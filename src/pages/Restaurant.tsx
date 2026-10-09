import { useEffect, useMemo, useRef, useState } from "react";
import scanIcon from "@/assets/nav-scan-heritage.png.asset.json";
import { useServerFn } from "@tanstack/react-start";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/router-compat";
import Layout from "@/components/Layout";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2,
  Camera,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Check,
  Minus,
  Plus,
} from "lucide-react";
import { extractWineList, extractMenu, pairFromList, pairAlternatives } from "@/lib/pairing.functions";
import { wishlistKey } from "@/lib/wishlistKey";
import { WineClink } from "@/components/WineClink";
import { ScanLine, LockCorners, Flash } from "@/components/ScanEffects";

type ListResult = Awaited<ReturnType<typeof extractWineList>>;
type MenuResult = Awaited<ReturnType<typeof extractMenu>>;
type TableResult = Awaited<ReturnType<typeof pairFromList>>;
type AltsResult = Awaited<ReturnType<typeof pairAlternatives>>;
type ListEntry = ListResult["entries"][number];
type Dish = MenuResult["dishes"][number];

const MAX_LIST_IMAGES = 6;
const MAX_MENU_IMAGES = 4;
/* Phone photos are 4000px and several megabytes each. Base64 encoded, a handful
   of those will not survive one request body, and the extra resolution buys
   nothing for OCR. Long edge is kept generous because printed menus and wine
   lists are dense type, which is where downscaling starts costing accuracy. */
const MAX_EDGE = 2000;

async function toScaledDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

const Restaurant = () => {
  const navigate = useNavigate();
  const extractListFn = useServerFn(extractWineList);
  const extractMenuFn = useServerFn(extractMenu);
  const pairFn = useServerFn(pairFromList);
  const altsFn = useServerFn(pairAlternatives);

  const [session, setSession] = useState<Session | null>(null);

  const [menuImages, setMenuImages] = useState<string[]>([]);
  const [menuResult, setMenuResult] = useState<MenuResult | null>(null);
  const [readingMenu, setReadingMenu] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);

  const [listImages, setListImages] = useState<string[]>([]);
  const [listResult, setListResult] = useState<ListResult | null>(null);
  const [readingList, setReadingList] = useState(false);
  const [listOpen, setListOpen] = useState(true);

  const [preparing, setPreparing] = useState(false);

  // Dish id -> how many of that plate the table ordered. Five guests often means
  // two of the same thing, and that weighting changes which wine serves them.
  const [selected, setSelected] = useState<Record<string, number>>({});

  const [dishes, setDishes] = useState("");
  const [place, setPlace] = useState("");
  // Once the field has been corrected by hand, no extraction may write to it.
  const [placeTouched, setPlaceTouched] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [table, setTable] = useState<TableResult | null>(null);
  const [alts, setAlts] = useState<AltsResult["picks"] | null>(null);
  const [altsLoading, setAltsLoading] = useState(false);
  const [pickIdx, setPickIdx] = useState(0);
  const altsReq = useRef(0);

  const [savedBottles, setSavedBottles] = useState<Record<string, boolean>>({});
  const [savingBottle, setSavingBottle] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const listInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const orderHeaderRef = useRef<HTMLDivElement>(null);
  // Scan confirmation: lock-on, clink (menu only), then the reveal.
  const [menuLock, setMenuLock] = useState(0);
  const [listLock, setListLock] = useState(0);
  const [clinkKey, setClinkKey] = useState(0);
  const [clinkY, setClinkY] = useState(0);
  const [listClinkKey, setListClinkKey] = useState(0);
  const [listClinkY, setListClinkY] = useState(0);
  const [clinking, setClinking] = useState(false);
  const [skip, setSkip] = useState(false);
  const [dishesShown, setDishesShown] = useState(true);
  const [listShown, setListShown] = useState(true);

  const onMenuScanned = () => {
    setMenuLock((n) => n + 1);
    const header = orderHeaderRef.current, stage = stageRef.current;
    if (!header || !stage) { setDishesShown(true); return; }
    // Let the corners lock on the photo, then bring the clink spot into view.
    window.setTimeout(() => {
      header.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        const y = header.getBoundingClientRect().bottom - stage.getBoundingClientRect().top + 34;
        setClinkY(y);
        setSkip(false);
        setClinking(true);
        setClinkKey((k) => k + 1);
      }, 380);
    }, 340);
  };
  const showDishes = () => { setClinking(false); setDishesShown(true); };
  const onListScanned = () => {
    setListLock((n) => n + 1);
    window.setTimeout(() => {
      setListShown(true);
      requestAnimationFrame(() => {
        const card = document.getElementById("rv-list-read"), stage = stageRef.current;
        if (!card || !stage) return;
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => {
          setListClinkY(card.getBoundingClientRect().bottom - stage.getBoundingClientRect().top + 34);
          setListClinkKey((k) => k + 1);
        }, 380);
      });
    }, 340);
  };

  useEffect(() => {
    setSheetOpen(!!table);
  }, [table]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) navigate("/auth");
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) navigate("/auth");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // Whichever extraction found a name, preferring the menu. Never once the user
  // has corrected it: reading the second photo must not undo their edit.
  useEffect(() => {
    if (placeTouched) return;
    const name = menuResult?.restaurantName ?? listResult?.restaurantName;
    if (name) setPlace(name);
  }, [menuResult, listResult, placeTouched]);

  const composeFrom = (sel: Record<string, number>) =>
    menuResult
      ? menuResult.dishes
          .filter((d) => (sel[d.id] ?? 0) > 0)
          .map((d) => `${sel[d.id]} x ${d.name}`)
          .join("; ")
      : "";

  /* The composed half and the manual half both have to survive. Rather than
     rewriting the whole string, the previous composed run is located inside
     whatever the user currently has and swapped for the new one, leaving
     anything they typed around it untouched. If they have edited the composed
     run beyond recognition, the new one is prepended rather than lost. */
  const mergeComposed = (text: string, prev: string, next: string) => {
    const current = text.trim();
    if (prev && current.includes(prev)) {
      return current
        .replace(prev, () => next)
        .replace(/^\s*;\s*/, "")
        .replace(/\s*;\s*$/, "")
        .replace(/;\s*;/g, ";")
        .trim();
    }
    if (!next) return current;
    return current ? `${next}; ${current}` : next;
  };

  // Selection composes into the textarea rather than bypassing it, so what the
  // model receives is exactly what the user can see and correct.
  const applySelection = (next: Record<string, number>) => {
    const prevComposed = composeFrom(selected);
    const nextComposed = composeFrom(next);
    setSelected(next);
    setDishes((text) => mergeComposed(text, prevComposed, nextComposed));
  };

  const selectedCount = Object.keys(selected).length;
  /* The gate exists only when a menu was photographed. Typing dishes by hand
     with no menu is the original path and stays ungated. */
  const awaitingDish = !!menuResult && menuResult.dishes.length > 0 && selectedCount === 0;

  const grouped = useMemo(() => {
    if (!menuResult) return [] as { section: string | null; dishes: Dish[] }[];
    const out: { section: string | null; dishes: Dish[] }[] = [];
    for (const d of menuResult.dishes) {
      const last = out[out.length - 1];
      if (last && last.section === d.section) last.dishes.push(d);
      else out.push({ section: d.section, dishes: [d] });
    }
    return out;
  }, [menuResult]);

  const addFiles = async (
    files: FileList | null,
    current: string[],
    max: number,
    set: (updater: (prev: string[]) => string[]) => void,
  ) => {
    if (!files || files.length === 0) return;
    const room = max - current.length;
    if (room <= 0) {
      toast.error(`${max} photos is the limit`);
      return;
    }
    setPreparing(true);
    try {
      const picked = Array.from(files).slice(0, room);
      const encoded = await Promise.all(picked.map(toScaledDataUrl));
      set((prev) => [...prev, ...encoded]);
      if (files.length > room) toast(`Only the first ${room} were added`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not read those photos");
    } finally {
      setPreparing(false);
    }
  };

  const readMenu = async () => {
    if (menuImages.length === 0) {
      toast.error("Photograph the menu first");
      return;
    }
    setReadingMenu(true);
    requestAnimationFrame(() => document.getElementById("rv-menu-photo")?.scrollIntoView({ block: "center" }));
    // The old ids point at dishes that will not exist after this call, so the
    // selection goes — and its composed run comes out of the text with it,
    // leaving anything typed by hand in place.
    const staleComposed = composeFrom(selected);
    setDishes((text) => mergeComposed(text, staleComposed, ""));
    setMenuResult(null);
    setSelected({});
    setDishesShown(false);
    setTable(null);
    try {
      const data = (await extractMenuFn({ data: { images: menuImages } })) as MenuResult;
      setMenuResult(data);
      setMenuOpen(true);
      if (data.dishes.length === 0) toast.error("Nothing readable on that menu");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not read that menu");
    } finally {
      setReadingMenu(false);
    }
  };

  const readList = async () => {
    if (listImages.length === 0) {
      toast.error("Photograph the wine list first");
      return;
    }
    setReadingList(true);
    requestAnimationFrame(() => document.getElementById("rv-list-photo")?.scrollIntoView({ block: "center" }));
    setListResult(null);
    setListShown(false);
    setTable(null);
    try {
      const data = (await extractListFn({ data: { images: listImages } })) as ListResult;
      setListResult(data);
      setListOpen(true);
      if (data.entries.length === 0) toast.error("Nothing readable on that list");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not read that wine list");
    } finally {
      setReadingList(false);
    }
  };

  // Like the film: capture, flash, then the scan starts on its own.
  const menuCountRef = useRef(0);
  const listCountRef = useRef(0);
  useEffect(() => {
    const grew = menuImages.length > menuCountRef.current;
    menuCountRef.current = menuImages.length;
    if (grew && !readingMenu) void readMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuImages.length]);
  useEffect(() => {
    const grew = listImages.length > listCountRef.current;
    listCountRef.current = listImages.length;
    if (grew && !readingList) void readList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listImages.length]);

  const pair = async () => {
    if (!listResult || listResult.entries.length === 0) return;
    if (dishes.trim().length < 3) {
      toast.error("Tell me what the table is eating");
      return;
    }
    setPairing(true);
    setTable(null);
    try {
      const lang = navigator.language || "en";
      const data = (await pairFn({
        data: { entries: listResult.entries, dishes: dishes.trim(), lang },
      })) as TableResult;
      setTable(data);
      setPickIdx(0);
      setAlts(null);
      if (data.single) {
        const req = ++altsReq.current;
        setAltsLoading(true);
        altsFn({
          data: {
            entries: listResult.entries,
            dishes: dishes.trim(),
            firstId: data.single.entry.id,
            firstWhy: data.single.why.slice(0, 400),
            lang,
          },
        })
          .then((r) => { if (req === altsReq.current) setAlts((r as AltsResult).picks); })
          .catch((e) => { console.error(e); if (req === altsReq.current) setAlts([]); })
          .finally(() => { if (req === altsReq.current) setAltsLoading(false); });
      }
      // Both lists fold away once there is an answer, but stay one tap from
      // view so a misread can be caught before the recommendation is trusted.
      setListOpen(false);
      setMenuOpen(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not pick from that list");
    } finally {
      setPairing(false);
    }
  };

  // Auto-pair once per wine list read, as soon as plates are ticked.
  const autoPairedRef = useRef<ListResult | null>(null);
  useEffect(() => {
    if (!listShown || !listResult || listResult.entries.length === 0) return;
    if (selectedCount === 0 || dishes.trim().length < 3 || table || pairing) return;
    if (autoPairedRef.current === listResult) return;
    autoPairedRef.current = listResult;
    void pair();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listShown, listResult, selectedCount, dishes]);

  const toggleDish = (id: string) => {
    const next = { ...selected };
    if (next[id]) delete next[id];
    else next[id] = 1;
    applySelection(next);
  };

  const stepQty = (id: string, delta: number) => {
    const q = (selected[id] ?? 1) + delta;
    if (q < 1) return;
    applySelection({ ...selected, [id]: Math.min(q, 20) });
  };

  const noteFor = (t: TableResult) => {
    const name = place.trim();
    if (!name) return t.saveNotePlain;
    if (t.saveNoteWithPlace.includes("{restaurant}")) {
      return t.saveNoteWithPlace.replace("{restaurant}", name);
    }
    // The model dropped the token; keep the name rather than lose it.
    return `${t.saveNotePlain} (${name})`;
  };

  const saveBottle = async (entry: ListEntry, why: string) => {
    if (!session || !table) return;
    const key = wishlistKey(entry.name, entry.producer);
    if (savedBottles[key] || savingBottle) return;

    setSavingBottle(key);
    try {
      const { data: rows, error: checkError } = await supabase
        .from("wishlist")
        .select("wine_name, producer")
        .eq("user_id", session.user.id);
      if (checkError) throw checkError;

      if ((rows ?? []).some((r) => wishlistKey(r.wine_name, r.producer) === key)) {
        setSavedBottles((prev) => ({ ...prev, [key]: true }));
        toast(table.savedLabel);
        return;
      }

      // Price as printed, verbatim: a restaurant list price is not a number and
      // there is no price column on wishlist.
      const description = entry.price ? `${why} (${entry.price})` : why || null;

      const { error: insertError } = await supabase.from("wishlist").insert({
        user_id: session.user.id,
        wine_name: entry.name,
        producer: entry.producer,
        region: entry.region,
        vintage_year: entry.vintage,
        description,
        notes: noteFor(table),
      });
      if (insertError) throw insertError;

      setSavedBottles((prev) => ({ ...prev, [key]: true }));
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not add to your list");
    } finally {
      setSavingBottle(null);
    }
  };

  const firePhoto = (
    files: FileList | null,
    images: string[],
    max: number,
    setImages: (updater: (prev: string[]) => string[]) => void,
  ) => {
    if (files && files.length > 0) setFlash((n) => n + 1);
    void addFiles(files, images, max, setImages);
  };

  const CaptureButton = ({
    images,
    max,
    setImages,
    addLabel,
    moreLabel,
  }: {
    images: string[];
    max: number;
    setImages: (updater: (prev: string[]) => string[]) => void;
    addLabel: string;
    moreLabel: string;
  }) =>
    images.length < max ? (
      <label className="rv-btn-ghost">
        {preparing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing...
          </>
        ) : (
          <>
            <Camera className="h-4 w-4" /> {images.length === 0 ? addLabel : moreLabel}
          </>
        )}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          disabled={preparing}
          onChange={(e) => {
            firePhoto(e.target.files, images, max, setImages);
            e.target.value = "";
          }}
        />
      </label>
    ) : null;

  const Thumbs = ({
    images,
    setImages,
    skipFirst,
  }: {
    images: string[];
    setImages: (updater: (prev: string[]) => string[]) => void;
    skipFirst?: boolean;
  }) => (
    <div className="flex flex-wrap gap-2">
      {images.map((src, i) =>
        skipFirst && i === 0 ? null : (
          <div key={i} className="relative">
            <img
              src={src}
              alt={`Page ${i + 1}`}
              className="h-[64px] w-[50px] rounded-[3px] border border-rv-line object-cover"
            />
            <button
              type="button"
              onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
              aria-label={`Remove page ${i + 1}`}
              className="absolute -right-1.5 -top-1.5 rounded-full border border-rv-line bg-rv-panel p-0.5 text-rv-tan2 hover:text-rv-cream"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ),
      )}
    </div>
  );

  const Unreadable = ({ what }: { what: string }) => (
    <p className="flex items-start gap-1.5 text-xs text-rv-peach">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      Some of that was too dark or blurred to read, so this {what} is probably incomplete. Add
      another photo of the pages that are missing.
    </p>
  );

  const LovedPill = ({ entry, why }: { entry: ListEntry; why: string }) => {
    const key = wishlistKey(entry.name, entry.producer);
    const isSaved = !!savedBottles[key];
    const isSaving = savingBottle === key;
    return (
      <button
        type="button"
        onClick={() => void saveBottle(entry, why)}
        disabled={isSaved || isSaving}
        data-loved={isSaved}
        className="rv-loved"
      >
        {isSaving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : isSaved ? (
          `♥ Loved${place.trim() ? ` · ${place.trim()}` : ""}`
        ) : (
          "♡ We loved it"
        )}
      </button>
    );
  };

  const totalPlates = Object.values(selected).reduce((a, b) => a + b, 0);
  const toastText = readingMenu
    ? "Reading the menu…"
    : readingList
      ? "Reading the wine list…"
      : pairing
        ? "Pairing recommendation"
        : null;

  if (!session) return null;

  const picks = table?.single ? [table.single, ...(alts ?? [])] : [];
  const first = picks[pickIdx] ?? table?.single ?? null;

  return (
    <Layout>
      {toastText && <div className="rv-toast"><TypeText key={toastText} text={toastText} /></div>}

      <div
        ref={stageRef}
        className="relative mx-auto max-w-[560px] px-6 pb-10 pt-10"
        onPointerDownCapture={() => { if (clinking) { setSkip(true); } }}
      >
        <WineClink motif="cutlery" run={clinkKey} y={clinkY} onDone={showDishes} skip={skip} />
        <WineClink motif="glasses" run={listClinkKey} y={listClinkY} />
        {/* STEP 1 */}
        <h1 className="page-title">
          At a restaurant
        </h1>
        <p className="page-subtitle mb-5">
          1- Scan the menu. <em>Tick what the table ordered</em>.
          <br />
          2- Scan the Winelist and get pairing recommandations
        </p>

        {menuImages.length > 0 ? (
          <div className="mb-4 flex justify-center">
            <div className="relative w-full max-w-[340px] -rotate-1">
              <div id="rv-menu-photo" className="relative overflow-hidden rounded-[3px] shadow-[0_14px_30px_-12px_#000]">
                <img src={menuImages[0]} alt="Menu" className="block max-h-[52vh] w-full object-cover object-top" />
                <ScanLine active={readingMenu} from={4} to={92} ms={2400} onFinished={onMenuScanned} />
                {flash > 0 && <Flash fire={flash} />}
              </div>
              <LockCorners lock={menuLock} gap={10} />
            </div>
          </div>
        ) : (
          <div className="rv-viewfinder">
            <span className="rv-corner rv-corner-tl" />
            <span className="rv-corner rv-corner-br" />
            <label
              aria-label="Scan the menu"
              className="flex h-[180px] cursor-pointer flex-col items-center justify-center gap-2 text-rv-tan2 transition-colors hover:text-rv-peach"
            >
              {preparing ? <Loader2 className="h-6 w-6 animate-spin" /> : <img src={scanIcon.url} alt="" className="h-[57px] w-[57px] max-w-none object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,0.7)]" />}
              <span className="rv-eyebrow !text-current">Scan the menu</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                disabled={preparing}
                onChange={(e) => {
                  firePhoto(e.target.files, menuImages, MAX_MENU_IMAGES, setMenuImages);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}
        {menuImages.length > 0 && (
          <div className="mb-3">
            <Thumbs images={menuImages} setImages={setMenuImages} />
          </div>
        )}
        {menuImages.length > 0 && (
          <CaptureButton
            images={menuImages}
            max={MAX_MENU_IMAGES}
            setImages={setMenuImages}
            addLabel="Scan the menu"
            moreLabel="Add another page"
          />
        )}

        {menuImages.length > 0 && !(menuResult && dishesShown) && (
          <button
            type="button"
            onClick={() => void readMenu()}
            disabled={readingMenu || preparing}
            className="rv-btn mt-3"
          >
            {readingMenu ? "Reading…" : "Read the menu"}
          </button>
        )}

        {menuResult && (
          <div className="mt-6">
            {menuResult.unreadable && <Unreadable what="menu" />}
            <div ref={orderHeaderRef} className="mb-1 flex items-baseline justify-between gap-3">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="rv-eyebrow flex items-center gap-1 !text-rv-cream"
              >
                {menuOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                What did the table order?
              </button>
              {totalPlates > 0 ? (
                <span className="rv-eyebrow !text-rv-peach">
                  {totalPlates} {totalPlates === 1 ? "plate" : "plates"}
                </span>
              ) : dishesShown ? (
                <DishCounter key={clinkKey} total={menuResult.dishes.length} instant={skip} />
              ) : null}
            </div>
            {totalPlates === 0 && dishesShown && menuResult.dishes.length > 0 && (
              <p className="rv-eyebrow mb-1">Tick the plates</p>
            )}

            {menuOpen && dishesShown &&
              grouped.map((group, gi) => (
                <div key={gi}>
                  {group.section && <p className="rv-eyebrow pb-1 pt-4">{group.section}</p>}
                  {group.dishes.map((d) => {
                    const qty = selected[d.id] ?? 0;
                    const on = qty > 0;
                    const idx = menuResult.dishes.indexOf(d);
                    return (
                      <div
                        key={d.id}
                        className={`flex items-center gap-3 border-b border-rv-line py-[10px] ${skip ? "" : "rv-row-rise"}`}
                        style={skip ? undefined : { animationDelay: `${idx * 80}ms` }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleDish(d.id)}
                          aria-pressed={on}
                          className="flex flex-1 items-center gap-3 text-left"
                        >
                          <span className="rv-check" data-on={on}>
                            {on && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                          <span
                            className={`text-[13.5px] transition-colors duration-300 ${on ? "text-rv-cream" : "text-rv-tan"}`}
                          >
                            {d.name}
                          </span>
                        </button>
                        {on && (
                          <div className="flex items-center gap-1">
                            {qty > 1 ? (
                              <button
                                type="button"
                                onClick={() => stepQty(d.id, -1)}
                                aria-label="One less"
                                className="p-1.5"
                              >
                                <span className="rv-check" data-on="true">
                                  <Minus className="h-3 w-3" strokeWidth={3} />
                                </span>
                              </button>
                            ) : (
                              <span aria-hidden className="p-1.5 inline-block w-[29px]" />
                            )}
                            <span className="rv-qty min-w-[26px] text-center">×{qty}</span>
                            <button
                              type="button"
                              onClick={() => stepQty(d.id, 1)}
                              disabled={qty >= 20}
                              aria-label="One more"
                              className="p-1.5 disabled:opacity-40"
                            >
                              <span className="rv-check" data-on="true">
                                <Plus className="h-3 w-3" strokeWidth={3} />
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>
        )}

        <div className="mt-6 space-y-3">
          <p className="rv-eyebrow">Or type what the table is eating</p>
          <Textarea
            value={dishes}
            onChange={(e) => setDishes(e.target.value)}
            placeholder="A steak, two mushroom risottos, grilled sea bass, a goat's cheese salad."
            rows={3}
            className="resize-none rounded-[8px] border-rv-line bg-rv-panel text-[13.5px] text-rv-cream"
          />
          <input
            value={place}
            onChange={(e) => {
              setPlaceTouched(true);
              setPlace(e.target.value);
            }}
            placeholder="Restaurant name, for your notes later"
            className="w-full border-b border-rv-line bg-transparent px-0 py-2 text-[14px] text-rv-cream placeholder:text-rv-tan2 focus:border-rv-peach focus:outline-none"
          />
        </div>

        <button
          type="button"
          className="rv-btn mt-6"
          onClick={() => {
            listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            // Opens the camera straight away when there is no list photo yet.
            if (listImages.length === 0 && !preparing) listInputRef.current?.click();
          }}
        >
          Now the wine list
        </button>

        {/* STEP 2 */}
        <div ref={listRef} className="scroll-mt-6 pt-12">
          <h2 className="mb-4 font-serif text-[31px] font-bold leading-tight text-rv-cream">
            The wine list
          </h2>
          <div className="rv-viewfinder">
            {listImages.length === 0 && (
              <>
                <span className="rv-corner rv-corner-tl" />
                <span className="rv-corner rv-corner-br" />
              </>
            )}
            {listImages.length > 0 ? (
              <div className="relative">
                <div id="rv-list-photo" className="relative overflow-hidden rounded-[4px]">
                  <img src={listImages[0]} alt="Wine list" className="block max-h-[52vh] w-full object-cover object-top" />
                  <ScanLine active={readingList} from={8} to={86} ms={2600} onFinished={onListScanned} />
                  {flash > 0 && <Flash fire={flash} />}
                </div>
                <LockCorners lock={listLock} gap={6} />
              </div>
            ) : (
              <label
                aria-label="Scan the wine list"
                className="flex h-[180px] cursor-pointer flex-col items-center justify-center gap-2 text-rv-tan2 transition-colors hover:text-rv-peach"
              >
                {preparing ? <Loader2 className="h-6 w-6 animate-spin" /> : <img src={scanIcon.url} alt="" className="h-[57px] w-[57px] max-w-none object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,0.7)]" />}
                <span className="rv-eyebrow !text-current">Scan the wine list</span>
                <input
                  ref={listInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  disabled={preparing}
                  onChange={(e) => {
                    firePhoto(e.target.files, listImages, MAX_LIST_IMAGES, setListImages);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          {listImages.length > 1 && (
            <div className="mt-3">
              <Thumbs images={listImages} setImages={setListImages} skipFirst />
            </div>
          )}
          {listImages.length === 1 && (
            <div className="mt-3">
              <Thumbs images={listImages} setImages={setListImages} />
            </div>
          )}
          {listImages.length > 0 && (
            <div className="mt-3">
              <CaptureButton
                images={listImages}
                max={MAX_LIST_IMAGES}
                setImages={setListImages}
                addLabel="Photograph the list"
                moreLabel="Add another page"
              />
            </div>
          )}
          {listImages.length > 0 && (
            <button
              type="button"
              onClick={() => void readList()}
              disabled={readingList || preparing}
              className="rv-btn mt-3"
            >
              {readingList ? "Reading…" : "Read the list"}
            </button>
          )}
        </div>

        {listResult && listShown && (
          <div className="mt-4 space-y-3">
            <div id="rv-list-read" className="rv-card rv-rise flex items-baseline justify-between gap-3">
              <button
                type="button"
                onClick={() => setListOpen((o) => !o)}
                className="flex items-center gap-1 font-serif text-[15px] text-rv-cream"
              >
                {listOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Wine list read
              </button>
              <span className="rv-eyebrow !text-rv-peach">
                <CountUp to={listResult.entries.length} />{" "}
                {listResult.entries.length === 1 ? "wine" : "wines"} · {totalPlates}{" "}
                {totalPlates === 1 ? "plate" : "plates"}
              </span>
            </div>
            {listResult.unreadable && <Unreadable what="list" />}
            {listOpen && listResult.entries.length > 0 && (
              <div className="rv-card !p-0">
                {listResult.entries.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-start justify-between gap-3 border-b border-rv-line px-[14px] py-2 text-[12.5px] last:border-0"
                  >
                    <div>
                      <span className="text-rv-cream">{e.name}</span>
                      {e.byTheGlass && <span className="ml-1.5 text-[10px] text-rv-peach">glass</span>}
                      {(e.producer || e.region || e.vintage) && (
                        <span className="block text-rv-tan2">
                          {[e.producer, e.vintage, e.region].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>
                    <span className="whitespace-nowrap text-rv-tan">{e.price ?? ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {listResult && listResult.entries.length > 0 && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => void pair()}
              disabled={pairing || awaitingDish}
              className="rv-btn"
            >
              {pairing ? "Choosing…" : "Pick for the table"}
            </button>
            {awaitingDish && (
              <p className="mt-2 text-center text-xs text-rv-tan2">Choose at least one dish above first.</p>
            )}
          </div>
        )}

        {table && !sheetOpen && (
          <button type="button" className="rv-btn-ghost mt-4" onClick={() => setSheetOpen(true)}>
            Show the recommendation
          </button>
        )}
      </div>

      {/* STEP 3: the sheet */}
      <div
        className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ pointerEvents: table && sheetOpen ? "auto" : "none" }}
        aria-hidden={!(table && sheetOpen)}
      >
        <button
          type="button"
          aria-label="Close"
          tabIndex={table && sheetOpen ? 0 : -1}
          onClick={() => setSheetOpen(false)}
          className={`absolute inset-0 bg-[rgba(20,9,9,0.6)] transition-opacity duration-500 ${table && sheetOpen ? "opacity-100" : "opacity-0"}`}
        />
        <div className="rv-sheet" data-open={!!(table && sheetOpen)} role="dialog">
          <div className="mx-auto mb-4 h-[3px] w-9 rounded-full bg-rv-line" />
          {table && (
            <div className="space-y-5">
              {table.tableRead && <p className="text-[12px] leading-[1.5] text-rv-tan">{table.tableRead}</p>}

              {first && (
                <div>
                  <p className="rv-eyebrow !text-rv-peach">One bottle for the table</p>
                  <p className="mt-1 font-serif text-[24px] font-bold leading-tight text-rv-cream">
                    {first.entry.name}
                  </p>
                  <p className="text-[12px] text-rv-tan2">
                    {[first.entry.producer, first.entry.vintage, first.entry.region, first.entry.price]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-2 text-[13px] leading-[1.5] text-rv-cream">{first.why}</p>
                  {first.compromise && (
                    <p className="mt-2 text-[12.5px] leading-[1.5] text-rv-peach">⚠ {first.compromise}</p>
                  )}
                  <div className="mt-3">
                    <LovedPill entry={first.entry} why={first.why} />
                  </div>
                </div>
              )}

              {table.split && (
                <div className="space-y-4 border-t border-rv-line pt-4">
                  <p className="rv-eyebrow !text-rv-peach">{first ? "Or two bottles" : "Two bottles for the table"}</p>
                  {table.split.rationale && (
                    <p className="text-[12px] leading-[1.5] text-rv-tan">{table.split.rationale}</p>
                  )}
                  {table.split.bottles.map((b, i) => (
                    <div key={i}>
                      <p className="font-serif text-[19px] font-bold leading-tight text-rv-cream">{b.entry.name}</p>
                      <p className="text-[12px] text-rv-tan2">
                        {[b.entry.producer, b.entry.vintage, b.entry.region, b.entry.price].filter(Boolean).join(" · ")}
                      </p>
                      {b.serves && <p className="mt-1 text-[12px] text-rv-peach">{b.serves}</p>}
                      <p className="mt-1 text-[13px] leading-[1.5] text-rv-cream">{b.why}</p>
                      <div className="mt-2">
                        <LovedPill entry={b.entry} why={b.why} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {table.verdict && (
                <p className="border-t border-rv-line pt-4 text-[12px] leading-[1.5] text-rv-tan">{table.verdict}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

/** Counts rows in step with their rise (80ms each), then pops a gold diamond. */
function DishCounter({ total, instant }: { total: number; instant: boolean }) {
  const [n, setN] = useState(instant ? total : 0);
  useEffect(() => {
    if (instant) { setN(total); return; }
    setN(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setN(Math.min(i, total));
      if (i >= total) window.clearInterval(id);
    }, 80);
    return () => window.clearInterval(id);
  }, [total, instant]);
  return (
    <span className="rv-eyebrow inline-flex items-center gap-1.5 !text-rv-peach">
      {n} {n === 1 ? "dish" : "dishes"}
      {n >= total && (
        <span aria-hidden style={{ width: 7, height: 7, background: "#D9B45F", transform: "rotate(45deg)",
          animation: "rv-pop 300ms cubic-bezier(0.34,1.6,0.64,1) both" }} />
      )}
    </span>
  );
}

/** Counts from 0 to `to` over 900ms, ease-out cubic. Always lands on the real number. */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const done = window.setTimeout(() => setN(to), 1000);
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [to]);
  return <>{n}</>;
}

export default Restaurant;

/** Types the text in one letter at a time (45ms per letter), with a blinking caret. */
function TypeText({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = window.setInterval(() => {
      setN((v) => {
        if (v >= text.length) { window.clearInterval(id); return v; }
        return v + 1;
      });
    }, 45);
    return () => window.clearInterval(id);
  }, [text]);
  return (
    <span aria-label={text}>
      {text.slice(0, n)}
      <span aria-hidden className="rv-caret">|</span>
    </span>
  );
}

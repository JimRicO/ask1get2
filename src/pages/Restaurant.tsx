import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/router-compat";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2,
  Camera,
  X,
  AlertTriangle,
  ScrollText,
  Heart,
  ChevronDown,
  ChevronRight,
  Minus,
  Plus,
  Check,
} from "lucide-react";
import { extractWineList, extractMenu, pairFromList } from "@/lib/pairing.functions";
import { wishlistKey } from "@/lib/wishlistKey";

type ListResult = Awaited<ReturnType<typeof extractWineList>>;
type MenuResult = Awaited<ReturnType<typeof extractMenu>>;
type TableResult = Awaited<ReturnType<typeof pairFromList>>;
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

  const [savedBottles, setSavedBottles] = useState<Record<string, boolean>>({});
  const [savingBottle, setSavingBottle] = useState<string | null>(null);

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
    // The old ids point at dishes that will not exist after this call, so the
    // selection goes — and its composed run comes out of the text with it,
    // leaving anything typed by hand in place.
    const staleComposed = composeFrom(selected);
    setDishes((text) => mergeComposed(text, staleComposed, ""));
    setMenuResult(null);
    setSelected({});
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
    setListResult(null);
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

  const pair = async () => {
    if (!listResult || listResult.entries.length === 0) return;
    if (dishes.trim().length < 3) {
      toast.error("Tell me what the table is eating");
      return;
    }
    setPairing(true);
    setTable(null);
    try {
      const data = (await pairFn({
        data: { entries: listResult.entries, dishes: dishes.trim() },
      })) as TableResult;
      setTable(data);
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

  const PhotoStep = ({
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
  }) => (
    <>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {images.map((src, i) => (
            <div key={i} className="relative">
              <img
                src={src}
                alt={`Page ${i + 1}`}
                className="h-20 w-16 object-cover rounded-lg border border-border/50"
              />
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove page ${i + 1}`}
                className="absolute -top-1.5 -right-1.5 rounded-full bg-card border border-border/50 p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {images.length < max && (
        <label className="flex items-center justify-center gap-2 w-full py-3 mb-3 rounded-xl border border-dashed border-border/50 text-sm text-muted-foreground cursor-pointer hover:text-foreground hover:border-border transition-colors">
          {preparing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing...
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" />
              {images.length === 0 ? addLabel : moreLabel}
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
              void addFiles(e.target.files, images, max, setImages);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </>
  );

  const Unreadable = ({ what }: { what: string }) => (
    <p className="flex items-start gap-1.5 text-xs text-accent">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      Some of that was too dark or blurred to read, so this {what} is probably
      incomplete. Add another photo of the pages that are missing.
    </p>
  );

  const SaveButton = ({ entry, why }: { entry: ListEntry; why: string }) => {
    const key = wishlistKey(entry.name, entry.producer);
    const isSaved = !!savedBottles[key];
    const isSaving = savingBottle === key;
    return (
      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={() => void saveBottle(entry, why)}
          disabled={isSaved || isSaving}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] border border-border/50 text-muted-foreground transition-colors hover:text-foreground hover:border-border disabled:hover:text-muted-foreground disabled:hover:border-border/50"
        >
          {isSaving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Heart className={`h-3 w-3 ${isSaved ? "fill-accent text-accent" : ""}`} />
          )}
          {isSaved ? table?.savedLabel : table?.saveLabel}
        </button>
      </div>
    );
  };

  const BottleLine = ({ entry }: { entry: ListEntry }) => (
    <>
      <p className="text-foreground font-medium">{entry.name}</p>
      <p className="text-xs text-muted-foreground">
        {[entry.producer, entry.vintage, entry.region, entry.price].filter(Boolean).join(" · ")}
        {entry.byTheGlass && <span className="ml-1.5 text-accent">glass</span>}
      </p>
    </>
  );

  if (!session) return null;

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 pt-8 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <ScrollText className="h-5 w-5 text-accent" />
          <h1 className="text-2xl font-semibold text-foreground">At the table</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          The menu, then the wine list. Your cave stays out of this one.
        </p>

        {/* Step one: the food, because that is the order the evening goes in. */}
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">The menu</p>
        <PhotoStep
          images={menuImages}
          max={MAX_MENU_IMAGES}
          setImages={setMenuImages}
          addLabel="Photograph the menu"
          moreLabel="Add another page"
        />
        {menuImages.length > 0 && (
          <Button
            onClick={() => void readMenu()}
            disabled={readingMenu || preparing}
            variant="secondary"
            className="w-full"
          >
            {readingMenu ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Reading...
              </>
            ) : (
              "Read the menu"
            )}
          </Button>
        )}

        {menuResult && (
          <div className="mt-4 space-y-3">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            >
              {menuOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {menuResult.dishes.length} {menuResult.dishes.length === 1 ? "dish" : "dishes"} read
            </button>

            {menuResult.unreadable && <Unreadable what="menu" />}

            {/* The step has to read as a question. Without this the rows look
                like a list the app is showing you, and people sit there. */}
            {menuResult.dishes.length > 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-foreground">{menuResult.selectionPrompt}</p>
                <p className="text-xs text-muted-foreground whitespace-nowrap">
                  {selectedCount} selected
                </p>
              </div>
            )}

            {menuOpen &&
              grouped.map((group, gi) => (
                <div key={gi} className="space-y-1">
                  {group.section && (
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 pt-1">
                      {group.section}
                    </p>
                  )}
                  {group.dishes.map((d) => {
                    const qty = selected[d.id] ?? 0;
                    return (
                      <div
                        key={d.id}
                        className={`flex items-start gap-2 rounded-xl border px-3 py-2 transition-colors ${
                          qty > 0
                            ? "bg-primary/10 border-primary/40"
                            : "bg-card/60 border-border/50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleDish(d.id)}
                          aria-pressed={qty > 0}
                          className="flex-1 flex items-start gap-2 text-left text-xs text-foreground"
                        >
                          {/* On every row, not only selected ones: the box is
                              what tells the user these are tappable. */}
                          <span
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center ${
                              qty > 0
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-border"
                            }`}
                          >
                            {qty > 0 && <Check className="h-2.5 w-2.5" />}
                          </span>
                          {d.name}
                        </button>
                        {qty > 0 && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => stepQty(d.id, -1)}
                              aria-label="One fewer"
                              className="rounded-full border border-border/50 p-0.5 text-muted-foreground hover:text-foreground"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="text-xs text-foreground w-4 text-center">{qty}</span>
                            <button
                              type="button"
                              onClick={() => stepQty(d.id, 1)}
                              aria-label="One more"
                              className="rounded-full border border-border/50 p-0.5 text-muted-foreground hover:text-foreground"
                            >
                              <Plus className="h-3 w-3" />
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

        {/* Always present, with or without a menu photo: tapping fills it in,
            typing works exactly as it did before this step existed. */}
        <div className="mt-6 space-y-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            What the table is eating
          </p>
          <Textarea
            value={dishes}
            onChange={(e) => setDishes(e.target.value)}
            placeholder="A steak, two mushroom risottos, grilled sea bass, a goat's cheese salad."
            rows={3}
            className="bg-card/60 border-border/50 resize-none"
          />
          <input
            value={place}
            onChange={(e) => {
              setPlaceTouched(true);
              setPlace(e.target.value);
            }}
            placeholder="Restaurant name, for your notes later"
            className="w-full bg-card/60 border border-border/50 rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Step two: the wine list. */}
        <div className="mt-8">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            The wine list
          </p>
          <PhotoStep
            images={listImages}
            max={MAX_LIST_IMAGES}
            setImages={setListImages}
            addLabel="Photograph the list"
            moreLabel="Add another page"
          />
          {listImages.length > 0 && (
            <Button
              onClick={() => void readList()}
              disabled={readingList || preparing}
              variant="secondary"
              className="w-full"
            >
              {readingList ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Reading...
                </>
              ) : (
                "Read the list"
              )}
            </Button>
          )}
        </div>

        {listResult && (
          <div className="mt-4 space-y-3">
            <button
              onClick={() => setListOpen((o) => !o)}
              className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            >
              {listOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {listResult.entries.length}{" "}
              {listResult.entries.length === 1 ? "wine read" : "wines read"}
            </button>

            {listResult.unreadable && <Unreadable what="list" />}

            {listOpen && listResult.entries.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border/50">
                <table className="w-full text-xs">
                  <tbody>
                    {listResult.entries.map((e) => (
                      <tr key={e.id} className="border-b border-border/30 last:border-0">
                        <td className="px-3 py-2 align-top">
                          <span className="text-foreground">{e.name}</span>
                          {e.byTheGlass && (
                            <span className="ml-1.5 text-[10px] text-accent">glass</span>
                          )}
                          {(e.producer || e.region) && (
                            <span className="block text-muted-foreground">
                              {[e.producer, e.region].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 align-top text-muted-foreground whitespace-nowrap">
                          {e.vintage ?? ""}
                        </td>
                        <td className="px-3 py-2 align-top text-right text-foreground whitespace-nowrap">
                          {e.price ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Kept visible while inactive: hiding it removes the cue about what
            comes next. */}
        {listResult && listResult.entries.length > 0 && (
          <div className="mt-6">
            <Button
              onClick={() => void pair()}
              disabled={pairing || awaitingDish}
              className="w-full"
            >
              {pairing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Choosing...
                </>
              ) : (
                "Pick for the table"
              )}
            </Button>
            {awaitingDish && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Choose at least one dish above first.
              </p>
            )}
          </div>
        )}

        {table && (
          <div className="mt-8 space-y-6">
            {table.tableRead && (
              <div className="bg-card rounded-xl p-4 border border-border/50">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  This table
                </p>
                <p className="text-sm text-foreground/80">{table.tableRead}</p>
              </div>
            )}

            {table.single && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">One bottle</p>
                <div className="bg-card rounded-xl p-4 border border-border/50">
                  <BottleLine entry={table.single.entry} />
                  <p className="text-sm text-foreground/90 mt-2">{table.single.why}</p>
                  {table.single.compromise && (
                    <p className="flex items-start gap-1.5 text-xs text-accent mt-3">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      {table.single.compromise}
                    </p>
                  )}
                  <SaveButton entry={table.single.entry} why={table.single.why} />
                </div>
              </div>
            )}

            {table.split && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Or two bottles
                </p>
                {table.split.rationale && (
                  <p className="text-xs text-muted-foreground">{table.split.rationale}</p>
                )}
                {table.split.bottles.map((b, i) => (
                  <div key={i} className="bg-card/60 rounded-xl p-4 border border-border/50">
                    <BottleLine entry={b.entry} />
                    {b.serves && <p className="text-xs text-accent mt-1">{b.serves}</p>}
                    <p className="text-sm text-foreground/80 mt-1">{b.why}</p>
                    <SaveButton entry={b.entry} why={b.why} />
                  </div>
                ))}
              </div>
            )}

            {table.verdict && (
              <div className="bg-card/40 rounded-xl p-4 border border-dashed border-border/50">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  The list
                </p>
                <p className="text-sm text-foreground/80">{table.verdict}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Restaurant;

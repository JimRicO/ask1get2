import { useEffect, useState } from "react";
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
} from "lucide-react";
import { extractWineList, pairFromList } from "@/lib/pairing.functions";
import { wishlistKey } from "@/lib/wishlistKey";

type ListResult = Awaited<ReturnType<typeof extractWineList>>;
type TableResult = Awaited<ReturnType<typeof pairFromList>>;
type ListEntry = ListResult["entries"][number];

const MAX_IMAGES = 6;
/* Phone photos are 4000px and several megabytes each. Six of those, base64
   encoded, will not survive one request body, and the extra resolution buys
   nothing for OCR. Long edge is kept generous because restaurant lists are
   dense two-column type, which is where downscaling starts costing accuracy. */
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
  const extractFn = useServerFn(extractWineList);
  const pairFn = useServerFn(pairFromList);

  const [session, setSession] = useState<Session | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<ListResult | null>(null);

  const [dishes, setDishes] = useState("");
  const [place, setPlace] = useState("");
  const [pairing, setPairing] = useState(false);
  const [table, setTable] = useState<TableResult | null>(null);
  const [listOpen, setListOpen] = useState(true);

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

  // Seeded from the list when it names the restaurant, still editable: without
  // a name the note is worthless a year later.
  useEffect(() => {
    if (result?.restaurantName) setPlace(result.restaurantName);
  }, [result]);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      toast.error(`${MAX_IMAGES} photos is the limit`);
      return;
    }
    setPreparing(true);
    try {
      const picked = Array.from(files).slice(0, room);
      const encoded = await Promise.all(picked.map(toScaledDataUrl));
      setImages((prev) => [...prev, ...encoded]);
      if (files.length > room) toast(`Only the first ${room} were added`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not read those photos");
    } finally {
      setPreparing(false);
    }
  };

  const read = async () => {
    if (images.length === 0) {
      toast.error("Photograph the wine list first");
      return;
    }
    setReading(true);
    setResult(null);
    setTable(null);
    try {
      const data = (await extractFn({ data: { images } })) as ListResult;
      setResult(data);
      setListOpen(true);
      if (data.entries.length === 0) toast.error("Nothing readable on that list");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not read that wine list");
    } finally {
      setReading(false);
    }
  };

  const pair = async () => {
    if (!result || result.entries.length === 0) return;
    if (dishes.trim().length < 3) {
      toast.error("Tell me what the table is eating");
      return;
    }
    setPairing(true);
    setTable(null);
    try {
      const data = (await pairFn({
        data: { entries: result.entries, dishes: dishes.trim() },
      })) as TableResult;
      setTable(data);
      // The list collapses once there is an answer, but stays one tap away so a
      // misread can be spotted before the recommendation is trusted.
      setListOpen(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not pick from that list");
    } finally {
      setPairing(false);
    }
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
          <h1 className="text-2xl font-semibold text-foreground">The wine list</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Photograph it, page by page. Your cave stays out of this one.
        </p>

        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
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

        {images.length < MAX_IMAGES && (
          <label className="flex items-center justify-center gap-2 w-full py-3 mb-3 rounded-xl border border-dashed border-border/50 text-sm text-muted-foreground cursor-pointer hover:text-foreground hover:border-border transition-colors">
            {preparing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing...
              </>
            ) : (
              <>
                <Camera className="h-4 w-4" />
                {images.length === 0 ? "Photograph the list" : "Add another page"}
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
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}

        <Button onClick={() => void read()} disabled={reading || preparing} className="w-full">
          {reading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Reading...
            </>
          ) : (
            "Read the list"
          )}
        </Button>

        {result && (
          <div className="mt-8 space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <button
                onClick={() => setListOpen((o) => !o)}
                className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
              >
                {listOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {result.entries.length} {result.entries.length === 1 ? "wine read" : "wines read"}
              </button>
              {result.restaurantName && (
                <p className="text-xs text-muted-foreground">{result.restaurantName}</p>
              )}
            </div>

            {/* A short list presented as complete is the failure mode that makes
                the whole feature untrustworthy. */}
            {result.unreadable && (
              <p className="flex items-start gap-1.5 text-xs text-accent">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Some of that was too dark or blurred to read, so this list is
                probably incomplete. Add another photo of the pages that are
                missing.
              </p>
            )}

            {listOpen && result.entries.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border/50">
                <table className="w-full text-xs">
                  <tbody>
                    {result.entries.map((e) => (
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

            {result.entries.length > 0 && (
              <div className="space-y-3 pt-2">
                <Textarea
                  value={dishes}
                  onChange={(e) => setDishes(e.target.value)}
                  placeholder="What is the table eating? A steak, two mushroom risottos, grilled sea bass, a goat's cheese salad."
                  rows={3}
                  className="bg-card/60 border-border/50 resize-none"
                />
                <input
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="Restaurant name, for your notes later"
                  className="w-full bg-card/60 border border-border/50 rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                />
                <Button onClick={() => void pair()} disabled={pairing} className="w-full">
                  {pairing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Choosing...
                    </>
                  ) : (
                    "Pick for the table"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {table && (
          <div className="mt-8 space-y-6">
            {table.tableRead && (
              <div className="bg-card rounded-xl p-4 border border-border/50 shadow-elegant">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  This table
                </p>
                <p className="text-sm text-foreground/80">{table.tableRead}</p>
              </div>
            )}

            {table.single && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">One bottle</p>
                <div className="bg-card rounded-xl p-4 border border-border/50 shadow-elegant">
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

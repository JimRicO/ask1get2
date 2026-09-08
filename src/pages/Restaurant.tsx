import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/router-compat";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Camera, X, AlertTriangle, ScrollText } from "lucide-react";
import { extractWineList } from "@/lib/pairing.functions";

type ListResult = Awaited<ReturnType<typeof extractWineList>>;

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

  const [session, setSession] = useState<Session | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<ListResult | null>(null);

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
    try {
      const data = (await extractFn({ data: { images } })) as ListResult;
      setResult(data);
      if (data.entries.length === 0) toast.error("Nothing readable on that list");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not read that wine list");
    } finally {
      setReading(false);
    }
  };

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
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {result.entries.length} {result.entries.length === 1 ? "wine read" : "wines read"}
              </p>
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

            {result.entries.length > 0 && (
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
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Restaurant;

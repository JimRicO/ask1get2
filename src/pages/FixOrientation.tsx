import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Check,
  ImageIcon,
  Loader2,
  RotateCcw,
  RotateCw,
  X,
} from "lucide-react";
import { rotateStoredImage } from "@/lib/normalizeImageOrientation";

type WineRow = {
  id: string;
  wine_name: string;
  images: Record<string, string> | null;
};

type StoredFront = {
  name: string;
  url: string;
};

const FixOrientation = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [wines, setWines] = useState<WineRow[]>([]);
  const [storedFronts, setStoredFronts] = useState<StoredFront[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [choosingFor, setChoosingFor] = useState<string | null>(null);
  const [candidateSearch, setCandidateSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);
      const [{ data: wineRows, error: wineError }, { data: files, error: filesError }] =
        await Promise.all([
          supabase
            .from("wines")
            .select("id, wine_name, images")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
          supabase.storage.from("wine-images").list(user.id, {
            limit: 1000,
            sortBy: { column: "created_at", order: "desc" },
          }),
        ]);

      if (wineError) toast.error(wineError.message);
      if (filesError) toast.error(filesError.message);
      setWines((wineRows as WineRow[] | null) ?? []);

      const frontFiles = (files ?? [])
        .filter((file) => /^(wishlist_)?front_/i.test(file.name))
        .map((file) => {
          const path = `${user.id}/${file.name}`;
          const { data } = supabase.storage.from("wine-images").getPublicUrl(path);
          return { name: file.name, url: data.publicUrl };
        });
      setStoredFronts(frontFiles);
      setLoading(false);
    };
    load();
  }, []);

  const visibleCandidates = useMemo(() => {
    const query = candidateSearch.trim().toLowerCase();
    return query
      ? storedFronts.filter((candidate) => candidate.name.toLowerCase().includes(query))
      : storedFronts;
  }, [candidateSearch, storedFronts]);

  const saveFrontReference = async (wine: WineRow, frontUrl: string) => {
    const updatedImages = { ...(wine.images ?? {}), front: frontUrl };
    const { error } = await supabase
      .from("wines")
      .update({ images: updatedImages })
      .eq("id", wine.id);
    if (error) throw error;
    setWines((current) =>
      current.map((item) =>
        item.id === wine.id ? { ...item, images: updatedImages } : item,
      ),
    );
  };

  const rotateFront = async (wine: WineRow, degrees: number) => {
    const frontUrl = wine.images?.front;
    if (!userId || !frontUrl) return;
    setBusy(wine.id);
    try {
      const blob = await rotateStoredImage(frontUrl, degrees);
      if (!blob || !blob.size) throw new Error("Could not create a visible image");
      const fileName = `${userId}/front_manual_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("wine-images")
        .upload(fileName, blob, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from("wine-images")
        .getPublicUrl(fileName);
      await saveFrontReference(wine, publicUrl);
      setStoredFronts((current) => [
        { name: fileName.split("/").pop() ?? fileName, url: publicUrl },
        ...current,
      ]);
      toast.success("Front label updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Front rotation failed");
    } finally {
      setBusy(null);
    }
  };

  const restoreFront = async (wine: WineRow, candidate: StoredFront) => {
    setBusy(wine.id);
    try {
      await saveFrontReference(wine, candidate.url);
      setChoosingFor(null);
      setCandidateSearch("");
      toast.success("Stored front label restored");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restore failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <p className="text-muted-foreground">Please sign in to repair front labels.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6 space-y-5">
      <header className="space-y-2 max-w-2xl">
        <h1 className="text-2xl font-semibold text-foreground">Front-label recovery</h1>
        <p className="text-sm text-muted-foreground">
          Nothing runs automatically. Only the front label shown on cellar cards can
          be changed here. Back, neck, and full-bottle views are never touched.
        </p>
      </header>

      <section className="space-y-3" aria-label="Wine front labels">
        {wines.map((wine) => {
          const frontUrl = wine.images?.front;
          const isBusy = busy === wine.id;
          const isChoosing = choosingFor === wine.id;
          return (
            <Card key={wine.id} className="p-4 border-border bg-card space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-28 bg-muted overflow-hidden rounded-md shrink-0 flex items-center justify-center">
                  {frontUrl ? (
                    <img
                      src={frontUrl}
                      alt={`${wine.wine_name} front label`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <ImageIcon className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <h2 className="font-medium text-foreground truncate">{wine.wine_name}</h2>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!frontUrl || isBusy}
                      onClick={() => rotateFront(wine, 270)}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" /> Left
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!frontUrl || isBusy}
                      onClick={() => rotateFront(wine, 180)}
                    >
                      180°
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!frontUrl || isBusy}
                      onClick={() => rotateFront(wine, 90)}
                    >
                      <RotateCw className="h-4 w-4 mr-1" /> Right
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => {
                        setChoosingFor(isChoosing ? null : wine.id);
                        setCandidateSearch("");
                      }}
                    >
                      {isChoosing ? <X className="h-4 w-4 mr-1" /> : <ImageIcon className="h-4 w-4 mr-1" />}
                      {isChoosing ? "Close" : "Choose earlier front"}
                    </Button>
                  </div>
                </div>
              </div>

              {isChoosing && (
                <div className="border-t border-border pt-4 space-y-3">
                  <input
                    value={candidateSearch}
                    onChange={(event) => setCandidateSearch(event.target.value)}
                    placeholder="Filter by stored filename"
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-96 overflow-y-auto">
                    {visibleCandidates.map((candidate) => (
                      <Button
                        key={candidate.name}
                        type="button"
                        variant="outline"
                        disabled={isBusy}
                        className="h-auto p-2 flex-col gap-2 overflow-hidden"
                        onClick={() => restoreFront(wine, candidate)}
                      >
                        <img
                          src={candidate.url}
                          alt="Stored front-label candidate"
                          loading="lazy"
                          className="w-full h-28 object-contain bg-muted rounded-sm"
                        />
                        <span className="text-xs w-full truncate">{candidate.name}</span>
                        <span className="inline-flex items-center text-xs">
                          <Check className="h-3 w-3 mr-1" /> Use this front
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </section>
    </main>
  );
};

export default FixOrientation;
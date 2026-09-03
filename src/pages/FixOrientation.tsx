import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, RotateCw, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  normalizeStoredImage,
  rotateStoredImage,
} from "@/lib/normalizeImageOrientation";

type WineRow = {
  id: string;
  wine_name: string;
  images: Record<string, string> | null;
};

type ReportEntry = {
  wineId: string;
  wineName: string;
  fixed: string[];
  skipped: string[];
  failed: string[];
};

const FixOrientation = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [wines, setWines] = useState<WineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState<ReportEntry[]>([]);
  const [manualBusy, setManualBusy] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const { data, error } = await supabase
        .from("wines")
        .select("id, wine_name, images")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) toast.error(error.message);
      setWines((data as WineRow[] | null) ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const uploadFixed = async (
    ownerId: string,
    type: string,
    blob: Blob,
  ): Promise<string> => {
    const fileName = `${ownerId}/${type}_upright_${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from("wine-images")
      .upload(fileName, blob, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    const {
      data: { publicUrl },
    } = supabase.storage.from("wine-images").getPublicUrl(fileName);
    return publicUrl;
  };

  const runPass = async () => {
    if (!userId) return;
    setRunning(true);
    setReport([]);
    setProgress({ done: 0, total: wines.length });

    const entries: ReportEntry[] = [];

    for (const wine of wines) {
      const entry: ReportEntry = {
        wineId: wine.id,
        wineName: wine.wine_name,
        fixed: [],
        skipped: [],
        failed: [],
      };
      const images = wine.images ?? {};
      const updated: Record<string, string> = { ...images };
      let changed = false;

      for (const [type, url] of Object.entries(images)) {
        if (!url || typeof url !== "string") continue;
        try {
          const result = await normalizeStoredImage(url);
          if (!result) {
            entry.skipped.push(type);
            continue;
          }
          updated[type] = await uploadFixed(userId, type, result.blob);
          entry.fixed.push(type);
          changed = true;
        } catch (error: any) {
          console.error(`Failed on ${wine.wine_name} / ${type}:`, error);
          entry.failed.push(type);
        }
      }

      if (changed) {
        const { error } = await supabase
          .from("wines")
          .update({ images: updated })
          .eq("id", wine.id);
        if (error) {
          entry.failed.push("save");
          entry.fixed = [];
        } else {
          setWines((prev) =>
            prev.map((w) => (w.id === wine.id ? { ...w, images: updated } : w)),
          );
        }
      }

      entries.push(entry);
      setReport([...entries]);
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setRunning(false);
    const totalFixed = entries.reduce((n, e) => n + e.fixed.length, 0);
    toast.success(
      totalFixed > 0
        ? `Rotated ${totalFixed} image${totalFixed === 1 ? "" : "s"} upright.`
        : "No sideways images found.",
    );
  };

  const manualRotate = async (wine: WineRow, type: string) => {
    if (!userId) return;
    const url = wine.images?.[type];
    if (!url) return;
    setManualBusy(`${wine.id}:${type}`);
    try {
      const blob = await rotateStoredImage(url);
      if (!blob) throw new Error("Could not rotate this image");
      const publicUrl = await uploadFixed(userId, type, blob);
      const updated = { ...(wine.images ?? {}), [type]: publicUrl };
      const { error } = await supabase
        .from("wines")
        .update({ images: updated })
        .eq("id", wine.id);
      if (error) throw error;
      setWines((prev) =>
        prev.map((w) => (w.id === wine.id ? { ...w, images: updated } : w)),
      );
      toast.success("Rotated.");
    } catch (error: any) {
      toast.error(error.message ?? "Rotation failed");
    } finally {
      setManualBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#211111] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/70" />
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="min-h-screen bg-[#211111] flex items-center justify-center p-6">
        <p className="text-white/80">Please sign in to run this maintenance pass.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#211111] p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Fix bottle orientation</h1>
        <p className="text-sm text-white/70 max-w-xl">
          One-off maintenance pass. Every stored bottle image is checked; any image
          that is wider than it is tall gets rotated upright, re-uploaded and saved
          back to the wine. Portrait images are left untouched.
        </p>
      </header>

      <div className="flex items-center gap-4">
        <Button onClick={runPass} disabled={running} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
          {running ? `Processing ${progress.done}/${progress.total}` : `Run pass on ${wines.length} wines`}
        </Button>
      </div>

      {report.length > 0 && (
        <div className="space-y-3">
          {report.map((entry) => {
            const wine = wines.find((w) => w.id === entry.wineId);
            const stillPortraitButOdd = entry.skipped;
            return (
              <Card key={entry.wineId} className="bg-card p-4 space-y-2 border-border/50">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-white font-medium">{entry.wineName}</span>
                  {entry.fixed.length > 0 ? (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle2 className="h-3 w-3" />
                      rotated: {entry.fixed.join(", ")}
                    </span>
                  ) : entry.failed.length > 0 ? (
                    <span className="flex items-center gap-1 text-xs text-red-400">
                      <AlertTriangle className="h-3 w-3" />
                      failed: {entry.failed.join(", ")}
                    </span>
                  ) : (
                    <span className="text-xs text-white/50">already upright</span>
                  )}
                </div>

                {stillPortraitButOdd.length > 0 && wine && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs text-white/50">
                      Looks portrait already — rotate manually if it is still wrong:
                    </span>
                    {stillPortraitButOdd.map((type) => (
                      <Button
                        key={type}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={manualBusy === `${wine.id}:${type}`}
                        onClick={() => manualRotate(wine, type)}
                      >
                        {manualBusy === `${wine.id}:${type}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCw className="h-3 w-3" />
                        )}
                        {type}
                      </Button>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FixOrientation;

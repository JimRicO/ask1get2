/**
 * Post-AI orientation guard.
 *
 * The AI background-removal step returns its own canvas (often 1472x704
 * landscape) with the bottle lying on its side. The server runtime has no
 * canvas API, so the correction runs in the browser: any stored wine image
 * that is wider than tall is rotated upright, re-uploaded and saved back to
 * the wine record.
 */

import { supabase } from "@/integrations/supabase/client";
import { normalizeStoredImage } from "@/lib/normalizeImageOrientation";

export async function uprightWineImages(
  wineId: string,
  images: Record<string, string> | null | undefined,
  ownerId: string,
): Promise<Record<string, string> | null> {
  if (!images) return null;

  const updated: Record<string, string> = { ...images };
  let changed = false;

  for (const [type, url] of Object.entries(images)) {
    if (!url || typeof url !== "string") continue;
    try {
      const result = await normalizeStoredImage(url);
      if (!result) continue; // already portrait

      const fileName = `${ownerId}/${type}_upright_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("wine-images")
        .upload(fileName, result.blob, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("wine-images").getPublicUrl(fileName);
      updated[type] = publicUrl;
      changed = true;
    } catch (error) {
      console.error(`Could not upright ${type} image:`, error);
    }
  }

  if (!changed) return null;

  const { error } = await supabase
    .from("wines")
    .update({ images: updated })
    .eq("id", wineId);
  if (error) {
    console.error("Could not save upright images:", error);
    return null;
  }

  return updated;
}

/**
 * Post-AI readability guard.
 *
 * The AI background-removal step returns its own canvas and can hand back a
 * sideways or inverted bottle. One rule decides the fix: the label text must
 * read normally. The AI readability check says how far to turn each image, and
 * the rotation happens in the browser (the server runtime has no canvas).
 */

import { supabase } from "@/integrations/supabase/client";
import { checkLabelOrientation } from "@/lib/wine-ai.functions";
import {
  rotateStoredImage,
  toInspectableDataUrl,
} from "@/lib/normalizeImageOrientation";

/** Clockwise degrees needed to make the label readable, or null if unreadable. */
export async function readableRotation(
  imageUrl: string,
): Promise<number | null> {
  const dataUrl = await toInspectableDataUrl(imageUrl);
  if (!dataUrl) return null;
  const result = await checkLabelOrientation({ data: { image: dataUrl } });
  return result?.degrees ?? null;
}

export async function uprightWineImages(
  wineId: string,
  images: Record<string, string> | null | undefined,
  ownerId: string,
): Promise<Record<string, string> | null> {
  const frontUrl = images?.front;
  if (!images || !frontUrl || typeof frontUrl !== "string") return null;

  const updated: Record<string, string> = { ...images };
  try {
    const degrees = await readableRotation(frontUrl);
    if (!degrees) return null;

    const blob = await rotateStoredImage(frontUrl, degrees);
    if (!blob) return null;

    const fileName = `${ownerId}/front_readable_${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("wine-images")
      .upload(fileName, blob, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("wine-images").getPublicUrl(fileName);
    updated.front = publicUrl;
  } catch (error) {
    console.error("Could not straighten front image:", error);
    return null;
  }

  const { error } = await supabase
    .from("wines")
    .update({ images: updated })
    .eq("id", wineId);
  if (error) {
    console.error("Could not save straightened images:", error);
    return null;
  }

  return updated;
}

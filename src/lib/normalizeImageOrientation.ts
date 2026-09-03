/**
 * Image orientation helpers.
 *
 * Rule: the label text must read normally. Nothing here guesses where a bottle
 * neck is — rotation amounts come from the AI readability check
 * (`checkLabelOrientation`), and these helpers only apply them to the pixels.
 */

const isBrowser = () =>
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  typeof createImageBitmap === "function";

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92),
  );
}

/** Draw a bitmap rotated clockwise by 0/90/180/270 degrees. */
function drawRotated(
  bitmap: ImageBitmap,
  degrees: number,
): HTMLCanvasElement | null {
  const normalized = ((degrees % 360) + 360) % 360;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const swap = normalized === 90 || normalized === 270;
  canvas.width = swap ? bitmap.height : bitmap.width;
  canvas.height = swap ? bitmap.width : bitmap.height;

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalized * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return canvas;
}

/**
 * Returns a new File with EXIF orientation baked into the pixels, so any later
 * re-encode (the AI background removal, for instance) keeps what the user saw.
 * Falls back to the original file if anything is unsupported or fails.
 */
export async function normalizeImageOrientation(file: File): Promise<File> {
  if (!isBrowser() || !file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const canvas = drawRotated(bitmap, 0);
    bitmap.close?.();
    if (!canvas) return file;

    const blob = await canvasToBlob(canvas);
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (error) {
    console.error("Failed to normalize image orientation:", error);
    return file;
  }
}

/** Rotate a stored image clockwise by the given degrees (0/90/180/270). */
export async function rotateStoredImage(
  imageUrl: string,
  degrees: number,
): Promise<Blob | null> {
  if (!isBrowser()) return null;
  if (((degrees % 360) + 360) % 360 === 0) return null;

  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load image (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob(), {
    imageOrientation: "from-image",
  });

  const canvas = drawRotated(bitmap, degrees);
  bitmap.close?.();
  if (!canvas) return null;

  return canvasToBlob(canvas);
}

/** Fetch a stored image and return it as a compact JPEG data URL for the AI check. */
export async function toInspectableDataUrl(
  imageUrl: string,
  maxSide = 640,
): Promise<string | null> {
  if (!isBrowser()) return null;

  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load image (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob(), {
    imageOrientation: "from-image",
  });

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return null;
  }
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  return canvas.toDataURL("image/jpeg", 0.85);
}

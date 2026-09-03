/** Bake a photo's embedded camera/EXIF orientation into its pixels. */

const isBrowser = () =>
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  typeof createImageBitmap === "function";

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92),
  );
}

function drawBitmap(bitmap: ImageBitmap): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  ctx.drawImage(bitmap, 0, 0);
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
    const canvas = drawBitmap(bitmap);
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

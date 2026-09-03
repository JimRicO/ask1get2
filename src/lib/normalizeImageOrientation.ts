/**
 * Bake EXIF orientation into the pixels and force a portrait (vertical) image.
 *
 * Phone cameras store portrait shots as a landscape pixel grid plus an EXIF
 * "rotate me" flag. Browsers honour that flag when rendering, but any pipeline
 * that re-encodes the image (our AI background removal, for instance) drops it,
 * leaving the bottle permanently sideways. Normalizing before upload keeps the
 * stored bytes visually identical to what the user saw.
 */

const isBrowser = () =>
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  typeof createImageBitmap === "function";

/** Draw a bitmap to a canvas, rotating it upright when it is landscape. */
function drawUpright(bitmap: ImageBitmap): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const landscape = bitmap.width > bitmap.height;

  if (landscape) {
    // Rotate 90deg clockwise so the bottle stands vertical.
    canvas.width = bitmap.height;
    canvas.height = bitmap.width;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  } else {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    ctx.drawImage(bitmap, 0, 0);
  }

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92),
  );
}

/**
 * Returns a new File whose pixels are already oriented upright and portrait.
 * Falls back to the original file if anything is unsupported or fails.
 */
export async function normalizeImageOrientation(file: File): Promise<File> {
  if (!isBrowser() || !file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const canvas = drawUpright(bitmap);
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

/**
 * Same normalization, but starting from an already-stored image URL.
 * Used by the one-off repair pass over existing records.
 * Returns null when the image is already portrait (nothing to fix).
 */
export async function normalizeStoredImage(
  imageUrl: string,
): Promise<{ blob: Blob; rotated: boolean } | null> {
  if (!isBrowser()) return null;

  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load image (${response.status})`);
  const sourceBlob = await response.blob();

  const bitmap = await createImageBitmap(sourceBlob, {
    imageOrientation: "from-image",
  });
  const wasLandscape = bitmap.width > bitmap.height;
  if (!wasLandscape) {
    bitmap.close?.();
    return null;
  }

  const canvas = drawUpright(bitmap);
  bitmap.close?.();
  if (!canvas) return null;

  const blob = await canvasToBlob(canvas);
  if (!blob) return null;

  return { blob, rotated: true };
}

/** Rotate a stored image 90deg clockwise regardless of its current shape. */
export async function rotateStoredImage(imageUrl: string): Promise<Blob | null> {
  if (!isBrowser()) return null;

  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load image (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob(), {
    imageOrientation: "from-image",
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return null;
  }
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close?.();

  return canvasToBlob(canvas);
}

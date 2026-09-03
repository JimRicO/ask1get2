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

/**
 * Work out which way to rotate a sideways bottle so the neck ends up on top.
 *
 * The bottle sits on a near-uniform cream/white background, so we can measure
 * how thick the bottle is at each end of the long axis: the neck is the narrow
 * end. Returns "cw" (rotate clockwise, narrow end is on the left) or "ccw".
 */
function detectRotationDirection(bitmap: ImageBitmap): "cw" | "ccw" {
  try {
    const sampleWidth = 240;
    const scale = sampleWidth / bitmap.width;
    const sampleHeight = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return "cw";
    ctx.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
    const { data } = ctx.getImageData(0, 0, sampleWidth, sampleHeight);

    const pixelAt = (x: number, y: number) => {
      const i = (y * sampleWidth + x) * 4;
      return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0] as const;
    };

    // Background estimated from the four corners.
    const corners = [
      pixelAt(0, 0),
      pixelAt(sampleWidth - 1, 0),
      pixelAt(0, sampleHeight - 1),
      pixelAt(sampleWidth - 1, sampleHeight - 1),
    ];
    const bg = [0, 1, 2].map(
      (c) => corners.reduce((sum, p) => sum + (p[c] ?? 0), 0) / corners.length,
    );

    const threshold = 42;
    const thickness: number[] = [];
    for (let x = 0; x < sampleWidth; x++) {
      let count = 0;
      for (let y = 0; y < sampleHeight; y++) {
        const [r, g, b] = pixelAt(x, y);
        const diff =
          Math.abs(r - (bg[0] ?? 0)) +
          Math.abs(g - (bg[1] ?? 0)) +
          Math.abs(b - (bg[2] ?? 0));
        if (diff > threshold) count++;
      }
      thickness.push(count);
    }

    // Content columns only (ignore the empty margins).
    const minContent = Math.max(2, Math.round(sampleHeight * 0.04));
    const first = thickness.findIndex((t) => t >= minContent);
    let last = -1;
    for (let x = thickness.length - 1; x >= 0; x--) {
      if ((thickness[x] ?? 0) >= minContent) {
        last = x;
        break;
      }
    }
    if (first < 0 || last <= first) return "cw";

    const span = last - first + 1;
    const band = Math.max(1, Math.round(span * 0.18));
    const avg = (from: number, to: number) => {
      const slice = thickness.slice(from, to);
      return slice.length
        ? slice.reduce((sum, t) => sum + t, 0) / slice.length
        : 0;
    };
    const leftThickness = avg(first, first + band);
    const rightThickness = avg(last - band + 1, last + 1);

    // Too close to call: fall back to clockwise.
    const ratio =
      Math.max(leftThickness, rightThickness) /
      Math.max(1, Math.min(leftThickness, rightThickness));
    if (ratio < 1.15) return "cw";

    // Narrow end (the neck) must end up at the top.
    // Clockwise rotation maps the left edge to the top edge.
    return leftThickness < rightThickness ? "cw" : "ccw";
  } catch (error) {
    console.error("Failed to detect bottle orientation:", error);
    return "cw";
  }
}

/** Rotate a bitmap 90deg in the given direction. */
function rotateBitmap(
  bitmap: ImageBitmap,
  direction: "cw" | "ccw",
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(direction === "cw" ? Math.PI / 2 : -Math.PI / 2);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return canvas;
}

/** Draw a bitmap to a canvas, rotating it upright when it is landscape. */
function drawUpright(bitmap: ImageBitmap): HTMLCanvasElement | null {
  if (bitmap.width > bitmap.height) {
    return rotateBitmap(bitmap, detectRotationDirection(bitmap));
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  ctx.drawImage(bitmap, 0, 0);
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

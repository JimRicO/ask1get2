export const PHOTO_MAX_EDGE = 1600;

export function fitPhoto(width: number, height: number) {
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
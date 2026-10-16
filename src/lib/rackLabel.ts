/** Display a rack value unambiguously: a bare "6" or "B2" reads as "Rack 6". */
export function formatRack(rack?: string | null): string {
  const r = (rack ?? "").trim();
  if (!r) return "";
  if (/^[a-z]?\d+[a-z]?$/i.test(r) || /^[a-z]$/i.test(r)) return `Rack ${r}`;
  return r;
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

export function sameLocation(a?: string | null, b?: string | null) {
  return norm(a) === norm(b);
}
export function sameRack(a?: string | null, b?: string | null) {
  return norm(a) === norm(b);
}

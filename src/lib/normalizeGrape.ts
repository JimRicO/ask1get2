const KNOWN_GRAPES = [
  "Cabernet Franc",
  "Cabernet Sauvignon",
  "Chardonnay",
  "Chenin Blanc",
  "Cinsault",
  "Grenache",
  "Malbec",
  "Merlot",
  "Mourvèdre",
  "Nebbiolo",
  "Petit Verdot",
  "Pinot Grigio/Gris",
  "Pinot Meunier",
  "Pinot Noir",
  "Riesling",
  "Roussanne",
  "Sangiovese",
  "Sauvignon Blanc",
  "Syrah/Shiraz",
  "Tannat",
  "Tempranillo",
  "Verdelho",
  "Viognier",
  "Zinfandel",
  "Barbera",
];

const KNOWN_BY_LOWER = new Map(KNOWN_GRAPES.map((g) => [g.toLowerCase(), g]));

const SMALL_WORDS = new Set(["de", "di", "du", "da", "of", "and", "the", "le", "la"]);

function titleCaseToken(token: string, index: number): string {
  const lower = token.toLowerCase();
  if (index > 0 && SMALL_WORDS.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Normalize a grape varietal name to a single canonical capitalisation so the
 * same grape never appears multiple times in filters. Spelling is untouched.
 */
export function normalizeGrape(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  const known = KNOWN_BY_LOWER.get(trimmed.toLowerCase());
  if (known) return known;

  // Title case each word, preserving separators like "/" and "-".
  let wordIndex = 0;
  return trimmed
    .split(/([\s/-]+)/)
    .map((part) => {
      if (/^[\s/-]+$/.test(part)) return part;
      return titleCaseToken(part, wordIndex++);
    })
    .join("");
}

/**
 * Normalize a list of grape varietals and drop case-insensitive duplicates,
 * preserving the original order.
 */
export function normalizeGrapeList(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeGrape(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

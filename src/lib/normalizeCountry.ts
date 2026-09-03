const ACRONYMS = new Set([
  "USA",
  "UK",
  "US",
  "UAE",
]);

const SMALL_WORDS = new Set(["of", "and", "the", "de", "da", "di"]);

/**
 * Normalize a country name to a single canonical capitalisation so the same
 * country never appears multiple times in filters.
 */
export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase().replace(/\./g, "");
  if (ACRONYMS.has(upper)) return upper === "US" ? "USA" : upper;

  return trimmed
    .split(" ")
    .map((word, index) => {
      const bare = word.toUpperCase().replace(/\./g, "");
      if (ACRONYMS.has(bare)) return bare;
      const lower = word.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

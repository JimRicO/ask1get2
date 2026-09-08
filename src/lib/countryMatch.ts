const COUNTRIES: Record<string, { name: string; aliases: string[] }> = {
  US: { name: "the United States", aliases: ["united states", "united states of america", "usa", "us", "america"] },
  FR: { name: "France", aliases: ["france"] },
  IT: { name: "Italy", aliases: ["italy", "italia"] },
  ES: { name: "Spain", aliases: ["spain", "espana", "españa"] },
  PT: { name: "Portugal", aliases: ["portugal"] },
  DE: { name: "Germany", aliases: ["germany", "deutschland"] },
  AT: { name: "Austria", aliases: ["austria", "osterreich", "österreich"] },
  GR: { name: "Greece", aliases: ["greece", "hellas"] },
  HU: { name: "Hungary", aliases: ["hungary", "magyarorszag", "magyarország"] },
  AR: { name: "Argentina", aliases: ["argentina"] },
  CL: { name: "Chile", aliases: ["chile"] },
  ZA: { name: "South Africa", aliases: ["south africa", "rsa", "republic of south africa"] },
  AU: { name: "Australia", aliases: ["australia"] },
  NZ: { name: "New Zealand", aliases: ["new zealand", "aotearoa"] },
  GE: { name: "Georgia", aliases: ["georgia", "sakartvelo"] },
  MD: { name: "Moldova", aliases: ["moldova", "republic of moldova"] },
  RO: { name: "Romania", aliases: ["romania"] },
  BG: { name: "Bulgaria", aliases: ["bulgaria"] },
  CH: { name: "Switzerland", aliases: ["switzerland", "suisse", "schweiz", "svizzera"] },
  SI: { name: "Slovenia", aliases: ["slovenia", "slovenija"] },
  HR: { name: "Croatia", aliases: ["croatia", "hrvatska"] },
  UY: { name: "Uruguay", aliases: ["uruguay"] },
  CA: { name: "Canada", aliases: ["canada"] },
  IL: { name: "Israel", aliases: ["israel"] },
  LB: { name: "Lebanon", aliases: ["lebanon", "liban"] },
  GB: { name: "the United Kingdom", aliases: ["united kingdom", "uk", "great britain", "england"] },
};

/** Display name for an ISO-2 code, for use in prompts. */
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  return COUNTRIES[code.trim().toUpperCase()]?.name ?? null;
}

/**
 * wines.country is free text written by the label reader, so it can be
 * "United States", "USA", "us" or anything else the model produced. Comparing
 * it to an ISO-2 code with startsWith silently fails for exactly the markets
 * whose names do not begin with their own code.
 */
export function matchesCountry(value: string | null | undefined, code: string | null | undefined): boolean {
  if (!value || !code) return false;
  const iso = code.trim().toUpperCase();
  const raw = value.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (!raw) return false;
  if (raw.toUpperCase() === iso) return true;
  const entry = COUNTRIES[iso];
  if (!entry) return false;
  return entry.aliases.includes(raw);
}

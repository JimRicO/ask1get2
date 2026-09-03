# Fix duplicate grape varietals caused by capitalisation

Same grape appears several times with different casing (`Cinsault` vs `cinsault`, `Tannat` vs `tannat`, `barbera`, `cabernet franc`, `petit verdot`). Confirmed in the database, and one wine even stores both `Cinsault` and `cinsault` in its own list.

## What gets fixed

1. **Existing data** — normalise every grape name already stored so each grape has one canonical capitalisation, and remove duplicates inside a single wine's grape list (`["Cinsault","cinsault"]` becomes `["Cinsault"]`).
2. **New entries** — normalise grape names on save in Add Wine, Wishlist and Wine Detail, so typing "cinsault" stores `Cinsault`.
3. **Cellar filter** — build the grape filter options case-insensitively and match case-insensitively, so legacy casing can never produce a second entry in the dropdown.

Spelling mistakes are left alone (e.g. `cabernet sauvignot` stays as-is) — only capitalisation is changed.

## Canonical capitalisation rule

Mirrors the existing country fix: a grape name is matched case-insensitively against the known varietal list already used in the Add Wine dropdown (`Cabernet Sauvignon`, `Syrah/Shiraz`, `Chenin Blanc`, ...) and rewritten to that exact spelling. Unknown grapes fall back to Title Case with small words lowercased (`blanc de blanc` -> `Blanc de Blanc`), preserving separators like `/` and `-`.

## Technical details

- New `src/lib/normalizeGrape.ts` with `normalizeGrape(value)` and `normalizeGrapeList(values)` (normalise + dedupe, preserving order), following the pattern of `src/lib/normalizeCountry.ts`.
- Apply on write:
  - `AddWine.tsx` — the `allGrapes` array built from main + additional grapes.
  - `WineDetail.tsx` — the `grapeArray` built when saving edits.
  - `Wishlist.tsx` — the comma-separated `grape_varietals` string.
- `Cellar.tsx` — `uniqueGrapes` deduped by lowercase key (keeping the normalised label) and `matchesGrape` compared case-insensitively.
- One data migration updating `public.wines.grape_varietals` for the affected rows only; no schema change, no RLS change.

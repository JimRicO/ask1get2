# Fix duplicate countries in the filter list

## What's wrong

The country filter lists the same country several times because the stored values differ only by capitalisation. Confirmed in the database today:

- "South Africa" — 26 bottles
- "SOUTH AFRICA" — 1 bottle
- "south africa" — 1 bottle

France, Italy, Spain and USA are currently consistent.

## The fix

1. Clean the existing data: rewrite country values to a single canonical capitalisation (Title Case, with "USA" and similar acronyms kept upper case), so all 28 South Africa bottles share one value.
2. Normalise on the way in: when a bottle is saved (manual entry, AI label extraction, wishlist), trim and title-case the country before writing it, so new spellings can't reintroduce duplicates.
3. Make the filter itself case-insensitive when grouping the dropdown options, so any legacy value still collapses into one entry and still matches its bottles.

Result: one "South Africa" row in the dropdown, and selecting it returns all its bottles.

## Technical notes

- One-off data update on `public.wines.country` collapsing case variants.
- Add a small country-normalising helper in `src/lib/` and apply it where wines/wishlist rows are inserted or updated (`src/pages/AddWine.tsx`, `src/pages/WineDetail.tsx`, `src/pages/Wishlist.tsx`, and the AI extraction handler in `src/lib/wine-ai.functions.ts`).
- In `src/pages/Cellar.tsx`, build `uniqueCountries` from a case-insensitive map and compare `matchesCountry` case-insensitively.
- No schema, RLS or storage changes.

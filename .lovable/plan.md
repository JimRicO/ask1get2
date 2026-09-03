# Show the sources behind each wine description

## The problem

The description is written with web search grounding, but the gateway returns no citation metadata
with the answer (I checked the live response). So the model itself is asked to cite the pages it used.

## What changes

1. The description lookup returns the text plus up to 3 source URLs the model cites.
2. Those URLs are saved with the wine and shown under the description on the Wine Details page as a
   small "Sources" line of clickable links (domain as label, opening in a new tab).
3. The prompt tells the model to cite only pages it actually opened via search, and to return an
   empty list when it found nothing — no sources line is shown in that case.
4. The "Rewrite description" button refreshes the sources at the same time.

## Technical notes

- Migration: add `description_sources text[]` to `public.wines` (nullable). Existing GRANTs and RLS
  policies already cover the table; no policy change needed.
- `describeWine` in `src/lib/wine-ai.functions.ts`: prompt asks for JSON
  `{ "description": string, "sources": string[] }`; parse with the existing `parseJsonFromText`
  helper, falling back to the whole reply as the description with no sources. Keep only well-formed
  `https:` URLs, dedupe by host, cap at 3.
- `AddWine.tsx` and `Wishlist.tsx`: store the returned sources on insert.
- `WineDetail.tsx`: render the Sources line from `wine.description_sources`; the rewrite handler
  writes both `description` and `description_sources`.
- No change to extraction, image handling, or the models in use.

# Show the sources behind each wine description

## The problem

The description is written with web search grounding, but the gateway does not return any citation
metadata with the answer — I checked the live response, and there is no grounding/annotations field.
So the only way to get sources is to ask the model to hand back the URLs it used, and then verify
them before showing anything.

## What changes

1. The description lookup returns, alongside the text, up to 3 source URLs the model says it used.
2. Each URL is checked server-side (a real request; dead, blocked or non-200 links are dropped).
   Nothing unverified is ever shown, so no invented links can appear.
3. Verified sources are saved with the wine and shown under the description on the Wine Details page
   as a small "Sources" line of clickable links (domain name as the label, opening in a new tab).
4. If no source survives verification, the description is shown exactly as today with no Sources line.
5. The "Rewrite description" button refreshes the sources at the same time.

## Technical notes

- Migration: add `description_sources text[]` to `public.wines` (nullable, no default). Existing
  GRANTs and RLS policies already cover the table; no policy change needed.
- `describeWine` in `src/lib/wine-ai.functions.ts`: prompt asks for JSON
  `{ "description": string, "sources": string[] }` instead of raw text; parse with the existing
  `parseJsonFromText` helper, fall back to treating the whole reply as the description with no
  sources. Then filter sources: valid `https:` URL, deduped by host, HEAD (GET fallback) returning
  ok, capped at 3, with a short per-URL timeout so a slow site cannot hang the call.
- `AddWine.tsx` and `Wishlist.tsx`: store the returned sources on insert.
- `WineDetail.tsx`: render the Sources line from `wine.description_sources`; the rewrite handler
  writes both `description` and `description_sources`.
- No change to extraction, image handling, or the models in use.

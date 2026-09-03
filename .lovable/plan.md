# Web-grounded wine descriptions + rewrite button

## Today
The description is written in one label-reading AI call (`extractWineData`, Gemini 2.5 Flash) from your photos only. No web search, no wine database — so obscure bottles get generic or invented notes. It is written once at add time and never refreshed.

## What changes

### 1. Web grounding
After the label is read, a second AI call looks the wine up on the web (Google Search grounding) using the extracted producer, wine name and vintage, and writes a 2-3 sentence description based on what it finds. If the search returns nothing useful, the description falls back to label-only facts and is not invented.

### 2. Model update
Move the wine-reading and description calls to a current Gemini 3 Flash model. Note: `gemini-3.5-flash` is already marked deprecated on the gateway; `google/gemini-3.7-flash` is the current non-deprecated Flash and is what I'll use unless you want 3.5 specifically. Verified working with search grounding.

### 3. Rewrite description button
On the Wine Details page, next to the description, a "Rewrite description" button re-runs the grounded lookup for that wine (producer, name, vintage, region, grapes) and saves the new text. Shows a spinner while working, a toast on success or failure, and leaves the old text untouched if the call fails. Also available when the description is empty.

## Technical notes
- New authenticated server fn `describeWine` in `src/lib/wine-ai.functions.ts`: takes producer/name/vintage/region/grapes, calls the gateway with `tools: [{ type: "google_search" }]`, returns `{ description, sources }`.
- `extractWineData` and `extractWineName` model strings bump to `google/gemini-3.7-flash`; extraction prompt drops the "invent a description" instruction — description now comes from `describeWine`.
- Add Wine and Wishlist call `describeWine` after extraction and prefill the description field; user can still edit before saving.
- `WineDetail.tsx` gets the rewrite control, wired through `useServerFn` and a `wines.description` update.
- No timeouts wrapped around gateway calls. No schema change.

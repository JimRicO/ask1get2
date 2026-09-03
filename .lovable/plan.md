# Include grape percentages in the description

## What changes

When the web lookup (or the label text you already extracted) states the blend proportions — e.g. "70% Cabernet Sauvignon, 20% Merlot, 10% Cabernet Franc" — the generated description must state them. When no percentages are found, the description lists the grapes without inventing numbers.

Applies to both places the description is written: the automatic lookup after a label scan (Add Wine, Wishlist) and the "Rewrite description" button on Wine Details. No schema change, no UI change.

## Technical notes

- Only `describeWine` in `src/lib/wine-ai.functions.ts` changes: add prompt rules to search for and report the blend percentages for the specific cuvée and vintage, and an explicit "never estimate or invent percentages" rule so unsupported numbers are not produced.
- Sentence budget widened slightly (2–4 sentences) so the blend can be stated without crowding out style/terroir.
- Everything else — model, grounding tool, callers, saving logic — stays as is.

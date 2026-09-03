# Fix front-label recovery: stop offering unrelated bottles

## The problem

Stored image files are named `front_<timestamp>.jpg` — nothing in the filename or the
database links a file to a specific wine. So "Choose earlier front" lists every front
photo in your account, which is why unrelated bottles show up. There is no reliable way
to auto-match old files to a wine, so the page should stop pretending it can.

## What changes on /fix-orientation

Each wine row keeps only actions that cannot show the wrong bottle:

1. **Current front preview** — the image the cellar card actually uses, portrait sized.
2. **Rotate left / 180 / rotate right** — manual pixel rotation of that front image only.
3. **Replace front photo** — a file/camera input that uploads a new front image for that
   one wine. Uploaded as-is (no AI, no auto-rotation), then set as `front`.

The name-based candidate list and its search box are removed. In its place, an optional,
collapsed **"Show all my stored photos"** panel per wine renders a thumbnail grid of
stored front files so you can *visually* pick one and confirm it — it stays closed by
default and is never presented as a suggestion for that wine.

## Rules that stay enforced

- Only `front` is ever read, rotated, replaced or saved.
- `back`, `neck` and `overall` are never displayed, rotated, processed or overwritten.
- Failed operations leave the whole image map untouched — no partial writes.
- No AI orientation or background pass runs anywhere on this page.
- No storage objects are deleted.

## Technical notes

- Edit `src/pages/FixOrientation.tsx` only.
- Drop `visibleCandidates`, `candidateSearch` and the filename-filtered candidate flow;
  keep `storedFronts` loading solely to feed the collapsed thumbnail grid.
- Add an upload handler writing to `${userId}/front_manual_${Date.now()}.<ext>` in the
  `wine-images` bucket, then `saveFrontReference(wine, publicUrl)`.
- `rotateFront` and `saveFrontReference` stay as-is (rotate → upload JPEG → merge only
  the `front` key).
- Verify with `bunx tsgo --noEmit` and a browser check that `/fix-orientation` renders
  rows with no candidate list visible by default.

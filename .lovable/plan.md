# Scan animation on Add Wine photos

## What I understood
On the Add Wine page, each of the four photo tiles (Front label, Back label, Neck, Full bottle) gets the same scan effect as "At a restaurant":
- When a photo is taken/uploaded in a tile: the white flash over that photo, then the peach scan line sweeps the full width of the photo.
- While "Magic scan" is reading the labels: the scan line keeps sweeping slowly on every tile that has a photo, then makes one final pass and stops when reading finishes.
- Peach corners snap onto each photo when reading is done (quiet version — no clink, no fork/knife).

Nothing else changes: same photos, same reading, same saving, same buttons.

## Technical details
- Move `ScanLine` and `Flash` out of `src/pages/Restaurant.tsx` into a shared `src/components/ScanEffects.tsx`; Restaurant imports them back unchanged (identical behaviour).
- In `src/pages/AddWine.tsx`: wrap each preview image in a relative container; fire `Flash` + one `ScanLine` pass on upload per tile; `ScanLine active={aiProcessing}` on all filled tiles; reuse existing `rv-*` CSS utilities and keyframes (rv-lock for the corners).
- No server/data changes.

# Use the overall bottle photo as the card thumbnail

Confirmed: the thumbnail on wine cards should come from the **overall** view (the whole-bottle photo), not the front label photo.

## Change

- Cellar wine cards: show `images.overall` instead of `images.front`.
- Wishlist cards: same switch, for consistency.
- If a record has no overall photo, keep the existing placeholder icon (no silent fallback to another view, per the front/back/neck/overall separation rule).
- Keep portrait framing with `object-contain` so nothing is cropped.

Nothing else changes: no image rewriting, no rotation, no processing — uploads still only bake in camera EXIF orientation.

## Technical detail

- `src/pages/Cellar.tsx` line ~395: thumbnail source `wine.images?.front` -> `wine.images?.overall`.
- `src/pages/Wishlist.tsx` line ~375: card thumbnail `item.images?.front` -> `item.images?.overall`.
- Detail-page image sections stay as they are.

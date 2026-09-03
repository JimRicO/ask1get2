# Make every bottle label readable, right way up

## What went wrong

The last repair guessed the top of the bottle by measuring the silhouette's thickness (the "neck" idea). On label close-ups there is no neck to measure, so it fell back to a fixed clockwise rotation. That's why 20 repaired records came out with several labels upside down.

## The simple rule

One rule, no silhouette analysis: **the label text must read normally.**

For each image, ask the AI vision model a single question — "is the text on this label upright, upside down, rotated left, or rotated right?" — then rotate the pixels by 0, 90, 180 or 270 degrees to make it upright. That's it.

## What gets built

### 1. Readability check on every new upload
Add Wine and Edit Wine: after the photo is taken and after background removal, check text readability and rotate to upright before the image is saved to the wine record.

### 2. One-off repair of what's already stored
Update `/fix-orientation` to run the readability check on every current wine image — including the files the previous pass already touched — and rotate each one so the label reads normally. Anything the model can't read (blank or textless images, like the current Blanc Sec thumbnail) is left alone and listed with rotate-left / rotate-180 / rotate-right buttons and a preview so you can set it in one click.

### 3. Display
Portrait thumbnail frame with `object-contain` stays as is, so nothing is cropped.

## Verification
Run the repair, then re-check the affected wines in the cellar and confirm the labels read normally. Typecheck and production build.

## Technical notes
- Readability check goes through the existing authenticated AI gateway (`src/lib/wine-ai.functions.ts`), returning only one of: upright / upside-down / rotate-left / rotate-right / unreadable.
- Rotation stays client-side Canvas work in `src/lib/normalizeImageOrientation.ts`; the neck/thickness detector is deleted.
- No database schema change.

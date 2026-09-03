# Fix sideways bottle previews

## Confirmed

Photos are uploaded exactly as the phone produced them: `handleImageChange` stores the raw `File` and `submitWine` uploads it unchanged. Nothing in the codebase touches EXIF orientation, rotation, or canvas re-encoding.

Phone cameras store portrait shots as a landscape pixel grid plus an EXIF "rotate me" flag. The browser honours that flag in `<img>`, so the local preview looks fine — but the AI background-removal step re-renders the image and writes a new PNG with no EXIF flag, so the stored bottle is permanently sideways. That is exactly what the screenshot shows: some thumbnails upright, others rotated 90 degrees.

## Fix

1. **Bake orientation in before upload.** Add a small image helper that decodes the picked file with the EXIF flag applied, draws it to a canvas, and re-encodes it as a JPEG. The uploaded bytes then match what the user saw — no hidden flag left for the AI step to drop.
2. **Force portrait.** In the same helper, if the normalized image is wider than it is tall, rotate it 90 degrees so the bottle stands vertical. A wine bottle photo is portrait by definition, so this is a safe rule and it also rescues photos whose EXIF flag was missing or wrong to begin with.
3. **Apply on every entry point** that accepts a bottle photo: Add Wine, Wishlist, and the Wine Detail re-photograph flow — so the fix is not limited to the one screen.
4. **Guard the display.** Give the list/detail thumbnails a portrait aspect box so a stray landscape image from an older record is letterboxed upright instead of cropping the label sideways.

5. **One-off repair pass for existing records.** Add a temporary owner-only maintenance page (`/fix-orientation`) that lists your wines, loads each stored image, detects landscape ones, rotates them upright, uploads the corrected file to storage and updates the wine record — with a progress readout and a report of what was changed and what was skipped. Portrait images are left untouched. The page is removable once the pass has run.

   Note: this pass can only fix images whose pixel grid is landscape. If a bottle was stored as a portrait-shaped image that is still visually rotated, automatic detection cannot see it; those get flagged in the report with a manual "rotate this one" button so you can correct them by hand.


## Technical notes

- New `src/lib/normalizeImageOrientation.ts`: `createImageBitmap(file, { imageOrientation: "from-image" })`, canvas draw, portrait rotation, `canvas.toBlob` to JPEG (quality ~0.92), returned as a `File` with the original name. Falls back to the original file if canvas/bitmap is unavailable.
- Hook it into the file-input handlers so both the preview and the uploaded bytes come from the normalized file (the same object also feeds the AI extraction base64, keeping AI input upright too).
- Display: portrait aspect wrapper with `object-cover` retained in `src/pages/Cellar.tsx` and the wine detail image.
- No database or storage schema changes.

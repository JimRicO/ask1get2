# Fix horizontal bottle thumbnails (real root cause)

## What I found

The EXIF fix from the last round is not the cause here. I measured the actual stored images used by the thumbnails:

- FULL SENTIMENTAL, De Thermes, Blanc Sec, Barbera d'Alba — all stored as **1472 x 704 pixels**, i.e. landscape.
- All four filenames are `front_cleaned_*.png`, meaning they are the **output of the AI background-removal step**, not the original phone photo.

So the AI image step returns a wide landscape canvas with the bottle lying on its side, and that landscape file is what gets saved to the wine record. No display tweak can fix it, because the pixels themselves are sideways.

Also note: the screenshot is from the published site (nowinenosex.com), which still runs the previous build.

## Plan

### 1. Never save a landscape bottle image again
In the background-removal / image-processing server function, after the AI returns an image:
- If the returned image is wider than tall, rotate it to portrait before uploading.
- Decide the rotation direction by content shape rather than guessing: find the bottle's content bounding box, measure how thick the content is at each end, and rotate so the **narrow end (the neck) points up**. If the two ends are too similar to call, default to rotating 90 degrees clockwise.
- Tighten the AI prompt to ask for a portrait, upright bottle on a cream background and to preserve the original framing.
- If the AI output cannot be made portrait, fall back to the user's normalized original photo instead of saving a sideways image.

### 2. Repair the existing sideways records
The `/fix-orientation` maintenance page already exists but has never been run, and its current rule only rotates landscape images by a fixed 90 degrees. Update it to use the same neck-detection rotation, then you run it once. It will:
- Walk every wine image you own,
- Rotate and re-upload the landscape ones as upright portrait JPEGs,
- Update each wine record,
- Report fixed / skipped / failed per wine, with manual rotate buttons for anything that still looks wrong.

### 3. Thumbnail display
Keep `object-contain` so nothing is cropped, and give the thumbnail box a portrait aspect so upright bottles fill it naturally.

### 4. Verify
Typecheck, production build, then re-check the stored pixel dimensions of a repaired record to confirm they are portrait (taller than wide) rather than relying on the visual alone.

## Note
The published site will keep showing the old thumbnails until you publish after this change; the repair pass writes to the shared database, so repaired images appear in both preview and published.

# Guarantee one upright orientation for every wine image

## Confirmed problem

The one-off pass repaired 20 wine records, including 18 front images and 18 overall images. The resulting files are portrait-shaped, but some are upside down.

The current algorithm only compares the thickness at the left and right ends of a landscape image to guess where the bottle neck is. This fails for front/back label close-ups where no neck is visible. When it cannot distinguish the ends, it defaults to clockwise rotation; that arbitrary fallback produced the mixed orientations shown in the cellar.

## Fix

### 1. Replace the ambiguous neck guess

Add an image-orientation classifier that returns exactly one of:

- upright
- upside down
- rotate clockwise
- rotate counter-clockwise
- uncertain

It will judge bottle shape, bottle base/neck, label text, and label artwork together instead of relying on a single silhouette measurement. Local pixel rotation will then apply the classifier’s explicit correction. No direction will be chosen from a blind clockwise fallback.

### 2. Make new uploads safe before saving

For both Add Wine and Edit Wine:

- Normalize the original camera image first.
- Run background removal while explicitly preserving the source orientation.
- Classify the processed result before it becomes the wine’s stored image.
- Rotate only when the result is explicit.
- If classification is uncertain, keep the correctly normalized original rather than save a potentially inverted AI result.
- Verify the final image is portrait and upright before updating the wine record.

### 3. Repair the images inverted by the previous pass

Update `/fix-orientation` to inspect every current wine image, including portrait-shaped files created by the previous repair. The new pass will:

- classify each current image;
- rotate upside-down images by 180°;
- rotate sideways images in the required direction;
- leave confirmed-upright images unchanged;
- refuse to auto-save uncertain results and show them for manual review;
- provide rotate-left, rotate-180, and rotate-right controls with a visible preview;
- save only the corrected file and update that wine record.

This specifically covers the existing `_upright_` files; it will not skip them merely because their dimensions are portrait.

### 4. Verification

- Test the classifier against known upright, upside-down, clockwise, and counter-clockwise stored images.
- Run typecheck and production build.
- Verify representative corrected records visually in the cellar and confirm their stored dimensions are portrait.
- Keep `object-contain` in the portrait thumbnail frame so the bottle is never cropped.

## Technical notes

- Classification uses the existing authenticated AI gateway; rotation remains client-side Canvas processing.
- The orientation response is schema-validated before any rotation is applied.
- The existing silhouette detector may be retained only as supporting evidence when a full bottle outline is clearly present; it will never again decide an ambiguous case by default.
- No database schema change is required.

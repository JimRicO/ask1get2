# Stop image damage and restore front-label thumbnails

## Confirmed problem

The current code violates the required image roles in three places:

- `/fix-orientation` loops through **front, back, neck, and overall** and writes rotated replacements for all of them.
- New-wine post-processing also sends the complete image map through orientation correction.
- Wine Detail “Remove Background” processes every image and then replaces the wine's entire image map with only the successful outputs, which can remove views when one fails.

The database confirms this happened: among 45 wines, generated `*_readable_*` files are currently assigned to 6 front, 4 back, 5 neck, and 2 overall fields. Older image objects still exist in storage, so recovery candidates are available, but the app has no version-history field that reliably identifies the correct old file for every wine.

## Required image rules

- `front` is the main-label image and the **only** cellar thumbnail.
- Only `front` may be checked or rotated for thumbnail orientation.
- `back`, `neck`, and `overall` must never be automatically rotated, background-removed, replaced, or used as the thumbnail.
- A failed image operation must preserve every existing image URL. It must never replace the complete image map with a partial result.
- No AI-generated image replaces a stored image without a valid, visible result.

## Implementation

### 1. Stop further damage

- Restrict orientation/readability processing to `images.front` only.
- Restrict automatic background cleanup to the front image only.
- Remove all multi-image calls to the orientation helper.
- Change every image update to merge one validated front URL into the existing image map; preserve back, neck, and overall byte-for-byte.
- Remove any fallback that uses `overall` as the cellar thumbnail. If front is absent or invalid, show the existing placeholder instead.

### 2. Replace the dangerous maintenance pass

- Change `/fix-orientation` into a front-label-only recovery screen.
- It will never write automatically across the cellar.
- For each wine, show the current front image and any recoverable earlier front-image candidates from storage.
- Require an explicit per-wine selection and preview before restoring or rotating a front image.
- Do not display or modify back, neck, or overall on this screen.

### 3. Recover the damaged records safely

- Restore back, neck, and overall from identifiable pre-`readable`/pre-`upright` stored files only where the mapping can be established safely.
- When an old file cannot be matched to a wine with certainty, do not guess; list that wine for manual selection in the recovery screen.
- Recover blank front thumbnails by selecting a visible earlier front image, then allow manual 90°/180° rotation of that front image only.
- Preserve all current storage files during recovery; update database references only, so nothing is irreversibly deleted.

### 4. Verify the actual wine-card behavior

- Confirm cellar cards render only `images.front`.
- Confirm front-label text is readable and the image is visible before saving a repaired reference.
- Confirm back, neck, and overall URLs remain unchanged during front processing.
- Test Add Wine, Edit Wine, background removal, and recovery with partial/failed processing.
- Typecheck, production build, and visually verify representative cellar cards and wine detail views.

## Scope boundary

No bottle-neck detection, no automatic orientation of secondary views, and no bulk AI rewrite of stored images.

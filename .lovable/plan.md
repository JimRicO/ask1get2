# Remove orientation machinery and preserve vertical uploads

## Goal

Return image handling to a simple wine-cellar rule: the user uploads the four bottle
views, the app respects each photo's camera orientation, and every view is displayed in
a vertical frame. The app must not guess, classify, replace, or associate images.

## Remove the added recovery system

- Delete the `/fix-orientation` route and recovery page.
- Remove the stored-image candidate browser and “Choose earlier front”.
- Remove `uprightWineImages`, the label-readability AI check, stored-image rotation,
  and inspection/data-URL helpers.
- Remove every automatic post-upload orientation pass and every call that rewrites a
  saved wine image after upload.
- Do not modify any existing database image references or delete storage objects.

## Upload behavior

For **front, back, neck, and overall** in Add Wine, Wishlist, and Edit Wine:

1. Read the uploaded photo using its embedded camera/EXIF orientation.
2. Bake that orientation into the image pixels once.
3. Save exactly that normalized upload—no AI orientation, no bottle/neck detection,
   no label-reading, and no background-generated replacement as part of orientation.
4. Show the preview in a stable portrait frame with `object-contain`, so the complete
   view remains visible without cropping.

This corrects the common phone-photo problem where a vertical photo is stored with
sideways pixels plus orientation metadata. It does not guess a rotation when the source
photo itself contains no correct orientation metadata.

## Existing background-removal feature

Keep the explicit user-triggered front-background-removal feature, but remove its
orientation follow-up. Remove the automatic background-processing call after adding a
wine, because it silently replaces the uploaded front photo. A user upload remains the
stored image unless the user explicitly requests background removal.

## Display behavior

- Cellar thumbnail: front view only, portrait frame, `object-contain`.
- Wine detail carousel: all stored views, portrait frame, `object-contain`.
- Add/Edit/Wishlist previews: all four views, portrait frame, `object-contain`.
- No fallback from front to another view for thumbnails.

## Verification

- Confirm no references remain to `/fix-orientation`, `uprightWineImages`,
  `checkLabelOrientation`, or stored-image rotation helpers.
- Typecheck and build.
- Browser-test upload previews for front, back, neck, and overall using a phone-oriented
  image and confirm each preview remains vertical and uncropped.

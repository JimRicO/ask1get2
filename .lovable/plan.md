# Fix typing a custom grape varietal

## What's wrong

On the Add Wine page, the "Enter custom grape varietal" box only appears while the main grape varietal is empty. As soon as the first character is typed, the field is no longer empty, so the box disappears and the typing is lost — only one letter ever registers.

## The fix

- Track "custom varietal" as its own mode: choosing "+ Add Custom Varietal" from the dropdown opens the text box and keeps it open regardless of what has been typed.
- The text box keeps its own value and stays focused while typing, so a full varietal name can be entered.
- The typed varietal is what gets saved as the main grape varietal, and it also shows as the selected value in the dropdown area so the choice is visible.
- Switching back to a listed varietal closes the custom box and clears the custom value.
- Clearing the box leaves the main varietal empty rather than saving a blank entry.

Only the Add Wine page has this input; no other page is affected.

## Technical notes

- In `src/pages/AddWine.tsx`, add a `useCustomGrape` boolean state; render the custom `Input` when it is true instead of keying off `formData.grape_varietals === ""`.
- Set the `Select` value to `useCustomGrape ? "custom" : formData.grape_varietals` so the trigger stays on the custom option.
- Save path (`allGrapes`) is unchanged — it already trims and filters empty values.

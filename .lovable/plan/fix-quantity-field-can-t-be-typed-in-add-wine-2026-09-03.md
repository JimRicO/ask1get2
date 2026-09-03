# Fix: quantity field can't be typed in Add Wine

## What's wrong

In the Storage Locations row on Add Wine, the Qty box starts at `1` and its change handler falls back to `1` whenever the field is empty (`parseInt(e.target.value) || 1`). So clearing the box instantly puts `1` back, and typing a number appends to it (`1` + `2` = `12`) instead of replacing it. There is no way to simply type the quantity you want.

## The fix

- Let the Qty field hold an empty value while editing, so selecting-all and deleting works and typing replaces the digit instead of appending to a forced `1`.
- Keep the quantity as a normal number in state; only coerce back to a minimum of 1 when the field loses focus or on submit, so an empty box never saves a bad stock count.
- No change to how stock totals are calculated or merged.

## Technical details

- `src/pages/AddWine.tsx`, storage-locations Qty `Input`: store the raw string in the location row (or keep `quantity` numeric plus a separate editable string), render `value` as that raw text, and stop the `|| 1` fallback inside `onChange`.
- Add an `onBlur` that normalises an empty/invalid entry to `1`.
- On submit, `totalStock` uses the coerced numeric quantities (min 1) — same behaviour as today for valid input.

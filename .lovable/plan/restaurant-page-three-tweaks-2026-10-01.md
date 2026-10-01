# Restaurant page: three tweaks

Only the "At a restaurant" page changes. Reading, pairing and saving logic stay the same.

1. **Hide "Read the menu" after the scan.** Once the menu has been read and the end-of-scan animation is over, the button goes away. It still shows while there's a photo but no result, so a failed read can be tried again. If you add another menu page, the scan starts by itself, just like now.
2. **"Tick the plates" hint.** A small line, "TICK THE PLATES", in the same label style goes right under "What did the table order?". It disappears once at least one plate is ticked.
3. **Automatic pairing.** When the wine list has been read and at least one plate is ticked, the recommendation starts right away. This happens whichever comes last: finishing the wine list scan, or ticking the first plate. It runs once for each wine list read. "Pick for the table" stays so you can ask again after changing plates.

## Technical details
- `src/pages/Restaurant.tsx` only.
- Hide the Read-the-menu button when `menuResult && dishesShown`.
- Add an eyebrow under the header, shown when `totalPlates === 0`.
- Add an effect: if `listShown && listResult.entries.length > 0 && totalPlates > 0 && !table && !pairing` and it hasn't already run automatically for this list, call `pair()`. A ref tracks this and resets when `readList` runs.

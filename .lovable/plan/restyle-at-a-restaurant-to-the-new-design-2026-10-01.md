# Restyle "At a restaurant" to the new design

Only the restaurant page's look and motion change. Menu reading, wine-list reading, pairing and saving keep working exactly as they do now. No other page changes.

## What you will see
1. **The menu**: title "At a restaurant" with the new subtitle. When you take the photo, the screen flashes white. The photo appears slightly tilted, and a peach scan line sweeps over it until the menu has been read. Next comes "What did the table order?" with a live "N plates" counter. Each dish row has a square checkbox. Tick a dish and "×1" appears; tap the "×1" to add another plate. Then the "Now the wine list" button.
2. **The wine list**: a dark viewfinder with peach corner brackets, the same flash and scan line, then a "Wine list read" card rises in. Its "N wines · M plates" count runs up from 0. Then the "Pick for the table" button.
3. **The recommendation**: a sheet springs up from the bottom with "One bottle for the table", the wine name, the producer and region, and why it fits. If a dish clashes, a peach ⚠ line suggests a glass for that dish. A "♡ We loved it" pill turns gold and reads "♥ Loved · restaurant name". It saves through the save action that already exists.
4. **Messages**: cream pill notices ("Reading the menu…", "Pairing recommendation") sit just above the bottom of the screen.
5. **Reduce motion**: if your device is set to reduce motion, there's no sweep. You see "Reading…" instead.

## Points to keep in mind
- The pairing engine can suggest more than one bottle, for example when the dishes need a split. The sheet shows the first bottle large. Any extra bottles appear underneath in the same style, each with its own "We loved it" pill, so no result is hidden.
- The manual "type the dishes" fallback and the restaurant name field stay, restyled.

## Technical details
- Edit only `src/pages/Restaurant.tsx`. Add a few new rules to `src/styles.css`: the sweep and flash keyframes, a back-out sheet easing, and the tokens `--panel`, `--line`, `--tan`, `--tan-2` and `--gold`, mapped to the brief's hex values.
- The scan loop is a CSS infinite animation while `readingMenu`/`readingList` is true. On finish, it stops at the end of the current pass (`animationiteration` listener), then the line hides.
- The count-up uses rAF with a timer fallback, so the final number always shows.
- The sheet is a local component (new geometry). It is driven by state and safe under `data-frozen`.
- Use the existing `saveBottle`, `stepQty`, `selected` and `table` state unchanged.

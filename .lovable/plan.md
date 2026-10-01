# Make the scan visible on the wine list

## What's known
- The scan line only runs after you tap "Read the list". Nothing sweeps when the photo is first added; you only get the flash.
- The code draws the line over the wine list photo while it's being read. You saw the "Reading the wine list" message but no line, so something is stopping it from showing. I haven't confirmed what yet.

## Plan
1. **Reproduce first.** In a test browser, add a wine list photo, tap "Read the list", and take screenshots during the read, at your screen size (475 wide) and at a desktop size. Test both with and without "reduce motion" turned on. This should show whether the line is drawn but hidden, sits off screen, or isn't drawn at all.
2. **Fix the cause the test shows.** Likely suspects:
   - The photo is taller than the screen, so the line sweeps out of view. Fix: cap the photo's height in the viewfinder so the whole scan area stays on screen.
   - Something on top of the photo covers the line. Fix: correct the layering.
   - Your computer has "reduce motion" on, so the line is replaced by a small "Reading…" label. If so, I'll ask whether you want the sweep shown anyway.
3. **Start reading straight after the photo.** Like the film: the flash, then the scan starts sweeping straight away, with no "Read the list" tap needed. The menu works the same way. The buttons stay for retrying.
4. **Verify** with screenshots taken mid-scan before I report it fixed.

## Technical details
- Files: `src/pages/Restaurant.tsx` only (plus a small style tweak if the photo needs a height cap).
- Auto-read: after the files are added, call `readList()` / `readMenu()` from an effect that watches the image count, guarded so one capture triggers one read.

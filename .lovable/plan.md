# Use the film's exact scan line on "At a restaurant"

Only the scan line and the capture flash change. Everything else on the page stays as it is.

## What you will see
- Menu photo: a 2px peach line with a soft glow, inset 10% on each side, sweeps from 4% to 92% of the photo every 0.9 s. It repeats until the menu has been read.
- Wine list photo: the same line sweeps from 8% to 86% every 1.0 s. Right now it takes 0.9 s.
- Each capture shows a white flash over the photo that fades from 85% to nothing over 0.45 s.
- If your device is set to reduce motion, you still see "Reading…" instead of the sweep.

## Technical details
- In `src/pages/Restaurant.tsx`, replace the local CSS-driven `ScanLine` with the supplied rAF component: position recomputed each frame as `from + p*(to-from)`, inline styles exactly as given, zIndex 3, returns null when inactive. Keep the reduced-motion "Reading…" fallback.
- Pass `ms={1000}` on the wine-list ScanLine.
- Add the supplied `Flash` component (`key={fire}`, absolute inset-0, zIndex 21). Render it inside each photo's relative, overflow-hidden container, driven by the existing `flash` counter. Remove the full-screen `rv-flash` div.
- In `src/styles.css`, add `@keyframes wvFlash { from {opacity:.85} to {opacity:0} }`, then delete the now-unused `rv-scan`, `rv-sweep`, `rv-flash` rules.

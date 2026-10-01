# Make the wine list scan line actually visible

## What's wrong
In my automated test the line showed. In your preview it doesn't. The code has two weak spots that can hide it in the Lovable preview:

1. **The line moves only if the browser keeps sending animation frames.** The project's own notes say the embedded preview sometimes stops sending them. When that happens, the line doesn't move and can look like nothing is there.
2. **The white flash sits on top of the line.** The flash is meant to fade out. If the page freezes motion, the flash stays as a solid white layer over the photo and covers the line.

I haven't confirmed which one causes your problem. Step 1 checks that first.

## Changes (restaurant page only)
1. **Reproduce first.** I'll run a real browser at your screen size (475×528), upload a real wine list photo through the actual button and take screenshots while the list is read. Nothing is faked.
2. **Make the line sweep with a plain CSS animation.** It will run without relying on animation frames: 2px peach line with the same glow, inset 10% on each side, sweeping 8% to 86% in 1 second on a loop. The menu photo keeps 4% to 92% in 0.9 seconds.
3. **Always sweep.** The "Reading…" fallback for reduce-motion goes away, as you chose. The line sweeps on every device.
4. **The line always sits on top.** It goes above the flash. The flash starts invisible and only shows during its 0.45 second fade, so it can never get stuck as a white layer.
5. **Finish the pass.** When the result arrives, the line finishes its current sweep, then hides, as in your brief.
6. **Check again.** I'll repeat step 1 and take screenshots at several moments during the read, with reduce motion both on and off, to confirm the line moves.

Nothing else changes: not the reading, pairing or saving, and no other screen.

## Technical details
- `ScanLine` in `src/pages/Restaurant.tsx`: replace rAF/`setP` with a `@keyframes rv-scan` (top from→to) driven by CSS vars `--from/--to/--ms`, `animation: rv-scan var(--ms) linear infinite`. On `active` → false, listen for `animationiteration` and unmount after the current pass.
- Remove the `prefers-reduced-motion` branch. Add `.rv-scanline` and `.rv-flash` to the `html[data-frozen]` exemption, or keep them outside that selector, so frozen documents don't strip them.
- `Flash`: base `opacity: 0`, `animation: wvFlash .45s linear` (no `forwards` reliance), z-index below the line (flash 2, line 3).
- Verify with Playwright: real `set_input_files` on the list input, screenshots at 200/500/800ms into the read, element screenshot of `#rv-list-photo`.

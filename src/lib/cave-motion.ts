import { useEffect, useState } from "react";

/**
 * Marks the document frozen whenever it is not visible.
 *
 * A transition that is not ticking keeps its START value, so in a hidden or
 * uncomposited document every animated state change lands half-applied. The
 * stylesheet rule this attribute drives (see `src/styles.css`) strips the
 * transition rather than the target, so final values apply instantly while
 * hidden and the motion comes back when the page is shown.
 *
 * Mounted once, at the root. Never per screen.
 */
export function useFrozenMotion() {
  useEffect(() => {
    const sync = () =>
      document.documentElement.toggleAttribute(
        "data-frozen",
        document.visibilityState !== "visible",
      );
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
}

/**
 * True once the page has painted a real frame.
 *
 * Fails open by design: it starts true on the server and in any document where
 * `requestAnimationFrame` never fires (background tab, screenshot pass, print,
 * embedded preview). Content is therefore never gated on a callback that may
 * not arrive — the animation is an enhancement, not a precondition for being
 * visible.
 *
 * Use it to *delay* an effect that would otherwise start at the wrong value,
 * not to decide whether content renders.
 */
export function usePainted(): boolean {
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    let raf = 0;
    // If rAF never fires, the timeout reveals anyway.
    const timer = window.setTimeout(() => setPainted(true), 400);
    raf = window.requestAnimationFrame(() => {
      raf = window.requestAnimationFrame(() => setPainted(true));
    });
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);

  return painted;
}

/** Entrance reveal delay: 55ms per step, capped at 8 steps. */
export const revealDelay = (index: number) => `${Math.min(index, 8) * 55}ms`;

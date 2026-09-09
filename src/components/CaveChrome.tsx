import { ReactNode, useEffect, useState } from "react";

/**
 * The sticky header Cellar, Bottle and Wishlist share.
 *
 * Slides down from translateY(-100%) once the page has scrolled past 150px.
 * Both the transform and the visibility are driven by state rather than by a
 * scroll-linked animation, so a frozen document lands on a final value instead
 * of freezing halfway.
 */
export function CaveStickyHeader({ title, status }: { title: string; status?: ReactNode }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 150);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 top-0 z-30 border-b border-border bg-[rgba(33,17,17,0.88)] backdrop-blur-[10px] transition-transform duration-[420ms] ease-[var(--ease-cave)] ${
        shown ? "translate-y-0" : "-translate-y-full"
      }`}
      // Hidden from assistive tech and pointers while it is off screen, so it
      // can never intercept a tap it is not visibly offering.
      aria-hidden={!shown}
      style={{ pointerEvents: shown ? undefined : "none" }}
    >
      <div className="mx-auto flex max-w-[1180px] items-baseline justify-between gap-4 px-7 py-3">
        <span className="font-serif text-[19px] text-foreground">{title}</span>
        {status && (
          <span className="font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
            {status}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Bottom sheet geometry: card ground, 1px rule, no bottom border, internal
 * scroll, sliding 420ms over a scrim that closes on tap.
 *
 * `pointer-events` follows `open`, never opacity — an unpainted sheet in a
 * frozen document must not sit invisible over the screen swallowing clicks.
 */
export function CaveSheet({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ pointerEvents: open ? "auto" : "none" }}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 bg-[rgba(20,9,9,0.72)] transition-opacity duration-[420ms] ease-[var(--ease-cave)] ${
          open ? "opacity-100" : "opacity-0"
        }`}
        tabIndex={open ? 0 : -1}
      />
      <div
        role="dialog"
        aria-modal={open}
        aria-labelledby={labelledBy}
        className={`relative w-full max-w-[640px] max-h-[94vh] overflow-y-auto border border-b-0 border-border bg-card transition-transform duration-[420ms] ease-[var(--ease-cave)] ${
          open ? "translate-y-0" : "translate-y-[102%]"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Mono eyebrow: 9-10px uppercase, wide tracking. The label voice of Cave. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`font-mono text-[10px] uppercase tracking-[0.11em] text-muted-foreground ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * A framed plate: 1px rule, card ground, 3:4. Holds a photo, a printed
 * parchment label, or the Lucide Wine glyph as the no-photo fallback.
 */
export function Plate({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`aspect-3/4 shrink-0 overflow-hidden border border-border bg-card ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

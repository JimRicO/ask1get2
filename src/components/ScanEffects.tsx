import { useEffect, useRef, useState } from "react";

/**
 * Peach scan line, a pure CSS sweep. Loops while active; when it ends it
 * finishes with one quick pass into the bottom edge, then hides.
 */
export function ScanLine({ active, from = 4, to = 92, ms = 900, onFinished }: { active: boolean; from?: number; to?: number; ms?: number; onFinished?: () => void }) {
  const [phase, setPhase] = useState<"off" | "loop" | "end">(active ? "loop" : "off");
  const [cur, setCur] = useState("0px");
  const el = useRef<HTMLDivElement>(null);
  const finished = useRef(onFinished);
  finished.current = onFinished;
  useEffect(() => {
    if (active) { setPhase("loop"); return; }
    setPhase((p) => {
      if (p !== "loop") return p;
      setCur(el.current ? getComputedStyle(el.current).top : "0px");
      return "end";
    });
  }, [active]);
  useEffect(() => {
    if (phase !== "end") return;
    const t = window.setTimeout(() => { setPhase("off"); finished.current?.(); }, 280);
    return () => window.clearTimeout(t);
  }, [phase]);
  if (phase === "off") return null;
  return (
    <div
      ref={el}
      aria-hidden
      className="rv-scanline"
      style={{
        ["--rv-from" as string]: phase === "end" ? cur : `${from}%`,
        ["--rv-to" as string]: phase === "end" ? "calc(100% - 2px)" : `${to}%`,
        ["--rv-ms" as string]: `${ms}ms`,
        ...(phase === "end" ? { animation: "rv-scan 250ms cubic-bezier(0.33,1,0.68,1) forwards" } : {}),
      }}
    />
  );
}

/** Two peach brackets that lock inward onto the photo, 320ms back-out (1.6). */
export function LockCorners({ lock, gap = 10 }: { lock: number; gap?: number }) {
  const base: React.CSSProperties = { position: "absolute", width: 22, height: 22, zIndex: 4, pointerEvents: "none" };
  const anim = (dir: number) =>
    lock > 0
      ? { animation: "rv-lock 320ms cubic-bezier(0.34,1.6,0.64,1) both", ["--rv-lk" as string]: `${dir * gap}px` }
      : { transform: `translate(${dir * gap}px, ${dir * gap}px)` };
  return (
    <>
      <span key={`a${lock}`} aria-hidden style={{ ...base, top: 0, left: 0, borderTop: "2px solid #F2A46C", borderLeft: "2px solid #F2A46C", ...anim(-1) }} />
      <span key={`b${lock}`} aria-hidden style={{ ...base, bottom: 0, right: 0, borderBottom: "2px solid #F2A46C", borderRight: "2px solid #F2A46C", ...anim(1) }} />
    </>
  );
}

/** White capture flash over the photo, .85 to 0 over 450ms. */
export function Flash({ fire }: { fire: number }) {
  return <div key={fire} aria-hidden style={{ position: "absolute", inset: 0, background: "#fff",
    opacity: 0, zIndex: 2, pointerEvents: "none", animation: "wvFlash .45s linear" }} />;
}

// WineClink.tsx
// Scan-confirmation "clink": two glasses toast, wine drops / gold diamonds / peach sparks burst.
// Port of the approved Clink demo. No dependencies.
//
// Usage: place inside a position:relative container (the restaurant screen).
//   <WineClink run={clinkKey} y={clinkY} onDone={() => setShowList(true)} />
// - run: increment this number to play once (e.g. when the menu scan returns).
// - y: px from the container top where the glass rims meet (just under the
//      "What did the table order?" row, about 34px below it).
// - onDone: fired when the glasses have faded (about 640ms after start);
//      start the dish rows rising here.
// Respects prefers-reduced-motion (calls onDone immediately, draws nothing).
// Tap anywhere on the container to skip: pass skip={true}.

import { useEffect, useRef } from "react";

const GLASS = `<svg viewBox="0 0 40 80" fill="none" style="width:100%;height:100%;overflow:visible">
<path d="M10.2 20 H29.8 C29.4 30 26.6 35.4 20 37 C13.4 35.4 10.6 30 10.2 20 Z" fill="#7C2033" opacity=".9"/>
<path d="M8 3 H32 C33 22 30 34 20 38 C10 34 7 22 8 3 Z" stroke="#F4ECE1" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M20 38 V69" stroke="#F4ECE1" stroke-width="1.6" stroke-linecap="round"/>
<path d="M10 72 C14 69.5 26 69.5 30 72" stroke="#F4ECE1" stroke-width="1.6" stroke-linecap="round"/>
<path d="M12.5 8 C12.5 16 13.5 23 15.5 27" stroke="#F4ECE1" stroke-width="1" stroke-linecap="round" opacity=".45"/></svg>`;

const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const P = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const ei = (x: number) => x * x * x;

const FLY = 280;        // glasses fly in
const FADE_A = 380;     // after contact: start fading
const FADE_B = 580;     // after contact: gone
const BURST = 900;      // particle lifetime window after contact
const GRAVITY = 620;    // px/s^2

type Part = { kind: "drop" | "dia" | "spark"; vx: number; vy: number; life: number; s: number; rot: number };

function makeParts(): Part[] {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 17 }, (_, i) => {
    const kind: Part["kind"] = i < 10 ? "drop" : i < 14 ? "dia" : "spark";
    const ang = ((-165 + rnd() * 150) * Math.PI) / 180;
    const sp = 120 + rnd() * 150;
    return { kind, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 600 + rnd() * 200,
      s: kind === "drop" ? 2.4 + rnd() * 1.4 : kind === "dia" ? 3.5 + rnd() * 1.5 : 1.4, rot: rnd() * 6 };
  });
}

let actx: AudioContext | null = null;
function ting() {
  try {
    actx = actx || new (window.AudioContext || (window as any).webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    const now = actx.currentTime, out = actx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.22, now + 0.004);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    out.connect(actx.destination);
    [[2093, 1], [3136, 0.45], [4186, 0.25], [5274, 0.12]].forEach(([f, g]) => {
      const o = actx!.createOscillator(), pg = actx!.createGain();
      o.frequency.value = f; pg.gain.value = g;
      o.connect(pg); pg.connect(out); o.start(now); o.stop(now + 0.95);
    });
  } catch { /* audio is optional */ }
}

export function WineClink({ run, y, onDone, sound = true, skip = false }:
  { run: number; y: number; onDone?: () => void; sound?: boolean; skip?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const gl = useRef<HTMLDivElement>(null);
  const gr = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!run) return;
    if (skip) { onDone?.(); return; }
    const parts = makeParts();
    const t0 = performance.now();
    let raf = 0, hit = false, done = false;

    const frame = (now: number) => {
      const t = now - t0, el = wrap.current, c = cv.current;
      if (!el || !c || !gl.current || !gr.current) return;
      const w = el.clientWidth, cx = w / 2;

      // glasses: fly in, clink, damped recoil, fade
      const fly = ei(P(t, 0, FLY));
      const h = t - FLY;
      const rp = P(h, 0, 600);
      const rec = h >= 0 ? Math.exp(-rp * 5) * Math.cos(rp * 14) : 0;
      const fade = 1 - P(h, FADE_A, FADE_B);
      const off = (1 - fly) * 150, rot = 20 - rec * 5;
      const op = String(Math.min(P(t, 0, 120), fade));
      Object.assign(gl.current.style, { left: `${cx - 60 - off}px`, top: `${y - 4}px`, opacity: op, transform: `rotate(${rot}deg)` });
      Object.assign(gr.current.style, { left: `${cx + 20 + off}px`, top: `${y - 4}px`, opacity: op, transform: `scaleX(-1) rotate(${rot}deg)` });

      if (h >= 0 && !hit) { hit = true; if (sound) ting(); navigator.vibrate?.(10); }
      if (h >= FADE_B && !done) { done = true; onDone?.(); }

      // particles
      const dpr = window.devicePixelRatio || 1, ch = el.clientHeight;
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(ch * dpr); }
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, ch);
      if (h >= 0) {
        const s = h / 1000;
        for (const p of parts) {
          if (h > p.life) continue;
          const x = cx + p.vx * s, py = y + p.vy * s + 0.5 * GRAVITY * s * s;
          ctx.globalAlpha = 1 - ei(h / p.life);
          if (p.kind === "drop") {
            ctx.save(); ctx.translate(x, py); ctx.rotate(Math.atan2(p.vy + GRAVITY * s, p.vx));
            ctx.fillStyle = "#9A2A40"; ctx.beginPath(); ctx.ellipse(0, 0, p.s * 1.7, p.s, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          } else if (p.kind === "dia") {
            ctx.save(); ctx.translate(x, py); ctx.rotate(Math.PI / 4 + p.rot * s);
            ctx.fillStyle = "#D9B45F"; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); ctx.restore();
          } else {
            ctx.strokeStyle = "#F2A46C"; ctx.lineWidth = 1.4; ctx.beginPath();
            ctx.moveTo(x, py); ctx.lineTo(x - p.vx * 0.03, py - (p.vy + GRAVITY * s) * 0.03); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }
      if (h < BURST) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, ch);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, skip]);

  const glassStyle: React.CSSProperties = { position: "absolute", width: 40, height: 80, transformOrigin: "50% 100%", opacity: 0 };
  return (
    <div ref={wrap} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
      <div ref={gl} style={glassStyle} dangerouslySetInnerHTML={{ __html: GLASS }} />
      <div ref={gr} style={glassStyle} dangerouslySetInnerHTML={{ __html: GLASS }} />
      <canvas ref={cv} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}

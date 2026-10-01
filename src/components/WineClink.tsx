// WineClink.tsx
// Scan-confirmation "clink". Port of the approved Clink demo. No dependencies.
// motif="cutlery": fork and knife swing in and cross into an X (menu scan),
//   metal double-tap sound, tan crumbs / gold diamonds / peach sparks.
// motif="glasses": two glasses toast (wine list scan),
//   glass ting, wine drops / gold diamonds / peach sparks.
//
// Usage: place inside a position:relative container (the restaurant screen).
//   <WineClink motif="cutlery" run={clinkKey} y={clinkY} onDone={() => setShowList(true)} />
// - run: increment this number to play once (e.g. when the menu scan returns).
// - y: px from the container top, about 34px below the list header row.
//      Glasses: the rims meet here. Cutlery: the X is centred 36px lower.
// - onDone: fired when the objects have faded (about 640ms after start);
//      start the dish rows rising here.
// Respects prefers-reduced-motion (calls onDone immediately, draws nothing).
// Tap anywhere on the container to skip: pass skip={true}.

import { useEffect, useRef } from "react";

export type ClinkMotif = "cutlery" | "glasses";

const GLASS = `<svg viewBox="0 0 40 80" fill="none" style="width:100%;height:100%;overflow:visible">
<path d="M10.2 20 H29.8 C29.4 30 26.6 35.4 20 37 C13.4 35.4 10.6 30 10.2 20 Z" fill="#7C2033" opacity=".9"/>
<path d="M8 3 H32 C33 22 30 34 20 38 C10 34 7 22 8 3 Z" stroke="#F4ECE1" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M20 38 V69" stroke="#F4ECE1" stroke-width="1.6" stroke-linecap="round"/>
<path d="M10 72 C14 69.5 26 69.5 30 72" stroke="#F4ECE1" stroke-width="1.6" stroke-linecap="round"/>
<path d="M12.5 8 C12.5 16 13.5 23 15.5 27" stroke="#F4ECE1" stroke-width="1" stroke-linecap="round" opacity=".45"/></svg>`;

const ST = 'stroke="#F4ECE1" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const SVGW = 'viewBox="0 0 24 100" fill="none" style="width:100%;height:100%;overflow:visible"';
const FORK = `<svg ${SVGW}><path d="M6 4 V22 M10 4 V22 M14 4 V22 M18 4 V22" ${ST}/>
<path d="M5 21 C5 29 8.5 32.5 12 33.5 C15.5 32.5 19 29 19 21" ${ST}/><path d="M12 33.5 V58" ${ST}/>
<path d="M10.2 58 C9.6 72 9.8 90 12 96 C14.2 90 14.4 72 13.8 58 Z" ${ST} fill="#F4ECE1" fill-opacity=".12"/></svg>`;
const KNIFE = `<svg ${SVGW}><path d="M9.5 4 C15.5 8 16.5 30 15.5 52 H9.5 Z" ${ST} fill="#F4ECE1" fill-opacity=".12"/>
<path d="M8.5 55 H15.5" ${ST}/><path d="M9.8 58 C9.3 74 9.6 90 12 96 C14.4 90 14.7 74 14.2 58 Z" ${ST} fill="#F4ECE1" fill-opacity=".12"/></svg>`;

const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const P = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const ei = (x: number) => x * x * x;

const FLY = 280;        // glasses fly in
const FADE_A = 380;     // after contact: start fading
const FADE_B = 580;     // after contact: gone
const BURST = 900;      // particle lifetime window after contact
const GRAVITY = 620;    // px/s^2

type Part = { kind: "drop" | "crumb" | "dia" | "spark"; vx: number; vy: number; life: number; s: number; rot: number };

function makeParts(motif: ClinkMotif): Part[] {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 17 }, (_, i) => {
    const kind: Part["kind"] = i < 10 ? (motif === "cutlery" ? "crumb" : "drop") : i < 14 ? "dia" : "spark";
    const ang = ((-165 + rnd() * 150) * Math.PI) / 180;
    const sp = 120 + rnd() * 150;
    return { kind, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 600 + rnd() * 200,
      s: kind === "drop" || kind === "crumb" ? 2.4 + rnd() * 1.4 : kind === "dia" ? 3.5 + rnd() * 1.5 : 1.4, rot: rnd() * 6 };
  });
}

let actx: AudioContext | null = null;
function ting(motif: ClinkMotif) {
  try {
    actx = actx || new (window.AudioContext || (window as any).webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    const now = actx.currentTime;
    if (motif === "cutlery") {
      // metal on metal: inharmonic partials, short, a double tap
      [0, 0.075].forEach((d, k) => {
        const g2 = actx!.createGain(), at = now + d;
        g2.gain.setValueAtTime(0.0001, at);
        g2.gain.exponentialRampToValueAtTime(k ? 0.12 : 0.2, at + 0.003);
        g2.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
        g2.connect(actx!.destination);
        [[3150, 1], [4730, 0.5], [6890, 0.3], [8120, 0.15]].forEach(([f, g]) => {
          const o = actx!.createOscillator(), pg = actx!.createGain();
          o.frequency.value = f * (k ? 1.02 : 1); pg.gain.value = g;
          o.connect(pg); pg.connect(g2); o.start(at); o.stop(at + 0.35);
        });
      });
      return;
    }
    const out = actx.createGain();
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

export function WineClink({ motif = "glasses", run, y, onDone, sound = true, skip = false }:
  { motif?: ClinkMotif; run: number; y: number; onDone?: () => void; sound?: boolean; skip?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const gl = useRef<HTMLDivElement>(null);
  const gr = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!run) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void reduced; if (skip) { onDone?.(); return; }
    const parts = makeParts(motif);
    const cut = motif === "cutlery";
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
      const off = (1 - fly) * 150;
      const op = String(Math.min(P(t, 0, 120), fade));
      let oy = y; // burst origin
      if (cut) {
        // fork from the left, knife from the right, swinging into a crossed X
        const cy = y + 36, rot = 34 * fly + rec * 6;
        Object.assign(gl.current.style, { left: `${cx - 12 - off}px`, top: `${cy - 50}px`, opacity: op, transform: `rotate(${-rot}deg)` });
        Object.assign(gr.current.style, { left: `${cx - 12 + off}px`, top: `${cy - 50}px`, opacity: op, transform: `rotate(${rot}deg)` });
        oy = cy - 26;
      } else {
        const rot = 20 - rec * 5;
        Object.assign(gl.current.style, { left: `${cx - 60 - off}px`, top: `${y - 4}px`, opacity: op, transform: `rotate(${rot}deg)` });
        Object.assign(gr.current.style, { left: `${cx + 20 + off}px`, top: `${y - 4}px`, opacity: op, transform: `scaleX(-1) rotate(${rot}deg)` });
      }

      if (h >= 0 && !hit) { hit = true; if (sound) ting(motif); navigator.vibrate?.(10); }
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
          const x = cx + p.vx * s, py = oy + p.vy * s + 0.5 * GRAVITY * s * s;
          ctx.globalAlpha = 1 - ei(h / p.life);
          if (p.kind === "drop") {
            ctx.save(); ctx.translate(x, py); ctx.rotate(Math.atan2(p.vy + GRAVITY * s, p.vx));
            ctx.fillStyle = "#9A2A40"; ctx.beginPath(); ctx.ellipse(0, 0, p.s * 1.7, p.s, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          } else if (p.kind === "crumb") {
            ctx.save(); ctx.translate(x, py); ctx.rotate(p.rot + s * 4);
            ctx.fillStyle = "#CDA985"; ctx.fillRect(-p.s * 0.6, -p.s * 0.5, p.s * 1.2, p.s); ctx.restore();
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
  }, [run, skip, motif]);

  const cut = motif === "cutlery";
  const glassStyle: React.CSSProperties = cut
    ? { position: "absolute", width: 24, height: 100, transformOrigin: "50% 50%", opacity: 0 }
    : { position: "absolute", width: 40, height: 80, transformOrigin: "50% 100%", opacity: 0 };
  return (
    <div ref={wrap} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
      <div ref={gl} style={glassStyle} dangerouslySetInnerHTML={{ __html: cut ? FORK : GLASS }} />
      <div ref={gr} style={glassStyle} dangerouslySetInnerHTML={{ __html: cut ? KNIFE : GLASS }} />
      <canvas ref={cv} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}

// WineClink.tsx
// Scan-confirmation "clink". Port of the approved Clink demo. No dependencies.
// Drawn in the app icon style: copper outline, smoked bronze fill, soft copper glow.
// motif="cutlery": fork and knife swing in and cross into an X (menu scan),
//   metal double-tap sound, bronze crumbs / gold flecks / peach sparks.
// motif="glasses": two glasses toast (wine list scan),
//   glass ting, rose-copper drops / gold flecks / peach sparks.
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

// Copper/bronze versions matching the app's icon set (copper outline, smoked bronze fill, inner highlight)
const CU = "#E39468";
const DEFS = (k: string) => `<defs>
<linearGradient id="br${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5B4038"/><stop offset=".55" stop-color="#2E201E"/><stop offset="1" stop-color="#1A1112"/></linearGradient>
<linearGradient id="gl${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A3A37" stop-opacity=".55"/><stop offset="1" stop-color="#1D1213" stop-opacity=".85"/></linearGradient>
<linearGradient id="wn${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E0A584"/><stop offset="1" stop-color="#A9664D"/></linearGradient></defs>`;
const SK = `stroke="${CU}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`;
const HL = `stroke="#FFE8D6" stroke-opacity=".28" stroke-width="1" stroke-linecap="round" fill="none"`;
const GLASS = (k: string) => `<svg viewBox="0 0 40 80" fill="none" style="width:100%;height:100%;overflow:visible">${DEFS(k)}
<path d="M10 4 C4 14 5 30 12 36 C15 38.5 18 39 20 39 C22 39 25 38.5 28 36 C35 30 36 14 30 4 Z" fill="url(#gl${k})"/>
<path d="M6.3 23 C6.8 29.5 9 33.5 12 36 C15 38.5 18 39 20 39 C22 39 25 38.5 28 36 C31 33.5 33.2 29.5 33.7 23 Z" fill="url(#wn${k})" opacity=".92"/>
<path d="M6.3 23 H33.7" stroke="#F3C3A4" stroke-opacity=".6" stroke-width=".8"/>
<path d="M10 4 C4 14 5 30 12 36 C15 38.5 18 39 20 39 C22 39 25 38.5 28 36 C35 30 36 14 30 4 Z" ${SK}/>
<path d="M11.5 9 C9 16 9 24 11.5 30" ${HL}/>
<path d="M20 39 V70" ${SK}/><path d="M9 72.5 C13 69.8 27 69.8 31 72.5 C27 74 13 74 9 72.5 Z" fill="url(#br${k})" ${SK}/></svg>`;
const FORK = (k: string) => `<svg viewBox="0 0 24 100" fill="none" style="width:100%;height:100%;overflow:visible">${DEFS(k)}
<path d="M5 3 V20 C5 28 8.5 32 10.6 33.2 V57 H13.4 V33.2 C15.5 32 19 28 19 20 V3" fill="url(#br${k})"/>
<path d="M5 3 V20 C5 28 8.5 32 10.6 33.2 V57 M19 3 V20 C19 28 15.5 32 13.4 33.2 V57 M9.7 3 V19 M14.3 3 V19" ${SK}/>
<path d="M10.2 58 C9.5 72 9.8 90 12 96 C14.2 90 14.5 72 13.8 58 Z" fill="url(#br${k})" ${SK}/><path d="M11.3 63 C11 74 11.2 84 11.8 90" ${HL}/></svg>`;
const KNIFE = (k: string) => `<svg viewBox="0 0 24 100" fill="none" style="width:100%;height:100%;overflow:visible">${DEFS(k)}
<path d="M9.5 3 C15.8 7.5 16.8 30 15.6 52 H9.5 Z" fill="url(#br${k})" ${SK}/><path d="M11.2 9 C12.6 20 12.8 34 12.3 46" ${HL}/>
<path d="M8.3 55 H15.7" ${SK}/>
<path d="M9.8 58 C9.2 74 9.6 90 12 96 C14.4 90 14.8 74 14.2 58 Z" fill="url(#br${k})" ${SK}/><path d="M11.2 63 C11 74 11.2 84 11.8 90" ${HL}/></svg>`;




const GLOW = "drop-shadow(0 0 4px rgba(227,148,104,.35))";
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
    if (reduced || skip) { onDone?.(); return; }
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
            ctx.fillStyle = "#D9A07F"; ctx.beginPath(); ctx.ellipse(0, 0, p.s * 1.7, p.s, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          } else if (p.kind === "crumb") {
            ctx.save(); ctx.translate(x, py); ctx.rotate(p.rot + s * 4);
            ctx.fillStyle = "#B9805F"; ctx.fillRect(-p.s * 0.6, -p.s * 0.5, p.s * 1.2, p.s); ctx.restore();
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
    ? { position: "absolute", width: 24, height: 100, transformOrigin: "50% 50%", opacity: 0, filter: GLOW }
    : { position: "absolute", width: 40, height: 80, transformOrigin: "50% 100%", opacity: 0, filter: GLOW };
  return (
    <div ref={wrap} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
      <div ref={gl} style={glassStyle} dangerouslySetInnerHTML={{ __html: cut ? FORK("a") : GLASS("a") }} />
      <div ref={gr} style={glassStyle} dangerouslySetInnerHTML={{ __html: cut ? KNIFE("b") : GLASS("b") }} />
      <canvas ref={cv} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}

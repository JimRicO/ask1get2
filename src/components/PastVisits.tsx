import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { recallVisits } from "@/lib/visits.functions";
import type { Database } from "@/integrations/supabase/types";

type Visit = Database["public"]["Tables"]["restaurant_sessions"]["Row"];
type J = Record<string, unknown>;

const label = (e: unknown) => {
  if (!e || typeof e !== "object") return null;
  const w = e as J;
  return [w.name, w.producer, w.vintage].filter(Boolean).join(" · ") || null;
};
const dateOf = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const ordered = (v: Visit) =>
  (Array.isArray(v.ordered_dishes) ? (v.ordered_dishes as J[]) : [])
    .map((d) => `${Number(d.qty) > 1 ? `${d.qty}× ` : ""}${d.name}`)
    .join(", ") || v.dishes_text || "";
const picks = (v: Visit) => {
  const rec = (v.recommendations ?? {}) as J;
  const table = (rec.table ?? {}) as J;
  const single = table.single as J | undefined;
  const alts = Array.isArray(rec.alternatives) ? (rec.alternatives as J[]) : [];
  return [single, ...alts]
    .filter(Boolean)
    .map((p) => ({ wine: label((p as J).entry), why: String((p as J).why ?? "") }))
    .filter((p) => p.wine);
};

export default function PastVisits() {
  const recallFn = useServerFn(recallVisits);
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [open, setOpen] = useState<Visit | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{ text: string | null; ids: string[] } | null>(null);

  useEffect(() => {
    supabase
      .from("restaurant_sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setVisits(data ?? []));
  }, []);

  const ask = async () => {
    if (q.trim().length < 3 || asking) return;
    setAsking(true);
    try {
      const r = await recallFn({ data: { question: q.trim(), lang: navigator.language || "en" } });
      setAnswer({ text: r.answer ?? "No past visits saved yet.", ids: r.visitIds });
    } catch (e) {
      setAnswer({ text: e instanceof Error ? e.message : "Could not answer", ids: [] });
    } finally {
      setAsking(false);
    }
  };

  if (visits === null) return null;

  return (
    <section className="mx-auto mt-12 max-w-[430px] px-4">
      <h2 className="font-serif text-[24px] text-foreground">Restaurant memories</h2>
      <p className="mt-1 text-[14px] text-wine-champagne">
        Every table you paired, saved with its menu and wine list.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void ask()}
          placeholder="What did we pair with the burger?"
          className="min-w-0 flex-1 rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground"
        />
        <button
          onClick={() => void ask()}
          disabled={asking || q.trim().length < 3}
          className="btn-plate rounded-md px-4 text-sm disabled:opacity-50"
        >
          {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
        </button>
      </div>

      {answer && (
        <div className="wood-panel mt-3 rounded-lg p-4 text-[14px] leading-relaxed text-foreground">
          {answer.text}
          {answer.ids.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {answer.ids.map((id) => {
                const v = visits.find((x) => x.id === id);
                return v ? (
                  <button
                    key={id}
                    onClick={() => setOpen(v)}
                    className="text-[12px] text-[#E8986A] underline underline-offset-2"
                  >
                    {v.restaurant_name || "Visit"} · {dateOf(v.created_at)}
                  </button>
                ) : null;
              })}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {visits.length === 0 && (
          <p className="text-[14px] text-muted-foreground">
            No visits yet. Use “Are you at a restaurant?” and your tables will appear here.
          </p>
        )}
        {visits.map((v) => {
          const p = picks(v)[0];
          return (
            <button
              key={v.id}
              onClick={() => setOpen(v)}
              className="wood-panel block w-full rounded-lg p-4 text-left transition-transform active:scale-[0.99]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-serif text-[17px] text-foreground">
                  {v.restaurant_name || "A restaurant"}
                </span>
                <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-[#E8986A]/70">
                  {dateOf(v.created_at)}
                </span>
              </div>
              {ordered(v) && <p className="mt-1 line-clamp-2 text-[13px] text-wine-champagne">{ordered(v)}</p>}
              {p && <p className="mt-1 text-[13px] text-[#E8986A]">{p.wine}</p>}
            </button>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setOpen(null)}>
          <div
            className="wood-panel max-h-[85vh] w-full max-w-[520px] overflow-y-auto rounded-t-xl p-5 sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-serif text-[22px] text-foreground">{open.restaurant_name || "A restaurant"}</h3>
                <p className="text-[12px] uppercase tracking-[0.14em] text-[#E8986A]/70">{dateOf(open.created_at)}</p>
              </div>
              <button onClick={() => setOpen(null)} aria-label="Close" className="p-1 text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {ordered(open) && (
              <>
                <h4 className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[#E8986A]">The table ordered</h4>
                <p className="mt-1 text-[14px] text-foreground">{ordered(open)}</p>
              </>
            )}

            {picks(open).length > 0 && (
              <>
                <h4 className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[#E8986A]">Picks</h4>
                <ol className="mt-1 space-y-2">
                  {picks(open).map((p, i) => (
                    <li key={i} className="text-[14px] text-foreground">
                      <span className="text-[#E8986A]">{i + 1}. {p.wine}</span>
                      {p.why && <span className="block text-[13px] text-wine-champagne">{p.why}</span>}
                    </li>
                  ))}
                </ol>
              </>
            )}

            {Array.isArray(open.loved_wines) && open.loved_wines.length > 0 && (
              <>
                <h4 className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[#D9B45F]">♥ Loved</h4>
                <p className="mt-1 text-[14px] text-foreground">
                  {(open.loved_wines as unknown[]).map(label).filter(Boolean).join("; ")}
                </p>
              </>
            )}

            {[...open.menu_images, ...open.wine_list_images].length > 0 && (
              <>
                <h4 className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[#E8986A]">Menu & wine list</h4>
                <div
                  data-swipe-ignore
                  className="-mx-5 mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none]"
                  style={{ touchAction: "pan-x pan-y" }}
                >
                  {[...open.menu_images, ...open.wine_list_images].map((src, i) => (
                    <button key={src} type="button" onClick={() => setViewer(i)} className="w-[82%] shrink-0 snap-center">
                      <img src={src} alt="" className="aspect-[3/4] w-full rounded object-contain bg-background/40" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {open && viewer !== null && (
        <Lightbox
          images={[...open.menu_images, ...open.wine_list_images]}
          start={viewer}
          onClose={() => setViewer(null)}
        />
      )}
    </section>
  );
}

function Lightbox({ images, start, onClose }: { images: string[]; start: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(start);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = start * el.clientWidth;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start, onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background/95" data-swipe-ignore onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-[13px] text-foreground">
        <span>{idx + 1} of {images.length}</span>
        <button type="button" aria-label="Close" onClick={onClose} className="p-2 text-[#E8986A]">
          <X className="h-6 w-6" />
        </button>
      </div>
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIdx(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        style={{ touchAction: "pan-x pan-y pinch-zoom" }}
      >
        {images.map((src) => (
          <div key={src} className="flex h-full w-full shrink-0 snap-center items-center justify-center p-2">
            <img src={src} alt="" onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full object-contain" />
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-2 py-4">
        {images.map((src, i) => (
          <span key={src} className={`h-1.5 w-1.5 rounded-full ${i === idx ? "bg-[#E8986A]" : "bg-[#E8986A]/30"}`} />
        ))}
      </div>
    </div>
  );
}

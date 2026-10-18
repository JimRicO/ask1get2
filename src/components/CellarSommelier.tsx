import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mic, MicOff, Send, X, Globe, Loader2 } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { askCellarSommelier, startSommelierVoice } from "@/lib/sommelier.functions";
import { getSommelierVoice } from "@/lib/sommelier-voices";
import { GeminiLiveSession } from "@/lib/gemini-live-client";
import profileIcon from "@/assets/nav-profile-v2.png.asset.json";

type Pick = {
  id: string;
  role: string;
  why: string;
  serve: string;
  name: string;
  producer: string | null;
  vintage: number | null;
  where: string | null;
};
type Turn = {
  role: "user" | "assistant";
  content: string;
  picks?: Pick[];
  question?: string;
  sources?: string[];
};

export default function CellarSommelier() {
  const ask = useServerFn(askCellarSommelier);
  const startVoice = useServerFn(startSommelierVoice);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState<"off" | "connecting" | "live">("off");
  const [speaking, setSpeaking] = useState(false);
  const [research, setResearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const liveTurnRef = useRef<{ user: boolean; assistant: boolean }>({ user: false, assistant: false });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  useEffect(() => {
    if (!open) stopVoice();
  }, [open]);

  useEffect(() => () => sessionRef.current?.stop(), []);

  /* Append streamed transcript text to the open live turn of that role. */
  function appendLive(role: "user" | "assistant", text: string) {
    const flags = liveTurnRef.current;
    if (role === "user" && flags.assistant) {
      flags.assistant = false;
    }
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (flags[role] && last?.role === role) {
        return [...prev.slice(0, -1), { ...last, content: last.content + text }];
      }
      return [...prev, { role, content: text.trimStart() }];
    });
    flags[role] = true;
    if (role === "assistant") flags.user = false;
  }

  function attachPicks(picks: Pick[]) {
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && liveTurnRef.current.assistant) {
        return [...prev.slice(0, -1), { ...last, picks }];
      }
      liveTurnRef.current.assistant = true;
      return [...prev, { role: "assistant", content: "", picks }];
    });
  }

  function stopVoice() {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setVoice("off");
    setSpeaking(false);
  }

  async function toggleVoice() {
    if (voice !== "off") return stopVoice();
    setError(null);
    setVoice("connecting");
    const session = new GeminiLiveSession({
      onReady: () => setVoice("live"),
      onUserText: (t) => appendLive("user", t),
      onModelText: (t) => appendLive("assistant", t),
      onTurnComplete: () => {
        liveTurnRef.current = { user: false, assistant: false };
      },
      onSpeaking: setSpeaking,
      onClose: (reason) => {
        sessionRef.current = null;
        setVoice("off");
        setSpeaking(false);
        if (reason) setError(/credit|billing|prepay/i.test(reason) ? "Crédits Google AI Studio épuisés : la voix est indisponible." : reason);
      },
      onToolCall: () => "ok",
    });
    sessionRef.current = session;
    try {
      session.prepare(); // must run inside the tap, before any await
      const { token, setup, wines } = await startVoice({ data: { voice: getSommelierVoice() } });
      const byId = new Map(wines.map((w) => [w.id, w]));
      session["ev"].onToolCall = (name, args) => {
        if (name !== "show_wines") return { error: "unknown tool" };
        const raw = Array.isArray(args.picks) ? (args.picks as any[]) : [];
        const picks: Pick[] = raw
          .filter((p) => p && byId.has(p.id))
          .slice(0, 3)
          .map((p, i) => {
            const w = byId.get(p.id)!;
            return { id: w.id, role: i === 0 ? "main" : "alternative", why: String(p.why ?? ""), serve: String(p.serve ?? ""), name: w.name, producer: w.producer, vintage: w.vintage, where: w.where };
          });
        if (picks.length) attachPicks(picks);
        return picks.length ? "shown" : { error: "no valid cellar ids" };
      };
      await session.start(token, setup);
    } catch (e) {
      stopVoice();
      setError(e instanceof Error && e.name === "NotAllowedError" ? "Micro refusé. Autorisez le micro dans le navigateur." : e instanceof Error ? e.message : "Session vocale indisponible.");
    }
  }

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    const history = turns.filter((t) => t.content).map((t) => ({ role: t.role, content: t.content })).slice(-12);
    setTurns((prev) => [...prev, { role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await ask({ data: { history, question: q, research } });
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: res.speech, picks: res.picks, question: res.question, sources: res.sources },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Le sommelier est indisponible.");
    } finally {
      setBusy(false);
    }
  }

  const suggestions = [
    "Un rouge léger pour ce soir",
    "Un vin puissant à son apogée",
    "Un blanc minéral pour l'apéritif",
    "Que boire avec un poulet rôti ?",
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Demander au sommelier"
        className="fixed right-4 z-40 flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/70 bg-card shadow-[0_10px_24px_-6px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,220,180,0.25)] transition-transform active:scale-95"
        style={{ bottom: "calc(100px + env(safe-area-inset-bottom))" }}
      >
        <img src={profileIcon.url} alt="" className="h-10 w-10 object-contain" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="flex max-h-[85vh] w-full max-w-[640px] flex-col rounded-t-2xl border border-primary/40 bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-primary/20 px-4 py-3">
              <div>
                <div className="font-serif text-[20px] italic text-primary">Le Sommelier</div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Votre cave, son expertise</div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setResearch((r) => !r)}
                  aria-label="Recherche web"
                  title="Vérifier sur le web en cas de doute"
                  className={`rounded-full p-2 ${research ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
                >
                  <Globe className="h-5 w-5" />
                </button>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="rounded-full p-2 text-muted-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {turns.length === 0 && (
                <div className="space-y-3">
                  <p className="font-serif text-[16px] text-foreground">
                    Dites-moi ce dont vous avez envie. Je choisis dans <span className="italic text-primary">votre cave</span>.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        className="rounded-full border border-primary/40 px-3 py-1.5 text-[13px] text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {turns.map((t, i) =>
                t.role === "user" ? (
                  <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-3 py-2 text-[14px] text-foreground">
                    {t.content}
                  </div>
                ) : (
                  <div key={i} className="max-w-[95%] space-y-2">
                    <p className="font-serif text-[16px] leading-snug text-foreground">{t.content}</p>
                    {t.picks?.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => navigate(`/wine/${p.id}`)}
                        className="block w-full rounded-xl border border-primary/30 bg-background/40 p-3 text-left"
                      >
                        <div className="text-[10px] uppercase tracking-[0.14em] text-primary">
                          {p.role === "main" ? "1er choix" : "Alternative"}
                        </div>
                        <div className="font-serif text-[16px] text-foreground">
                          {p.name}
                          {p.vintage ? ` ${p.vintage}` : ""}
                        </div>
                        {p.producer && <div className="text-[12px] text-muted-foreground">{p.producer}</div>}
                        <div className="mt-1 text-[13px] text-foreground/90">{p.why}</div>
                        {p.serve && <div className="mt-1 text-[12px] italic text-muted-foreground">{p.serve}</div>}
                        {p.where && <div className="mt-1 text-[12px] text-primary">📍 {p.where}</div>}
                      </button>
                    ))}
                    {t.question && <p className="text-[14px] italic text-primary">{t.question}</p>}
                    {t.sources && t.sources.length > 0 && (
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        {t.sources.map((s, j) => (
                          <a key={s} href={s} target="_blank" rel="noreferrer" className="text-muted-foreground underline">
                            Source {j + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              )}

              {busy && (
                <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {research ? "Le sommelier vérifie…" : "Le sommelier réfléchit…"}
                </div>
              )}
              {error && <div className="text-[13px] text-destructive">{error}</div>}
            </div>

            <form
              className="flex items-center gap-2 border-t border-primary/20 p-3"
              style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <button
                type="button"
                onClick={() => void toggleVoice()}
                aria-label={voice === "off" ? "Parler au sommelier" : "Terminer la conversation"}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${voice === "live" ? `bg-primary text-primary-foreground ${speaking ? "" : "animate-pulse"}` : "bg-secondary text-primary"}`}
              >
                {voice === "connecting" ? <Loader2 className="h-5 w-5 animate-spin" /> : voice === "live" ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={voice === "live" ? (speaking ? "Le sommelier parle…" : "Je vous écoute…") : "Un vin léger, un rouge puissant…"}
                className="h-11 min-w-0 flex-1 rounded-full border border-primary/30 bg-background px-4 text-[15px] text-foreground outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Envoyer"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

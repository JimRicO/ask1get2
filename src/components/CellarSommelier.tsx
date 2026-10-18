import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mic, MicOff, Send, X, Globe, Loader2 } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { askCellarSommelier, startSommelierVoice } from "@/lib/sommelier.functions";
import { getSommelierVoice } from "@/lib/sommelier-voices";
import { getSommelierPrefs } from "@/lib/sommelier-prefs";
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

/* Browser speech recognition (Chrome, Safari). Typed input remains the fallback. */
function getRecognizer(): any | null {
  if (typeof window === "undefined") return null;
  const C = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  if (!C) return null;
  const r = new C();
  r.lang = "fr-FR";
  r.interimResults = true;
  r.continuous = false;
  return r;
}

export default function CellarSommelier() {
  const ask = useServerFn(askCellarSommelier);
  const speak = useServerFn(speakSommelier);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState<"off" | "listening" | "thinking" | "speaking">("off");
  const [research, setResearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voiceOnRef = useRef(false);
  const recRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  useEffect(() => {
    if (!open) stopVoice();
  }, [open]);

  useEffect(() => () => stopVoice(), []);

  function stopVoice() {
    voiceOnRef.current = false;
    try { recRef.current?.abort(); } catch { /* already stopped */ }
    recRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setVoice("off");
  }

  function listen() {
    if (!voiceOnRef.current) return;
    const rec = getRecognizer();
    if (!rec) {
      stopVoice();
      setError("La reconnaissance vocale n'est pas disponible sur ce navigateur. Écrivez votre question.");
      return;
    }
    recRef.current = rec;
    let finalText = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setInput(finalText || interim);
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed") {
        stopVoice();
        setError("Micro refusé. Autorisez le micro dans le navigateur.");
      }
    };
    rec.onend = () => {
      recRef.current = null;
      if (!voiceOnRef.current) return;
      const q = finalText.trim();
      if (q) void send(q, true);
      else listen(); // silence: keep listening
    };
    setVoice("listening");
    rec.start();
  }

  async function playAnswer(text: string) {
    if (!voiceOnRef.current || !text.trim()) return listen();
    try {
      const { audio } = await speak({ data: { text: text.slice(0, 1500), voice: getSommelierVoice() } });
      if (!voiceOnRef.current) return;
      const el = audioRef.current ?? new Audio();
      audioRef.current = el;
      el.src = `data:audio/wav;base64,${audio}`;
      setVoice("speaking");
      el.onended = () => listen();
      await el.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voix indisponible.");
      listen();
    }
  }

  function toggleVoice() {
    if (voice !== "off") return stopVoice();
    setError(null);
    // Unlock audio playback inside the tap (iOS).
    const el = audioRef.current ?? new Audio();
    audioRef.current = el;
    el.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
    void el.play().catch(() => {});
    voiceOnRef.current = true;
    listen();
  }

  async function send(question: string, spoken = false) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    const prefs = getSommelierPrefs();
    const current = turnsRef.current;
    // In "ask" mode, a short yes after the sommelier offered to search triggers the search.
    const lastA = [...current].reverse().find((t) => t.role === "assistant")?.content ?? "";
    const accepted = prefs.research === "ask" && /recherche|search|chercher/i.test(lastA) && /^(oui|yes|ok|vas-y|go|d'accord|volontiers|cherche)/i.test(q);
    const history = current.filter((t) => t.content).map((t) => ({ role: t.role, content: t.content })).slice(-12);
    setTurns((prev) => [...prev, { role: "user", content: q }]);
    setBusy(true);
    if (spoken) setVoice("thinking");
    let answer = "";
    try {
      const res = await ask({ data: { history, question: q, research: research || accepted, prefs } });
      answer = [res.speech, res.question].filter(Boolean).join(" ");
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: res.speech, picks: res.picks, question: res.question, sources: res.sources },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Le sommelier est indisponible.");
    } finally {
      setBusy(false);
    }
    if (spoken) void playAnswer(answer);
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

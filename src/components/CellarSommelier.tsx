import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mic, MicOff, Send, X, Volume2, VolumeX, Globe, Loader2 } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { askCellarSommelier } from "@/lib/sommelier.functions";
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

/* Minimal typing for the browser Speech Recognition API (Chrome/Safari prefix). */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function CellarSommelier() {
  const ask = useServerFn(askCellarSommelier);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [research, setResearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canListen, setCanListen] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const transcriptRef = useRef("");
  const conversationRef = useRef(false); // hands-free loop active
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCanListen(!!getRecognitionCtor());
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  useEffect(() => {
    if (!open) {
      conversationRef.current = false;
      recRef.current?.abort();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    }
  }, [open]);

  const lang = typeof navigator !== "undefined" ? navigator.language : "fr-FR";

  function speak(text: string) {
    if (!voiceOn || typeof window === "undefined" || !window.speechSynthesis) {
      if (conversationRef.current) startListening();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1;
    const voices = window.speechSynthesis.getVoices();
    const prefix = lang.slice(0, 2);
    const v = voices.find((x) => x.lang.startsWith(prefix) && /premium|enhanced|natural|google/i.test(x.name))
      ?? voices.find((x) => x.lang.startsWith(prefix));
    if (v) u.voice = v;
    u.onend = () => {
      if (conversationRef.current) startListening();
    };
    window.speechSynthesis.speak(u);
  }

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    const history = turns.map((t) => ({ role: t.role, content: t.content })).slice(-12);
    setTurns((prev) => [...prev, { role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await ask({ data: { history, question: q, lang, research } });
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: res.speech, picks: res.picks, question: res.question, sources: res.sources },
      ]);
      speak([res.speech, res.question].filter(Boolean).join(" "));
    } catch (e) {
      conversationRef.current = false;
      setError(e instanceof Error ? e.message : "Le sommelier est indisponible.");
    } finally {
      setBusy(false);
    }
  }

  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    window.speechSynthesis?.cancel();
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    transcriptRef.current = "";
    rec.onresult = (e: any) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      transcriptRef.current = text;
      setInput(text);
    };
    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed") setError("Micro refusé. Autorisez le micro dans le navigateur.");
      conversationRef.current = false;
    };
    rec.onend = () => {
      setListening(false);
      const said = transcriptRef.current.trim();
      if (said) void send(said);
      else conversationRef.current = false;
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  function toggleMic() {
    if (listening) {
      conversationRef.current = false;
      recRef.current?.stop();
      return;
    }
    conversationRef.current = true;
    startListening();
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
                <button
                  type="button"
                  onClick={() => {
                    setVoiceOn((v) => !v);
                    window.speechSynthesis?.cancel();
                  }}
                  aria-label={voiceOn ? "Couper la voix" : "Activer la voix"}
                  className="rounded-full p-2 text-muted-foreground"
                >
                  {voiceOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
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
                conversationRef.current = false;
                void send(input);
              }}
            >
              {canListen && (
                <button
                  type="button"
                  onClick={toggleMic}
                  aria-label={listening ? "Arrêter l'écoute" : "Parler"}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${listening ? "animate-pulse bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}
                >
                  {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={listening ? "Je vous écoute…" : "Un vin léger, un rouge puissant…"}
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

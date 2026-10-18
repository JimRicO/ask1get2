import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Play, Square, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { previewSommelierVoice } from "@/lib/sommelier.functions";
import { SOMMELIER_VOICES, getSommelierVoice, setSommelierVoice, type SommelierVoice, DEFAULT_VOICE } from "@/lib/sommelier-voices";

export default function SommelierVoicePicker() {
  const preview = useServerFn(previewSommelierVoice);
  const [selected, setSelected] = useState<SommelierVoice>(DEFAULT_VOICE);
  const [loading, setLoading] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cache = useRef(new Map<string, string>());

  useEffect(() => setSelected(getSommelierVoice()), []);
  useEffect(() => () => audioRef.current?.pause(), []);

  const stop = () => {
    audioRef.current?.pause();
    setPlaying(null);
  };

  const play = async (id: SommelierVoice) => {
    if (playing === id) return stop();
    stop();
    const audio = new Audio();
    audioRef.current = audio; // created inside the tap so iOS allows playback
    try {
      let src = cache.current.get(id);
      if (!src) {
        setLoading(id);
        const { audio: b64 } = await preview({ data: { voice: id } });
        src = `data:audio/wav;base64,${b64}`;
        cache.current.set(id, src);
      }
      if (audioRef.current !== audio) return;
      audio.src = src;
      audio.onended = () => setPlaying(null);
      await audio.play();
      setPlaying(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aperçu indisponible.");
    } finally {
      setLoading(null);
    }
  };

  const choose = (id: SommelierVoice) => {
    setSelected(id);
    setSommelierVoice(id);
  };

  return (
    <div className="mt-8 rounded-md border border-border bg-card p-6">
      <div className="font-serif text-[19px] leading-tight text-foreground">Sommelier voice</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.11em] text-muted-foreground">
        Tap ▶ to listen, tap the name to choose
      </div>
      <ul className="mt-4 space-y-2">
        {SOMMELIER_VOICES.map((v) => {
          const active = selected === v.id;
          return (
            <li
              key={v.id}
              className={`flex items-center gap-3 rounded-md border p-2 transition-colors ${active ? "border-primary" : "border-border"}`}
            >
              <button
                type="button"
                onClick={() => play(v.id)}
                aria-label={`Preview ${v.label}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary text-primary"
              >
                {loading === v.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : playing === v.id ? (
                  <Square className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </button>
              <button type="button" onClick={() => choose(v.id)} className="flex flex-1 items-center justify-between text-left">
                <span>
                  <span className="font-serif text-[17px] text-foreground">{v.label}</span>
                  <span className="ml-2 text-[12px] text-muted-foreground">{v.tone}</span>
                </span>
                {active && <Check className="h-4 w-4 text-primary" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

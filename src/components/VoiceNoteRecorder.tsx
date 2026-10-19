import { useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw } from "lucide-react";

/* Records the spoken tasting note (audio kept) while the browser transcribes it live. */
export default function VoiceNoteRecorder({
  onAudio,
  onTranscript,
}: {
  onAudio: (blob: Blob | null) => void;
  onTranscript: (text: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const recRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);
  const finalRef = useRef("");

  useEffect(() => () => stop(), []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported?.(t));
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        setUrl(URL.createObjectURL(blob));
        onAudio(blob);
      };
      mr.start();
      mediaRef.current = mr;

      const C = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
      finalRef.current = "";
      if (C) {
        const rec = new C();
        rec.lang = navigator.language || "fr-FR";
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (e: any) => {
          let finals = "";
          let interim = "";
          for (let i = 0; i < e.results.length; i++) {
            const t = e.results[i][0].transcript;
            if (e.results[i].isFinal) finals += t + " ";
            else interim += t;
          }
          onTranscript((finalRef.current + finals + interim).trim());
          if (!interim) finalRef.current = finalRef.current; // keep
        };
        rec.onend = () => {
          // Browsers end sessions on pauses; restart while still recording.
          if (mediaRef.current?.state === "recording") {
            try { rec.start(); } catch { /* ignore */ }
          }
        };
        recRef.current = rec;
        try { rec.start(); } catch { /* ignore */ }
      }
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
      setRecording(true);
    } catch {
      setError("Micro refusé ou indisponible.");
    }
  }

  function stop() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    const rec = recRef.current;
    recRef.current = null;
    if (rec) { rec.onend = null; try { rec.stop(); } catch { /* ignore */ } }
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    mediaRef.current = null;
    setRecording(false);
  }

  function reset() {
    setUrl(null);
    onAudio(null);
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={recording ? stop : start}
          aria-label={recording ? "Arrêter l'enregistrement" : "Enregistrer une note vocale"}
          className={`flex h-11 w-11 items-center justify-center rounded-full ${recording ? "animate-pulse bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}
        >
          {recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
        </button>
        <span className="font-mono text-[11px] tracking-[0.05em] text-muted-foreground">
          {recording ? `Enregistrement… ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : url ? "Note vocale prête" : "Dictez votre note"}
        </span>
        {url && !recording && (
          <button type="button" onClick={reset} aria-label="Supprimer l'enregistrement" className="ml-auto text-muted-foreground">
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>
      {url && !recording && <audio controls src={url} className="w-full" />}
      {error && <p className="text-[12px] text-destructive">{error}</p>}
    </div>
  );
}

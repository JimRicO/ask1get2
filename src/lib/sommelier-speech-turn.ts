// Keep one utterance across browser-imposed recognition sessions.
export const SPEECH_PAUSE_MS = 2500;

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };

const norm = (s: string | undefined) => (s ?? "").trim().replace(/\s+/g, " ");

// Merge two hypotheses: prefix/suffix/containment, then word-level overlap.
export function stitch(base: string, next: string) {
  const b = norm(base);
  const n = norm(next);
  if (!b) return n;
  if (!n) return b;
  const bl = b.toLowerCase();
  const nl = n.toLowerCase();
  if (bl === nl || bl.includes(nl)) return b;
  if (nl.includes(bl)) return n;
  const bw = bl.split(" ");
  const nw = n.split(" ");
  const nwl = nl.split(" ");
  for (let len = Math.min(bw.length, nw.length); len >= 1; len--) {
    if (bw.slice(-len).join(" ") === nwl.slice(0, len).join(" ")) {
      return `${b} ${nw.slice(len).join(" ")}`.trim();
    }
  }
  return `${b} ${n}`;
}

// Remove immediately repeated multi-word runs (Android cumulative echo).
// Single-word repetition ("non non") is kept as intentional.
export function collapseEcho(text: string) {
  const words = norm(text).split(" ").filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    let skipped = false;
    for (let len = Math.min(out.length, 20); len >= 2; len--) {
      const tail = out.slice(-len).join(" ").toLowerCase();
      if (tail === words.slice(i, i + len).join(" ").toLowerCase()) {
        i += len;
        skipped = true;
        break;
      }
    }
    if (!skipped) out.push(words[i++]);
  }
  return out.join(" ");
}

// Some browsers revise an index; others append cumulative hypotheses at new indices.
export function createSpeechTranscript() {
  let previous = "";
  let segments: string[] = [];
  const combine = (parts: string[]) => collapseEcho(parts.reduce((t, p) => stitch(t, p), ""));
  return {
    startSession() {
      previous = combine([previous, ...segments]);
      segments = [];
    },
    update(results: ArrayLike<RecognitionResult>, resultIndex: number) {
      segments.length = results.length;
      for (let i = 0; i < results.length; i++) { void resultIndex;
        segments[i] = results[i]?.[0]?.transcript ?? "";
      }
      return {
        text: combine([previous, ...segments]),
        hasInterim: Array.from(results).some((result) => !result.isFinal),
      };
    },
    reset() { previous = ""; segments = []; },
  };
}

export function createSpeechTurn(onComplete: (text: string) => void) {
  let text = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  function cancelPause() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function waitForPause() {
    cancelPause();
    if (!text.trim()) return;
    timer = setTimeout(() => {
      timer = undefined;
      const completed = text.trim();
      text = "";
      if (completed) onComplete(completed);
    }, SPEECH_PAUSE_MS);
  }
  return {
    update(value: string, hasInterim: boolean) {
      text = value;
      cancelPause();
      if (!hasInterim) waitForPause();
    },
    speechStarted: cancelPause,
    ended: waitForPause,
    cancel() { cancelPause(); text = ""; },
  };
}
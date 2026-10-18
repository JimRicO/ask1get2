// Keep one utterance across browser-imposed recognition sessions.
export const SPEECH_PAUSE_MS = 2500;

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };

// Some browsers revise an index; others append cumulative hypotheses at new indices.
// Keep the browser's result indices, rather than appending every partial transcript.
export function createSpeechTranscript() {
  let previous = "";
  let segments: string[] = [];
  function combine(parts: string[]) {
    return parts.reduce((text, part) => {
      const next = part.trim().replace(/\s+/g, " ");
      if (!next) return text;
      if (!text) return next;
      if (next === text || text.startsWith(`${next} `)) return text;
      if (next.startsWith(`${text} `)) return next;
      return `${text} ${next}`;
    }, "");
  }
  return {
    startSession() {
      previous = combine([previous, ...segments]);
      segments = [];
    },
    update(results: ArrayLike<RecognitionResult>, resultIndex: number) {
      segments.length = results.length;
      for (let i = resultIndex; i < results.length; i++) {
        segments[i] = results[i][0].transcript;
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
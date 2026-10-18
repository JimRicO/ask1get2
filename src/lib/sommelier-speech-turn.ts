// Keep one utterance across browser-imposed recognition sessions.
export const SPEECH_PAUSE_MS = 2500;

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
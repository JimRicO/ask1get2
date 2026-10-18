/* Prebuilt Gemini voices offered for the sommelier (names from Google's voice table). */
export const SOMMELIER_VOICES = [
  { id: "Aoede", label: "Aoede", tone: "Breezy" },
  { id: "Charon", label: "Charon", tone: "Informative" },
  { id: "Kore", label: "Kore", tone: "Firm" },
  { id: "Fenrir", label: "Fenrir", tone: "Excitable" },
  { id: "Puck", label: "Puck", tone: "Upbeat" },
  { id: "Zephyr", label: "Zephyr", tone: "Bright" },
  { id: "Sulafat", label: "Sulafat", tone: "Warm" },
  { id: "Gacrux", label: "Gacrux", tone: "Mature" },
] as const;

export type SommelierVoice = (typeof SOMMELIER_VOICES)[number]["id"];
export const DEFAULT_VOICE: SommelierVoice = "Aoede";
const KEY = "sommelier-voice";

export function getSommelierVoice(): SommelierVoice {
  if (typeof window === "undefined") return DEFAULT_VOICE;
  const v = window.localStorage.getItem(KEY);
  return (SOMMELIER_VOICES.find((x) => x.id === v)?.id ?? DEFAULT_VOICE) as SommelierVoice;
}
export function setSommelierVoice(v: SommelierVoice) {
  window.localStorage.setItem(KEY, v);
}

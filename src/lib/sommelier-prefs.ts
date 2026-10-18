/* Owner-tunable behaviour of the sommelier. Stored on this device. */
export const EXPERT_SOURCES = [
  { id: "estate", label: "Sites officiels des domaines" },
  { id: "rvf", label: "La Revue du Vin de France" },
  { id: "bettane", label: "Bettane & Desseauve" },
  { id: "decanter", label: "Decanter" },
  { id: "jancis", label: "Jancis Robinson" },
  { id: "vinous", label: "Vinous" },
  { id: "cellartracker", label: "CellarTracker" },
] as const;
export type ExpertSourceId = (typeof EXPERT_SOURCES)[number]["id"];

export type SommelierPrefs = {
  tone: "strict" | "complice";
  research: "auto" | "ask" | "off";
  sources: ExpertSourceId[];
};

export const DEFAULT_PREFS: SommelierPrefs = {
  tone: "strict",
  research: "ask",
  sources: EXPERT_SOURCES.map((s) => s.id),
};

const KEY = "sommelier-prefs";

export function getSommelierPrefs(): SommelierPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const p = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (!p) return DEFAULT_PREFS;
    return {
      tone: p.tone === "complice" ? "complice" : "strict",
      research: ["auto", "ask", "off"].includes(p.research) ? p.research : "ask",
      sources: Array.isArray(p.sources)
        ? p.sources.filter((s: string) => EXPERT_SOURCES.some((e) => e.id === s))
        : DEFAULT_PREFS.sources,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setSommelierPrefs(p: SommelierPrefs) {
  window.localStorage.setItem(KEY, JSON.stringify(p));
}

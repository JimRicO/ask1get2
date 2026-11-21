import { callGateway } from "./wine-ai.functions";
import { MODELS } from "./ai-models";
import { DEFAULT_PREFS } from "./sommelier-prefs";
import { expertRules, shouldResearch } from "./sommelier-expertise";
import type { SommelierRequest, SommelierReply } from "./sommelier-request";

type Json = Record<string, unknown>;

function grapes(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value
      .map((g) => {
        if (typeof g === "string") return g;
        if (g && typeof g === "object") {
          const o = g as Json;
          const name = o.name ?? o.grape;
          if (!name) return null;
          return o.percentage ? `${name} ${o.percentage}%` : String(name);
        }
        return null;
      })
      .filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}

function locations(w: { storage_locations: unknown; storage_location: string | null }) {
  const list = Array.isArray(w.storage_locations) ? (w.storage_locations as Json[]) : [];
  const out = list
    .filter((l) => l && typeof l.location === "string")
    .map((l) => {
      const rack = typeof l.rack === "string" && l.rack.trim()
        ? /^\d+$/.test(l.rack.trim()) ? ` · Rack ${l.rack.trim()}` : ` · ${l.rack.trim()}`
        : "";
      return `${l.location}${rack} (${Number(l.quantity) || 0})`;
    });
  if (out.length) return out.join("; ");
  return w.storage_location ?? null;
}

type Supa = { from: (t: string) => any };

export async function loadCellar(supabase: Supa) {
  const allRows: any[] = [];
  for (let offset = 0; ; offset += 500) {
  const { data: rows, error } = await supabase
    .from("wines")
    .select(
      "id, wine_name, producer, vintage_year, wine_type, country, region, appellation, grape_varietals, alcohol_content, current_stock, optimal_drinking_window, ai_tasting_notes, description, domain_description, notes, storage_location, storage_locations",
    )
    .gt("current_stock", 0)
    .order("id").range(offset, offset + 499);
  if (error) throw new Error(error.message);
  allRows.push(...(rows ?? []));
  if (!rows || rows.length < 500) break;
  }
  return allRows.map((w) => ({
    id: w.id as string,
    name: w.wine_name as string,
    producer: w.producer as string | null,
    vintage: w.vintage_year as number | null,
    type: w.wine_type as string | null,
    origin: [w.appellation, w.region, w.country].filter(Boolean).join(", ") || null,
    grapes: grapes(w.grape_varietals),
    abv: w.alcohol_content,
    bottles: w.current_stock as number,
    drinking_window: w.optimal_drinking_window,
    tasting: (w.ai_tasting_notes ?? "").slice(0, 400) || null,
    description: (w.description ?? "").slice(0, 500) || null,
    estate: (w.domain_description ?? "").slice(0, 250) || null,
    notes: (w.notes ?? "").slice(0, 200) || null,
    where: locations(w),
  }));
}

type Cellar = Awaited<ReturnType<typeof loadCellar>>;


export async function runSommelier(supabase: Supa, data: SommelierRequest, signal?: AbortSignal, progress?: (stage: string) => void): Promise<SommelierReply> {
    const cellar: Cellar = await loadCellar(supabase);
    progress?.("reasoning");
    const year = new Date().getUTCFullYear();
    const prefs = data.prefs ?? DEFAULT_PREFS;
    const useSearch = shouldResearch(prefs, data.research);
    const prompt = `${expertRules(year, prefs)}
- "speech": 1 to 4 short sentences meant to be read aloud (no lists, no markdown, no ids).
- When you recommend nothing, "picks" must be [].
${useSearch ? "- You may use Google Search to check drinking windows, vintage reports or producer style when your knowledge is uncertain. Cite only pages you actually used." : ""}

CELLAR (${cellar.length} references in stock):
${JSON.stringify(cellar)}

Return ONLY valid JSON, no markdown fences:
{"speech":"","picks":[{"id":"","role":"main|alternative","why":"max 35 words","serve":"temperature / decanting, max 12 words or empty"}],"question":"optional follow-up or empty","sources":[]}`;

    const messages = [
      { role: "system", content: prompt },
      ...data.history.map((t) => ({ role: t.role, content: t.content })),
      { role: "user", content: data.question },
    ];

    const result = await callGateway({
      model: useSearch ? MODELS.GROUNDED : MODELS.FAST,
      messages,
      ...(useSearch ? { tools: [{ type: "google_search" }] } : {}),
    }, { stream: true, ...(signal ? { signal } : {}) });

    const text = result.choices?.[0]?.message?.content?.trim() ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    let parsed: Json | null = null;
    try {
      parsed = m ? (JSON.parse(m[0]) as Json) : null;
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed.speech !== "string" || !parsed.speech.trim()) {
      throw new Error("Le sommelier n’a pas renvoyé une réponse exploitable. Réessayez.");
    }

    const byId = new Map(cellar.map((c) => [c.id, c]));
    const picks = (Array.isArray(parsed?.picks) ? (parsed?.picks as Json[]) : [])
      .filter((p) => typeof p?.id === "string" && byId.has(p.id as string))
      .slice(0, 3)
      .flatMap((p) => {
        const w = byId.get(p.id as string);
        if (!w) return [];
        return [{
          id: w.id,
          role: p.role === "main" ? "main" : "alternative",
          why: String(p.why ?? "").slice(0, 400),
          serve: typeof p.serve === "string" ? p.serve.slice(0, 120) : "",
          name: w.name,
          producer: w.producer,
          vintage: w.vintage,
          type: w.type,
          where: w.where,
          bottles: w.bottles,
        }];
      });

    const sources = (Array.isArray(parsed?.sources) ? (parsed?.sources as unknown[]) : [])
      .filter((s): s is string => typeof s === "string" && /^https?:\/\//.test(s))
      .slice(0, 3);

    return {
      speech: typeof parsed?.speech === "string" ? parsed.speech : text.slice(0, 800),
      question: typeof parsed?.question === "string" ? parsed.question : "",
      picks,
      sources,
    };
}

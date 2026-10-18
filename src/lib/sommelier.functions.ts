import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callGateway } from "./wine-ai.functions";
import { MODELS } from "./ai-models";

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

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
});

/* Cellar sommelier. Recommends only bottles the caller actually has in stock
   (RLS scopes the read). research=true enables Google Search grounding for
   questions about drinking windows, vintages or producers it is unsure of. */
export const askCellarSommelier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        history: z.array(turnSchema).max(20),
        question: z.string().trim().min(2).max(1000),
        lang: z.string().trim().max(35).optional(),
        research: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("wines")
      .select(
        "id, wine_name, producer, vintage_year, wine_type, country, region, appellation, grape_varietals, alcohol_content, current_stock, optimal_drinking_window, ai_tasting_notes, description, domain_description, notes, storage_location, storage_locations",
      )
      .gt("current_stock", 0)
      .limit(300);
    if (error) throw new Error(error.message);

    const cellar = (rows ?? []).map((w) => ({
      id: w.id,
      name: w.wine_name,
      producer: w.producer,
      vintage: w.vintage_year,
      type: w.wine_type,
      origin: [w.appellation, w.region, w.country].filter(Boolean).join(", ") || null,
      grapes: grapes(w.grape_varietals),
      abv: w.alcohol_content,
      bottles: w.current_stock,
      drinking_window: w.optimal_drinking_window,
      tasting: (w.ai_tasting_notes ?? "").slice(0, 400) || null,
      description: (w.description ?? "").slice(0, 500) || null,
      estate: (w.domain_description ?? "").slice(0, 250) || null,
      notes: (w.notes ?? "").slice(0, 200) || null,
      where: locations(w),
    }));

    const year = new Date().getUTCFullYear();
    const prompt = `You are the private head sommelier of this cellar, a Master Sommelier with deep oenological knowledge: appellations, grape structure, producers' house styles, vintage quality, ageing curves, service temperature and food pairing.

Your job: answer the owner's request and recommend bottles FROM THIS CELLAR ONLY (JSON below). It is ${year}.

How you reason (silently):
- Translate the request into structure: body, tannin, acidity, alcohol, sweetness, aromatic profile, occasion, food.
- Judge each candidate with real knowledge of its appellation, grapes, producer and vintage, plus the data given. Judge maturity: too young, in its window, at peak, or past it.
- Prefer the bottle that truly fits, not the most expensive or famous one.

Hard rules:
- Never recommend a wine that is not in the cellar list. Use its exact "id".
- Never invent facts about a bottle. If you are unsure, say so briefly.
- If nothing in the cellar fits, say it bluntly and give the closest fallback with what it trades off.
- No filler, no generic wine-101 talk, no flattery. Be precise and concrete, like speaking to a knowledgeable friend.
- If the request is ambiguous, recommend anyway and ask ONE short question to refine.
- "speech": 1 to 4 short sentences meant to be read aloud (no lists, no markdown, no ids). Name the wine naturally and say where it is stored.
- Give 1 main pick and at most 2 alternatives, each a genuinely different direction.
${data.research ? "- You may use Google Search to check drinking windows, vintage reports or producer style when your knowledge is uncertain. Cite only pages you actually used." : ""}
${data.lang ? `- Answer in the language with BCP 47 code "${data.lang}" unless the user writes in another language; then follow the user.` : "- Answer in the user's language."}

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
      model: data.research ? MODELS.GROUNDED : MODELS.FAST,
      messages,
      ...(data.research ? { tools: [{ type: "google_search" }] } : {}),
    });

    const text = result.choices?.[0]?.message?.content?.trim() ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    let parsed: Json | null = null;
    try {
      parsed = m ? (JSON.parse(m[0]) as Json) : null;
    } catch {
      parsed = null;
    }

    const byId = new Map(cellar.map((c) => [c.id, c]));
    const picks = (Array.isArray(parsed?.picks) ? (parsed!.picks as Json[]) : [])
      .filter((p) => typeof p?.id === "string" && byId.has(p.id as string))
      .slice(0, 3)
      .map((p) => {
        const w = byId.get(p.id as string)!;
        return {
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
        };
      });

    const sources = (Array.isArray(parsed?.sources) ? (parsed!.sources as unknown[]) : [])
      .filter((s): s is string => typeof s === "string" && /^https?:\/\//.test(s))
      .slice(0, 3);

    return {
      speech: typeof parsed?.speech === "string" ? parsed.speech : text.slice(0, 800),
      question: typeof parsed?.question === "string" ? parsed.question : "",
      picks,
      sources,
    };
  });

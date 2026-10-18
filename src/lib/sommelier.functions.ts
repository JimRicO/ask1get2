import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callGateway } from "./wine-ai.functions";
import { MODELS } from "./ai-models";
import { SOMMELIER_VOICES, DEFAULT_VOICE } from "./sommelier-voices";

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

type Supa = { from: (t: string) => any };

async function loadCellar(supabase: Supa) {
  const { data: rows, error } = await supabase
    .from("wines")
    .select(
      "id, wine_name, producer, vintage_year, wine_type, country, region, appellation, grape_varietals, alcohol_content, current_stock, optimal_drinking_window, ai_tasting_notes, description, domain_description, notes, storage_location, storage_locations",
    )
    .gt("current_stock", 0)
    .limit(300);
  if (error) throw new Error(error.message);
  return ((rows ?? []) as any[]).map((w) => ({
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

function expertRules(year: number) {
  return `You are the private head sommelier of this cellar, a Master Sommelier with deep oenological knowledge: appellations, grape structure, producers' house styles, vintage quality, ageing curves, service temperature and food pairing. It is ${year}.

How you reason (silently):
- Translate the request into structure: body, tannin, acidity, alcohol, sweetness, aromatic profile, occasion, food.
- Judge each candidate with real knowledge of its appellation, grapes, producer and vintage, plus the data given. Judge maturity: too young, in its window, at peak, or past it.
- Prefer the bottle that truly fits, not the most expensive or famous one.

Two intents — identify which one:
1. DRINK FROM THE CELLAR (tonight, a meal, an occasion): recommend ONLY wines from the cellar list below, by exact "id". Never invent a bottle or a fact about one; if unsure, say so.
2. BUYING ADVICE (what to add, buy, complete the cellar, discover): give real expert advice with named producers, cuvées and appellations that fit the owner's taste and fill a gap in this cellar. This is allowed and expected. Never present these as being in stock and never show them as cellar picks.

Hard rules:
- UNDERSTAND FIRST. If the request is garbled, nonsensical or off-topic, recommend nothing and ask them to rephrase in one short sentence. Never guess.
- If a request is clear but lacks a detail, make the best call and offer one sharp either/or question — do not interrogate.
- If the request is clear but nothing in the cellar fits, say it bluntly; you may propose the closest bottle and state what it trades off.
- Never announce that you are checking, looking, searching, thinking or finalising. Start directly with the answer.
- Never repeat a recommendation you just gave.
- Tone: a private sommelier who knows the owner — direct, warm, complicit, concise. No assistant clichés ("afin de vous guider au mieux", "n'hésitez pas"), no wine-101, no flattery.
- Always answer in the language the owner is speaking, detected from their words.
- Give 1 main pick and at most 2 alternatives, each a genuinely different direction. For cellar picks, say where each bottle is stored.`;
}

/* Cellar sommelier (text). Recommends only bottles the caller actually has in stock
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
    const cellar: Cellar = await loadCellar(context.supabase as unknown as Supa);
    const year = new Date().getUTCFullYear();
    const prompt = `${expertRules(year)}
- "speech": 1 to 4 short sentences meant to be read aloud (no lists, no markdown, no ids).
- When you recommend nothing, "picks" must be [].
${data.research ? "- You may use Google Search to check drinking windows, vintage reports or producer style when your knowledge is uncertain. Cite only pages you actually used." : ""}

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

export const SOMMELIER_LIVE_MODEL = "gemini-3.8-live";

/* Voice sommelier: mints a single-use Gemini Live token server-side (the Google
   key never reaches the browser) and returns the session setup built from the
   caller's own in-stock cellar. */
const voiceIds = SOMMELIER_VOICES.map((v) => v.id) as [string, ...string[]];

/* Short spoken sample of a voice, for the Profile picker. Returns a WAV as base64. */
export const previewSommelierVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ voice: z.enum(voiceIds) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env["GOOGLE_API_KEY"];
    if (!key) throw new Error("La clé Google n'est pas configurée.");
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-3.8-flash-tts",
        input: [{ type: "user_input", content: [{ type: "text", text: "Bonsoir. Je suis votre sommelier. Que souhaitez-vous boire ce soir ?" }] }],
        response_format: { type: "audio", mime_type: "audio/wav" },
        generation_config: { speech_config: [{ voice: data.voice }] },
      }),
    });
    if (!res.ok) {
      console.error("TTS preview error", res.status, await res.text());
      throw new Error("Aperçu indisponible.");
    }
    const json = (await res.json()) as { steps?: { content?: { data?: string }[] }[] };
    const audio = json.steps?.flatMap((s) => s.content ?? []).find((c) => c?.data)?.data;
    if (!audio) throw new Error("Aperçu indisponible.");
    return { audio };
  });

export const startSommelierVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ voice: z.enum(voiceIds).optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const key = process.env["GOOGLE_API_KEY"];
    if (!key) throw new Error("La clé Google n'est pas configurée.");
    const cellar = await loadCellar(context.supabase as unknown as Supa);
    const now = Date.now();
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
      }),
    });
    if (!res.ok) {
      console.error("Gemini token error", res.status, await res.text());
      throw new Error("Impossible d'ouvrir la session vocale.");
    }
    const token = ((await res.json()) as { name?: string }).name;
    if (!token) throw new Error("Impossible d'ouvrir la session vocale.");

    const instructions = `${expertRules(new Date().getUTCFullYear())}

Voice conversation rules:
- You are speaking out loud. Keep each answer to 1 to 4 short spoken sentences. No lists, no ids read aloud.
- Whenever you recommend bottles, ALSO call the show_wines tool with their exact ids (main pick first) so they appear on screen. Never call it for an unclear request.
- Open with one short greeting and ask what they feel like drinking, in French unless the owner speaks another language.

CELLAR (${cellar.length} references in stock):
${JSON.stringify(cellar)}`;

    const setup = {
      model: `models/${SOMMELIER_LIVE_MODEL}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        thinkingConfig: { thinkingLevel: "medium" },
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: data.voice ?? DEFAULT_VOICE } } },
      },
      systemInstruction: { parts: [{ text: instructions }] },
      tools: [
        {
          functionDeclarations: [
            {
              name: "show_wines",
              description: "Display the recommended cellar bottles on the owner's screen.",
              behavior: "NON_BLOCKING",
              parameters: {
                type: "OBJECT",
                properties: {
                  picks: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        id: { type: "STRING", description: "Exact cellar wine id" },
                        why: { type: "STRING", description: "Max 30 words" },
                        serve: { type: "STRING", description: "Temperature / decanting, short" },
                      },
                      required: ["id", "why"],
                    },
                  },
                },
                required: ["picks"],
              },
            },
          ],
        },
      ],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    };

    return {
      token,
      setup,
      wines: cellar.map((c) => ({ id: c.id, name: c.name, producer: c.producer, vintage: c.vintage, where: c.where })),
    };
  });

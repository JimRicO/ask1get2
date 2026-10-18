import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callGateway } from "./wine-ai.functions";
import { MODELS } from "./ai-models";
import { SOMMELIER_VOICES, DEFAULT_VOICE } from "./sommelier-voices";
import { DEFAULT_PREFS, EXPERT_SOURCES, type ExpertSourceId } from "./sommelier-prefs";
import { expertRules, shouldResearch } from "./sommelier-expertise";

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

const prefsSchema = z
  .object({
    tone: z.enum(["strict", "complice"]),
    research: z.enum(["auto", "ask", "off"]),
    sources: z.array(z.enum(EXPERT_SOURCES.map((s) => s.id) as [ExpertSourceId, ...ExpertSourceId[]])).max(10),
  })
  .optional();
type Prefs = NonNullable<z.infer<typeof prefsSchema>>;
const DEFAULT: Prefs = DEFAULT_PREFS;

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
        prefs: prefsSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const cellar: Cellar = await loadCellar(context.supabase as unknown as Supa);
    const year = new Date().getUTCFullYear();
    const prefs = data.prefs ?? DEFAULT;
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
  });

export const SOMMELIER_LIVE_MODEL = "gemini-3.8-live";

/* Voice sommelier: mints a single-use Gemini Live token server-side (the Google
   key never reaches the browser) and returns the session setup built from the
   caller's own in-stock cellar. */
const voiceIds = SOMMELIER_VOICES.map((v) => v.id) as [string, ...string[]];

async function synthesize(text: string, voice: string): Promise<string> {
  const key = process.env["GOOGLE_API_KEY"];
  if (!key) throw new Error("La clé Google n'est pas configurée.");
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-3.8-flash-tts",
      input: [{ type: "user_input", content: [{ type: "text", text }] }],
      response_format: { type: "audio", mime_type: "audio/wav" },
      generation_config: { speech_config: [{ voice }] },
    }),
  });
  if (!res.ok) {
    console.error("TTS error", res.status, await res.text());
    throw new Error("Voix indisponible.");
  }
  const json = (await res.json()) as { steps?: { content?: { data?: string }[] }[] };
  const audio = json.steps?.flatMap((s) => s.content ?? []).find((c) => c?.data)?.data;
  if (!audio) throw new Error("Voix indisponible.");
  return audio;
}

/* Short spoken sample of a voice, for the Profile picker. Returns a WAV as base64. */
export const previewSommelierVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ voice: z.enum(voiceIds) }).parse(d))
  .handler(async ({ data }) => ({
    audio: await synthesize("Bonsoir. Je suis votre sommelier. Que souhaitez-vous boire ce soir ?", data.voice),
  }));

/* Reads a sommelier answer aloud. The answer itself comes from askCellarSommelier,
   so voice and text share the same deliberate reasoning. */
export const speakSommelier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ text: z.string().trim().min(1).max(1500), voice: z.enum(voiceIds).optional() }).parse(d),
  )
  .handler(async ({ data }) => ({ audio: await synthesize(data.text, data.voice ?? DEFAULT_VOICE) }));

export const startSommelierVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ voice: z.enum(voiceIds).optional(), prefs: prefsSchema }).parse(d ?? {}))
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

    const prefs = data.prefs ?? DEFAULT;
    const instructions = `${expertRules(new Date().getUTCFullYear(), prefs)}

Voice conversation rules:
- You are speaking out loud. Keep each answer to 1 to 4 short spoken sentences. No lists, no ids read aloud.
- Whenever you recommend CELLAR bottles, call the show_wines tool exactly once per answer with their exact ids (main pick first), then speak your answer once. After the tool result, do not restate or repeat what you said. Never call it for buying advice or an unclear request.
- Never say filler like "laissez-moi vérifier", "je consulte", "je cherche", "un instant". Answer immediately.
- Open with one very short, natural greeting (a few words), in French unless the owner speaks another language.

CELLAR (${cellar.length} references in stock):
${JSON.stringify(cellar)}`;

    const setup = {
      model: `models/${SOMMELIER_LIVE_MODEL}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: data.voice ?? DEFAULT_VOICE } } },
      },
      systemInstruction: { parts: [{ text: instructions }] },
      tools: [
        ...(prefs.research === "off" ? [] : [{ googleSearch: {} }]),
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

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SOMMELIER_VOICES, DEFAULT_VOICE } from "./sommelier-voices";
import { DEFAULT_PREFS } from "./sommelier-prefs";
import { expertRules } from "./sommelier-expertise";

import { prefsSchema, sommelierRequestSchema } from "./sommelier-request";

export const askCellarSommelier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sommelierRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { runSommelier } = await import("./sommelier.server");
    return runSommelier(context.supabase, data);
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
    const { loadCellar } = await import("./sommelier.server");
    const cellar = await loadCellar(context.supabase);
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

    const prefs = data.prefs ?? DEFAULT_PREFS;
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

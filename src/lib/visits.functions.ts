import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callGateway } from "./wine-ai.functions";
import { MODELS } from "./ai-models";

type Json = Record<string, unknown>;

function wineLabel(e: unknown): string | null {
  if (!e || typeof e !== "object") return null;
  const w = e as Json;
  return [w.name, w.producer, w.vintage].filter(Boolean).join(", ") || null;
}

/* Answers questions like "what did we pair with the Pinot Noir?" from the
   user's own saved restaurant visits only. RLS scopes the read to the caller. */
export const recallVisits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        question: z.string().trim().min(3).max(400),
        lang: z.string().trim().max(35).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("restaurant_sessions")
      .select("id, restaurant_name, created_at, dishes_text, ordered_dishes, recommendations, loved_wines")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) {
      return { answer: null as string | null, visitIds: [] as string[] };
    }

    const compact = rows.map((r) => {
      const rec = (r.recommendations ?? {}) as Json;
      const table = (rec.table ?? {}) as Json;
      const single = (table.single ?? null) as Json | null;
      const alts = Array.isArray(rec.alternatives) ? (rec.alternatives as Json[]) : [];
      return {
        id: r.id,
        restaurant: r.restaurant_name,
        date: r.created_at?.slice(0, 10),
        dishes: r.ordered_dishes,
        dishes_text: r.dishes_text,
        first_pick: single ? { wine: wineLabel(single.entry), why: single.why } : null,
        split: table.split ?? null,
        other_picks: alts.map((a) => ({ wine: wineLabel(a.entry), why: a.why })),
        loved: (Array.isArray(r.loved_wines) ? r.loved_wines : []).map(wineLabel),
      };
    });

    const prompt = `You are the user's sommelier memory. Below are their past restaurant visits (JSON). Answer the question using ONLY these records. If nothing matches, say so plainly. Never invent wines, dishes, dates or restaurants. Mention the restaurant and date of each visit you cite. Keep it to 1-4 sentences.

${data.lang ? `Answer in the language with BCP 47 code "${data.lang}".` : ""}

VISITS:
${JSON.stringify(compact)}

QUESTION: ${data.question}

Return ONLY valid JSON: {"answer": "", "visit_ids": ["ids of the visits you used"]}`;

    const result = await callGateway({
      model: MODELS.FAST,
      messages: [{ role: "user", content: prompt }],
    });
    const text = result.choices?.[0]?.message?.content?.trim() ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    let parsed: Json | null = null;
    try {
      parsed = m ? (JSON.parse(m[0]) as Json) : null;
    } catch {
      parsed = null;
    }
    const known = new Set(rows.map((r) => r.id));
    const visitIds = (Array.isArray(parsed?.visit_ids) ? (parsed!.visit_ids as unknown[]) : [])
      .filter((v): v is string => typeof v === "string" && known.has(v));
    const answer = typeof parsed?.answer === "string" ? parsed.answer : text || null;
    return { answer, visitIds };
  });

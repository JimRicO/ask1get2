import { z } from "zod";
import { EXPERT_SOURCES, type ExpertSourceId } from "./sommelier-prefs";

export const prefsSchema = z.object({
  tone: z.enum(["strict", "complice"]),
  research: z.enum(["auto", "ask", "off"]),
  sources: z.array(z.enum(EXPERT_SOURCES.map((s) => s.id) as [ExpertSourceId, ...ExpertSourceId[]])).max(10),
}).optional();
export const sommelierRequestSchema = z.object({
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20),
  question: z.string().trim().min(2).max(1000),
  lang: z.string().trim().max(35).optional(),
  research: z.boolean().optional(),
  prefs: prefsSchema,
});
export type SommelierRequest = z.infer<typeof sommelierRequestSchema>;
export type SommelierReply = {
  speech: string; question: string; sources: string[];
  picks: Array<{ id: string; role: string; why: string; serve: string; name: string; producer: string | null; vintage: number | null; type: string | null; where: string | null; bottles: number }>;
};
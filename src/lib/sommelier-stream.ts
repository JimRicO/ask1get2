import { supabase } from "@/integrations/supabase/client";
import type { SommelierRequest, SommelierReply } from "./sommelier-request";

export async function askSommelierStream(data: SommelierRequest, signal: AbortSignal, onProgress: (stage: string) => void): Promise<SommelierReply> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Connectez-vous pour consulter le sommelier.");
  const response = await fetch("/api/sommelier", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await response.text());
  if (!response.body) throw new Error("Le sommelier n’a pas répondu.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: SommelierReply | undefined;
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "progress") onProgress(event.stage);
        if (event.type === "result") result = event.result;
      }
      if (chunk.done) break;
    }
    if (!result) throw new Error("La réponse a été interrompue. Réessayez.");
    return result;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
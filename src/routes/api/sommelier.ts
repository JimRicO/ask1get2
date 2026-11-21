import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sommelierRequestSchema } from "@/lib/sommelier-request";

export const Route = createFileRoute("/api/sommelier")({
  server: { handlers: { POST: async ({ request }) => {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return new Response("Sign in to ask the sommelier.", { status: 401 });
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return new Response("The cellar service is not configured.", { status: 503 });
    const supabase = createClient<Database>(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claims, error } = await supabase.auth.getClaims(token);
    if (error || !claims?.claims?.sub) return new Response("Your session has expired. Sign in again.", { status: 401 });
    const parsed = sommelierRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response("Please send a valid question.", { status: 400 });
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    request.signal.addEventListener("abort", onAbort, { once: true });
    let closed = false;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: unknown) => { if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); };
        emit({ type: "progress", stage: "cellar" });
        // Heartbeats keep the browser connection alive; never abort deliberation on a timer.
        const heartbeat = setInterval(() => emit({ type: "heartbeat" }), 15000);
        try {
          const { runSommelier } = await import("@/lib/sommelier.server");
          const result = await runSommelier(supabase, parsed.data, abort.signal, (stage) => emit({ type: "progress", stage }));
          emit({ type: "result", result });
        } catch (cause) {
          if (!abort.signal.aborted) emit({ type: "error", message: cause instanceof Error ? cause.message : "Le sommelier est indisponible." });
        } finally {
          clearInterval(heartbeat);
          request.signal.removeEventListener("abort", onAbort);
          if (!closed) { closed = true; controller.close(); }
        }
      },
      cancel() { closed = true; abort.abort(); },
    });
    return new Response(body, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } } },
});
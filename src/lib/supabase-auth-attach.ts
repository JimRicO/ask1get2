import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

// Attaches the current Supabase session bearer token to every server function call.
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token: string | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
    } catch {
      token = undefined;
    }

    return next(
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    );
  },
);

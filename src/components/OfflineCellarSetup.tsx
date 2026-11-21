import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearOfflineCellars } from "@/lib/offline-cellar";

export function OfflineCellarSetup() {
  useEffect(() => {
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    const setup = async () => {
      if (!("serviceWorker" in navigator)) return;
      registration = await navigator.serviceWorker.register("/cellar-sw.js");
    };
    void setup().catch(() => {});
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      void clearOfflineCellars();
      (registration?.active ?? navigator.serviceWorker?.controller)?.postMessage({ type: "CLEAR_PRIVATE_MEDIA" });
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!disposed && !data.session) void clearOfflineCellars();
    });
    return () => { disposed = true; subscription.unsubscribe(); };
  }, []);
  return null;
}
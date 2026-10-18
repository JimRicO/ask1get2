import { pageMeta } from "@/lib/page-meta";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: pageMeta("Private Wine Archive", "Wine & Virtue — To taste is to feel. To collect is to remember.") }),
  ssr: false,
  beforeLoad: () => {
    if (typeof window !== "undefined" && !localStorage.getItem("wv-intro-seen")) {
      throw redirect({ to: "/intro", replace: true });
    }
    throw redirect({ to: "/auth", replace: true });
  },
});

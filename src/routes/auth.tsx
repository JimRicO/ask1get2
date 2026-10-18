import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import Auth from "@/pages/Auth";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: pageMeta("Sign in", "Sign in to your Wine & Virtue private wine archive.") }),
  component: Auth,
});

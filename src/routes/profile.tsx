import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import Profile from "@/pages/Profile";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: pageMeta("Profile", "Your Wine & Virtue profile and sommelier preferences.") }),
  component: Profile,
});

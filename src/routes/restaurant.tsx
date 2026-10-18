import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import Restaurant from "@/pages/Restaurant";

export const Route = createFileRoute("/restaurant")({
  head: () => ({ meta: pageMeta("At a Restaurant", "Match your menu with the restaurant wine list and revisit past pairings.") }),
  component: Restaurant,
});

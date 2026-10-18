import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import Pairing from "@/pages/Pairing";

export const Route = createFileRoute("/pair")({
  head: () => ({ meta: pageMeta("Pair with Dinner", "Find a wine from your cellar to accompany your meal.") }),
  component: Pairing,
});

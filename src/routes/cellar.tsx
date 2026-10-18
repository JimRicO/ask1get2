import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import Cellar from "@/pages/Cellar";

export const Route = createFileRoute("/cellar")({
  head: () => ({ meta: pageMeta("Cellar", "Your wine collection, storage locations and private sommelier.") }),
  component: Cellar,
});

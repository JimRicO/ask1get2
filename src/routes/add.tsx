import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import AddWine from "@/pages/AddWine";

export const Route = createFileRoute("/add")({
  head: () => ({ meta: pageMeta("New Wine", "Add a bottle to your private Wine & Virtue cellar.") }),
  component: AddWine,
});

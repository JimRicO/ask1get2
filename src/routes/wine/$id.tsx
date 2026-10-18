import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import WineDetail from "@/pages/WineDetail";

export const Route = createFileRoute("/wine/$id")({
  head: () => ({ meta: pageMeta("Bottle Details", "Wine details, estate information and storage in your private archive.") }),
  component: WineDetail,
});

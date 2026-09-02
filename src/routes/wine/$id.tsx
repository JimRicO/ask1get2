import { createFileRoute } from "@tanstack/react-router";
import WineDetail from "@/pages/WineDetail";

export const Route = createFileRoute("/wine/$id")({
  component: WineDetail,
});

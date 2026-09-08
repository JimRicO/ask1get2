import { createFileRoute } from "@tanstack/react-router";
import Restaurant from "@/pages/Restaurant";

export const Route = createFileRoute("/restaurant")({
  component: Restaurant,
});

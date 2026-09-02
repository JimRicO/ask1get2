import { createFileRoute } from "@tanstack/react-router";
import AddWine from "@/pages/AddWine";

export const Route = createFileRoute("/add")({
  component: AddWine,
});

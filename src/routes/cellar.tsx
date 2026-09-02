import { createFileRoute } from "@tanstack/react-router";
import Cellar from "@/pages/Cellar";

export const Route = createFileRoute("/cellar")({
  component: Cellar,
});

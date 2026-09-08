import { createFileRoute } from "@tanstack/react-router";
import Pairing from "@/pages/Pairing";

export const Route = createFileRoute("/pair")({
  component: Pairing,
});

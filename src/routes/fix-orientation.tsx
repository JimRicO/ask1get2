import { createFileRoute } from "@tanstack/react-router";
import FixOrientation from "@/pages/FixOrientation";

export const Route = createFileRoute("/fix-orientation")({
  component: FixOrientation,
  head: () => ({
    meta: [
      { title: "Fix Bottle Orientation | No wine, No sex" },
      {
        name: "description",
        content:
          "Maintenance pass that rotates sideways wine bottle photos upright in your cellar.",
      },
      { property: "og:title", content: "Fix Bottle Orientation" },
      {
        property: "og:description",
        content: "Rotate sideways wine bottle photos upright across your cellar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

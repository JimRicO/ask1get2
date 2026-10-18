import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import Wishlist from "@/pages/Wishlist";

export const Route = createFileRoute("/wishlist")({
  head: () => ({ meta: pageMeta("Wishlist", "Keep track of wines you want to discover.") }),
  component: Wishlist,
});

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window !== "undefined" && !localStorage.getItem("wv-intro-seen")) {
      throw redirect({ to: "/intro", replace: true });
    }
    throw redirect({ to: "/auth", replace: true });
  },
});

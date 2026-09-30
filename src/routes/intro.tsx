import { useCallback, useEffect } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

const SEEN_KEY = "wv-intro-seen";

export const Route = createFileRoute("/intro")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { replay?: boolean } => {
    const r = search.replay;
    return r === true || r === "true" || r === 1 || r === "1" ? { replay: true } : {};
  },
  beforeLoad: ({ search }) => {
    if (!search.replay && typeof window !== "undefined" && localStorage.getItem(SEEN_KEY)) {
      throw redirect({ to: "/", replace: true });
    }
  },
  head: () => ({
    meta: [
      { title: "Intro — Wine & Virtue" },
      { name: "description", content: "The Wine & Virtue opening film." },
      { property: "og:title", content: "Intro — Wine & Virtue" },
      { property: "og:description", content: "The Wine & Virtue opening film." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntroPage,
});

function IntroPage() {
  const navigate = useNavigate();

  const finish = useCallback(() => {
    localStorage.setItem(SEEN_KEY, "1");
    navigate({ to: "/", replace: true });
  }, [navigate]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data === "wv-intro-ended") finish();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [finish]);

  return (
    <div style={{ position: "relative", background: "#140B0C", height: "100dvh" }}>
      <iframe
        src="/wine-and-virtue-intro.html"
        title="Wine & Virtue intro"
        allow="autoplay"
        style={{
          border: "none",
          width: "100%",
          height: "100dvh",
          background: "#140B0C",
          display: "block",
        }}
      />
      <button
        type="button"
        onClick={finish}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#F4ECE1",
          background: "rgba(29, 18, 19, 0.7)",
          border: "1px solid #3B2729",
          borderRadius: 9999,
          padding: "8px 14px",
          cursor: "pointer",
        }}
      >
        Skip intro
      </button>
    </div>
  );
}

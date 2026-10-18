import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import UploadLogo from "@/pages/UploadLogo";

export const Route = createFileRoute("/upload-logo")({
  head: () => ({ meta: pageMeta("Logo", "Manage the Wine & Virtue logo.") }),
  component: UploadLogo,
});

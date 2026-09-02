import { createFileRoute } from "@tanstack/react-router";
import UploadLogo from "@/pages/UploadLogo";

export const Route = createFileRoute("/upload-logo")({
  component: UploadLogo,
});

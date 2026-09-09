import type { Metadata } from "next";
import { AiVisibilityPage } from "@/products/ai-visibility";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export const metadata: Metadata = {
  title: "Free AI Visibility Audit",
  description:
    "Assess website readability and inspect one sampled Gemini response when available. Free, no signup required.",
};

export default function Page() {
  return <AiVisibilityPage workspaceEnabled={workspaceReleaseEnabled()} />;
}

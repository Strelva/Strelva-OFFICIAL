import type { Metadata } from "next";
import { AiVisibilityPage } from "@/products/ai-visibility";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export const metadata: Metadata = {
  title: "Free AI Visibility Audit",
  description:
    "When customers ask ChatGPT or Gemini for the best business near them, do you show up? Get an instant A–F AI visibility grade — free, no signup.",
};

export default function Page() {
  return <AiVisibilityPage workspaceEnabled={workspaceReleaseEnabled()} />;
}

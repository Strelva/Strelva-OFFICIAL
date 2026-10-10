import { resolveAgencyAttribution } from "@/platform/agency-prospecting/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AiVisibilityPage } from "@/products/ai-visibility";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export const metadata: Metadata = {
  title: "Free AI Visibility Audit",
  description:
    "Assess website readability and inspect one sampled Gemini response when available. Free, no signup required.",
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const agency = await resolveAgencyAttribution(params.agency).catch(() => notFound());
  return <AiVisibilityPage agency={agency} workspaceEnabled={workspaceReleaseEnabled()} />;
}

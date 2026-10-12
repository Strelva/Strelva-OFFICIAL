import { resolveAgencyAttribution } from "@/platform/agency-prospecting/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AiVisibilityPage } from "@/products/ai-visibility";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { businessSignupReleaseEnabled } from "@/platform/business-signup-release";

export const metadata: Metadata = {
  title: "Ask Gemini about your business",
  description:
    "Assess website readability and inspect one sampled Gemini response when available. Free, no signup required.",
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const agency = await resolveAgencyAttribution(params.agency).catch(() => notFound());
  // Owner door: a business's Getting started link carries its name and one website.
  const carried = businessSignupReleaseEnabled()
    ? { initialBusiness: typeof params.business === "string" ? params.business.trim().slice(0, 160) : "", initialUrl: typeof params.url === "string" ? params.url.trim().slice(0, 2048) : "" }
    : {};
  return <AiVisibilityPage agency={agency} workspaceEnabled={workspaceReleaseEnabled()} {...carried} />;
}

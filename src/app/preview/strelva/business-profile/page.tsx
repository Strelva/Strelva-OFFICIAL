import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PublicBusinessProfile, type AssistantViewState } from "@/experience/product/assistants/PublicBusinessProfile";
import { assistantsFacts, assistantsProfileCapabilities, assistantsProfileFacts } from "@/experience/workspace/preview/assistants-fixture";
export const dynamic = "force-dynamic";
export const metadata = { title: "Business profile preview | Strelva", robots: { index: false, follow: false } };
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state } = await searchParams;
  const view: AssistantViewState = state === "loading" || state === "empty" || state === "error" || state === "permission" ? state : "ready";
  return <PublicBusinessProfile facts={assistantsFacts} confirmedAt="2026-10-03T12:00:00Z" pageUrl="/preview/strelva/business-profile" factRows={assistantsProfileFacts} capabilities={assistantsProfileCapabilities} endpoint="mcp.example.test/b/fictional-mediation" state={view} fictional />;
}

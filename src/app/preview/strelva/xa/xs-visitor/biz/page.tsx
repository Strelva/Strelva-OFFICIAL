import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { PublicBusinessProfile, type AssistantViewState } from "@/experience/product/assistants/PublicBusinessProfile";
import { harborFacts } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business page preview", robots: { index: false, follow: false } };

const STATES: readonly AssistantViewState[] = ["ready", "loading", "empty", "error", "permission"];

/** /biz/[handle] as the real PublicBusinessProfile renders it. ?state=ready|loading|empty|error|permission|assistants&mode=dark */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode } = await searchParams;
  const view = STATES.find(item => item === state) ?? "ready";
  const assistants = state === "assistants";
  return <XsVisitorFrame mode={mode}><PublicBusinessProfile facts={view === "empty" ? { name: "Harbor Dental", verification: harborFacts.verification } : harborFacts} confirmedAt="2026-10-12T12:00:00Z" pageUrl="/preview/strelva/xa/xs-visitor/biz" state={view}
    {...(assistants ? { capabilities: [
      { label: "See open times", detail: "From the booking calendar; never shows who is booked", method: "GET /times" },
      { label: "Ask for a visit", detail: "Harbor Dental confirms each request. Nothing is booked until then.", method: "POST /request" },
    ], endpoint: "mcp.strelva.example/b/harbor-dental" } : {})} /></XsVisitorFrame>;
}

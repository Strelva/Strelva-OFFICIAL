import { notFound } from "next/navigation";
import { InquiryPreviewExperience } from "@/experience/inquiries/InquiryPreviewExperience";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Strelva inquiry · Interface preview",
  robots: { index: false, follow: false },
};

export default async function InquiryPreviewObjectPage({ params, searchParams }: { params: Promise<{ inquiryId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const [{ inquiryId }, query] = await Promise.all([params, searchParams]);
  const view = query.view ? parsePreviewView(query.view) : inquiryId.startsWith("record") ? "record" : "work";
  return <InquiryPreviewExperience audience={query.audience === "agency" ? "agency" : "business"} scenario={query.scenario || query.state} initialView={view} initialRequestId={query.request || (view === "work" || view === "preview" || view === "shape" ? inquiryId : null)} initialInquiryId={query.inquiry || (view === "record" || view === "why" ? inquiryId : null)} basePath="/preview/strelva/inquiries" />;
}

function parsePreviewView(value: string | undefined) {
  const views = ["home", "new", "shape", "work", "plan", "preview", "rehearsal", "receipt", "search", "record", "why", "responsibility", "connections", "onboarding", "account", "attention", "patterns"] as const;
  return value && views.includes(value as (typeof views)[number]) ? value as (typeof views)[number] : "home";
}

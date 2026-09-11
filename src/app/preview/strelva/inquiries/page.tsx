import { notFound } from "next/navigation";
import { InquiryPreviewExperience } from "@/experience/inquiries/InquiryPreviewExperience";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Strelva inquiries · Interface preview",
  robots: { index: false, follow: false },
};

export default async function InquiryPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  const audience = params.audience === "agency" ? "agency" : "business";
  return <InquiryPreviewExperience audience={audience} scenario={params.scenario || params.state} initialView={parsePreviewView(params.view)} initialRequestId={params.request || null} initialInquiryId={params.inquiry || null} basePath="/preview/strelva/inquiries" />;
}

function parsePreviewView(value: string | undefined) {
  const views = ["home", "new", "shape", "work", "plan", "preview", "rehearsal", "receipt", "search", "record", "why", "responsibility", "connections", "onboarding", "account", "attention", "patterns"] as const;
  return value && views.includes(value as (typeof views)[number]) ? value as (typeof views)[number] : "home";
}

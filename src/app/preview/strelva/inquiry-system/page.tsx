import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { InquirySystemPreview } from "@/experience/workspace/preview/InquirySystemPreview";

export const dynamic = "force-dynamic";
export default async function InquirySystemPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode } = await searchParams;
  return <InquirySystemPreview state={state} mode={mode === "dark" ? "dark" : "light"} />;
}

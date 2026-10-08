import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { InquiryRunningPreview } from "@/experience/workspace/preview/InquiryRunningPreview";
export const dynamic = "force-dynamic";
export default function InquiryRunningPage() {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <main className="mx-auto max-w-4xl bg-canvas text-warm-black"><InquiryRunningPreview /></main>;
}

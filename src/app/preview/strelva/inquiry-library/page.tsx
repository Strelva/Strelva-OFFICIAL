import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { InquiryLibraryPreview } from "@/experience/workspace/preview/InquiryLibraryPreview";
export const dynamic = "force-dynamic";
export default function InquiryLibraryPage() {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <main className="mx-auto max-w-4xl bg-canvas p-6 text-warm-black"><h1 className="font-display mb-8 text-xl font-medium">Library</h1><InquiryLibraryPreview /></main>;
}

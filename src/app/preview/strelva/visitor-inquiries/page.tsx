import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { VisitorInquiriesPreview } from "@/experience/workspace/preview/VisitorInquiriesPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Visitor inquiries · fictional preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string; state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { view, state } = await searchParams;
  const initialView = view === "received" || view === "inquiry" || view === "instant" || view === "manage" ? view : "request";
  return <VisitorInquiriesPreview initialView={initialView} state={state} />;
}

import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { InquiryCanonPreview } from "@/experience/workspace/preview/InquiryCanonPreview";
import { inquiryCanonState, inquiryCanonView } from "@/experience/workspace/preview/inquiry-canon-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · inquiry canon preview", robots: { index: false, follow: false } };

export default async function InquiryCanonPage({ searchParams }: { searchParams: Promise<{ view?: string; state?: string; mode?: string; detail?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  return <InquiryCanonPreview key={`${params.view}:${params.state}:${params.detail}`} view={inquiryCanonView(params.view)} state={inquiryCanonState(params.state)} mode={params.mode === "dark" ? "dark" : "light"} showDetail={params.detail === "1"} />;
}

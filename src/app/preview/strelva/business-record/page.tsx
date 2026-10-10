import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { BusinessRecordPreview } from "@/experience/workspace/preview/BusinessRecordPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Business record · Local preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ surface?: string; state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  return <BusinessRecordPreview surface={params.surface === "facts" ? "facts" : "record"} state={params.state} />;
}

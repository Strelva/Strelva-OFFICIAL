import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { AgencyLibraryCanonPreview } from "@/experience/workspace/preview/AgencyLibraryCanonPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agency Library preview", robots: { index: false, follow: false } };
export default async function AgencyLibraryPreviewPage({ searchParams }: { searchParams: Promise<{ surface?: string; state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { surface = "library", state = "ready", mode } = await searchParams;
  return <AgencyLibraryCanonPreview surface={surface} state={state} mode={mode === "dark" ? "dark" : "light"} />;
}

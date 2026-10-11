import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { AgencyCanonPreview } from "@/experience/workspace/preview/AgencyCanonPreview";
import { agencyCanonFrame, agencyCanonState } from "@/experience/workspace/preview/agency-canon-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · Agency canon preview", robots: { index: false, follow: false } };
export default async function AgencyCanonPage({ searchParams }: { searchParams: Promise<{ frame?: string; state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  return <AgencyCanonPreview frame={agencyCanonFrame(params.frame)} state={agencyCanonState(params.state)} mode={params.mode === "dark" ? "dark" : "light"} />;
}

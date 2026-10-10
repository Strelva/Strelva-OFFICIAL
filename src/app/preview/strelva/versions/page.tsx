import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { systemDetailFixtureState } from "@/experience/workspace/preview/system-details-fixture";
import { VersionsComparisonPreview } from "@/experience/workspace/preview/SystemsDetailsPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Versions preview", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode } = await searchParams;
  return <VersionsComparisonPreview state={systemDetailFixtureState(state)} mode={mode === "dark" ? "dark" : "light"} />;
}

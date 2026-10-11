import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { AgencyPortfolioPreview } from "@/experience/workspace/preview/AgencyPortfolioPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · Fictional agency portfolio", robots: { index: false, follow: false } };
export default async function AgencyPortfolioPage({ searchParams }: { searchParams: Promise<{ surface?: string; state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  const surface = params.surface === "queue" || params.surface === "home" ? params.surface : "clients";
  const state = params.state === "loading" || params.state === "empty" || params.state === "error" || params.state === "permission" ? params.state : "ready";
  return <AgencyPortfolioPreview surface={surface} state={state} mode={params.mode === "dark" ? "dark" : "light"} />;
}

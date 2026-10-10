import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { L13RemainingPreview } from "@/experience/workspace/preview/L13RemainingPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · Fictional remaining pages", robots: { index: false, follow: false } };
export default async function RemainingPreview({ searchParams }: { searchParams: Promise<{ surface?: string; state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  return <L13RemainingPreview surface={params.surface === "home-finder" ? "home-finder" : "prospects"} state={params.state || "ready"} mode={params.mode === "dark" ? "dark" : "light"} />;
}

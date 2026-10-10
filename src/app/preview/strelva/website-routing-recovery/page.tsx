import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { WebsiteRoutingRecoveryFixture } from "@/experience/websites/WebsiteRoutingRecoveryFixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fictional website routing recovery", robots: { index: false, follow: false } };
export default async function WebsiteRoutingPreview({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (!strelvaUiPreviewEnabled() || process.env.NODE_ENV !== "development") notFound();
  const { mode } = await searchParams;
  if (mode !== "domain" && mode !== "undo") notFound();
  return <WebsiteRoutingRecoveryFixture domain={mode === "domain"} />;
}

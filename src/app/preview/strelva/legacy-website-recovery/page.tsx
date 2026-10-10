import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { LegacyWebsiteRecoveryFixture } from "@/experience/websites/LegacyWebsiteRecoveryFixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fictional legacy website recovery", robots: { index: false, follow: false } };
export default async function LegacyRecoveryPreview({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (!strelvaUiPreviewEnabled() || process.env.NODE_ENV !== "development") notFound();
  const { mode } = await searchParams;
  if (mode !== "create" && mode !== "saved") notFound();
  return <LegacyWebsiteRecoveryFixture saved={mode === "saved"} />;
}

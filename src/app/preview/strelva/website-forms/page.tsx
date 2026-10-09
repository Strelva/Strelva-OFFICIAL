import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { WebsiteFormsRecoveryFixture } from "@/experience/websites/WebsiteFormsRecoveryFixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fictional website form recovery", robots: { index: false, follow: false } };

export default async function WebsiteFormsPreview({ searchParams }: { searchParams: Promise<{ version?: string }> }) {
  if (!strelvaUiPreviewEnabled() || process.env.NODE_ENV !== "development") notFound();
  const { version } = await searchParams;
  if (version !== "1" && version !== "2") notFound();
  return <WebsiteFormsRecoveryFixture version={version === "2" ? 2 : 1} />;
}

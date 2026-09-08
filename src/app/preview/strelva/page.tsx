import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { previewScenario } from "@/experience/workspace/preview/fixture";
import { WorkspacePreview } from "@/experience/workspace/preview/WorkspacePreview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Local interface preview", robots: { index: false, follow: false } };

export default async function StrelvaPreviewPage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { scenario } = await searchParams;
  return <WorkspacePreview scenario={previewScenario(scenario)} />;
}

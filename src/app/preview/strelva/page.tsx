import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { previewScenario } from "@/experience/workspace/preview/fixture";
import { WorkspacePreview } from "@/experience/workspace/preview/WorkspacePreview";
import { previewSystems } from "@/experience/workspace/preview/systems-projection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Local interface preview", robots: { index: false, follow: false } };

export default async function StrelvaPreviewPage({ searchParams }: { searchParams: Promise<{ scenario?: string; previewSetup?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { scenario, previewSetup } = await searchParams;
  const selected = previewScenario(scenario);
  // The Systems projection runs on the server, as it does for the workspace route.
  const systems = await previewSystems(selected, { installedStaffRequest: previewSetup === "staff-request", seededRequests: previewSetup === "requests" });
  return <WorkspacePreview scenario={selected} systems={systems} />;
}

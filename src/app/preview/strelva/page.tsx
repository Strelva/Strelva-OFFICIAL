import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { previewScenario } from "@/experience/workspace/preview/fixture";
import { WorkspacePreview } from "@/experience/workspace/preview/WorkspacePreview";
import { previewSystems } from "@/experience/workspace/preview/systems-projection";
import { systemsReleaseEnabled } from "@/platform/systems-release";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Local interface preview", robots: { index: false, follow: false } };

export default async function StrelvaPreviewPage({ searchParams }: { searchParams: Promise<{ scenario?: string; previewSetup?: string; systems?: string; needsYou?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { scenario, previewSetup, systems: systemsParam, needsYou } = await searchParams;
  const selected = previewScenario(scenario);
  // STRELVA_SYSTEMS_RELEASE decides, as on the workspace route. This
  // fixture-only page may override it with `systems=on|off` so both states
  // can be reviewed from one local server.
  const released = systemsParam === "on" ? true : systemsParam === "off" ? false : systemsReleaseEnabled();
  // The Systems projection runs on the server, as it does for the workspace route.
  const systems = await previewSystems(selected, { installedStaffRequest: previewSetup === "staff-request", seededRequests: previewSetup === "requests", systems: released });
  // Needs you on Home is fixture-only here: `needsYou=on` shows the policy model's Home.
  return <WorkspacePreview scenario={selected} systems={systems} needsYou={needsYou === "on"} />;
}

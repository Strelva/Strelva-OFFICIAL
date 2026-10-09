import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { previewScenario } from "@/experience/workspace/preview/fixture";
import { WorkspacePreview } from "@/experience/workspace/preview/WorkspacePreview";
import { previewSystems } from "@/experience/workspace/preview/systems-projection";
import { systemsReleaseEnabled } from "@/platform/systems-release";
import { previewPublishingMode } from "@/experience/workspace/preview/publishing-fixture";
import { publishingReleaseEnabled } from "@/products/publishing/server";
import { previewAskMode } from "@/experience/workspace/preview/ask-fixture";
import { previewMakeRealMode } from "@/experience/workspace/preview/make-real-fixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Local interface preview", robots: { index: false, follow: false } };

export default async function StrelvaPreviewPage({ searchParams }: { searchParams: Promise<{ scenario?: string; previewSetup?: string; systems?: string; needsYou?: string; publishing?: string; ask?: string; makeReal?: string; sibling?: string; outcomes?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { scenario, previewSetup, systems: systemsParam, needsYou, publishing: publishingParam, ask, makeReal, sibling, outcomes } = await searchParams;
  const selected = previewScenario(scenario);
  // STRELVA_SYSTEMS_RELEASE decides, as on the workspace route. This
  // fixture-only page may override it with `systems=on|off` so both states
  // can be reviewed from one local server.
  const released = systemsParam === "on" ? true : systemsParam === "off" ? false : systemsReleaseEnabled();
  // The Systems projection runs on the server, as it does for the workspace route.
  const systems = await previewSystems(selected, { installedStaffRequest: previewSetup === "staff-request", seededRequests: previewSetup === "requests", systems: released,
    // STRELVA_PUBLISHING_RELEASE decides; `publishing=on|off|pending|disconnected|none` overrides here only.
    publishing: previewPublishingMode(publishingParam, publishingReleaseEnabled()),
    // Fixture-only: `makeReal=partly|live` shows the spec's walk-through (Make real in progress, History, What changed).
    makeReal: previewMakeRealMode(makeReal), sibling: sibling === "empty" || sibling === "unavailable" ? sibling : "ready" });
  // Needs you on Home is fixture-only here: `needsYou=on` shows the policy model's Home.
  // Ask Strelva is fixture-only here: `ask=on|off|error|forbidden|unsaved` picks the state.
  // The outcome loop ribbon on Home is fixture-only here: `outcomes=on` shows it.
  return <WorkspacePreview scenario={selected} systems={systems} needsYou={needsYou === "on"} ask={previewAskMode(ask)} outcomes={outcomes === "on"} />;
}

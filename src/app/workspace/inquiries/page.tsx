import type { Metadata } from "next";
import { openWorkspacePlace } from "@/platform/owner-entry/place";
import { readPlace } from "@/platform/owner-entry/place-state";
import { readWorkspaceInquiryInbox } from "@/products/inquiries";
import { z } from "zod";
import { WorkspaceInquiries } from "@/experience/places/WorkspaceInquiries";
import { releaseViewerFor } from "@/platform/release-flags/viewer";
import { inquiryForwardingReleaseEnabled, inquiryForwardingReleasedFor } from "@/products/inquiry-forwarding/server";
import { WorkspaceSurfaceShell } from "@/experience/workspace/WorkspaceSurfaceShell";
import { listWorkspaces } from "@/platform/workspaces";
import { systemsReleasedFor } from "@/platform/systems-release";
import { IntakeAppPanel } from "@/experience/vertical-intake/IntakeAppPanel";
import { readIntakeApp, verticalIntakeReleaseMayBeOn, verticalIntakeReleasedFor } from "@/products/vertical-intake/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inquiries", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The workspace home of /dashboard/leads (owner-entry spec §5). */
export default async function InquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { workspaceId, actor } = await openWorkspacePlace(params, "/workspace/inquiries");
  const cursor = z.object({ before: z.iso.datetime({ offset: true }), beforeId: z.string().uuid() }).safeParse(params);
  const [state, workspaces, systemsReleased] = await Promise.all([
    readPlace("inquiries", workspaceId, () => readWorkspaceInquiryInbox(actor, workspaceId, cursor.success ? cursor.data : undefined)),
    listWorkspaces(actor).catch(() => []),
    systemsReleasedFor(actor, workspaceId).catch(() => false),
  ]);
  const forwarding = state.kind !== "permission" && inquiryForwardingReleaseEnabled()
    && await inquiryForwardingReleasedFor(workspaceId, await releaseViewerFor(actor)).catch(() => false);
  // Dental intake: nothing is read and nothing renders unless the flag may be on and is on for this person and business.
  const intake = state.kind !== "permission" && verticalIntakeReleaseMayBeOn() && await verticalIntakeReleasedFor(actor, workspaceId).catch(() => false)
    ? await readIntakeApp(actor, workspaceId, "dental_intake").catch(() => null)
    : null;
  return <WorkspaceSurfaceShell workspaceId={workspaceId} businessName={workspaces.find(workspace => workspace.id === workspaceId)?.name} systemsReleased={systemsReleased}>
    <>
      <WorkspaceInquiries workspaceId={workspaceId} state={state} forwarding={forwarding} embedded />
      {intake ? <div className="px-4 pb-32 md:pl-14 md:pr-10"><IntakeAppPanel workspaceId={workspaceId} initial={intake} /></div> : null}
    </>
  </WorkspaceSurfaceShell>;
}

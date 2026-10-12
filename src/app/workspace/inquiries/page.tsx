import type { Metadata } from "next";
import { openWorkspacePlace } from "@/platform/owner-entry/place";
import { readPlace } from "@/platform/owner-entry/place-state";
import { readWorkspaceInquiryInbox } from "@/products/inquiries";
import { z } from "zod";
import { WorkspaceInquiries } from "@/experience/places/WorkspaceInquiries";
import { releaseViewerFor } from "@/platform/release-flags/viewer";
import { inquiryForwardingReleaseEnabled, inquiryForwardingReleasedFor } from "@/products/inquiry-forwarding/release";
import { WorkspaceSurfaceShell } from "@/experience/workspace/WorkspaceSurfaceShell";
import { listWorkspaces } from "@/platform/workspaces";
import { systemsReleasedFor } from "@/platform/systems-release";
import { StPage } from "@/components/ui/strelva/Kit";

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
  return <WorkspaceSurfaceShell workspaceId={workspaceId} businessName={workspaces.find(workspace => workspace.id === workspaceId)?.name} systemsReleased={systemsReleased}>
    <StPage><WorkspaceInquiries workspaceId={workspaceId} state={state} forwarding={forwarding} embedded /></StPage>
  </WorkspaceSurfaceShell>;
}

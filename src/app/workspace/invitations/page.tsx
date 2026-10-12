import { redirect } from "next/navigation";
import { WorkspaceInvitationManager } from "@/experience/workspace/WorkspaceInvitationManager";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { listWorkspaces } from "@/platform/workspaces";
import { systemsReleasedFor } from "@/platform/systems-release";
import { z } from "zod";

export const dynamic = "force-dynamic";

export default async function WorkspaceInvitationsPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[] }> }) {
  if (!workspaceReleaseEnabled()) redirect("/workspace");
  const workspaceId = (await searchParams).workspaceId;
  if (typeof workspaceId !== "string" || !z.string().uuid().safeParse(workspaceId).success) redirect("/workspace?view=access");
  const actor = await workspaceHttpActor();
  if (!actor) redirect(`/sign-in?next=${encodeURIComponent(`/workspace/invitations?workspaceId=${workspaceId}`)}`);
  const [workspaces, systemsReleased] = await Promise.all([
    listWorkspaces(actor).catch(() => []),
    systemsReleasedFor(actor, workspaceId).catch(() => false),
  ]);
  return <WorkspaceInvitationManager workspaceId={workspaceId} businessName={workspaces.find(workspace => workspace.id === workspaceId)?.name} systemsReleased={systemsReleased} />;
}

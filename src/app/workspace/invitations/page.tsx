import { redirect } from "next/navigation";
import { WorkspaceInvitationManager } from "@/experience/workspace/WorkspaceInvitationManager";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export const dynamic = "force-dynamic";

export default async function WorkspaceInvitationsPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[] }> }) {
  if (!workspaceReleaseEnabled()) redirect("/workspace");
  const workspaceId = (await searchParams).workspaceId;
  if (typeof workspaceId !== "string") redirect("/workspace?view=access");
  return <WorkspaceInvitationManager workspaceId={workspaceId} />;
}

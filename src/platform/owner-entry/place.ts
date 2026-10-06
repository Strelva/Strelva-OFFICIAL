import { redirect } from "next/navigation";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { ownerEntryHomesOpen } from "./linked-sites";
import { workspaceHome } from "./dispositions";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * The shared door of the workspace homes of old `/dashboard` pages
 * (`/workspace/inquiries`, `/workspace/reviews`, `/workspace/results`,
 * `/workspace/business-details`). Workspaces off or no business: Home.
 * Signed out: sign-in, coming back here. Owner entry off for this business:
 * its Home, as before these pages existed. Membership and the tenant check
 * are the readers' job (linked-sites.ts).
 */
export async function openWorkspacePlace(params: Record<string, string | string[] | undefined>, path: string): Promise<{ workspaceId: string; actor: WorkspaceActor }> {
  if (!workspaceReleaseEnabled()) redirect("/workspace");
  const workspaceId = typeof params.workspaceId === "string" && UUID.test(params.workspaceId) ? params.workspaceId : null;
  if (!workspaceId) redirect("/workspace");
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) {
    redirect(`/sign-in?next=${encodeURIComponent(`${path}?workspaceId=${workspaceId}`)}`);
  }
  if (!(await ownerEntryHomesOpen(workspaceId, user.id))) redirect(workspaceHome(workspaceId));
  return { workspaceId, actor: { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() } };
}

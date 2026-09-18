import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { acceptWorkspaceInvitation, inspectWorkspaceInvitation, WorkspaceInvitationRecipientError } from "@/platform/workspaces/invitations";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Context) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspace invitations are not available." }, 503);
  try {
    return workspaceJson({ invitation: await inspectWorkspaceInvitation((await context.params).token) });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return workspaceJson({ error: "This invitation is missing or unavailable." }, 404);
    return workspaceHttpFailure(error);
  }
}

export async function POST(request: Request, context: Context) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspace invitations are not available." }, 503);
  const guard = workspaceWriteGuard(request);
  if (guard) return guard;
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in with the invited confirmed email before accepting." }, 401);
  try {
    const accepted = await acceptWorkspaceInvitation(actor, (await context.params).token);
    if (accepted.status === "revoked") return workspaceJson({ error: "The workspace owner revoked this invitation." }, 410);
    if (accepted.status === "expired") return workspaceJson({ error: "This invitation expired. Ask the workspace owner for a new link." }, 410);
    return workspaceJson({ accepted });
  } catch (error) {
    if (error instanceof WorkspaceInvitationRecipientError) return workspaceJson({ error: error.message, code: "wrong_account" }, 403);
    return workspaceHttpFailure(error);
  }
}

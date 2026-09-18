import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { revokeWorkspaceInvitation } from "@/platform/workspaces/invitations";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";

const inputSchema = z.object({ invitationId: z.string().uuid() }).strict();
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspace invitations are not available." }, 503);
  const guard = workspaceWriteGuard(request);
  if (guard) return guard;
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to revoke an invitation." }, 401);
  try {
    const input = inputSchema.parse(await readWorkspaceBody(request, 1_000));
    return workspaceJson({ status: await revokeWorkspaceInvitation(actor, input.invitationId) });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

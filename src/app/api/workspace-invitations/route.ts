import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { createWorkspaceInvitation, listWorkspaceInvitations } from "@/platform/workspaces/invitations";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspace invitations are not available." }, 503);
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to manage invitations." }, 401);
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";
    return workspaceJson({ invitations: await listWorkspaceInvitations(actor, workspaceId) });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspace invitations are not available." }, 503);
  const guard = workspaceWriteGuard(request);
  if (guard) return guard;
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to create an invitation." }, 401);
  try {
    const body = await readWorkspaceBody(request, 4_000);
    const created = await createWorkspaceInvitation(actor, body);
    return workspaceJson(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return workspaceJson({ error: "Enter a valid email, role, and workspace." }, 400);
    return workspaceHttpFailure(error);
  }
}

import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { issueWorkspaceInvitation, listWorkspaceInvitations } from "@/platform/workspaces/invitations";
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
    const input = z.object({ workspaceId: z.string().uuid(), recipientEmail: z.string().trim().toLowerCase().email().max(254), role: z.enum(["owner", "admin", "member"]) }).strict().parse(body);
    const issued = await issueWorkspaceInvitation({ ...input, issuer: { kind: "member", actor } });
    const token = issued.acceptUrl.slice(issued.acceptUrl.lastIndexOf("/") + 1);
    // `token` stays for existing callers; delivery says whether anything was emailed.
    return workspaceJson({ invitation: issued.invitation, token, acceptUrl: issued.acceptUrl, delivery: issued.delivery }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return workspaceJson({ error: "Enter a valid email, role, and workspace." }, 400);
    return workspaceHttpFailure(error);
  }
}

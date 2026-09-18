import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import {
  workspaceJson as json,
  workspaceHttpActor,
  workspaceWriteGuard,
  readWorkspaceBody,
  workspaceHttpFailure,
} from "@/platform/workspaces/http";
import {
  acceptOperationalAssignment,
  inspectOperationalAssignment,
  inspectOperationalAssignmentForWork,
  offerOperationalAssignment,
  revokeOperationalAssignment,
  runOperationalAssignment,
} from "@/products/operations/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in to open assigned work." }, 401);
    const query = z.union([
      z.object({ assignmentId: z.string().uuid(), workId: z.undefined() }),
      z.object({ assignmentId: z.undefined(), workId: z.string().uuid() }),
    ]).parse(Object.fromEntries(new URL(request.url).searchParams));
    return json(query.assignmentId
      ? await inspectOperationalAssignment(actor, query.assignmentId)
      : await inspectOperationalAssignmentForWork(actor, query.workId!));
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  const guard = workspaceWriteGuard(request);
  if (guard) return guard;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in to change assigned work." }, 401);
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("offer"), workId: z.string().uuid(), assignment: z.unknown() }).strict(),
      z.object({ action: z.literal("accept"), assignmentId: z.string().uuid() }).strict(),
      z.object({ action: z.literal("revoke"), assignmentId: z.string().uuid() }).strict(),
      z.object({ action: z.literal("run"), assignmentId: z.string().uuid() }).strict(),
    ]).parse(await readWorkspaceBody(request));
    if (input.action === "offer") return json(await offerOperationalAssignment(actor, input.workId, input.assignment), 201);
    if (input.action === "accept") return json(await acceptOperationalAssignment(actor, input.assignmentId));
    if (input.action === "revoke") return json(await revokeOperationalAssignment(actor, input.assignmentId));
    return json(await runOperationalAssignment(actor, input.assignmentId));
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

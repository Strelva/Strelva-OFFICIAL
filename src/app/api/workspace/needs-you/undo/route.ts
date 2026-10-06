import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { listWorkspaces } from "@/platform/workspaces";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { BusinessRecordConflictError, undoBusinessRecordRevision } from "@/platform/business-record";
import { needsYouReleaseEnabled } from "@/platform/needs-you/server";

export const dynamic = "force-dynamic";

const input = z.object({
  workspaceId: z.string().uuid(),
  receiptId: z.string().regex(/^record:[1-9][0-9]{0,17}$/),
}).strict();

/**
 * One-tap undo for a Strelva-handled business record change: the HTTP route
 * undo_business_record_revision never had. Only business record receipts are
 * one tap; every other receipt says why it isn't. Undo restores the state
 * just before the change only if nothing later touched the same item; the
 * database refuses otherwise. Owners and admins of the business only.
 */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !needsYouReleaseEnabled()) return workspaceJson({ error: "Undo is not enabled. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = input.parse(await readWorkspaceBody(request, 1_000));
    if (await isRateLimitedWindowedAsync(`workspace:needs-you-undo:${actor.userId}`, 10, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const workspace = (await listWorkspaces(actor)).find(item => item.id === body.workspaceId);
    if (!workspace || workspace.kind !== "customer" || workspace.access !== "member") return workspaceJson({ error: "This business is unavailable to your account." }, 403);
    if (workspace.role !== "owner" && workspace.role !== "admin") return workspaceJson({ error: "Only an owner or admin can undo this.", permission: "not_manager" }, 403);
    const sequence = Number(body.receiptId.slice("record:".length));
    const result = await undoBusinessRecordRevision(actor, body.workspaceId, sequence, { source: "owner" });
    return workspaceJson({ result });
  } catch (error) {
    if (error instanceof BusinessRecordConflictError) return workspaceJson({ error: error.message, code: error.code }, 409);
    return workspaceHttpFailure(error);
  }
}

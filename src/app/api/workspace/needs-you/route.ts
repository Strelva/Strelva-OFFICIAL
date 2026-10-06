import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { listWorkspaces } from "@/platform/workspaces";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { needsYouReleaseEnabled, needsYouService, readStrelvaHandled } from "@/platform/needs-you/server";

export const dynamic = "force-dynamic";

const workspaceIdSchema = z.string().uuid();
const decideInput = z.object({
  workspaceId: z.string().uuid(),
  itemId: z.string().uuid(),
  revision: z.string().regex(/^[0-9a-f]{64}$/),
  decision: z.enum(["approve", "not_yet"]),
}).strict();

async function memberWorkspace(actor: { userId: string; verifiedEmail: string }, workspaceId: string) {
  const workspace = (await listWorkspaces(actor)).find(item => item.id === workspaceId);
  return workspace && workspace.kind === "customer" && workspace.access === "member" ? workspace : null;
}

/**
 * Needs you and Strelva handled for one business: the owner's open
 * decisions, oldest first, and the last week of what Strelva did. Direct
 * members only; the SQL rechecks membership on every read.
 */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !needsYouReleaseEnabled()) return workspaceJson({ error: "Needs you is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const workspaceId = workspaceIdSchema.parse(new URL(request.url).searchParams.get("workspaceId"));
    const workspace = await memberWorkspace(actor, workspaceId);
    if (!workspace) return workspaceJson({ error: "This business is unavailable to your account." }, 403);
    const [needs, handled] = await Promise.all([
      needsYouService().list(actor, workspaceId),
      readStrelvaHandled(actor, workspaceId).then(items => ({ items, available: true })).catch(() => ({ items: [], available: false })),
    ]);
    return workspaceJson({
      role: workspace.role ?? "member",
      items: needs.items,
      complete: needs.complete,
      handled: handled.items,
      handledAvailable: handled.available,
    });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

/** Approve or Not yet, signed in. Same resolver as the email link; the SQL decides who may. */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !needsYouReleaseEnabled()) return workspaceJson({ error: "Needs you is not enabled. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = decideInput.parse(await readWorkspaceBody(request, 2_000));
    if (await isRateLimitedWindowedAsync(`workspace:needs-you:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    if (!(await memberWorkspace(actor, body.workspaceId))) return workspaceJson({ error: "This business is unavailable to your account." }, 403);
    const result = await needsYouService().decide({ ...body, by: { kind: "session", actor } });
    const status = result.status === "forbidden" || result.status === "not_owner" ? 403
      : result.status === "not_found" ? 404
      : result.status === "changed" || result.status === "already_handled" || result.status === "expired" ? 409
      : 200;
    return workspaceJson({ status: result.status, item: result.item }, status);
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

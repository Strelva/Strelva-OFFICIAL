import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { listWork, listWorkspaces } from "@/platform/workspaces";
import { readWorkspaceExit } from "@/platform/workspace-exit";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { listManagedPresenceWork } from "@/products/managed-presence/server";
import { makeRealForWorkspace } from "@/experience/systems/server";

export const dynamic = "force-dynamic";

const input = z.object({
  workspaceId: z.string().uuid(),
  possibilityId: z.string().min(1).max(120),
}).strict();

/**
 * Make real for a Ready Possibility, run on an isolated copy.
 *
 * Owners of the business only. The runner is wired to isolated adapters and
 * an in-memory copy of the affected Systems (src/platform/make-real/sandbox):
 * it cannot publish, send, charge, book or switch a live System. The response
 * is the activation's partial state and the outside effects that are not
 * connected.
 */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = input.parse(await readWorkspaceBody(request, 4_000));
    if (await isRateLimitedWindowedAsync(`workspace:make-real:${actor.userId}`, 10, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const workspace = (await listWorkspaces(actor)).find((item) => item.id === body.workspaceId);
    if (!workspace || workspace.kind !== "customer") return workspaceJson({ error: "This business is unavailable to your account." }, 403);
    if (workspace.access !== "member" || workspace.role !== "owner") {
      return workspaceJson({ error: "Only an owner of this business can make a possibility real.", permission: "not_owner" }, 403);
    }
    const exit = await readWorkspaceExit(actor, workspace.id).catch(() => null);
    if (!exit || exit.state?.status === "completed") return workspaceJson({ error: "Work in this business has stopped, or its state could not be confirmed. Nothing changed." }, 409);
    const managed = await listManagedPresenceWork().catch(() => ({ managedWork: [] as Array<{ id: string; domain?: string }> }));
    const result = await makeRealForWorkspace({
      actor, businessId: workspace.id, savedWork: await listWork(actor, workspace.id),
      siteDomains: new Map(managed.managedWork.flatMap((site) => site.domain ? [[site.id, site.domain] as const] : [])),
    }, body.possibilityId, { canActivate: true });
    if (!result) return workspaceJson({ error: "This possibility is not available. Nothing changed." }, 404);
    return workspaceJson({ result });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

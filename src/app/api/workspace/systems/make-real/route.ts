import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleaseEnabledForWorkspace } from "@/platform/systems-release";
import { releaseFlagEnvMode } from "@/platform/release-flags/resolve";
import { listWork, listWorkspaces } from "@/platform/workspaces";
import { readWorkspaceExit } from "@/platform/workspace-exit";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { listManagedPresenceWork } from "@/products/managed-presence/server";
import { makeRealForWorkspace } from "@/experience/systems/server";
import { sendEmailWithReceipt } from "@/lib/email/send";
import { needsYouAppOrigin, needsYouReleaseEnabled, needsYouStore } from "@/platform/needs-you/server";
import { makeRealThroughNeedsYou } from "@/platform/needs-you/systems-sources";
import { liveMakeRealPorts, makeRealPath } from "@/experience/systems/live-make-real";

export const dynamic = "force-dynamic";

const input = z.object({
  workspaceId: z.string().uuid(),
  possibilityId: z.string().min(1).max(120),
}).strict();

/**
 * Make real for a Ready Possibility.
 *
 * With a `make_real_live:<channel>` flag on for the business and a stored
 * Possibility, the owner's tap is the Needs you decision for the plan and
 * starts the durable, live activation (src/experience/systems/live-make-real):
 * the response is `{ live }`. Otherwise it runs on an isolated copy, as below.
 *
 * Owners of the business only. The isolated runner is wired to isolated adapters and
 * an in-memory copy of the affected Systems (src/platform/make-real/sandbox):
 * it cannot publish, send, charge, book or switch a live System. The response
 * is the activation's partial state and the outside effects that are not
 * connected.
 *
 * A 1.0.0 launch feature: it also needs STRELVA_SYSTEMS_RELEASE, checked
 * before any session or body read.
 *
 * A stored Possibility with a live channel on runs live: the tap is the
 * owner's Needs you decision (makeRealPath). Otherwise it runs on the
 * isolated copy; with STRELVA_NEEDS_YOU_RELEASE on, that too is the owner's
 * one approval for the plan through the same `make_real` item Home and the
 * email show. Off, it runs as before.
 */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  if (releaseFlagEnvMode("systems") === "off") return workspaceJson({ error: "Make real is not enabled. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = input.parse(await readWorkspaceBody(request, 4_000));
    if (await isRateLimitedWindowedAsync(`workspace:make-real:${actor.userId}`, 10, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const workspace = (await listWorkspaces(actor)).find((item) => item.id === body.workspaceId);
    if (!workspace || workspace.kind !== "customer") return workspaceJson({ error: "This business is unavailable to your account." }, 403);
    if (!(await systemsReleaseEnabledForWorkspace(workspace.id, { operator: false, tester: false, userId: actor.userId }))) return workspaceJson({ error: "Make real is not enabled. Nothing changed." }, 503);
    if (workspace.access !== "member" || workspace.role !== "owner") {
      return workspaceJson({ error: "Only an owner of this business can make a possibility real.", permission: "not_owner" }, 403);
    }
    const exit = await readWorkspaceExit(actor, workspace.id).catch(() => null);
    if (!exit || exit.state?.status === "completed") return workspaceJson({ error: "Work in this business has stopped, or its state could not be confirmed. Nothing changed." }, 409);
    const path = await makeRealPath(actor, workspace.id, body.possibilityId, await liveMakeRealPorts());
    if (!path) return workspaceJson({ error: "This possibility is not available. Nothing changed." }, 404);
    if (path.kind === "live") return workspaceJson({ live: path.result });
    if (needsYouReleaseEnabled()) {
      const decided = await makeRealThroughNeedsYou(actor, workspace.id, path.possibilityId, {
        store: needsYouStore, appOrigin: needsYouAppOrigin(), sendEmail: sendEmailWithReceipt,
      });
      if (!decided) return workspaceJson({ error: "This possibility is not waiting on a decision. Nothing changed." }, 404);
      if (decided.status === "forbidden" || decided.status === "not_owner" || decided.status === "sign_in") {
        return workspaceJson({ error: "Only an owner of this business can make a possibility real.", permission: "not_owner" }, 403);
      }
      if (decided.status === "changed" || decided.status === "already_handled" || decided.status === "expired") {
        return workspaceJson({ error: "This changed since you opened it. Reload and look again. Nothing changed.", status: decided.status }, 409);
      }
      if (!decided.result) return workspaceJson({ error: "Make real could not start. Nothing changed. Strelva is on it.", status: decided.status, reason: decided.reason }, 409);
      return workspaceJson({ result: decided.result, decision: decided.status });
    }
    const managed = await listManagedPresenceWork().catch(() => ({ managedWork: [] as Array<{ id: string; domain?: string }> }));
    const result = await makeRealForWorkspace({
      actor, businessId: workspace.id, savedWork: await listWork(actor, workspace.id),
      siteDomains: new Map(managed.managedWork.flatMap((site) => site.domain ? [[site.id, site.domain] as const] : [])),
    }, path.possibilityId, { canActivate: true });
    if (!result) return workspaceJson({ error: "This possibility is not available. Nothing changed." }, 404);
    return workspaceJson({ result });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

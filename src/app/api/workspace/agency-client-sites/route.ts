import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { CLIENT_BULK_LIMIT } from "@/products/connected-sites/client";
import {
  ConnectedSiteInputError, checkClientSites, connectClientSite, detectClientSites, keepYourSiteMayBeOn, readAgencyClientSites,
} from "@/products/connected-sites/server";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();
const ids = z.array(uuid).min(1).max(CLIENT_BULK_LIMIT);
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("detect"), agencyWorkspaceId: uuid, workspaceIds: ids }).strict(),
  z.object({ action: z.literal("connect"), agencyWorkspaceId: uuid, workspaceId: uuid }).strict(),
  z.object({ action: z.literal("check"), agencyWorkspaceId: uuid, workspaceIds: ids }).strict(),
]);

const notAvailable = () => workspaceJson({ error: "Not available." }, 404);

function failure(error: unknown) {
  if (error instanceof ConnectedSiteInputError) return workspaceJson({ error: error.message }, 400);
  if (error instanceof WorkspaceAccessError && error.message !== "Workspace access denied") return workspaceJson({ error: error.message }, 403);
  return workspaceHttpFailure(error);
}

/**
 * GET: one page of the clients this person is staffed on, with each client's
 * website, what it is built with and its install state. Off unless keep your
 * site could be on; each client is then marked on or off for itself.
 */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !keepYourSiteMayBeOn()) return notAvailable();
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const params = new URL(request.url).searchParams;
    const agencyWorkspaceId = uuid.parse(params.get("agencyWorkspaceId"));
    const afterName = params.get("afterName");
    const afterId = params.get("afterId");
    const cursor = afterName && afterId ? { name: z.string().max(300).parse(afterName), id: uuid.parse(afterId) } : null;
    return workspaceJson(await readAgencyClientSites(actor, agencyWorkspaceId, cursor));
  } catch (error) {
    return failure(error);
  }
}

/**
 * POST: read what clients' sites are built with (`detect`), get the two lines
 * for one client's site (`connect`), or check the lines on several (`check`).
 * SQL rechecks that the person is staffed on each client; nothing on a
 * client's site changes.
 */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !keepYourSiteMayBeOn()) return notAvailable();
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = action.parse(await readWorkspaceBody(request, 8_000));
    if (await isRateLimitedWindowedAsync(`agency-client-sites:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    if (body.action === "detect") {
      if (await isRateLimitedWindowedAsync(`agency-client-sites:detect:${actor.userId}`, 4, 600_000)) return workspaceJson({ error: "Please wait before checking again." }, 429);
      return workspaceJson({ results: await detectClientSites(actor, body.agencyWorkspaceId, body.workspaceIds) });
    }
    if (body.action === "check") {
      if (await isRateLimitedWindowedAsync(`agency-client-sites:check:${actor.userId}`, 6, 600_000)) return workspaceJson({ error: "Please wait before checking again." }, 429);
      return workspaceJson({ results: await checkClientSites(actor, body.agencyWorkspaceId, body.workspaceIds) });
    }
    return workspaceJson(await connectClientSite(actor, body.agencyWorkspaceId, body.workspaceId), 201);
  } catch (error) {
    return failure(error);
  }
}

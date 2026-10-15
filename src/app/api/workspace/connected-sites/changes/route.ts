import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { ServiceRequestAccessError, ServiceRequestConflictError } from "@/platform/service-requests";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { editGuide } from "@/products/connected-sites/client";
import { planInputSchema } from "@/products/connected-sites/client";
import {
  ConnectedSiteInputError, askConnectedSiteChange, checkConnectedSiteChange, connectedSiteChangeOwnerEmailEnabled, connectedSiteChangeView,
  connectedSiteChangesStore, keepYourSiteReleasedFor, markConnectedSiteChangeDone, planConnectedSiteChange,
} from "@/products/connected-sites/server";
import type { SitePlatform } from "@/products/connected-sites/contracts";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();
const note = z.string().trim().min(1).max(1_000).optional();
const base = { workspaceId: uuid, systemId: uuid };
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ask"), ...base, words: z.string().trim().min(1).max(3_000), page: z.string().trim().min(1).max(500).optional(), idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/) }).strict(),
  z.object({ action: z.literal("plan"), ...base, siteId: uuid, changeId: uuid.optional(), requestId: uuid.optional(), title: z.string().trim().min(1).max(300).optional(), plan: planInputSchema }).strict(),
  z.object({ action: z.literal("done"), ...base, changeId: uuid, note }).strict(),
  z.object({ action: z.literal("check"), ...base, changeId: uuid }).strict(),
  z.object({ action: z.literal("record_unconfirmed"), ...base, changeId: uuid, note }).strict(),
  z.object({ action: z.literal("withdraw"), ...base, changeId: uuid, note }).strict(),
]);

const notAvailable = () => workspaceJson({ error: "Not available." }, 404);

/** The view as the page reads it: the builder's name rides along, and whether owners are emailed (they are not unless a switch says so). */
async function freshView(actor: { userId: string; verifiedEmail: string }, workspaceId: string, systemId: string) {
  const view = await connectedSiteChangeView(actor, workspaceId, systemId);
  return { ...view, site: { ...view.site, platformLabel: editGuide(view.site.platform as SitePlatform).label } };
}

/**
 * GET: the changes on one connected site. Any member of the business, and the
 * agency serving it, may read them. Off unless keep_your_site is on for the
 * business: then this route does not exist.
 */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return notAvailable();
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const params = new URL(request.url).searchParams;
    const workspaceId = uuid.safeParse(params.get("workspaceId"));
    const systemId = uuid.safeParse(params.get("systemId"));
    if (!workspaceId.success || !systemId.success) return workspaceJson({ error: "Check the request. Some fields are missing or invalid." }, 400);
    if (!(await keepYourSiteReleasedFor(actor, workspaceId.data))) return notAvailable();
    return workspaceJson({ view: await freshView(actor, workspaceId.data, systemId.data), ownerEmail: connectedSiteChangeOwnerEmailEnabled() });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  if (error instanceof ServiceRequestAccessError) return workspaceJson({ error: "Only an owner or admin of this business can ask for a change here." }, 403);
  if (error instanceof ServiceRequestConflictError) {
    return workspaceJson({ error: error.message.startsWith("No active agency access") ? "Requests go to your agency. Bring in an agency first." : error.message }, 409);
  }
  if (error instanceof ConnectedSiteInputError) return workspaceJson({ error: error.message }, 400);
  if (error instanceof WorkspaceAccessError && error.message !== "Workspace access denied") return workspaceJson({ error: error.message }, 403);
  return workspaceHttpFailure(error);
}

/**
 * POST: ask your agency for a change, or move one along (plan, mark done,
 * check, record without confirmation, withdraw). There is no `decide` action:
 * an owner says yes only in Needs you. SQL decides who may do what, in what order.
 */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return notAvailable();
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = action.parse(await readWorkspaceBody(request, 20_000));
    if (!(await keepYourSiteReleasedFor(actor, body.workspaceId))) return notAvailable();
    if (await isRateLimitedWindowedAsync(`connected-site-changes:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    if ((body.action === "check" || body.action === "done") && await isRateLimitedWindowedAsync(`connected-site-change-check:${body.changeId}`, 10, 600_000)) {
      return workspaceJson({ error: "Please wait before checking again." }, 429);
    }
    const store = connectedSiteChangesStore();
    if (body.action === "ask") {
      const filed = await askConnectedSiteChange(actor, { workspaceId: body.workspaceId, systemId: body.systemId, words: body.words, page: body.page, origin: "owner", idempotencyKey: body.idempotencyKey });
      return workspaceJson({ requestId: filed.requestId, view: await freshView(actor, body.workspaceId, body.systemId) }, 201);
    }
    let release: { number: number } | null = null;
    if (body.action === "plan") {
      await planConnectedSiteChange(actor, body.workspaceId, { systemId: body.systemId, siteId: body.siteId, changeId: body.changeId, requestId: body.requestId, title: body.title, input: body.plan });
    } else if (body.action === "done") {
      release = (await markConnectedSiteChangeDone(actor, body.workspaceId, body.changeId, body.systemId, body.note)).release;
    } else if (body.action === "check") {
      release = (await checkConnectedSiteChange(actor, body.workspaceId, body.changeId, body.systemId)).release;
    } else if (body.action === "record_unconfirmed") {
      release = (await store.releaseUnconfirmed(actor, body.workspaceId, body.changeId, body.note)).release;
    } else {
      await store.withdraw(actor, body.workspaceId, body.changeId, body.note);
    }
    return workspaceJson({ view: await freshView(actor, body.workspaceId, body.systemId), ...(release ? { release } : {}) });
  } catch (error) {
    return failure(error);
  }
}

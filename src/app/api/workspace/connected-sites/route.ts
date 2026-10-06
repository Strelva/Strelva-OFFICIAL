import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { PLATFORMS } from "@/products/connected-sites/contracts";
import { ConnectedSiteInputError, connectSite, connectedSitesReleaseEnabled, connectedSitesReleasedFor, presentConnectedSite, readConnectedSites, verifySite } from "@/products/connected-sites/server";
import { connectedSitesStore } from "@/products/connected-sites/store";

export const dynamic = "force-dynamic";

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), workspaceId: z.string().uuid(), siteUrl: z.string().trim().min(4).max(500), label: z.string().trim().min(1).max(120).optional(), platform: z.enum(PLATFORMS).optional() }).strict(),
  z.object({ action: z.literal("update"), workspaceId: z.string().uuid(), siteId: z.string().uuid(), label: z.string().trim().min(1).max(120).optional(), platform: z.enum(PLATFORMS).optional(), captureForms: z.boolean().optional(), injectSchema: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("verify"), workspaceId: z.string().uuid(), siteId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("disconnect"), workspaceId: z.string().uuid(), siteId: z.string().uuid() }).strict(),
]);

function disabled() {
  return !workspaceReleaseEnabled() || !connectedSitesReleaseEnabled();
}

/**
 * The business's connected sites: GET lists them (with install snippet,
 * 30-day activity and recent inquiries); POST connects, verifies, updates or
 * disconnects one. SQL decides who may: members read, owners and admins
 * change. Off unless STRELVA_CONNECTED_SITES_RELEASE=1, and per business
 * only where Systems is on for it (connectedSitesReleasedFor).
 */
export async function GET(request: Request) {
  if (disabled()) return workspaceJson({ error: "Connected sites are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    if (!(await connectedSitesReleasedFor(actor, workspaceId))) return workspaceJson({ error: "Connected sites are not enabled." }, 503);
    return workspaceJson(await readConnectedSites(actor, workspaceId));
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

export async function POST(request: Request) {
  if (disabled()) return workspaceJson({ error: "Connected sites are not enabled. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = action.parse(await readWorkspaceBody(request, 4_000));
    if (!(await connectedSitesReleasedFor(actor, body.workspaceId))) return workspaceJson({ error: "Connected sites are not enabled. Nothing changed." }, 503);
    if (await isRateLimitedWindowedAsync(`workspace:connected-sites:${actor.userId}`, 20, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const store = connectedSitesStore();
    if (body.action === "connect") {
      const site = await connectSite(actor, { businessId: body.workspaceId, siteUrl: body.siteUrl, label: body.label, platform: body.platform }, store);
      return workspaceJson({ site: presentConnectedSite(site) }, 201);
    }
    if (body.action === "verify") {
      const site = await verifySite(actor, body.workspaceId, body.siteId, { store });
      return workspaceJson({ site: presentConnectedSite(site) });
    }
    if (body.action === "disconnect") return workspaceJson({ site: presentConnectedSite(await store.revoke(actor, body.workspaceId, body.siteId)) });
    const { action: _action, workspaceId, siteId, ...patch } = body;
    return workspaceJson({ site: presentConnectedSite(await store.update(actor, workspaceId, siteId, patch)) });
  } catch (error) {
    if (error instanceof ConnectedSiteInputError) return workspaceJson({ error: error.message }, 400);
    return workspaceHttpFailure(error);
  }
}

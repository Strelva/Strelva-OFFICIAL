import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { ConnectedSiteInputError, businessPagesReleaseEnabled, checkSchemaBlock, connectedSitesReleaseEnabled, connectedSitesReleasedFor, readBusinessVisibility, setBusinessPage } from "@/products/connected-sites/server";

export const dynamic = "force-dynamic";

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("page"), workspaceId: z.string().uuid(), handle: z.string().trim().min(1).max(64), published: z.boolean() }).strict(),
  z.object({ action: z.literal("check"), workspaceId: z.string().uuid(), siteId: z.string().uuid() }).strict(),
]);

function disabled() {
  return !workspaceReleaseEnabled() || !connectedSitesReleaseEnabled();
}

/**
 * What AI crawlers can read about the business without JavaScript (#309,
 * #502). GET returns the public page's settings and the static JSON-LD block
 * to paste into each connected site (or any site). POST `page` sets the
 * page's address and publishes it (STRELVA_BUSINESS_PAGES=1 only); POST
 * `check` reads a connected site's live page and reports whether its block
 * still matches the confirmed facts. SQL decides who may: members read and
 * check (both read-only), owners and admins publish.
 */
export async function GET(request: Request) {
  if (disabled()) return workspaceJson({ error: "Connected sites are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    if (!(await connectedSitesReleasedFor(actor, workspaceId))) return workspaceJson({ error: "Connected sites are not enabled." }, 503);
    return workspaceJson(await readBusinessVisibility(actor, workspaceId));
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
    const body = action.parse(await readWorkspaceBody(request, 2_000));
    if (!(await connectedSitesReleasedFor(actor, body.workspaceId))) return workspaceJson({ error: "Connected sites are not enabled. Nothing changed." }, 503);
    if (await isRateLimitedWindowedAsync(`workspace:connected-sites:${actor.userId}`, 20, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    if (body.action === "page") {
      if (!businessPagesReleaseEnabled()) return workspaceJson({ error: "Public business pages are not enabled. Nothing changed." }, 503);
      return workspaceJson({ page: await setBusinessPage(actor, body.workspaceId, { handle: body.handle, published: body.published }) });
    }
    return workspaceJson({ check: await checkSchemaBlock(actor, body.workspaceId, body.siteId) });
  } catch (error) {
    if (error instanceof ConnectedSiteInputError) return workspaceJson({ error: error.message }, 400);
    if (error instanceof z.ZodError) {
      const message = error.issues.find(issue => issue.path[0] === "handle")?.message;
      if (message) return workspaceJson({ error: message }, 400);
    }
    return workspaceHttpFailure(error);
  }
}

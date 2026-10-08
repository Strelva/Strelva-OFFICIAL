import { z } from "zod";
import { requireTenantAccess } from "@/platform/infra/auth";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { submitOwnerReviewReply } from "@/lib/reviews/owner-reply";
import { sessionTenantDecider } from "@/lib/operator-decisions";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { ownerEntryHomesOpen, readLinkedSite } from "@/platform/owner-entry/linked-sites";

export const dynamic = "force-dynamic";

const input = z.object({
  workspaceId: z.string().uuid(),
  tenantId: z.string().min(1).max(120),
  reviewId: z.string().min(1).max(200),
  reply: z.string().trim().min(1).max(4000),
}).strict();

/**
 * Reply to a review from the workspace (the home of /dashboard/reviews). The
 * person must be a direct member of the business, the site must be linked to
 * it, and they must pass the same tenant check POST /api/reviews/reply uses
 * (`requireTenantAccess`). Then the same governed reply path runs.
 */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled. Nothing was posted." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = input.parse(await readWorkspaceBody(request, 10_000));
    if (!(await ownerEntryHomesOpen(body.workspaceId, actor.userId))) return workspaceJson({ error: "Replies from the workspace aren't open for this business yet." }, 503);
    if (await isRateLimitedWindowedAsync(`workspace:review-reply:${actor.userId}`, 20, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const site = await readLinkedSite(actor, body.workspaceId, body.tenantId);
    if (!site) return workspaceJson({ error: "This site is unavailable to your account." }, 403);
    const denied = await requireTenantAccess(site.tenantId);
    if (denied) return denied;
    const decider = await sessionTenantDecider(site.tenantId);
    if (!decider) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const result = await submitOwnerReviewReply(site.tenantId, body.reviewId, body.reply, decider);
    if (result.status === "not_found") return workspaceJson({ error: "Review not found." }, 404);
    if (result.status === "owner_decides") return workspaceJson({ error: "The owner decides this reply. Nothing was posted." }, 403);
    if (result.status === "publish_failed") return workspaceJson({ error: "Could not publish the reply to Google.", published: false }, 502);
    return workspaceJson({ review: result.review, published: result.published });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

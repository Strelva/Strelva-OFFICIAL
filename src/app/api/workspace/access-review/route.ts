import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { accessReviewScopeSchema, accessReviewRevokeSchema } from "@/platform/access-review/contracts";
import { readAccessReview, revokeAccessReview } from "@/platform/access-review/server";
export const dynamic = "force-dynamic";
const unavailable = () => workspaceJson({ error: "Access review is not enabled." }, 503);
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return unavailable();
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const query = new URL(request.url).searchParams;
    const scope = accessReviewScopeSchema.parse({ workspaceId: query.get("workspaceId"), organization: query.get("organization") === "true" });
    if (await isRateLimitedWindowedAsync(`workspace:access-review:${actor.userId}`, 60, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await readAccessReview(actor, scope));
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return unavailable();
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const input = accessReviewRevokeSchema.parse(await readWorkspaceBody(request, 4_000));
    if (await isRateLimitedWindowedAsync(`workspace:access-review-write:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await revokeAccessReview(actor, input));
  } catch (error) { return workspaceHttpFailure(error); }
}

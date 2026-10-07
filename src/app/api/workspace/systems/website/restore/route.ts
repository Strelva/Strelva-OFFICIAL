import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { prepareWebsiteContentRestore } from "@/products/websites/index";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Website restore is not enabled." }, 503);
  const denied = workspaceWriteGuard(request); if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to restore this website." }, 401);
    if (await isRateLimitedWindowedAsync(`website-restore:${actor.userId}`, 10, 60_000)) return workspaceJson({ error: "Please wait before preparing another restore." }, 429);
    const result = await prepareWebsiteContentRestore(actor, await readWorkspaceBody(request, 4000));
    if (result.status === "blocked" || result.status === "failed") return workspaceJson({ error: result.status === "blocked" ? result.message : "The saved content could not be prepared for review." }, 409);
    return workspaceJson({ status: result.status, ...(result.status === "queued" ? { eventId: result.eventId } : {}), message: "The earlier content is prepared for review. Your live website is unchanged." });
  } catch (error) { return workspaceHttpFailure(error); }
}

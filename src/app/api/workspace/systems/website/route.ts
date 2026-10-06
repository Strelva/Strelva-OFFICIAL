import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { isSuperAdminUser } from "@/lib/db/repositories";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleaseEnabledForWorkspace } from "@/platform/systems-release";
import { listWorkspaces } from "@/platform/workspaces";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { readWebsiteSystemDetail } from "@/experience/systems/website-detail-server";

export const dynamic = "force-dynamic";

const query = z.object({ workspaceId: z.string().uuid(), systemId: z.string().uuid() }).strict();

/**
 * The website System page's own lists: domains, Waiting on you, Requests and
 * History. Read-only. Members of the business (and an agency, for the work it
 * was given) read it; the Systems listing rechecks access in SQL. Behind
 * STRELVA_SYSTEMS_RELEASE, like the System page itself.
 */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const params = new URL(request.url).searchParams;
    const input = query.parse({ workspaceId: params.get("workspaceId"), systemId: params.get("systemId") });
    if (await isRateLimitedWindowedAsync(`workspace:website-system:${actor.userId}`, 60, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const workspace = (await listWorkspaces(actor)).find(item => item.id === input.workspaceId);
    if (!workspace || workspace.kind !== "customer") return workspaceJson({ error: "This business is unavailable to your account." }, 403);
    if (!(await systemsReleaseEnabledForWorkspace(workspace.id, { operator: await isSuperAdminUser(actor.userId), tester: false, userId: actor.userId }))) {
      return workspaceJson({ error: "Systems are not enabled for this business." }, 503);
    }
    const detail = await readWebsiteSystemDetail(actor, workspace.id, input.systemId);
    if (!detail) return workspaceJson({ error: "This website isn't available here." }, 404);
    return workspaceJson({ detail });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

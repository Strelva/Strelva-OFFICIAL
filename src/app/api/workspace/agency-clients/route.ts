import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { VersionAccessError } from "@/platform/system-versions";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { readAgencyClientsPage } from "@/experience/workspace/agency-server";

export const dynamic = "force-dynamic";

const query = z.object({ workspaceId: z.string().uuid(), cursor: z.string().uuid().nullable() }).strict();

/**
 * Every client of one agency in one read: a page of client rows, the agency
 * Queue and the Team. Replaces one GET /api/workspace per client. Postgres
 * scopes each row exactly as opening that client would; a client the actor
 * cannot open is not returned.
 */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const url = new URL(request.url);
    const input = query.parse({ workspaceId: url.searchParams.get("workspaceId"), cursor: url.searchParams.get("cursor") || null });
    if (await isRateLimitedWindowedAsync(`workspace:agency-clients:${actor.userId}`, 60, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await readAgencyClientsPage(actor, input.workspaceId, input.cursor));
  } catch (error) {
    if (error instanceof VersionAccessError) return workspaceJson({ error: "This agency is unavailable to your account." }, 403);
    return workspaceHttpFailure(error);
  }
}

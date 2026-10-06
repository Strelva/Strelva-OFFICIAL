import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleaseEnabled } from "@/platform/systems-release";
import { VersionAccessError } from "@/platform/system-versions";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { readAgencyLibrary, reviewAllImprovements } from "@/experience/workspace/agency-server";

export const dynamic = "force-dynamic";

const reviewAll = z.object({
  action: z.literal("review_all"),
  workspaceId: z.string().uuid(),
  sourceSystemId: z.string().uuid(),
  revision: z.number().int().positive(),
  versionIds: z.array(z.string().uuid()).min(1).max(500),
}).strict();

function failure(error: unknown) {
  if (error instanceof VersionAccessError) return workspaceJson({ error: "This library is unavailable to your account." }, 403);
  return workspaceHttpFailure(error);
}

/**
 * The agency's source Systems and each client Version's improvement state.
 * Versions are part of the Systems model: STRELVA_SYSTEMS_RELEASE gates it.
 */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  if (!systemsReleaseEnabled()) return workspaceJson({ error: "The library is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    if (await isRateLimitedWindowedAsync(`workspace:agency-library:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await readAgencyLibrary(actor, workspaceId));
  } catch (error) {
    return failure(error);
  }
}

/** "Review all": prepares each ready Version for its own business's approval. Releases nothing. */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  if (!systemsReleaseEnabled()) return workspaceJson({ error: "The library is not enabled. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = reviewAll.parse(await readWorkspaceBody(request, 40_000));
    if (await isRateLimitedWindowedAsync(`workspace:agency-review-all:${actor.userId}`, 10, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await reviewAllImprovements(actor, {
      agencyWorkspaceId: body.workspaceId, sourceSystemId: body.sourceSystemId, revision: body.revision, versionIds: body.versionIds,
    }));
  } catch (error) {
    return failure(error);
  }
}

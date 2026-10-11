import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { VersionAccessError, VersionStaleError, VersionValidationError } from "@/platform/system-versions";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
import { commandGoogleLocationVersions, readGoogleLocationVersion } from "@/products/google-listing/server";

export const dynamic = "force-dynamic";
function failure(error: unknown) {
  if (error instanceof VersionAccessError) return workspaceJson({ error: error.message }, 403);
  if (error instanceof VersionStaleError) return workspaceJson({ error: error.message }, 409);
  if (error instanceof VersionValidationError) return workspaceJson({ error: error.message }, 400);
  return workspaceHttpFailure(error);
}
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    if (await isRateLimitedWindowedAsync(`workspace:google-versions:${actor.userId}`, 40, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const params = new URL(request.url).searchParams;
    return workspaceJson(await readGoogleLocationVersion(actor, z.string().uuid().parse(params.get("workspaceId")), z.string().uuid().parse(params.get("versionId"))));
  } catch (error) { return failure(error); }
}
/** Preparing never approves; existing owner links, receipts and read-back remain per location. */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  const guard = workspaceWriteGuard(request);
  if (guard) return guard;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    if (await isRateLimitedWindowedAsync(`workspace:google-versions:${actor.userId}`, 20, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await commandGoogleLocationVersions(actor, await readWorkspaceBody(request, 80_000)));
  } catch (error) { return failure(error); }
}

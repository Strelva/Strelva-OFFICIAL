import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleaseMayBeOn, systemsReleasedFor } from "@/platform/systems-release";
import { VersionAccessError, VersionConflictError, VersionIncompatibleError, VersionStaleError, VersionValidationError } from "@/platform/system-versions";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { readSystemVersion, decideSystemImprovement } from "@/experience/workspace/agency/version-server";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
export const dynamic = "force-dynamic";
const uuid = z.string().uuid();
const ref = z.object({ workspaceId: uuid, systemId: uuid }).strict();
const body = ref.extend({ versionId: uuid, rowRevision: z.number().int().positive(), revision: z.number().int().positive(), action: z.enum(["adopt", "decline"]),
  resolutions: z.array(z.object({ path: z.string().min(1).max(300), choice: z.enum(["keep_local", "take_upstream"]) }).strict()).max(200).optional(), reason: z.string().trim().min(1).max(500).optional(),
}).strict().superRefine((value, ctx) => { if (value.action === "decline" && !value.reason) ctx.addIssue({ code: "custom", message: "Add a reason", path: ["reason"] }); });
function failure(error: unknown) {
  if (error instanceof VersionAccessError) return workspaceJson({ error: "This Version is unavailable to your account." }, 403);
  if (error instanceof VersionStaleError || error instanceof VersionConflictError || error instanceof VersionIncompatibleError) return workspaceJson({ error: error.message }, 409);
  if (error instanceof VersionValidationError) return workspaceJson({ error: error.message }, 400);
  return workspaceHttpFailure(error);
}
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !systemsReleaseMayBeOn()) return workspaceJson({ error: "Versions are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in to continue." }, 401);
    const query = new URL(request.url).searchParams;
    const input = ref.parse({ workspaceId: query.get("workspaceId"), systemId: query.get("systemId") });
    if (!(await systemsReleasedFor(actor, input.workspaceId))) return workspaceJson({ error: "Versions are not enabled." }, 503);
    return workspaceJson(await readSystemVersion(actor, input.workspaceId, input.systemId));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !systemsReleaseMayBeOn()) return workspaceJson({ error: "Versions are not enabled. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request); if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in to continue." }, 401);
    const input = body.parse(await readWorkspaceBody(request, 40_000));
    if (!(await systemsReleasedFor(actor, input.workspaceId))) return workspaceJson({ error: "Versions are not enabled. Nothing changed." }, 503);
    if (await isRateLimitedWindowedAsync(`workspace:version-decide:${actor.userId}`, 20, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await decideSystemImprovement(actor, input));
  } catch (error) { return failure(error); }
}

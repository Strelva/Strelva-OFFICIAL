import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleaseMayBeOn, systemsReleasedFor } from "@/platform/systems-release";
import { VersionAccessError } from "@/platform/system-versions";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { createWorkPlanRequestSchema, executeWorkPlanOutputRequestSchema } from "@/products/work-plans/contracts";
import { executeAgencyBuild, packageAgencySystem, prepareAgencyBuild, readPackageChoices } from "@/experience/workspace/agency/authoring-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const uuid = z.string().uuid();
const packageBody = z.object({ workspaceId: uuid, systemId: uuid, commandId: uuid, fingerprint: z.string().min(1).max(150),
  expectedRevision: z.number().int().min(0), summary: z.string().trim().min(1).max(500) }).strict();
function failure(error: unknown) {
  if (error instanceof VersionAccessError) return workspaceJson({ error: "This client or agency is unavailable to your account." }, 403);
  return workspaceHttpFailure(error);
}
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !systemsReleaseMayBeOn()) return workspaceJson({ error: "Agency authoring is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to continue." }, 401);
    const workspaceId = uuid.parse(new URL(request.url).searchParams.get("agencyWorkspaceId"));
    if (!(await systemsReleasedFor(actor, workspaceId))) return workspaceJson({ error: "Agency authoring is not enabled." }, 503);
    return workspaceJson(await readPackageChoices(actor, workspaceId));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !systemsReleaseMayBeOn()) return workspaceJson({ error: "Agency authoring is not enabled. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to continue." }, 401);
    const query = new URL(request.url).searchParams;
    const agencyWorkspaceId = uuid.parse(query.get("agencyWorkspaceId"));
    const action = z.enum(["prepare", "execute", "package"]).parse(query.get("action"));
    const raw = await readWorkspaceBody(request, 128_000);
    const input = action === "prepare" ? createWorkPlanRequestSchema.parse(raw) : action === "execute" ? executeWorkPlanOutputRequestSchema.parse(raw) : packageBody.parse(raw);
    if (!(await systemsReleasedFor(actor, agencyWorkspaceId)) || !(await systemsReleasedFor(actor, input.workspaceId))) return workspaceJson({ error: "Agency authoring is not enabled for this client. Nothing changed." }, 503);
    if (await isRateLimitedWindowedAsync(`workspace:agency-authoring:${actor.userId}`, 10, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    if (action === "package") {
      const body = packageBody.parse(input);
      if (body.workspaceId !== agencyWorkspaceId) return workspaceJson({ error: "Package only a System owned by this agency." }, 403);
      return workspaceJson(await packageAgencySystem(actor, body), 201);
    }
    if (action === "prepare") return workspaceJson(await prepareAgencyBuild(actor, agencyWorkspaceId, createWorkPlanRequestSchema.parse(input)), 201);
    return workspaceJson(await executeAgencyBuild(actor, agencyWorkspaceId, executeWorkPlanOutputRequestSchema.parse(input)), 201);
  } catch (error) { return failure(error); }
}

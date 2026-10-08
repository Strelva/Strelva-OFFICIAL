import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { unitCommandSchema, unitScopeSchema } from "@/platform/enterprise/contracts";
import { readUnits, changeUnit, readUnitVersionChoices } from "@/platform/enterprise/server";
export const dynamic = "force-dynamic";
const unavailable = () => workspaceJson({ error: "Units is not enabled." }, 503);
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return unavailable();
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const query = new URL(request.url).searchParams;
    const scope = unitScopeSchema.parse({ organizationId: query.get("organizationId") });
    if (await isRateLimitedWindowedAsync(`workspace:units:${actor.userId}`, 60, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    if (query.has("unitId")) return workspaceJson(await readUnitVersionChoices(actor, scope.organizationId, query.get("unitId") ?? ""));
    return workspaceJson(await readUnits(actor, scope.organizationId));
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return unavailable();
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const input = unitCommandSchema.parse(await readWorkspaceBody(request, 4_000));
    if (await isRateLimitedWindowedAsync(`workspace:units-write:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await changeUnit(actor, input));
  } catch (error) { return workspaceHttpFailure(error); }
}

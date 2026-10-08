import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleaseMayBeOn, systemsReleasedFor } from "@/platform/systems-release";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { agencyTeamActionSchema } from "@/experience/workspace/agency-team";
import { manageAgencyTeam, readAgencyTeam } from "@/experience/workspace/agency-team-server";

export const dynamic = "force-dynamic";
const enabled = () => workspaceReleaseEnabled() && systemsReleaseMayBeOn();
const unavailable = () => workspaceJson({ error: "Agency Team is not enabled." }, 503);

export async function GET(request: Request) {
  if (!enabled()) return unavailable();
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    if (!(await systemsReleasedFor(actor, workspaceId))) return unavailable();
    if (await isRateLimitedWindowedAsync(`workspace:agency-team:${actor.userId}`, 60, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await readAgencyTeam(actor, workspaceId));
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!enabled()) return unavailable();
  const guard = workspaceWriteGuard(request);
  if (guard) return guard;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const input = agencyTeamActionSchema.parse(await readWorkspaceBody(request, 16_000));
    if (!(await systemsReleasedFor(actor, input.workspaceId))) return unavailable();
    if (await isRateLimitedWindowedAsync(`workspace:agency-team-write:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await manageAgencyTeam(actor, input));
  } catch (error) { return workspaceHttpFailure(error); }
}

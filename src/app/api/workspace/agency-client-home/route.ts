import { z } from "zod";
import { systemsReleaseMayBeOn, systemsReleasedFor } from "@/platform/systems-release";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { readAgencyClientHome } from "@/experience/workspace/agency-client-home-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !systemsReleaseMayBeOn()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    if (!(await systemsReleasedFor(actor, workspaceId))) return workspaceJson({ error: "Systems are not enabled for this business." }, 503);
    const projection = await readAgencyClientHome(actor, workspaceId);
    return workspaceJson({ ...projection, decisions: needsYouReleaseEnabled() ? projection.decisions : [] });
  } catch (error) { return workspaceHttpFailure(error); }
}

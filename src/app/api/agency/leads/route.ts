import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { AgencyLeadError, commandAgencyLead, leadAgency, readAgencyLeads } from "@/experience/workspace/leads/leads-server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Agency workspaces are unavailable." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a verified email." }, 401);
    const params = new URL(request.url).searchParams;
    const id = params.get("agencyWorkspaceId") ?? "";
    if (params.get("availability") === "1") { await leadAgency(actor, id); return workspaceJson({ available: true, agencyWorkspaceId: id }); }
    return workspaceJson(await readAgencyLeads(actor, id));
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Agency workspaces are unavailable." }, 503);
  const refused = workspaceWriteGuard(request); if (refused) return refused;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a verified email." }, 401);
    return workspaceJson(await commandAgencyLead(actor, await readWorkspaceBody(request, 16384)));
  } catch (error) {
    if (error instanceof AgencyLeadError) return workspaceJson({ error: error.message, code: error.code }, error.status);
    return workspaceHttpFailure(error);
  }
}

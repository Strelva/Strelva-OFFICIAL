import { isSuperAdmin } from "@/platform/infra/auth";
import { agencySignupReleaseEnabled } from "@/platform/agency-signup-release";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
import { decideQualification, readQualification, readQualificationDesk, submitQualification } from "@/experience/workspace/agency/qualification-server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!agencySignupReleaseEnabled()) return workspaceJson({ error: "Agency qualification is coming soon." }, 503);
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("desk") === "1") {
      if (!(await isSuperAdmin())) return workspaceJson({ error: "Operators only." }, 403);
      return workspaceJson({ submissions: await readQualificationDesk(actor.verifiedEmail) });
    }
    return workspaceJson({ qualification: await readQualification(actor, params.get("workspaceId") ?? "") });
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!agencySignupReleaseEnabled()) return workspaceJson({ error: "Agency qualification is coming soon." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
  try {
    const body = await readWorkspaceBody(request, 12000);
    if (typeof body === "object" && body !== null && "action" in body && body.action === "decide") {
      if (!(await isSuperAdmin())) return workspaceJson({ error: "Operators only." }, 403);
      await decideQualification(actor.verifiedEmail, body);
      try { return workspaceJson({ submissions: await readQualificationDesk(actor.verifiedEmail) }); }
      catch { return workspaceJson({ error: "The updated decision could not be confirmed. Reload its current status.", code: "qualification_readback_unavailable" }, 503); }
    }
    return workspaceJson({ qualification: await submitQualification(actor, body) });
  } catch (error) { return workspaceHttpFailure(error); }
}

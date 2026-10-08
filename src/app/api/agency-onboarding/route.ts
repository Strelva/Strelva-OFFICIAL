import { agencySignupReleaseEnabled } from "@/platform/agency-signup-release";
import { listMemberAgencies, readAgencyOnboarding } from "@/platform/workspaces/agency-onboarding";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

/**
 * The agency setup checklist (#258). Read only. Without `workspaceId` it lists
 * the agencies the actor is a member of, so the page can open one or offer to
 * create the first through `POST /api/workspace` `create_agency`.
 */
export async function GET(request: Request) {
  if (!agencySignupReleaseEnabled()) return workspaceJson({ error: "Agency setup is not available." }, 503);
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to set up your agency." }, 401);
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (workspaceId === null) return workspaceJson({ agencies: await listMemberAgencies(actor) });
    return workspaceJson({ onboarding: await readAgencyOnboarding(actor, workspaceId) });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

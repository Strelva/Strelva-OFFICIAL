import { agencySignupReleaseEnabled } from "@/platform/agency-signup-release";
import { agencyAddClientReleaseEnabled } from "@/products/agency-clients";
import { listMemberAgencies, readAgencyOnboarding } from "@/platform/workspaces/agency-onboarding";
import { workspaceHttpFailure, workspaceHttpViewer, workspaceJson } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

/**
 * The agency setup checklist (#258). Read only. Without `workspaceId` it lists
 * the agencies the actor is a member of, so the page can open one or offer to
 * create the first through `POST /api/workspace` `create_agency`.
 */
export async function GET(request: Request) {
  if (!agencySignupReleaseEnabled()) return workspaceJson({ error: "Agency setup is not available." }, 503);
  const viewer = await workspaceHttpViewer();
  if (!viewer) return workspaceJson({ error: "Sign in with a confirmed email to set up your agency." }, 401);
  const { actor } = viewer;
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (workspaceId === null) return workspaceJson({ agencies: await listMemberAgencies(actor) });
    const onboarding = await readAgencyOnboarding(actor, workspaceId, undefined, { addClient: agencyAddClientReleaseEnabled() });
    // The greeting's name comes from this session's own auth profile, never from the agency.
    return workspaceJson({ onboarding: { ...onboarding, viewer: { firstName: viewer.firstName } } });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

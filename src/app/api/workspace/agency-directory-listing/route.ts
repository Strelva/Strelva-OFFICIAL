import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { setAgencyDirectoryListing } from "@/platform/agency-directory";

export const dynamic = "force-dynamic";

/** An agency's owner or admin lists it where businesses bring in agencies, or removes it (ADR 0015). */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Business workspaces are not enabled." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
    const { agencyId, ...rest } = z.object({ agencyId: z.string().uuid() }).passthrough().parse(await readWorkspaceBody(request, 4_000));
    return workspaceJson(await setAgencyDirectoryListing(actor, agencyId, rest));
  } catch (error) { return workspaceHttpFailure(error); }
}

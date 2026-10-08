import { z } from "zod";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { agencyAddClientReleaseEnabled, AgencyClientError, listAgencyClientAdditions } from "@/products/agency-clients/server";

export const dynamic = "force-dynamic";

/** The clients this agency added (#259), newest first, with each owner link's state. Any agency member. */
export async function GET(request: Request) {
  if (!agencyAddClientReleaseEnabled()) return workspaceJson({ error: "Adding clients is not available yet." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    return workspaceJson({ clients: await listAgencyClientAdditions(actor, workspaceId) });
  } catch (error) {
    if (error instanceof AgencyClientError) return workspaceJson({ error: error.status === 403 ? "This agency isn't available to your account." : error.message }, error.status);
    return workspaceHttpFailure(error);
  }
}

import { workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { acceptOwnerClaim, agencyAddClientReleaseEnabled, AgencyClientError, readOwnerClaim } from "@/products/agency-clients/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };

/**
 * The owner claim link an agency delivers (#259). GET shows the terms to
 * anyone holding the link; POST makes the signed-in, verified account with
 * the link's address the business's owner. The link alone grants nothing.
 */
export async function GET(_request: Request, context: Context) {
  if (!agencyAddClientReleaseEnabled()) return workspaceJson({ error: "This link isn't available." }, 404);
  try {
    return workspaceJson({ claim: await readOwnerClaim((await context.params).token) });
  } catch (error) {
    if (error instanceof AgencyClientError) return workspaceJson({ error: error.message }, error.status);
    return workspaceHttpFailure(error);
  }
}

export async function POST(request: Request, context: Context) {
  if (!agencyAddClientReleaseEnabled()) return workspaceJson({ error: "This link isn't available." }, 404);
  const guard = workspaceWriteGuard(request);
  if (guard) return guard;
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in with the email this link was sent to." }, 401);
  try {
    const accepted = await acceptOwnerClaim(actor, (await context.params).token);
    if (accepted.status === "revoked") return workspaceJson({ error: "The agency replaced this link with a newer one. Use the latest link they sent." }, 410);
    if (accepted.status === "expired") return workspaceJson({ error: "This link expired. Ask the agency for a new one." }, 410);
    return workspaceJson({ accepted });
  } catch (error) {
    if (error instanceof AgencyClientError) return workspaceJson({ error: error.message, code: error.code }, error.status);
    return workspaceHttpFailure(error);
  }
}

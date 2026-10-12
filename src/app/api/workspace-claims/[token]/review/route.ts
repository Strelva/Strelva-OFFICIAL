import { z } from "zod";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { acceptClaimReview, AgencyClientError, claimReviewAcceptInputSchema, claimReviewReleaseEnabled, readClaimReview } from "@/products/agency-clients/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };

/**
 * The claim review (STRELVA_CLAIM_REVIEW_RELEASE). Only the signed-in, verified
 * recipient of the link reads what the agency found and prepared; the link
 * alone shows none of it. POST takes the business and records the owner's
 * decision for each found fact and each area in one step.
 */
export async function GET(_request: Request, context: Context) {
  if (!claimReviewReleaseEnabled()) return workspaceJson({ error: "This link isn't available." }, 404);
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in with the email this link was sent to." }, 401);
  try {
    return workspaceJson({ review: await readClaimReview(actor, (await context.params).token) });
  } catch (error) {
    if (error instanceof AgencyClientError) return workspaceJson({ error: error.message, code: error.code }, error.status);
    return workspaceHttpFailure(error);
  }
}

export async function POST(request: Request, context: Context) {
  if (!claimReviewReleaseEnabled()) return workspaceJson({ error: "This link isn't available." }, 404);
  const guard = workspaceWriteGuard(request);
  if (guard) return guard;
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in with the email this link was sent to." }, 401);
  try {
    const input = claimReviewAcceptInputSchema.parse(await readWorkspaceBody(request, 64_000));
    const accepted = await acceptClaimReview(actor, (await context.params).token, input);
    if (accepted.status === "revoked") return workspaceJson({ error: "The agency replaced this link with a newer one. Use the latest link they sent." }, 410);
    if (accepted.status === "expired") return workspaceJson({ error: "This link expired. Ask the agency for a new one." }, 410);
    return workspaceJson({ accepted });
  } catch (error) {
    if (error instanceof z.ZodError) return workspaceJson({ error: "Choose what to do in each area, and check the details you changed." }, 400);
    if (error instanceof AgencyClientError) return workspaceJson({ error: error.message, code: error.code }, error.status);
    return workspaceHttpFailure(error);
  }
}

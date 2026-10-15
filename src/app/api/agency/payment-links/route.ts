import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { PayLinkConflictError, PayLinkValidationError } from "@/lib/pay-links";
import { AgencyPayLinkClosedError } from "@/platform/agency-pay-links";
import { commandAgencyPaymentLink, readAgencyPaymentLinks } from "@/experience/workspace/billing/payment-links-server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Agency workspaces are unavailable." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a verified email." }, 401);
    return workspaceJson(await readAgencyPaymentLinks(actor, new URL(request.url).searchParams.get("agencyWorkspaceId") ?? ""));
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Agency workspaces are unavailable." }, 503);
  const refused = workspaceWriteGuard(request); if (refused) return refused;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a verified email." }, 401);
    return workspaceJson({ payLink: await commandAgencyPaymentLink(actor, await readWorkspaceBody(request, 16384)) });
  } catch (error) {
    if (error instanceof PayLinkValidationError) return workspaceJson({ error: error.message }, 400);
    if (error instanceof AgencyPayLinkClosedError) return workspaceJson({ error: error.message }, error.status);
    if (error instanceof PayLinkConflictError) return workspaceJson({ error: "This address or request key is already in use. Refresh links before trying a new request." }, 409);
    return workspaceHttpFailure(error);
  }
}

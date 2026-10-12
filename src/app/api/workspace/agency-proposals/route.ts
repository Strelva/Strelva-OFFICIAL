import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { readAgencyDirectory, readAgencyProposals, respondToAgencyProposal } from "@/platform/agency-directory";

export const dynamic = "force-dynamic";

/** Businesses that asked this agency in (ADR 0015). Owners and admins of the agency accept or decline. */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Business workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
    const agencyId = z.string().uuid().parse(new URL(request.url).searchParams.get("agencyId"));
    const [proposals, directory] = await Promise.all([readAgencyProposals(actor, agencyId), readAgencyDirectory(actor)]);
    const own = directory.find(agency => agency.agencyWorkspaceId === agencyId);
    return workspaceJson({ proposals, listing: own ? { listed: true, summary: own.summary } : { listed: false, summary: "" } });
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Business workspaces are not enabled." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
    if (await isRateLimitedWindowedAsync(`workspace:agency-proposals:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait a minute before trying again." }, 429);
    const body = z.object({ agencyId: z.string().uuid(), businessId: z.string().uuid(), accept: z.boolean(), proposalId: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(await readWorkspaceBody(request, 4_000));
    return workspaceJson({ status: await respondToAgencyProposal(actor, body.agencyId, body.businessId, body.accept, body.proposalId) });
  } catch (error) { return workspaceHttpFailure(error); }
}

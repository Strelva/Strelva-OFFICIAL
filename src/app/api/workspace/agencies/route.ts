import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { bringInAgency, endAgencyForBusiness, readAgencyDirectory, readBusinessAgencies } from "@/platform/agency-directory";

export const dynamic = "force-dynamic";

/**
 * Bring in an agency (ADR 0015), from the business's side.
 * GET ?workspaceId: the agency list and this business's agencies.
 * POST { workspaceId, agencyWorkspaceId, scopes }: the owner proposes; the agency accepts before anything changes.
 * DELETE { workspaceId, agencyWorkspaceId }: the owner ends one agency's access.
 */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Business workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    const [directory, agencies] = await Promise.all([readAgencyDirectory(actor), readBusinessAgencies(actor, workspaceId)]);
    return workspaceJson({ directory, agencies });
  } catch (error) { return workspaceHttpFailure(error); }
}

const target = z.object({ workspaceId: z.string().uuid() }).passthrough();
async function write(request: Request, run: (actor: NonNullable<Awaited<ReturnType<typeof workspaceHttpActor>>>, body: Record<string, unknown> & { workspaceId: string }) => Promise<unknown>) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Business workspaces are not enabled." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
    if (await isRateLimitedWindowedAsync(`workspace:agencies:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait a minute before trying again." }, 429);
    const body = target.parse(await readWorkspaceBody(request, 8_000));
    return workspaceJson({ agencies: await run(actor, body) });
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  return write(request, (actor, { workspaceId, ...rest }) => bringInAgency(actor, workspaceId, rest));
}
export async function DELETE(request: Request) {
  return write(request, (actor, body) => endAgencyForBusiness(actor, body.workspaceId, z.string().uuid().parse(body.agencyWorkspaceId)));
}

import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { checkListingsNow, listingsSyncAvailable, listingsSyncMayBeOn, readListingsSyncView } from "@/products/listings-sync/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({ action: z.literal("check"), workspaceId: z.string().uuid() }).strict();
const OFF = "Listings in sync is not on for this business.";

const off = () => workspaceJson({ error: OFF }, 404);
const globallyOff = () => !workspaceReleaseEnabled() || !listingsSyncMayBeOn();

/**
 * The business's listings state. GET reads it (members and agencies); POST
 * `check` runs a check now, at most 6 an hour. There is no approve endpoint:
 * making a change live happens only through Needs you.
 */
export async function GET(request: Request) {
  if (globallyOff()) return off();
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    if (!(await listingsSyncAvailable(workspaceId, { operator: false, tester: false, userId: actor.userId }))) return off();
    return workspaceJson(await readListingsSyncView(actor, workspaceId));
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

export async function POST(request: Request) {
  if (globallyOff()) return off();
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const parsed = body.parse(await readWorkspaceBody(request, 1_000));
    if (!(await listingsSyncAvailable(parsed.workspaceId, { operator: false, tester: false, userId: actor.userId }))) return off();
    return workspaceJson(await checkListingsNow(actor, parsed.workspaceId));
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

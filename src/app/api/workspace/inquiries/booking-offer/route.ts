import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { ownerEntryHomesOpen } from "@/platform/owner-entry/linked-sites";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
import { inquiryReleaseEnabledForWorkspace, inquiryBookingHandoffEnabled, prepareWorkspaceInquiryBooking, prepareInquiryBookingInput } from "@/products/inquiries";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !inquiryBookingHandoffEnabled()) return workspaceJson({ error: "Booking times aren't open here yet." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to propose times." }, 401);
    const input = prepareInquiryBookingInput.parse(await readWorkspaceBody(request, 3000));
    if (!await ownerEntryHomesOpen(input.workspaceId, actor.userId) || !await inquiryReleaseEnabledForWorkspace(input.workspaceId, { userId: actor.userId, operator: false, tester: false })) return workspaceJson({ error: "Booking times aren't open for this business." }, 503);
    if (await isRateLimitedWindowedAsync(`inquiry-booking-offer:${actor.userId}`, 20, 60_000)) return workspaceJson({ error: "Wait before trying again." }, 429);
    return workspaceJson({ offer: await prepareWorkspaceInquiryBooking(actor, input) });
  } catch (error) { return workspaceHttpFailure(error); }
}

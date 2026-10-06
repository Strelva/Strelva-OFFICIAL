import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { BookingNotFoundError, BookingRequestDecisionError, bookingStatusChange, changeWorkspaceBooking } from "@/products/bookings/server";

export const dynamic = "force-dynamic";

/**
 * Check in, undo a check-in, or cancel one booking from the bookings System's
 * day and week views (/workspace/bookings). Direct members of the business
 * only; the site must be linked to it. The change goes through the same
 * booking store functions the dashboard uses, so both stores stay in step.
 */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace is not enabled. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = bookingStatusChange.parse(await readWorkspaceBody(request, 2_000));
    if (await isRateLimitedWindowedAsync(`workspace:bookings:${actor.userId}`, 60, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const booking = await changeWorkspaceBooking(actor, body);
    return workspaceJson({ booking });
  } catch (error) {
    if (error instanceof BookingNotFoundError) return workspaceJson({ error: error.message }, 404);
    if (error instanceof BookingRequestDecisionError) return workspaceJson({ error: error.message }, 409);
    return workspaceHttpFailure(error);
  }
}

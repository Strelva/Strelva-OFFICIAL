import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { BookingHoursError, BookingNotFoundError, bookingHoursChange, setWorkspaceBookingHours } from "@/products/bookings/server";

export const dynamic = "force-dynamic";

/**
 * Booking-only hours for one linked site, from the bookings screen. They can
 * only narrow the business record's opening hours; the store refuses a range
 * outside them. Owner or admin of the business only.
 */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace is not enabled. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const parsed = bookingHoursChange.safeParse(await readWorkspaceBody(request, 8_000));
    if (!parsed.success) return workspaceJson({ error: "Each booking time needs a start before its end. Nothing changed." }, 400);
    if (await isRateLimitedWindowedAsync(`workspace:booking-hours:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const bookable = await setWorkspaceBookingHours(actor, parsed.data);
    return workspaceJson({ bookable });
  } catch (error) {
    if (error instanceof BookingNotFoundError) return workspaceJson({ error: error.message }, 404);
    if (error instanceof BookingHoursError) {
      const status = error.code === "forbidden" ? 403 : error.code === "unavailable" ? 503 : 409;
      return workspaceJson({ error: error.message }, status);
    }
    return workspaceHttpFailure(error);
  }
}

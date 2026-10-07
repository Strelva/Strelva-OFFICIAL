import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
import { manualBookingScope, manualBookingsEnabled, manualBookingOptions, createManualBooking } from "@/platform/bookings/manual";
import { PublicBookingError } from "@/platform/bookings/errors";
function failure(error: unknown) { return error instanceof PublicBookingError ? workspaceJson({ error: error.message }, error.status) : workspaceHttpFailure(error); }
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !await manualBookingsEnabled()) return workspaceJson({ error: "Taking bookings here is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in to take a booking." }, 401);
    const query = new URL(request.url).searchParams;
    const scope = manualBookingScope.parse({ workspaceId: query.get("workspaceId"), tenantId: query.get("tenantId") });
    if (await isRateLimitedWindowedAsync(`manual-booking-read:${actor.userId}`, 60, 60000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await manualBookingOptions(actor, scope, query.get("serviceId") ?? undefined));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !await manualBookingsEnabled()) return workspaceJson({ error: "Taking bookings here is not enabled. Nothing changed." }, 503);
  const denied = workspaceWriteGuard(request); if (denied) return denied;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in to take a booking." }, 401);
    if (await isRateLimitedWindowedAsync(`manual-booking-write:${actor.userId}`, 20, 60000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await createManualBooking(actor, await readWorkspaceBody(request, 48000)), 201);
  } catch (error) { return failure(error); }
}

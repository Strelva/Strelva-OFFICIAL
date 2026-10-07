import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { BookingSettingsError, bookingSettingsChange, bookingSettingsEnabled, changeBookingSettings, readBookingSettings } from "@/products/bookings/server";

export const dynamic = "force-dynamic";
function failure(error: unknown) {
  if (error instanceof BookingSettingsError) return workspaceJson({ error: error.message }, error.code === "forbidden" ? 403 : error.code === "conflict" ? 409 : 503);
  return workspaceHttpFailure(error);
}
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !await bookingSettingsEnabled()) return workspaceJson({ error: "Booking setup is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const query = new URL(request.url).searchParams;
    const scope = bookingSettingsChange.pick({ workspaceId: true, tenantId: true }).safeParse({ workspaceId: query.get("workspaceId"), tenantId: query.get("tenantId") });
    if (!scope.success) return workspaceJson({ error: "Choose the business and booking site." }, 400);
    return workspaceJson(await readBookingSettings(actor, scope.data.workspaceId, scope.data.tenantId));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !await bookingSettingsEnabled()) return workspaceJson({ error: "Booking setup is not enabled. Nothing changed." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const parsed = bookingSettingsChange.safeParse(await readWorkspaceBody(request, 100_000));
    if (!parsed.success) return workspaceJson({ error: "Check the booking mode, buffer, notice, horizon, cutoff and daily limit. Nothing changed." }, 400);
    if (await isRateLimitedWindowedAsync(`workspace:booking-settings:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await changeBookingSettings(actor, parsed.data));
  } catch (error) { return failure(error); }
}

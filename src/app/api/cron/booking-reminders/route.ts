import { bookingCalendarMirrorPorts, runBookingCalendarMirrors } from "@/platform/bookings/calendar-mirror";
import { calendarSchedulingService } from "@/products/scheduling/server";
import { deliverBookingUpdates } from "@/platform/bookings/updates";
import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/platform/infra/heartbeat";
import { alertOnce } from "@/platform/infra/monitoring";
import { bookingRemindersEnabled } from "@/platform/bookings/flags";
import { runBookingLifecycle } from "@/platform/bookings/lifecycle";
import { bookingLifecyclePorts } from "@/platform/bookings/lifecycle-ports";

export const maxDuration = 120;

/**
 * Every 15 minutes (bookings spec, "Notifications"): the hold sweep (15
 * minutes), the request clock (owner chased once at 24 hours, the request
 * declined and the customer offered new times at 72 hours), and the customer
 * reminders 24 hours and 2 hours before. Each message is claimed once in the
 * store's send log; every email goes through src/lib/email/send.ts and its
 * gates. With STRELVA_BOOKING_REMINDERS (or the store's write switch) off it
 * records a heartbeat and does nothing.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  if (!bookingRemindersEnabled()) {
    await recordHeartbeat("booking-reminders", { ok: true, processed: 0 });
    return NextResponse.json({ status: "disabled", ranAt: new Date().toISOString() });
  }

  const started = Date.now();
  const summary = await runBookingLifecycle(bookingLifecyclePorts, { now: new Date(), limit: 200 });
  const updates = await deliverBookingUpdates().catch(() => ({ sent: 0, suppressed: 0, failed: 1 }));
  const calendar = await runBookingCalendarMirrors(bookingCalendarMirrorPorts(calendarSchedulingService)).catch(() => ({ processed: 0, failed: 1 }));
  summary.failed += calendar.failed;
  summary.sent += updates.sent; summary.suppressed += updates.suppressed; summary.failed += updates.failed;
  if (summary.errors.length > 0) {
    await alertOnce("booking_reminders_failed", "high", { errors: summary.errors.length }, 3600).catch(() => undefined);
  }
  await recordHeartbeat("booking-reminders", {
    ok: summary.errors.length === 0 && summary.failed === 0,
    durationMs: Date.now() - started,
    processed: summary.holdsExpired + summary.requestsLapsed + summary.sent + summary.suppressed + summary.skipped,
    failed: summary.failed + summary.errors.length,
  });
  return NextResponse.json({ ranAt: new Date().toISOString(), ...summary });
}

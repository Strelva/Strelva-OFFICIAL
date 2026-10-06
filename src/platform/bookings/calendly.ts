/**
 * Calendly as a *triggers* Connection of the bookings System (bookings spec,
 * "Existing tools"). Each `invitee.created` webhook becomes an `import`
 * booking in the one store, and `invitee.canceled` cancels it. Calendly stays
 * the record for its own bookings: an import is always kept (the store never
 * refuses it for overlapping), and its time is not offered by Strelva's routes.
 *
 * Off unless the store's write switch is on. Never throws: the webhook still
 * acknowledges, and a failed write is reported for the operator, because a
 * missed webhook shows as health, not as a lost booking.
 */
import { alertOnce } from "@/platform/infra/monitoring";
import { timeZoneOf } from "./availability";
import { bookingStoreWriteEnabled } from "./flags";
import { readBookingContext, recordBooking } from "./store";

export interface CalendlyInviteePayload {
  event: string;
  invitee: { uri?: string; name?: string; email?: string; timezone?: string };
  scheduledEvent: { uri?: string; name?: string; start_time?: string; end_time?: string };
}

export type CalendlyImportOutcome = "recorded" | "updated" | "unchanged" | "off" | "ignored" | "invalid" | "failed";

function validTimeZone(zone: string | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export async function recordCalendlyBooking(tenant: string, payload: CalendlyInviteePayload): Promise<CalendlyImportOutcome> {
  if (!bookingStoreWriteEnabled()) return "off";
  if (payload.event !== "invitee.created" && payload.event !== "invitee.canceled") return "ignored";
  const ref = payload.invitee.uri?.trim();
  const start = payload.scheduledEvent.start_time;
  const end = payload.scheduledEvent.end_time;
  if (!ref || !start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) {
    return "invalid";
  }
  try {
    const context = await readBookingContext(tenant).catch(() => null);
    const zone = context ? timeZoneOf(context) : validTimeZone(payload.invitee.timezone) ? payload.invitee.timezone : "UTC";
    const cancelled = payload.event === "invitee.canceled";
    const result = await recordBooking(tenant, {
      externalSource: "calendly",
      externalRef: ref.slice(0, 500),
      status: cancelled ? "cancelled" : "confirmed",
      origin: "import",
      serviceName: (payload.scheduledEvent.name || "Booking").slice(0, 160),
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      bufferMinutes: 0,
      timeZone: zone,
      customer: {
        name: (payload.invitee.name || "Customer").slice(0, 160),
        ...(payload.invitee.email ? { email: payload.invitee.email.slice(0, 320) } : {}),
      },
      ...(cancelled ? { cancelledAt: new Date().toISOString(), reason: "Cancelled in Calendly" } : {}),
    }, "import");
    // Imports are never refused for overlapping; a conflict here would be a schema fault.
    return result.status === "conflict" ? "failed" : result.status;
  } catch (error) {
    console.error("[calendly] import booking not recorded", { tenant, error: error instanceof Error ? error.message : String(error) });
    await alertOnce("calendly_import_failed", "medium", { tenant }, 3600).catch(() => undefined);
    return "failed";
  }
}

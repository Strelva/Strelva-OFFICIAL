/** Store-served public capabilities keep their published grant and receipt,
 * while availability and commitments come from the shared business record. */
interface PublicBookingRange { from: string; to: string }
interface PublicBookingBinding { tenantId: string; workspaceId: string; recordBooking?: { serviceRef: string } }
interface PublicBookingCalendarConfirmation { verification: "pending"; status: "confirmed" | "cancelled" | "pending"; start: string; end: string; expectedRevision: number }
import { PublicBookingError } from "./errors";
import { settingsOrDefault, timeZoneOf } from "./availability";
import { publicRecordReservationId } from "./public-request";
import { nativeSlots } from "./native";
import { readBookingContext, readTenantBookings, recordBooking, setBookingStatus } from "./store";

export async function recordPublicAvailability(input: { tenantId: string; capabilityId: string; name: string; range?: PublicBookingRange; includeRevoked?: boolean; requestId?: string }) {
  const context = await readBookingContext(input.tenantId);
  if (!context?.workspaceId) throw new PublicBookingError("unavailable", "Booking records are unavailable.");
  const active = context.services.filter(s => s.active);
  const named = active.filter(s => s.name === input.name);
  const service = active.find(s => s.id === input.capabilityId || s.externalRef === input.capabilityId)
    ?? (named.length === 1 ? named[0] : undefined);
  // A removed or ambiguous service never falls back to copied intervals.
  if (!service && !input.includeRevoked) throw new PublicBookingError("not_found", "This booking service is unavailable.");
  const settings = settingsOrDefault(context);
  const from = input.range?.from ?? new Date().toISOString();
  const to = input.range?.to ?? new Date(Date.parse(from) + Math.min(60, settings.maxAdvanceDays) * 86400000).toISOString();
  const availability = service && !context.paused ? await nativeSlots(input.tenantId, service.externalRef ?? service.id, from, to, input.requestId ? { excludePublicReservationId: publicRecordReservationId(context.tenantStableId, input.requestId) } : {}) : { slots: [] };
  return { workspaceId: context.workspaceId, paused: context.paused, timeZone: timeZoneOf(context), name: service?.name ?? input.name,
    slots: availability.slots, recordBooking: {
      serviceRef: service?.externalRef ?? service?.id ?? "", bufferMinutes: settings.bufferMinutes, mode: settings.mode,
      uncheckedStarts: availability.slots.filter(s => !s.calendarChecked).map(s => s.start),
    } };
}

/** Recompute immediately before claiming/updating. The exclusion constraint
 * closes the final race; a storage failure never falls through to a calendar. */
export async function recordPublicSlot(binding: PublicBookingBinding, start: string, end: string, excludePublicReservationId?: string) {
  const ref = binding.recordBooking?.serviceRef;
  if (!ref) throw new PublicBookingError("not_found", "This service is unavailable.");
  const context = await readBookingContext(binding.tenantId);
  if (!context || context.paused || context.workspaceId !== binding.workspaceId) throw new PublicBookingError("conflict", "This booking is not accepting new times.");
  const offered = await nativeSlots(binding.tenantId, ref, start, new Date(Date.parse(end) + 1).toISOString(), { excludePublicReservationId });
  const slot = offered.slots.find(s => Date.parse(s.start) === Date.parse(start) && Date.parse(s.end) === Date.parse(end));
  if (!slot) throw new PublicBookingError("conflict", "That time has just been taken. Choose another time.");
  const service = context.services.find(s => s.active && (s.id === ref || s.externalRef === ref));
  if (!service) throw new PublicBookingError("not_found", "This service is unavailable.");
  const settings = settingsOrDefault(context);
  return { serviceRef: ref, serviceName: service.name, bufferMinutes: settings.bufferMinutes, timeZone: timeZoneOf(context),
    status: settings.mode === "request" || !slot.calendarChecked ? "requested" as const : "confirmed" as const };
}

export async function readPublicRecord(binding: PublicBookingBinding, reservationId?: string) {
  const row = (await readTenantBookings(binding.tenantId)).find(b => b.publicReservationId === reservationId);
  if (!row) throw new PublicBookingError("not_found", "This reservation is unavailable.");
  return row;
}

function confirmation(row: Awaited<ReturnType<typeof readPublicRecord>>): PublicBookingCalendarConfirmation {
  return { verification: "pending", status: row.status === "confirmed" ? "confirmed" : row.status === "cancelled" || row.status === "declined" ? "cancelled" : "pending",
    start: row.start, end: row.end, expectedRevision: 0 };
}

export async function changePublicRecord(binding: PublicBookingBinding, reservationId: string | undefined, start: string, end: string) {
  const prior = await readPublicRecord(binding, reservationId);
  if (!prior.serviceRef) return null; // Pre-flip receipts keep their original calendar recovery path.
  if (Date.parse(prior.end) <= Date.now()) throw new PublicBookingError("not_found", "This booking link has expired.");
  if (prior.status !== "requested" && prior.status !== "confirmed") throw new PublicBookingError("not_found", "This reservation cannot be changed.");
  const slot = await recordPublicSlot(binding, start, end);
  const result = await recordBooking(binding.tenantId, { publicReservationId: prior.publicReservationId!, origin: prior.origin,
    ...slot, start, end, customer: prior.customer, reason: "Customer rescheduled" }, "native");
  if (result.status === "conflict") throw new PublicBookingError("conflict", "That time has just been taken. Choose another time.");
  return confirmation(result.booking);
}
export async function cancelPublicRecord(binding: PublicBookingBinding, reservationId?: string) {
  const prior = await readPublicRecord(binding, reservationId);
  if (!prior.serviceRef) return null;
  if (Date.parse(prior.end) <= Date.now()) throw new PublicBookingError("not_found", "This booking link has expired.");
  const row = await setBookingStatus(binding.tenantId, prior.id, "cancelled", "visitor", "Customer cancelled");
  if (row.status === "not_found") throw new PublicBookingError("not_found", "This reservation is unavailable.");
  if (row.status === "conflict") throw new PublicBookingError("conflict", "This reservation cannot be cancelled.");
  return confirmation(row.booking);
}
export async function confirmPublicRecord(binding: PublicBookingBinding, reservationId?: string) {
  const prior = await readPublicRecord(binding, reservationId);
  if (prior.status !== "held") return confirmation(prior);
  const slot = await recordPublicSlot(binding, prior.start, prior.end, prior.publicReservationId!);
  const result = await recordBooking(binding.tenantId, { publicReservationId: prior.publicReservationId!, origin: "site",
    ...slot, start: prior.start, end: prior.end, customer: prior.customer,
    reason: slot.status === "requested" ? "Owner confirmation requested" : "Instant booking" }, "native");
  if (result.status === "conflict") throw new PublicBookingError("conflict", "That time has just been taken.");
  return confirmation(result.booking);
}

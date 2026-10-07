/**
 * The customer's manage link (bookings spec, "Manage link"): `/b/[token]`
 * with the management token every public API reservation already has. The
 * token is hashed at rest (public_website_bookings.management_token_hash) and
 * looked up by its hash alone; it stops working once the booking has ended.
 *
 * Change and cancel run through the public booking service's own change and
 * cancel (src/products/scheduling/public-booking.ts), so the same rules hold
 * as on `/api/v1/bookings`: a paused or revoked schedule refuses a new time
 * but still lets the customer cancel, and every calendar write keeps its
 * read-back. Nothing here writes a second path.
 */
import { createHash } from "node:crypto";
import type { ManagedReservation } from "./store";

export interface ManagedBookingView {
  siteName: string;
  title: string;
  /** "Tuesday, November 3" and "10:00 AM" in the booking's own zone. */
  day: string;
  time: string;
  timeZoneLabel: string;
  status: "pending" | "confirmed" | "cancelled" | "held";
  confirmationRequired?: boolean;
}

export type ManageBookingState =
  | { kind: "not_found" }
  /** The booking couldn't be read (store down). Nothing changed. */
  | { kind: "error" }
  | { kind: "ended"; booking: ManagedBookingView }
  | {
      kind: "ready";
      booking: ManagedBookingView;
      /** Open times for a change, grouped by day. Empty when none are open or they couldn't be read. */
      days: Array<{ day: string; slots: Array<{ id: string; time: string }> }>;
      slotsUnavailable: boolean;
      /** The business is not taking new times (paused); cancelling still works. */
      changesClosed: boolean;
      notice?: "cancelled" | "rescheduled" | "pending" | "confirmed";
      error?: string;
    };

export const MANAGE_TOKEN = /^[A-Za-z0-9._~-]{8,256}$/;
const CHANGE_WINDOW_DAYS = 14;
const MAX_SLOTS = 60;

type Schedule = { paused?: boolean; version: number; timeZone: string; slots: Array<{ id: string; start: string; end: string }> };
type Receipt = { status: "pending" | "confirmed" | "cancelled" };

export interface ManageDeps {
  find(tokenHash: string): Promise<ManagedReservation | null>;
  read(input: { tenantId: string; capabilityId: string; range: { from: string; to: string } }): Promise<Schedule>;
  change(input: { tenantId: string; reservationId: string; managementToken: string; capabilityId: string; capabilityVersion: number; slotId: string }): Promise<Receipt>;
  cancel(input: { tenantId: string; reservationId: string; managementToken: string }): Promise<Receipt>;
  confirm?(token: string): Promise<Receipt>;
  now(): number;
}

export function manageTokenHash(token: string): string | null {
  if (!MANAGE_TOKEN.test(token)) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "conflict" || code === "not_found" || code === "invalid" ? code : "unavailable";
}

const ERRORS: Record<string, string> = {
  conflict: "That time can't be booked now. Pick another time, or reply to your booking email.",
  not_found: "This booking can't be changed from here any more. Reply to your booking email to reach the business.",
  invalid: "Pick one of the open times first.",
  unavailable: "That didn't go through, and your booking is unchanged. Try again in a minute.",
  rate: "Too many tries in a row. Wait a minute and try again.",
};

export function manageErrorMessage(code: string | null | undefined): string | undefined {
  return code ? ERRORS[code] ?? ERRORS.unavailable : undefined;
}

function label(iso: string, timeZone: string): { day: string; time: string } {
  const date = new Date(iso);
  try {
    return {
      day: new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone }).format(date),
      time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(date),
    };
  } catch {
    return label(iso, "UTC");
  }
}

function zoneLabel(iso: string, timeZone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longGeneric" }).formatToParts(new Date(iso)).find((p) => p.type === "timeZoneName");
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function managedView(reservation: ManagedReservation): ManagedBookingView {
  const when = label(reservation.start, reservation.timeZone);
  return {
    siteName: reservation.siteName,
    title: reservation.title,
    day: when.day,
    time: when.time,
    timeZoneLabel: zoneLabel(reservation.start, reservation.timeZone),
    status: reservation.status,
    confirmationRequired: reservation.confirmationRequired,
  };
}

export async function loadManageState(
  token: string,
  query: { done?: string | null; error?: string | null },
  deps: ManageDeps,
): Promise<ManageBookingState> {
  const hash = manageTokenHash(token);
  if (!hash) return { kind: "not_found" };
  const reservation = await deps.find(hash);
  if (!reservation) return { kind: "not_found" };
  const booking = managedView(reservation);
  // The link expires once the booking has ended.
  if (Date.parse(reservation.end) <= deps.now() || (reservation.status === "held" && (!reservation.confirmUntil || Date.parse(reservation.confirmUntil) <= deps.now()))) return { kind: "ended", booking };
  const notice: "cancelled" | "rescheduled" | "pending" | "confirmed" | undefined =
    query.done === "cancelled" || query.done === "rescheduled" || query.done === "pending" || query.done === "confirmed" ? query.done : undefined;
  const base = { kind: "ready" as const, booking, ...(notice ? { notice } : {}), ...(query.error ? { error: manageErrorMessage(query.error) } : {}) };
  if (reservation.status === "held") return { ...base, days: [], slotsUnavailable: false, changesClosed: true };
  if (reservation.status === "cancelled") return { ...base, days: [], slotsUnavailable: false, changesClosed: false };
  const now = deps.now();
  let schedule: Schedule;
  try {
    schedule = await deps.read({
      tenantId: reservation.tenantId,
      capabilityId: reservation.capabilityId,
      range: { from: new Date(now).toISOString(), to: new Date(now + CHANGE_WINDOW_DAYS * 86_400_000).toISOString() },
    });
  } catch (error) {
    // Availability stopped (paused, exited, revoked): no new time, cancel still works.
    if (errorCode(error) === "conflict" || errorCode(error) === "not_found") return { ...base, days: [], slotsUnavailable: false, changesClosed: true };
    return { ...base, days: [], slotsUnavailable: true, changesClosed: false };
  }
  if (schedule.paused) return { ...base, days: [], slotsUnavailable: false, changesClosed: true };
  const days: Array<{ day: string; slots: Array<{ id: string; time: string }> }> = [];
  const slots = schedule.slots
    .filter((slot) => Date.parse(slot.start) > now && Date.parse(slot.start) !== Date.parse(reservation.start))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, MAX_SLOTS);
  for (const slot of slots) {
    const when = label(slot.start, reservation.timeZone);
    const last = days[days.length - 1];
    if (last && last.day === when.day) last.slots.push({ id: slot.id, time: when.time });
    else days.push({ day: when.day, slots: [{ id: slot.id, time: when.time }] });
  }
  return { ...base, days, slotsUnavailable: false, changesClosed: false };
}

export type ManageActionResult = { done: "cancelled" | "rescheduled" | "pending" | "confirmed" } | { error: string };

/** One change from the manage page. Never throws; the page shows the outcome. */
export async function actOnManageLink(token: string, form: { action: string | null; slotId: string | null }, deps: ManageDeps): Promise<ManageActionResult> {
  const hash = manageTokenHash(token);
  const reservation = hash ? await deps.find(hash).catch(() => null) : null;
  if (!reservation || Date.parse(reservation.end) <= deps.now()) return { error: "not_found" };
  const ids = { tenantId: reservation.tenantId, reservationId: reservation.reservationId, managementToken: token };
  try {
    if (form.action === "confirm" && reservation.confirmationRequired && deps.confirm) {
      if (!reservation.confirmUntil || Date.parse(reservation.confirmUntil) <= deps.now()) return { error: "not_found" };
      const receipt = await deps.confirm(token);
      return { done: receipt.status === "confirmed" ? "confirmed" : "pending" };
    }
    if (reservation.status === "held") return { error: "invalid" };
    if (form.action === "cancel") {
      const receipt = await deps.cancel(ids);
      return { done: receipt.status === "cancelled" ? "cancelled" : "pending" };
    }
    if (form.action === "reschedule") {
      if (!form.slotId || form.slotId.length > 256) return { error: "invalid" };
      // The change must name the schedule version it was offered from.
      const now = deps.now();
      const schedule = await deps.read({
        tenantId: reservation.tenantId,
        capabilityId: reservation.capabilityId,
        range: { from: new Date(now).toISOString(), to: new Date(now + CHANGE_WINDOW_DAYS * 86_400_000).toISOString() },
      });
      const receipt = await deps.change({ ...ids, capabilityId: reservation.capabilityId, capabilityVersion: schedule.version, slotId: form.slotId });
      return { done: receipt.status === "confirmed" ? "rescheduled" : "pending" };
    }
    return { error: "invalid" };
  } catch (error) {
    return { error: errorCode(error) };
  }
}

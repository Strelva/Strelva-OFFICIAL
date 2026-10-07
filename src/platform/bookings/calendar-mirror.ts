/** Calendar projection of the authoritative booking store. All provider work
 * uses the scheduling product's existing receipt/recovery service through a
 * port supplied at the app edge. This module never constructs an adapter. */
import { randomUUID } from "node:crypto";
import { bookingStoreWriteEnabled } from "./flags";
import { bookingStoreDb, parseStoreBooking, type StoreBooking } from "./store";
import type { WorkspaceActor } from "@/platform/workspaces/types";

type Provider = "google" | "outlook";
interface MirrorReservation {
  requestId: string; start: string; end: string;
  status: "reserved" | "writing" | "unknown" | "accepted" | "cancelled";
  providerId?: string; verification?: "pending" | "verified" | "failed";
}
interface MirrorWork { payload: { revision: number; reservations: MirrorReservation[] } }
export interface BookingCalendarService {
  read(actor: WorkspaceActor, id: string): Promise<MirrorWork>;
  create(actor: WorkspaceActor, id: string, requestId: string, provider: Provider): Promise<MirrorWork>;
  recover(actor: WorkspaceActor, id: string, requestId: string, provider: Provider): Promise<MirrorWork>;
  reschedule(actor: WorkspaceActor, id: string, requestId: string, input: { provider: Provider; expectedRevision: number; start: string; end: string }): Promise<MirrorWork>;
  cancel(actor: WorkspaceActor, id: string, requestId: string, input: { provider: Provider; expectedRevision: number }): Promise<MirrorWork>;
}
export type BookingCalendarMirrorStatus = "verified" | "accepted" | "unknown" | "failed" | "skipped";
export interface BookingCalendarMirrorClaim {
  actor: WorkspaceActor; workId: string; provider: Provider; booking: StoreBooking;
}
export interface BookingCalendarMirrorPorts {
  prepare(bookingId: string, token: string): Promise<BookingCalendarMirrorClaim | null>;
  calendar: BookingCalendarService;
  finish(bookingId: string, token: string, result: { status: BookingCalendarMirrorStatus; eventId?: string; detail?: string }): Promise<void>;
}

export function bookingCalendarMirrorEnabled(env: Partial<Record<string, string | undefined>> = process.env): boolean {
  return env.STRELVA_BOOKING_CALENDAR_MIRROR?.trim() === "1" && bookingStoreWriteEnabled(env);
}

/** Repeat calls recover uncertain/accepted writes through read-back only.
 * Booking status is never changed by a calendar failure. Pause does not stop
 * delivery of an already confirmed appointment or its cancellation. */
export async function mirrorBookingCalendar(bookingId: string, ports: BookingCalendarMirrorPorts): Promise<BookingCalendarMirrorStatus> {
  if (!bookingCalendarMirrorEnabled()) return "skipped";
  const token = randomUUID();
  let claim: BookingCalendarMirrorClaim | null;
  try { claim = await ports.prepare(bookingId, token); }
  catch { return "failed"; }
  if (!claim) return "skipped";
  const { actor, workId, provider, booking } = claim;
  const requestId = booking.id;
  let result: { status: BookingCalendarMirrorStatus; eventId?: string; detail?: string };
  try {
    let work = await ports.calendar.read(actor, workId);
    let reservation = work.payload.reservations.find(item => item.requestId === requestId);
    if (!reservation) throw new Error("Calendar projection is unavailable.");
    // Never issue another write while outcome or read-back is uncertain,
    // including cancellation. A later run may act after recovery is proven.
    if (reservation.status === "writing" || reservation.status === "unknown" || reservation.verification === "failed") {
      work = await ports.calendar.recover(actor, workId, requestId, provider);
    } else if (booking.status === "cancelled") {
      if (reservation.status !== "cancelled") work = await ports.calendar.cancel(actor, workId, requestId, { provider, expectedRevision: work.payload.revision });
    } else if (booking.status === "confirmed") {
      if (reservation.status === "reserved") work = await ports.calendar.create(actor, workId, requestId, provider);
      else if (reservation.status === "accepted" && (Date.parse(reservation.start) !== Date.parse(booking.start) || Date.parse(reservation.end) !== Date.parse(booking.end))) {
        work = await ports.calendar.reschedule(actor, workId, requestId, { provider, expectedRevision: work.payload.revision, start: booking.start, end: booking.end });
      }
    }
    reservation = work.payload.reservations.find(item => item.requestId === requestId);
    if (!reservation) throw new Error("Calendar projection is unavailable.");
    const desiredStatus = booking.status === "cancelled" ? "cancelled" : "accepted";
    const desiredInterval = booking.status === "cancelled" || (Date.parse(reservation.start) === Date.parse(booking.start) && Date.parse(reservation.end) === Date.parse(booking.end));
    result = { status: reservation.status === "writing" || reservation.status === "unknown" ? "unknown"
      : reservation.verification === "failed" ? "failed"
      : reservation.status === desiredStatus && reservation.verification === "verified" && desiredInterval ? "verified"
      : reservation.status === desiredStatus ? "accepted" : "failed", eventId: reservation.providerId };
  } catch {
    result = { status: "failed", detail: "Calendar copy needs review; the booking is unchanged." };
  }
  // Failed evidence storage is surfaced, never a reason to replay a write.
  try { await ports.finish(bookingId, token, result); }
  catch { return "failed"; }
  return result.status;
}

/** Real persistence, with the governed scheduling service supplied by the
 * app/server edge. Service-role SQL resolves current verified owner authority. */
export function bookingCalendarMirrorPorts(calendar: BookingCalendarService): BookingCalendarMirrorPorts {
  async function rpc(name: string, args: Record<string, unknown>) {
    const db = bookingStoreDb();
    if (!db) throw new Error("Calendar copy storage is unavailable.");
    const call = db.rpc(name, args);
    const result = await (call.abortSignal ? call.abortSignal(AbortSignal.timeout(5000)) : call);
    if (result.error) throw new Error("Calendar copy storage is unavailable.");
    return result.data;
  }
  return {
    calendar,
    async prepare(bookingId, token) {
      const raw = await rpc("prepare_booking_calendar_mirror", { p_booking_id: bookingId, p_token: token });
      if (!raw || typeof raw !== "object") return null;
      const row = raw as Record<string, unknown>;
      const booking = parseStoreBooking(row.booking);
      if (!booking || typeof row.workId !== "string" || typeof row.userId !== "string" || typeof row.email !== "string" || (row.provider !== "google" && row.provider !== "outlook")) throw new Error("Calendar copy authority is unavailable.");
      return { booking, workId: row.workId, actor: { userId: row.userId, verifiedEmail: row.email }, provider: row.provider };
    },
    async finish(bookingId, token, result) {
      await rpc("finish_booking_calendar_mirror", { p_booking_id: bookingId, p_token: token, p_status: result.status, p_event_id: result.eventId ?? null, p_detail: result.detail ?? null });
    },
  };
}

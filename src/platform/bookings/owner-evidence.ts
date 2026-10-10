/** Bounded owner-list evidence; returns no provider credentials or customer bearer tokens. */
import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { bookingStoreDb, BookingStoreError, parseStoreBooking, STORE_BOOKING_STATUSES, type StoreBooking } from "./store";

const historyEntry = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("change"), actor: z.enum(["visitor", "owner", "member", "strelva", "import", "migration", "system"]),
    from: z.enum(STORE_BOOKING_STATUSES).nullable(), to: z.enum(STORE_BOOKING_STATUSES), reason: z.string().nullable(), at: z.string().datetime({ offset: true }) }),
  z.object({ kind: z.literal("reminder"), reminder: z.enum(["reminder_24h", "reminder_2h", "request_owner_reminder", "request_lapsed"]),
    status: z.enum(["claimed", "sent", "suppressed", "failed", "skipped"]), at: z.string().datetime({ offset: true }) }),
]);
export type BookingHistoryEntry = z.infer<typeof historyEntry>;
const result = z.object({
  calendarHealth: z.enum(["connected", "reconnect", "setup", "not_connected"]), truncated: z.boolean(),
  bookings: z.array(z.object({ booking: z.unknown(), history: z.array(historyEntry).max(50), historyTruncated: z.boolean(),
    calendar: z.object({ status: z.enum(["verified", "accepted", "unknown", "failed", "skipped"]), updatedAt: z.string().datetime({ offset: true }) }).nullable(),
  })).max(500),
});
export type OwnerBookingEvidence = Omit<z.infer<typeof result>, "bookings"> & {
  bookings: Array<Omit<z.infer<typeof result>["bookings"][number], "booking"> & { booking: StoreBooking }>;
};

export async function readOwnerBookingEvidence(actor: WorkspaceActor, workspaceId: string, tenantId: string, range: { from: string; to: string }): Promise<OwnerBookingEvidence> {
  const db = bookingStoreDb();
  if (!db) throw new BookingStoreError("unconfigured");
  const request = db.rpc("read_workspace_booking_evidence", { p_workspace_id: workspaceId, p_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail.trim().toLowerCase(), p_tenant_id: tenantId, p_from: range.from, p_to: range.to });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    const response = await Promise.race([Promise.resolve(request.abortSignal ? request.abortSignal(controller.signal) : request),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new BookingStoreError("timeout")); }, 2000); })]);
    if (response.error?.message?.includes("workspace_access_denied")) throw new WorkspaceAccessError();
    if (response.error) throw new BookingStoreError("failed");
    const parsed = result.safeParse(response.data);
    if (!parsed.success) throw new BookingStoreError("failed", "booking_evidence_malformed");
    return { ...parsed.data, bookings: parsed.data.bookings.map((entry) => {
      const booking = parseStoreBooking(entry.booking);
      if (!booking) throw new BookingStoreError("failed", "booking_evidence_malformed");
      return { ...entry, booking };
    }) };
  } finally { if (timer) clearTimeout(timer); }
}

export async function markOwnerBookingNoShow(actor: WorkspaceActor, workspaceId: string, tenantId: string, ref: string): Promise<StoreBooking> {
  const db = bookingStoreDb();
  if (!db) throw new BookingStoreError("unconfigured");
  const request = db.rpc("mark_workspace_booking_no_show", { p_workspace_id: workspaceId, p_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail.trim().toLowerCase(), p_tenant_id: tenantId, p_ref: ref });
  const response = await (request.abortSignal ? request.abortSignal(AbortSignal.timeout(2000)) : request);
  if (response.error?.message?.includes("workspace_access_denied")) throw new WorkspaceAccessError();
  if (response.error?.message?.includes("booking_not_found")) throw new BookingStoreError("not_found");
  if (response.error) throw new BookingStoreError("failed");
  const booking = parseStoreBooking(response.data);
  if (!booking) throw new BookingStoreError("failed", "booking_evidence_malformed");
  return booking;
}

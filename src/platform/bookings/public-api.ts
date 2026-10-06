/**
 * `/api/v1/bookings/[tenant]` on the one store. The public API's request and
 * response shapes don't change; each reservation also becomes a row in the
 * store the legacy widget uses, keyed by the same tenant calendar, so a slot
 * taken through one route is refused to the other.
 *
 * Before reads flip, the store only records (a refusal is a parity difference,
 * logged). After reads flip, the store guards: a reservation whose slot is
 * held by any booking is refused before its receipt or calendar write, and
 * open times subtract every booking in the store.
 */
import { alertOnce } from "@/platform/infra/monitoring";
import { getRedis } from "@/platform/infra/redis";
import type { PublicBookingSlot, PublicBookingStatus, PublicBookingStoreHook } from "@/products/scheduling/public-booking";
import { blocksTime } from "./availability";
import { bookingReadSource, bookingStoreWriteEnabled } from "./flags";
import { readTenantBookings, recordBooking, type StoreBookingStatus } from "./store";
import { BOOKING_STORE_PENDING_KEY, bookingPendingMember } from "./tenant";

const STATUS: Record<PublicBookingStatus, StoreBookingStatus> = { pending: "requested", confirmed: "confirmed", cancelled: "cancelled" };

async function queue(tenant: string, reservationId: string, reason: string): Promise<void> {
  console.error("[booking-store] reservation not copied to the one store", { tenant, reservationId, reason });
  const redis = getRedis();
  if (redis) {
    await redis.zadd(BOOKING_STORE_PENDING_KEY, { score: Date.now(), member: bookingPendingMember("reservation", tenant, reservationId) }).catch(() => undefined);
  }
  await alertOnce("booking_store_write_failed", "high", { kind: "reservation", reason }, 3600).catch(() => undefined);
}

export function publicBookingStoreHook(): PublicBookingStoreHook | undefined {
  if (!bookingStoreWriteEnabled()) return undefined;
  return {
    async claim(input) {
      try {
        const result = await recordBooking(input.binding.tenantId, {
          publicReservationId: input.reservationId,
          status: "requested",
          origin: "site",
          serviceName: input.title,
          start: input.start,
          end: input.end,
          bufferMinutes: 0,
          timeZone: input.binding.timeZone,
          customer: { name: input.visitor.name, email: input.visitor.email },
          ...(input.visitor.message ? { intakeAnswers: { message: input.visitor.message } } : {}),
          inquiryId: input.inquiryId,
          requestFingerprint: input.requestFingerprint,
        }, "native");
        if (result.status !== "conflict") return "claimed";
        if ((await bookingReadSource()) === "postgres") return "conflict";
        console.error("[booking-store] the one store refused an API reservation the legacy path accepted", { tenant: input.binding.tenantId });
        await alertOnce("booking_store_conflict", "high", { tenant: input.binding.tenantId }, 3600).catch(() => undefined);
        return "skipped";
      } catch (error) {
        await queue(input.binding.tenantId, input.reservationId, error instanceof Error ? error.message : String(error));
        return "skipped";
      }
    },
    async settle(input) {
      try {
        await recordBooking(input.binding.tenantId, {
          publicReservationId: input.reservationId,
          status: STATUS[input.status],
          origin: "site",
          serviceName: input.title,
          start: input.start,
          end: input.end,
          bufferMinutes: 0,
          timeZone: input.binding.timeZone,
          customer: input.visitor ? { name: input.visitor.name, email: input.visitor.email } : { name: "Customer" },
          ...(input.status === "cancelled" ? { cancelledAt: new Date().toISOString() } : {}),
        }, "native");
      } catch (error) {
        await queue(input.binding.tenantId, input.reservationId, error instanceof Error ? error.message : String(error));
      }
    },
  };
}

/**
 * Open API slots minus every booking in the store that holds time, once reads
 * have flipped. Before that, or if the store can't be read, the slots are
 * returned as the schedule computed them.
 */
export async function subtractStoreBookings(tenant: string, slots: PublicBookingSlot[]): Promise<PublicBookingSlot[]> {
  if (!slots.length || (await bookingReadSource()) !== "postgres") return slots;
  const starts = slots.map((s) => Date.parse(s.start));
  const ends = slots.map((s) => Date.parse(s.end));
  const day = 24 * 60 * 60 * 1000;
  const from = new Date(Math.min(...starts) - day).toISOString().slice(0, 10);
  const to = new Date(Math.max(...ends) + day).toISOString().slice(0, 10);
  try {
    const held = (await readTenantBookings(tenant, { from, to })).filter(blocksTime);
    return slots.filter((slot) => !held.some((b) => Date.parse(slot.start) < Date.parse(b.end) + b.bufferMinutes * 60_000 && Date.parse(slot.end) > Date.parse(b.start)));
  } catch (error) {
    console.error("[booking-store] could not subtract store bookings from API slots", { tenant, error: error instanceof Error ? error.message : String(error) });
    return slots;
  }
}

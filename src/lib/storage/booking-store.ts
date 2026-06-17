/**
 * Booking storage - appointments, availability, and config.
 */

import type { BookingConfig, DateOverride, Booking } from "../types";
import { DEFAULT_BOOKING_CONFIG, generateBookingId, generateSlots } from "../booking";
import { getSanityClient } from "../sanity";
import { getRedis } from "../redis";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { getContent } from "./content-store";

export async function getBookingConfig(
  tenant: string = DEFAULT_TENANT
): Promise<BookingConfig> {
  if (hasSanity) {
    const doc = await getSanityClient().fetch(
      `*[_type == "bookingConfig" && tenant == $tenant][0]`,
      { tenant }
    );
    if (doc) {
      const { _id, _rev, _type, _createdAt, _updatedAt, tenant: _, ...config } = doc;
      // Clean _key from weeklySchedule items
      if (config.weeklySchedule) {
        config.weeklySchedule = config.weeklySchedule.map(
          ({ _key, ...rest }: { _key?: string } & Record<string, unknown>) => rest
        );
      }
      return config as BookingConfig;
    }
    return DEFAULT_BOOKING_CONFIG;
  }

  const store = await readDevContent(tenant);
  return (store[`__bookingConfig_${tenant}`] as BookingConfig) ?? DEFAULT_BOOKING_CONFIG;
}

export async function setBookingConfig(
  config: BookingConfig,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasSanity) {
    const existingId = await getSanityClient().fetch(
      `*[_type == "bookingConfig" && tenant == $tenant][0]._id`,
      { tenant }
    );
    const doc = { _type: "bookingConfig" as const, tenant, ...config };
    if (existingId) {
      await getSanityClient().patch(existingId).set(doc).commit();
    } else {
      await getSanityClient().create(doc);
    }
    return;
  }

  const store = await readDevContent(tenant);
  store[`__bookingConfig_${tenant}`] = config;
  await writeDevContent(store, tenant);
}

export async function getDateOverrides(
  tenant: string = DEFAULT_TENANT
): Promise<DateOverride[]> {
  if (hasSanity) {
    // Store date overrides as part of booking config
    const doc = await getSanityClient().fetch(
      `*[_type == "bookingConfig" && tenant == $tenant][0].dateOverrides`,
      { tenant }
    );
    return doc || [];
  }

  const store = await readDevContent(tenant);
  return (store[`__dateOverrides_${tenant}`] as DateOverride[]) ?? [];
}

export async function getBookings(
  tenant: string = DEFAULT_TENANT,
  dateRange?: { from: string; to: string }
): Promise<Booking[]> {
  if (hasSanity) {
    let query = `*[_type == "booking" && tenant == $tenant`;
    const params: Record<string, string> = { tenant };

    if (dateRange) {
      query += ` && date >= $from && date <= $to`;
      params.from = dateRange.from;
      params.to = dateRange.to;
    }
    query += `] | order(date asc){ "id": bookingId, serviceId, serviceName, date, startTime, endTime, clientName, clientEmail, clientPhone, notes, status, "createdAt": _createdAt, cancelledAt }`;

    return getSanityClient().fetch(query, params);
  }

  const store = await readDevContent(tenant);
  let bookings = (store[`__bookings_${tenant}`] as Booking[]) ?? [];
  if (dateRange) {
    bookings = bookings.filter(
      (b) => b.date >= dateRange.from && b.date <= dateRange.to
    );
  }
  return bookings;
}

/**
 * Granularity (minutes) of the Redis slot-lock grid.
 *
 * Bookings have variable durations, so locking only the exact start-time key
 * would let two overlapping bookings (e.g. a 90-min at 10:00 and a 60-min at
 * 10:30) both succeed because their start keys differ. Instead we lock every
 * grid cell the booking *spans*. 5 minutes is fine enough to catch any realistic
 * overlap while keeping the number of keys per booking small.
 */
const SLOT_GRID_MINUTES = 5;

function slotTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function slotMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Compute every grid key a booking occupies, from startTime (inclusive) through
 * endTime + bufferTime (exclusive) at SLOT_GRID_MINUTES granularity. This mirrors
 * generateSlots, which reserves endTime + bufferTime against future bookings.
 *
 * The grid cell for a span point is floor(minute / grid) * grid, so a span and
 * any other span that overlaps it (even at a different start time) share at least
 * one key and therefore collide on SET NX.
 *
 * Keys are intentionally NOT scoped by serviceId: getAvailableSlots treats the
 * calendar as a single shared resource (it blocks slots that overlap ANY existing
 * booking on the date, regardless of service), so the lock must do the same or two
 * different services could be double-booked into the same window.
 */
function spanSlotKeys(
  tenant: string,
  date: string,
  startTime: string,
  endTime: string,
  bufferTime: number
): string[] {
  const startMinutes = slotTimeToMinutes(startTime);
  const endMinutes = slotTimeToMinutes(endTime) + Math.max(0, bufferTime);

  const keys: string[] = [];
  const firstCell = Math.floor(startMinutes / SLOT_GRID_MINUTES) * SLOT_GRID_MINUTES;
  for (let cell = firstCell; cell < endMinutes; cell += SLOT_GRID_MINUTES) {
    keys.push(`reb:booking:slot:${tenant}:${date}:${slotMinutesToTime(cell)}`);
  }
  // Always lock at least the start cell (handles zero/invalid durations).
  if (keys.length === 0) {
    keys.push(`reb:booking:slot:${tenant}:${date}:${slotMinutesToTime(firstCell)}`);
  }
  return keys;
}

/**
 * Atomically claim every grid cell a booking spans using Redis SET NX.
 * Returns claimed=true only if ALL cells were free; if any cell is already
 * taken, the cells claimed so far are released and claimed=false is returned.
 * Locks expire after 10 minutes to prevent stuck slots.
 */
async function claimBookingSlot(
  tenant: string,
  date: string,
  startTime: string,
  endTime: string,
  bufferTime: number
): Promise<{ claimed: boolean; release: () => Promise<void> }> {
  const redis = getRedis();
  const lockTTL = 600; // 10 minutes

  if (redis) {
    const keys = spanSlotKeys(tenant, date, startTime, endTime, bufferTime);
    const claimedKeys: string[] = [];
    const release = async () => {
      await Promise.all(claimedKeys.map((key) => redis.del(key)));
    };

    for (const key of keys) {
      // SET NX with expiry - atomic per-cell claim
      const ok = await redis.set(key, "pending", { nx: true, ex: lockTTL });
      if (!ok) {
        // Another booking already holds an overlapping cell - back out.
        await release();
        return { claimed: false, release: async () => {} };
      }
      claimedKeys.push(key);
    }

    return { claimed: true, release };
  }

  // No Redis - fall back to non-atomic behavior (acceptable for dev)
  return { claimed: true, release: async () => {} };
}

/**
 * Mark every grid cell a booking spans as booked (after successful creation).
 * Keys remain with a longer TTL so future overlap claims collide on them.
 */
async function confirmBookingSlot(
  tenant: string,
  date: string,
  startTime: string,
  endTime: string,
  bufferTime: number
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const keys = spanSlotKeys(tenant, date, startTime, endTime, bufferTime);
  // Keep slots marked as booked for 48 hours (covers day-of and next-day edge cases)
  await Promise.all(
    keys.map((key) => redis.set(key, "confirmed", { ex: 172800 }))
  );
}

/**
 * Check if any grid cell a booking would span is already claimed/booked in Redis.
 */
export async function isSlotClaimed(
  tenant: string,
  date: string,
  startTime: string,
  endTime: string,
  bufferTime: number
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  const keys = spanSlotKeys(tenant, date, startTime, endTime, bufferTime);
  const values = await Promise.all(keys.map((key) => redis.get(key)));
  return values.some((value) => !!value);
}

export async function createBooking(
  booking: Omit<Booking, "id" | "createdAt" | "status">,
  tenant: string = DEFAULT_TENANT
): Promise<Booking> {
  const bookingId = generateBookingId();
  const { bufferTime } = await getBookingConfig(tenant);

  if (hasSanity) {
    const doc = await getSanityClient().create({
      _type: "booking",
      tenant,
      bookingId,
      ...booking,
      status: "confirmed",
    });

    // Mark the full booked span as confirmed in Redis after successful DB write
    await confirmBookingSlot(
      tenant,
      booking.date,
      booking.startTime,
      booking.endTime,
      bufferTime
    );

    return {
      ...booking,
      id: bookingId,
      status: "confirmed",
      createdAt: doc._createdAt!,
    };
  }

  const newBooking: Booking = {
    ...booking,
    id: bookingId,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };

  const store = await readDevContent(tenant);
  const bookings = (store[`__bookings_${tenant}`] as Booking[]) ?? [];
  bookings.push(newBooking);
  store[`__bookings_${tenant}`] = bookings;
  await writeDevContent(store, tenant);

  // Mark the full booked span as confirmed in Redis after successful write
  await confirmBookingSlot(
    tenant,
    booking.date,
    booking.startTime,
    booking.endTime,
    bufferTime
  );

  return newBooking;
}

/**
 * Atomically claim a slot, verify availability, and create booking.
 * Prevents race conditions where two requests check availability simultaneously.
 */
export async function createBookingAtomic(
  booking: Omit<Booking, "id" | "createdAt" | "status">,
  tenant: string = DEFAULT_TENANT
): Promise<{ success: true; booking: Booking } | { success: false; error: string }> {
  // Step 1: Atomically claim every grid cell the booking spans. For
  // variable-duration services this prevents two overlapping bookings (whose
  // start times differ) from both succeeding.
  const { bufferTime } = await getBookingConfig(tenant);
  const { claimed, release } = await claimBookingSlot(
    tenant,
    booking.date,
    booking.startTime,
    booking.endTime,
    bufferTime
  );

  if (!claimed) {
    return { success: false, error: "This time slot is no longer available. Please choose another time." };
  }

  try {
    // Step 2: Double-check availability (handles case where slot was booked before Redis key expired)
    const available = await getAvailableSlots(booking.date, booking.serviceId, tenant);
    if (!available.includes(booking.startTime)) {
      await release();
      return { success: false, error: "This time slot is no longer available. Please choose another time." };
    }

    // Step 3: Create the booking (this also confirms the slot in Redis)
    const created = await createBooking(booking, tenant);
    return { success: true, booking: created };
  } catch (error) {
    // Release the slot claim on any error
    await release();
    throw error;
  }
}

export async function updateBooking(
  id: string,
  updates: Partial<Pick<Booking, "status" | "notes" | "cancelledAt">>,
  tenant: string = DEFAULT_TENANT
): Promise<Booking | null> {
  if (hasSanity) {
    const query = `*[_type == "booking" && tenant == $tenant && bookingId == $id][0]`;
    const doc = await getSanityClient().fetch(query, { tenant, id });
    if (!doc) return null;

    await getSanityClient().patch(doc._id).set(updates).commit();
    return {
      id,
      serviceId: doc.serviceId,
      serviceName: doc.serviceName,
      date: doc.date,
      startTime: doc.startTime,
      endTime: doc.endTime,
      clientName: doc.clientName,
      clientEmail: doc.clientEmail,
      clientPhone: doc.clientPhone,
      notes: doc.notes,
      status: doc.status,
      createdAt: doc._createdAt,
      cancelledAt: doc.cancelledAt,
      ...updates,
    };
  }

  const store = await readDevContent(tenant);
  const bookings = (store[`__bookings_${tenant}`] as Booking[]) ?? [];
  const idx = bookings.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  bookings[idx] = { ...bookings[idx], ...updates };
  store[`__bookings_${tenant}`] = bookings;
  await writeDevContent(store, tenant);
  return bookings[idx];
}

export async function getAvailableSlots(
  date: string,
  serviceId: string,
  tenant: string = DEFAULT_TENANT
): Promise<string[]> {
  const [config, bookings, overrides, services] = await Promise.all([
    getBookingConfig(tenant),
    getBookings(tenant, { from: date, to: date }),
    getDateOverrides(tenant),
    getContent("services", tenant),
  ]);

  const serviceList = Array.isArray(services.services) ? services.services : [];
  const service = serviceList.find((s) => s.id === serviceId);
  const duration = service ? parseInt(service.duration) || config.slotDuration : config.slotDuration;

  return generateSlots(config, date, duration, bookings, overrides);
}

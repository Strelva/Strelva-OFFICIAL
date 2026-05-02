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
 * Atomically claim a booking slot using Redis SETNX.
 * Returns true if the slot was claimed, false if already taken.
 * The lock expires after 10 minutes to prevent stuck slots.
 */
async function claimBookingSlot(
  tenant: string,
  date: string,
  startTime: string,
  serviceId: string
): Promise<{ claimed: boolean; release: () => Promise<void> }> {
  const redis = getRedis();
  const slotKey = `reb:booking:slot:${tenant}:${date}:${startTime}:${serviceId}`;
  const lockTTL = 600; // 10 minutes

  if (redis) {
    // SETNX with expiry - atomic slot claim
    const claimed = await redis.set(slotKey, "pending", { nx: true, ex: lockTTL });
    return {
      claimed: !!claimed,
      release: async () => {
        await redis.del(slotKey);
      },
    };
  }

  // No Redis - fall back to non-atomic behavior (acceptable for dev)
  return { claimed: true, release: async () => {} };
}

/**
 * Mark a slot as permanently booked (after successful booking creation).
 * The slot key remains with a longer TTL so getAvailableSlots can check it.
 */
async function confirmBookingSlot(
  tenant: string,
  date: string,
  startTime: string,
  serviceId: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const slotKey = `reb:booking:slot:${tenant}:${date}:${startTime}:${serviceId}`;
  // Keep slot marked as booked for 48 hours (covers day-of and next-day edge cases)
  await redis.set(slotKey, "confirmed", { ex: 172800 });
}

/**
 * Check if a slot is already claimed/booked in Redis.
 */
export async function isSlotClaimed(
  tenant: string,
  date: string,
  startTime: string,
  serviceId: string
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  const slotKey = `reb:booking:slot:${tenant}:${date}:${startTime}:${serviceId}`;
  const value = await redis.get(slotKey);
  return !!value;
}

export async function createBooking(
  booking: Omit<Booking, "id" | "createdAt" | "status">,
  tenant: string = DEFAULT_TENANT
): Promise<Booking> {
  const bookingId = generateBookingId();

  if (hasSanity) {
    const doc = await getSanityClient().create({
      _type: "booking",
      tenant,
      bookingId,
      ...booking,
      status: "confirmed",
    });

    // Mark slot as confirmed in Redis after successful DB write
    await confirmBookingSlot(tenant, booking.date, booking.startTime, booking.serviceId);

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

  // Mark slot as confirmed in Redis after successful write
  await confirmBookingSlot(tenant, booking.date, booking.startTime, booking.serviceId);

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
  // Step 1: Atomically claim the slot
  const { claimed, release } = await claimBookingSlot(
    tenant,
    booking.date,
    booking.startTime,
    booking.serviceId
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

  const service = services.services.find((s) => s.id === serviceId);
  const duration = service ? parseInt(service.duration) || config.slotDuration : config.slotDuration;

  return generateSlots(config, date, duration, bookings, overrides);
}

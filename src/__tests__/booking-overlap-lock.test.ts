import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests for the booking time-range overlap lock.
 *
 * The bug: claimBookingSlot used to lock only the exact start-time key, so two
 * OVERLAPPING variable-duration bookings (e.g. a 90-min at 10:00 and a 60-min at
 * 10:30) both passed SET NX because their start keys differed -> double-book.
 *
 * These tests drive the real claim/confirm logic with an in-memory Redis that
 * honours SET NX semantics, plus an in-memory dev content store.
 */

// In-memory Redis honouring { nx, ex } SET semantics used by claimBookingSlot.
const redisStore = vi.hoisted(() => new Map<string, unknown>());
const mockRedis = vi.hoisted(() => ({
  get: vi.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
  set: vi.fn(
    (key: string, value: unknown, opts?: { nx?: boolean; ex?: number }) => {
      if (opts?.nx && redisStore.has(key)) return Promise.resolve(null);
      redisStore.set(key, value);
      return Promise.resolve("OK");
    }
  ),
  del: vi.fn((key: string) => {
    redisStore.delete(key);
    return Promise.resolve(1);
  }),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => mockRedis),
}));

// In-memory dev content store (Sanity is off in tests).
const devStore = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock("@/lib/storage/core", () => ({
  hasSanity: false,
  DEFAULT_TENANT: "demo",
  readDevContent: vi.fn((tenant: string) =>
    Promise.resolve({ ...(devStore.get(tenant) ?? {}) })
  ),
  writeDevContent: vi.fn((data: Record<string, unknown>, tenant: string) => {
    devStore.set(tenant, data);
    return Promise.resolve();
  }),
}));

// Services list consumed by getAvailableSlots.
vi.mock("@/lib/storage/content-store", () => ({
  getContent: vi.fn(() =>
    Promise.resolve({
      services: [
        { id: "svc-long", name: "Long", duration: "90" },
        { id: "svc-short", name: "Short", duration: "60" },
      ],
    })
  ),
}));

const TENANT = "demo";

/**
 * Find the next Wednesday (UTC day 3) that is at least 3 days from now.
 * Wednesday maps to weeklySchedule day 3 (10:00-16:00) in DEFAULT_BOOKING_CONFIG.
 * The date must be > bookingLeadTime (24h) away AND within maxAdvanceBooking (60d),
 * so a fixed far-future date like "2099-01-07" fails the maxAdvanceBooking filter
 * that generateSlots enforces.
 */
function nextWednesdayDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 3); // skip at least 3 days (> 24h lead time)
  while (d.getUTCDay() !== 3) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

const DATE = nextWednesdayDate();

async function loadStore() {
  return import("@/lib/storage/booking-store");
}

/** Build a booking payload, computing endTime from startTime + duration. */
function bookingPayload(opts: {
  serviceId: string;
  serviceName: string;
  startTime: string;
  duration: number;
}) {
  const [h, m] = opts.startTime.split(":").map(Number);
  const endMinutes = h * 60 + m + opts.duration;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(
    endMinutes % 60
  ).padStart(2, "0")}`;
  return {
    serviceId: opts.serviceId,
    serviceName: opts.serviceName,
    date: DATE,
    startTime: opts.startTime,
    endTime,
    clientName: "Test Client",
    clientEmail: "test@example.com",
    clientPhone: "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  redisStore.clear();
  devStore.clear();
});

describe("booking time-range overlap lock", () => {
  it("rejects a second booking whose time range overlaps the first", async () => {
    const { createBookingAtomic } = await loadStore();

    // First: 90-min booking at 10:00 -> occupies 10:00-11:30 (+buffer).
    const first = await createBookingAtomic(
      bookingPayload({
        serviceId: "svc-long",
        serviceName: "Long",
        startTime: "10:00",
        duration: 90,
      }),
      TENANT
    );
    expect(first.success).toBe(true);

    // Second: 60-min booking at 10:30 -> overlaps the first's range.
    const second = await createBookingAtomic(
      bookingPayload({
        serviceId: "svc-short",
        serviceName: "Short",
        startTime: "10:30",
        duration: 60,
      }),
      TENANT
    );
    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.error).toMatch(/no longer available/i);
    }
  });

  it("releases all span cells when a claim is rejected so they stay free", async () => {
    const { createBookingAtomic, isSlotClaimed } = await loadStore();

    await createBookingAtomic(
      bookingPayload({
        serviceId: "svc-long",
        serviceName: "Long",
        startTime: "10:00",
        duration: 90,
      }),
      TENANT
    );

    // A rejected overlapping attempt must not leave a partial 12:00 lock behind.
    const rejected = await createBookingAtomic(
      bookingPayload({
        serviceId: "svc-short",
        serviceName: "Short",
        startTime: "10:30",
        duration: 60,
      }),
      TENANT
    );
    expect(rejected.success).toBe(false);

    // 12:00 (well past the first booking + buffer) must remain unclaimed.
    const claimedAfterBuffer = await isSlotClaimed(
      TENANT,
      DATE,
      "12:00",
      "13:00",
      15
    );
    expect(claimedAfterBuffer).toBe(false);
  });

  it("allows a non-overlapping booking after an earlier one", async () => {
    const { createBookingAtomic } = await loadStore();

    // 10:00 booking occupies 10:00-11:00 (+15 buffer = 11:15). On the svc-short grid.
    const first = await createBookingAtomic(
      bookingPayload({
        serviceId: "svc-short",
        serviceName: "Short",
        startTime: "10:00",
        duration: 60,
      }),
      TENANT
    );
    expect(first.success).toBe(true);

    // 13:45 is on the svc-short grid and well clear of the first booking's span.
    const second = await createBookingAtomic(
      bookingPayload({
        serviceId: "svc-short",
        serviceName: "Short",
        startTime: "13:45",
        duration: 60,
      }),
      TENANT
    );
    expect(second.success).toBe(true);
  });

  it("isSlotClaimed reports an overlapping range claimed across the full span", async () => {
    const { createBookingAtomic, isSlotClaimed } = await loadStore();

    await createBookingAtomic(
      bookingPayload({
        serviceId: "svc-long",
        serviceName: "Long",
        startTime: "10:00",
        duration: 90,
      }),
      TENANT
    );

    // An overlapping range (11:00-12:00) shares cells with 10:00-11:30 span.
    const overlaps = await isSlotClaimed(TENANT, DATE, "11:00", "12:00", 15);
    expect(overlaps).toBe(true);
  });
});

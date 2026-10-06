import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRedisMock } from "./support/redis-mock";
import { fakeBookingStore, type FakeTenant } from "./support/booking-store-fake";

// The visitor's /api/booking when the one booking store is authoritative
// (STRELVA_BOOKING_STORE_READ=postgres after 7 days of parity) and Redis is
// absent or down. The store's exclusion constraint guards the slot, so the
// booking goes through; Redis is only the legacy lock and the rate limit's
// home. When nothing can store or guard the booking, the visitor is told that
// nothing was booked: never a 500, never a false success.

const redisMock = makeRedisMock();
const devStore = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const h = vi.hoisted(() => ({
  redis: "up" as "up" | "absent" | "down",
  perInstanceLimited: false,
  rateLimitCalls: [] as string[],
  logActivity: vi.fn(),
  sendBookingConfirmation: vi.fn(),
}));

/** Redis configured but failing every call, like an Upstash outage. */
const downRedis = new Proxy({}, { get: () => async () => { throw new Error("Upstash: fetch failed"); } });

vi.mock("@/platform/infra/redis", () => ({ getRedis: () => (h.redis === "up" ? redisMock : h.redis === "down" ? downRedis : null) }));
vi.mock("@/lib/events", () => ({ addEvent: vi.fn() }));
vi.mock("@/lib/storage/core", () => ({
  DEFAULT_TENANT: "demo",
  readDevContent: async (tenant: string) => ({ ...(devStore.get(tenant) ?? {}) }),
  writeDevContent: async (data: Record<string, unknown>, tenant: string) => { devStore.set(tenant, JSON.parse(JSON.stringify(data))); },
}));
vi.mock("@/lib/storage/content-store", () => ({ getContent: async () => ({ services: [{ id: "svc-consult", name: "Consultation", duration: "30" }] }) }));
vi.mock("@/lib/storage", async () => ({
  ...(await vi.importActual<typeof import("@/platform/bookings/legacy-store")>("@/platform/bookings/legacy-store")),
  getContent: async () => ({ services: [{ id: "svc-consult", name: "Consultation", duration: "30" }] }),
  logActivity: h.logActivity,
  DEFAULT_TENANT: "demo",
}));
vi.mock("@/platform/infra/db/source-flags", () => ({ dataSourceIsPostgres: () => false }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "t1" }));
// Production behavior: the Redis limit throws when Redis is absent or down (it fails closed).
vi.mock("@/platform/infra/rate-limit", () => ({
  isRateLimitedAsync: async () => {
    h.rateLimitCalls.push("redis");
    if (h.redis !== "up") throw new Error("[PRODUCTION] Redis required for rate limiting but not configured");
    return false;
  },
  isRateLimitedPerInstance: () => { h.rateLimitCalls.push("instance"); return h.perInstanceLimited; },
  rateLimitKey: () => "booking-test",
}));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: async (id: string) => ({ id, siteName: "Willow Studio", ownerEmail: "rae@example.test", active: true }) }));
vi.mock("@/lib/owner-recipient", () => ({ ownerNoticeEmail: async () => "rae@example.test" }));
vi.mock("@/lib/tenant-urls", () => ({ getTenantDashboardUrl: (_c: unknown, path: string) => `https://app.strelva.test${path}` }));
vi.mock("@/lib/delivery-email", () => ({ sendBookingConfirmation: h.sendBookingConfirmation, sendNewBookingOwnerEmail: vi.fn() }));
vi.mock("@/lib/monitoring", () => ({ alertOnce: vi.fn() }));

import { POST as postBooking } from "@/app/api/booking/route";
import { resetBookingFlagCache, bookingReadSource } from "@/platform/bookings/flags";
import { readTenantBookings, readWorkspaceBookingRequests, setBookingStoreDb, upsertBookingSettings } from "@/platform/bookings/store";
import { bookingRequestAdapter } from "@/platform/bookings/needs-you-adapter";
import type { Booking } from "@/lib/types";

const FRIDAY = "2026-11-06";
const NOW = Date.parse("2026-11-02T12:00:00.000Z");
const SETTINGS = { mode: "instant" as const, bufferMinutes: 0, minNoticeMinutes: 0, maxAdvanceDays: 60, defaultLengthMinutes: 60, timezone: "America/New_York" };

function bookingRequest(startTime: string, name = "Jo Banks") {
  return new Request("https://willow.example/api/booking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ serviceId: "svc-consult", date: FRIDAY, startTime, clientName: name, clientEmail: "jo@example.test" }),
  });
}

function legacyRows(): Booking[] {
  return (devStore.get("t1")?.["__bookings_t1"] as Booking[] | undefined) ?? [];
}

/** A converted business with the one store serving (seven days of parity). */
async function world(mode: "instant" | "request" = "instant") {
  const fake = fakeBookingStore();
  fake.state.streakDays = 7;
  const tenant: FakeTenant = {
    stableId: randomUUID(), workspaceId: randomUUID(), systemId: randomUUID(), paused: false, phone: "716-555-0199",
    hours: { timezone: "America/New_York", weekly: [{ day: 5, opens: "09:00", closes: "15:00" }] },
    services: [{ id: randomUUID(), name: "Consultation", durationMinutes: 30, active: true, externalRef: "svc-consult" }],
  };
  fake.tenants.set("t1", tenant);
  setBookingStoreDb(fake.db);
  vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1");
  vi.stubEnv("STRELVA_BOOKING_STORE_READ", "postgres");
  resetBookingFlagCache();
  await upsertBookingSettings("t1", { ...SETTINGS, mode }, "native", fake.db);
  expect(await bookingReadSource()).toBe("postgres");
  return { fake, tenant };
}

beforeEach(() => {
  redisMock.store.clear();
  redisMock.zsets.clear();
  devStore.clear();
  h.redis = "up";
  h.perInstanceLimited = false;
  h.rateLimitCalls = [];
  h.logActivity.mockReset().mockResolvedValue(undefined);
  h.sendBookingConfirmation.mockReset().mockResolvedValue(false);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("DUAL_WRITE_PG", "1");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  setBookingStoreDb(undefined);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetBookingFlagCache();
});

describe("the one store serving, Redis absent", () => {
  it("a request-mode booking is held in the store and reaches Needs you", async () => {
    const { fake, tenant } = await world("request");
    h.redis = "absent";
    const res = await postBooking(bookingRequest("10:00"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, requested: true, confirmationSent: false, booking: { status: "requested", startTime: "10:00" } });
    // The per-instance limit stood in for the Redis one.
    expect(h.rateLimitCalls).toEqual(["redis", "instance"]);
    expect(fake.rows).toEqual([expect.objectContaining({ status: "requested", origin: "site" })]);
    expect(legacyRows()).toHaveLength(1);
    // The owner's decision: the hourly chase reads the request by workspace.
    const adapter = bookingRequestAdapter({ requests: (ws) => readWorkspaceBookingRequests(ws), decide: vi.fn() });
    const proposal = await adapter.propose({ workspaceId: tenant.workspaceId! });
    expect(proposal.items).toEqual([expect.objectContaining({ sourceLifecycle: "booking_request", kind: "customer.commitment", title: "Booking request: Jo Banks, Fri, Nov 6 10:00 AM" })]);
  });

  it("the store still refuses a taken time", async () => {
    await world();
    h.redis = "absent";
    expect((await postBooking(bookingRequest("10:00"))).status).toBe(200);
    const second = await postBooking(bookingRequest("10:00", "Late Comer"));
    expect(second.status).toBe(409);
    expect(legacyRows()).toHaveLength(1);
  });

  it("the per-instance limit still limits", async () => {
    const { fake } = await world();
    h.redis = "absent";
    h.perInstanceLimited = true;
    const res = await postBooking(bookingRequest("10:00"));
    expect(res.status).toBe(429);
    expect(fake.rows).toEqual([]);
  });

  it("with the store unreachable too, nothing is booked and the visitor is told so", async () => {
    const { fake } = await world();
    h.redis = "absent";
    fake.state.down = true;
    const res = await postBooking(bookingRequest("10:00"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("We couldn't save your booking just now, so nothing was booked. Please try again in a minute.");
    expect(legacyRows()).toEqual([]);
    expect(h.logActivity).not.toHaveBeenCalled();
  });
});

describe("the one store serving, Redis down", () => {
  it("an instant booking is confirmed from the store; the Redis lock is skipped, not fatal", async () => {
    const { fake } = await world();
    h.redis = "down";
    const res = await postBooking(bookingRequest("11:00"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, booking: { status: "confirmed", startTime: "11:00" } });
    expect(fake.rows).toEqual([expect.objectContaining({ status: "confirmed" })]);
    expect(legacyRows()).toEqual([expect.objectContaining({ startTime: "11:00", status: "confirmed" })]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Redis slot lock not written"), expect.anything());
  });

  it("with the store unreachable too, nothing is booked and the visitor is told so", async () => {
    const { fake } = await world();
    await bookingReadSource();
    h.redis = "down";
    fake.state.down = true;
    const res = await postBooking(bookingRequest("10:00"));
    expect(res.status).toBe(503);
    expect(legacyRows()).toEqual([]);
  });
});

describe("after the booking is stored", () => {
  it("a failing activity log or owner notice never turns a stored booking into an error", async () => {
    const { fake } = await world();
    h.logActivity.mockRejectedValueOnce(new Error("activity table down"));
    const res = await postBooking(bookingRequest("10:00"));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(fake.rows).toHaveLength(1);
  });
});

describe("legacy reads (the store not yet serving)", () => {
  it("Redis down: the limit fails closed and the visitor is told nothing was booked", async () => {
    vi.stubEnv("STRELVA_BOOKING_STORE_READ", "");
    resetBookingFlagCache();
    h.redis = "down";
    const res = await postBooking(bookingRequest("10:00"));
    expect(res.status).toBe(503);
    expect(h.rateLimitCalls).toEqual(["redis"]);
    expect(legacyRows()).toEqual([]);
  });

  it("Redis up: unchanged, the legacy lock and a confirmed booking", async () => {
    vi.stubEnv("STRELVA_BOOKING_STORE_READ", "");
    resetBookingFlagCache();
    const res = await postBooking(bookingRequest("10:00"));
    expect(res.status).toBe(200);
    expect(legacyRows()).toEqual([expect.objectContaining({ status: "confirmed" })]);
    expect([...redisMock.store.values()]).toContain("confirmed");
    expect(await readTenantBookings("t1", undefined, undefined).catch(() => [])).toEqual([]);
  });
});

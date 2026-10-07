import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const edge = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), alert: vi.fn(async () => undefined) }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => edge }));
vi.mock("@/platform/infra/monitoring", () => ({ alertOnce: edge.alert }));
import { readBookingContext, type BookingStoreDb } from "@/platform/bookings/store";
import { resetBookingRecordCache, BOOKING_RECORD_CACHE_MS } from "@/platform/bookings/record-fallback";

const facts = { hours: { timezone: "America/New_York", weekly: [{ day: 5, opens: "09:00", closes: "15:00" }] },
  phone: "716-555-0100", services: [{ id: "s", name: "Consultation", durationMinutes: 30, active: true, externalRef: null }] };
let policy: Record<string, unknown>, factsDown: boolean, storeDown: boolean;
const rpc = vi.fn(async (name: string) => {
  if (storeDown || (name === "read_tenant_booking_context" && factsDown)) return { data: null, error: { message: "unavailable" } };
  return { data: name === "read_tenant_booking_policy" ? policy : { ...policy, ...facts }, error: null };
});
const db: BookingStoreDb = { rpc };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-01T12:00:00Z")); vi.clearAllMocks(); resetBookingRecordCache();
  vi.stubEnv("STRELVA_BOOKING_RECORD_FALLBACK", "1"); vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1");
  edge.get.mockResolvedValue(null); edge.set.mockResolvedValue("OK");
  policy = { tenantStableId: "stable-one", workspaceId: "business-one", systemId: "booking-one", paused: false,
    settings: { mode: "request", bufferMinutes: 15, minNoticeMinutes: 240, maxAdvanceDays: 60 } };
  factsDown = false; storeDown = false;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); resetBookingRecordCache(); });

describe("last readable booking record", () => {
  it("with the flag off makes no cache, policy or operator calls", async () => {
    vi.stubEnv("STRELVA_BOOKING_RECORD_FALLBACK", "0");
    await readBookingContext("site", db); factsDown = true;
    await expect(readBookingContext("site", db)).rejects.toThrow();
    expect(rpc.mock.calls.map(c => c[0])).toEqual(["read_tenant_booking_context", "read_tenant_booking_context"]);
    expect(edge.get).not.toHaveBeenCalled(); expect(edge.set).not.toHaveBeenCalled(); expect(edge.alert).not.toHaveBeenCalled();
  });
  it("rereads facts every time; outage uses cached facts with fresh pause and narrower policy", async () => {
    const live = await readBookingContext("site", db);
    factsDown = true; policy = { ...policy, paused: true, settings: { ...policy.settings as object, bufferMinutes: 30 } };
    const cached = await readBookingContext("site", db);
    expect(cached).toMatchObject({ ...facts, paused: true, settings: { bufferMinutes: 30 } });
    expect(cached?.hours).not.toBe(live?.hours);
    expect(edge.alert).toHaveBeenCalledWith("booking_record_unreadable", "high", { tenant: "site" }, 3600);
    expect(edge.set).toHaveBeenCalledWith("reb:booking:record:stable-one:business-one", expect.any(Object), { ex: 3600 });
  });
  it("expires at one hour and never falls back across identity or workspace changes", async () => {
    await readBookingContext("site", db); factsDown = true;
    policy.workspaceId = "different-business";
    await expect(readBookingContext("site", db)).rejects.toThrow();
    policy.workspaceId = "business-one";
    vi.advanceTimersByTime(BOOKING_RECORD_CACHE_MS - 1);
    expect(await readBookingContext("site", db)).toMatchObject({ hours: facts.hours });
    vi.advanceTimersByTime(1);
    await expect(readBookingContext("site", db)).rejects.toThrow();
  });
  it("store policy outage fails closed even with a cached record", async () => {
    await readBookingContext("site", db); storeDown = true;
    await expect(readBookingContext("site", db)).rejects.toThrow();
  });
  it("can use Redis across instances; corrupt and future-dated entries fail closed", async () => {
    await readBookingContext("site", db);
    const snapshot = edge.set.mock.calls[0]?.[1]; resetBookingRecordCache(); factsDown = true;
    edge.get.mockResolvedValue(snapshot);
    expect(await readBookingContext("site", db)).toMatchObject({ services: facts.services });
    edge.get.mockResolvedValue({ ...snapshot, at: Date.now() + 1 });
    await expect(readBookingContext("site", db)).rejects.toThrow();
    edge.get.mockResolvedValue({ at: Date.now(), facts: { services: "bad" } });
    await expect(readBookingContext("site", db)).rejects.toThrow();
  });
});

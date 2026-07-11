/**
 * Regression coverage for the booking CONFIG store (getBookingConfig /
 * setBookingConfig / getDateOverrides).
 *
 * BookingConfig + DateOverride have NO Postgres table — before the Sanity
 * teardown they persisted in Sanity in prod. They now persist as a Redis blob.
 * This guards the regression where the Sanity write path was removed leaving
 * only the dev-file write, which throws on a read-only prod filesystem: with
 * Redis present, a set MUST round-trip through Redis (never touch the dev file).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());
const redisState = vi.hoisted(() => ({ throwOnGet: false }));

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: async (k: string) => {
      if (redisState.throwOnGet) throw new Error("redis blip");
      return store.has(k) ? store.get(k) : null;
    },
    set: async (k: string, v: unknown) => {
      store.set(k, v);
      return "OK";
    },
  }),
}));

// Fail loudly if the config path ever falls back to the dev-file store while
// Redis is present — that is exactly the prod-breaking regression.
vi.mock("@/lib/storage/core", async (orig) => ({
  ...(await orig()),
  readDevContent: () => {
    throw new Error("dev-file path must not run when Redis is present");
  },
  writeDevContent: () => {
    throw new Error("dev-file path must not run when Redis is present");
  },
}));

import {
  getBookingConfig,
  setBookingConfig,
  getDateOverrides,
  setDateOverrides,
} from "@/lib/storage/booking-store";
import type { DateOverride } from "@/lib/types";
import { DEFAULT_BOOKING_CONFIG } from "@/lib/booking";

beforeEach(() => {
  store.clear();
  redisState.throwOnGet = false;
});

describe("booking config store (Redis-backed)", () => {
  it("round-trips a saved config through Redis, scoped per tenant", async () => {
    const config = { ...DEFAULT_BOOKING_CONFIG, slotDuration: 30, bufferTime: 5 };
    await setBookingConfig(config, "gldf");

    expect(store.has("reb:booking:config:gldf")).toBe(true);
    const read = await getBookingConfig("gldf");
    expect(read.slotDuration).toBe(30);
    expect(read.bufferTime).toBe(5);
  });

  it("returns the default when a tenant has no saved config", async () => {
    const read = await getBookingConfig("rohlax");
    expect(read).toEqual(DEFAULT_BOOKING_CONFIG);
  });

  it("does not leak one tenant's config to another", async () => {
    await setBookingConfig({ ...DEFAULT_BOOKING_CONFIG, slotDuration: 45 }, "gldf");
    const other = await getBookingConfig("rohlax");
    expect(other.slotDuration).toBe(DEFAULT_BOOKING_CONFIG.slotDuration);
  });

  it("returns [] for date overrides when none are set", async () => {
    expect(await getDateOverrides("gldf")).toEqual([]);
  });

  it("round-trips saved date overrides through Redis, and getDateOverrides reads them", async () => {
    const overrides: DateOverride[] = [
      { date: "2026-11-26", available: false, reason: "Thanksgiving" },
      { date: "2026-12-24", available: true, start: "09:00", end: "12:00", reason: "Christmas Eve" },
    ];
    await setDateOverrides(overrides, "gldf");

    expect(store.has("reb:booking:overrides:gldf")).toBe(true);
    expect(await getDateOverrides("gldf")).toEqual(overrides);
  });

  it("does not leak one tenant's date overrides to another", async () => {
    await setDateOverrides([{ date: "2026-07-04", available: false }], "gldf");
    expect(await getDateOverrides("rohlax")).toEqual([]);
  });

  it("fails CLOSED on a Redis read error instead of serving default hours", async () => {
    // A transient Redis blip must NOT silently return DEFAULT_BOOKING_CONFIG —
    // default hours could offer/deny slots for the wrong days on a live booking
    // surface. The error propagates so the caller fails the request.
    redisState.throwOnGet = true;
    await expect(getBookingConfig("gldf")).rejects.toThrow("redis blip");
    await expect(getDateOverrides("gldf")).rejects.toThrow("redis blip");
  });
});

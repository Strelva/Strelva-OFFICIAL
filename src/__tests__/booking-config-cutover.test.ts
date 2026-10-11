import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOOKING_CONFIG } from "@/lib/booking";
import type { BookingConfig, DateOverride } from "@/lib/types";
import { legacyConfigToSettings } from "@/platform/bookings/availability";
import { fakeBookingStore } from "./support/booking-store-fake";

const cache = vi.hoisted(() => ({ present: true, fails: false, rows: new Map<string, unknown>(), writes: [] as string[] }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => !cache.present ? null : {
  get: async (key: string) => { if (cache.fails) throw new Error("Redis unavailable"); return cache.rows.get(key) ?? null; },
  set: async (key: string, value: unknown) => { cache.writes.push(key); if (cache.fails) throw new Error("Redis unavailable"); cache.rows.set(key, value); },
} }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
vi.mock("@/lib/storage/core", async original => ({ ...(await original()),
  readDevContent: () => { throw new Error("No dev-file fallback during a qualified cutover"); },
  writeDevContent: () => { throw new Error("No dev-file fallback during a qualified cutover"); },
}));
import { setClientRecordDb, type ClientRecordDb } from "@/platform/client-records/mirror";
import { resetBookingFlagCache } from "@/platform/bookings/flags";
import { setBookingStoreDb, type BookingStoreDb } from "@/platform/bookings/store";
import { getBookingConfig, getDateOverrides, setBookingConfig, setDateOverrides } from "@/platform/bookings/legacy-store";

const tenant = "booking-owner";
const stableId = "cccccccc-1000-4000-8000-000000000001";
let native: ReturnType<typeof fakeBookingStore>;
let nativeFailure: "read" | "write" | null;
let blobFailure: boolean;
let records: Map<string, { recordId: string; payload: Record<string, unknown>; capturedAt: string }>;
let writes: string[];
let nativeCalls: Array<{ name: string; args: Record<string, unknown> }>;

beforeEach(() => {
  cache.present = true; cache.fails = false; cache.rows.clear(); cache.writes = [];
  blobFailure = false; nativeFailure = null; records = new Map(); writes = []; nativeCalls = [];
  vi.stubEnv("STRELVA_BOOKING_STORE_READ", "legacy"); vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "0");
  vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", "booking_config"); vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
  const db: ClientRecordDb = { rpc(name, args) {
    if (name === "client_record_parity_streak") return Promise.resolve({ data: { days: 7 }, error: null });
    if (name === "read_tenant_client_records_page") return Promise.resolve({ data: [...records.values()], error: null });
    writes.push(String(args.p_record_id));
    if (blobFailure) return Promise.resolve({ data: null, error: { code: "08006", message: "Durable write unavailable" } });
    records.set(String(args.p_record_id), { recordId: String(args.p_record_id), payload: args.p_payload as Record<string, unknown>, capturedAt: String(args.p_captured_at) });
    return Promise.resolve({ data: { status: "recorded", workspaceId: null }, error: null });
  } };
  setClientRecordDb(db);
  native = fakeBookingStore(); native.state.streakDays = 7;
  native.tenants.set(tenant, { stableId, workspaceId: null, systemId: null, paused: false, phone: null, hours: null, services: [] });
  native.settings.set(stableId, { ...legacyConfigToSettings(DEFAULT_BOOKING_CONFIG, [{ date: "2026-12-25", available: false }]), mode: "request", maxPerDay: 4, revision: 1, recordedVia: "native" });
  const nativeDb: BookingStoreDb = { rpc(name, args) {
    nativeCalls.push({ name, args });
    if ((nativeFailure === "read" && name === "read_tenant_booking_context") || (nativeFailure === "write" && (name === "upsert_tenant_booking_settings" || name === "write_tenant_booking_settings_fields"))) {
      return Promise.resolve({ data: null, error: { message: "Native store unavailable" } });
    }
    if (name === "write_tenant_booking_settings_fields") {
      const target = native.tenants.get(String(args.p_tenant_id));
      if (!target) return Promise.resolve({ data: null, error: { message: "booking_unknown_tenant" } });
      const prior = native.settings.get(target.stableId);
      const initial = { mode: "instant", maxPerDay: null, bookableOverrides: null, ...(args.p_initial_config as Record<string, unknown>) };
      const next = { ...(prior ?? initial), ...(args.p_settings as Record<string, unknown>), recordedVia: "native", revision: (prior?.revision ?? 0) + 1 };
      native.settings.set(target.stableId, next);
      return Promise.resolve({ data: { status: prior ? "updated" : "recorded", revision: next.revision }, error: null });
    }
    // Model the real historical SQL native-provenance guard for held-writer regression.
    if (name === "upsert_tenant_booking_settings" && args.p_via !== "native") {
      const prior = native.settings.get(stableId);
      if (prior?.recordedVia === "native") {
        prior.revision += 1;
        return Promise.resolve({ data: { status: "updated", revision: prior.revision }, error: null });
      }
    }
    return native.db.rpc(name, args);
  } };
  setBookingStoreDb(nativeDb); resetBookingFlagCache();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { setClientRecordDb(undefined); setBookingStoreDb(undefined); resetBookingFlagCache(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const config: BookingConfig = { ...DEFAULT_BOOKING_CONFIG, slotDuration: 45, bufferTime: 10 };
const overrides: DateOverride[] = [{ date: "2026-12-31", available: false, reason: "Closed" }];

describe("booking configuration authoritative cutover", () => {
  it("keeps Redis authoritative before either cutover and surfaces its failure", async () => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", ""); vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "0");
    await setBookingConfig(config, tenant); await setDateOverrides(overrides, tenant);
    expect(await getBookingConfig(tenant)).toEqual(config); expect(await getDateOverrides(tenant)).toEqual(overrides);
    expect(writes).toEqual([]);
    cache.fails = true;
    await expect(setBookingConfig(config, tenant)).rejects.toThrow("Redis unavailable");
    await expect(setDateOverrides(overrides, tenant)).rejects.toThrow("Redis unavailable");
    expect(writes).toEqual([]);
  });
  it("rejects unqualified blob selection before any cache mutation", async () => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "0");
    await expect(setBookingConfig(config, tenant)).rejects.toThrow();
    await expect(setDateOverrides(overrides, tenant)).rejects.toThrow();
    expect(cache.writes).toEqual([]); expect(writes).toEqual([]);
  });
  it("does not replace unknown companion settings with defaults in optional native mirrors", async () => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", ""); vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "0");
    vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1");
    const before = structuredClone(native.settings.get(stableId));
    // Writes work, but the companion Redis read is unavailable.
    const failRead = vi.spyOn(cache.rows, "get").mockImplementation(() => { throw new Error("Companion unavailable"); });
    await setBookingConfig(config, tenant); await setDateOverrides(overrides, tenant);
    expect(native.settings.get(stableId)).toEqual(before);
    expect(cache.writes).toHaveLength(2); failRead.mockRestore();
  });
  it("commits selected durable blobs and reads them back when Redis writes/reads fail", async () => {
    cache.fails = true;
    await setBookingConfig(config, tenant); await setDateOverrides(overrides, tenant);
    expect(writes).toEqual(["config", "overrides"]);
    expect(await getBookingConfig(tenant)).toEqual(config);
    expect(await getDateOverrides(tenant)).toEqual(overrides);
  });
  it("does not require a Redis client or development file after blob cutover", async () => {
    cache.present = false;
    await setBookingConfig(config, tenant); await setDateOverrides(overrides, tenant);
    expect(await getBookingConfig(tenant)).toEqual(config);
    expect(await getDateOverrides(tenant)).toEqual(overrides);
  });
  it("refuses a durable blob write before changing the Redis copy", async () => {
    blobFailure = true;
    await expect(setBookingConfig(config, tenant)).rejects.toThrow();
    await expect(setDateOverrides(overrides, tenant)).rejects.toThrow();
    expect(cache.writes).toEqual([]); expect(records.size).toBe(0);
  });
  it("writes selected native settings despite Redis failure and preserves native mode, caps and companion fields", async () => {
    vi.stubEnv("STRELVA_BOOKING_STORE_READ", "postgres"); vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1");
    cache.fails = true;
    await setBookingConfig(config, tenant);
    expect(native.settings.get(stableId)).toMatchObject({ mode: "request", maxPerDay: 4, defaultLengthMinutes: 45,
      bookableOverrides: [{ date: "2026-12-25", closed: true }] });
    await setDateOverrides(overrides, tenant);
    expect(native.settings.get(stableId)).toMatchObject({ mode: "request", maxPerDay: 4, defaultLengthMinutes: 45, bufferMinutes: 10 });
    expect(await getBookingConfig(tenant)).toMatchObject({ slotDuration: 45, bufferTime: 10 });
    expect(await getDateOverrides(tenant)).toEqual(overrides);
  });
  it("keeps both producer saves when a previously mirrored row receives config and overrides together", async () => {
    vi.stubEnv("STRELVA_BOOKING_STORE_READ", "postgres"); vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1");
    native.settings.get(stableId)!.recordedVia = "backfill";
    await Promise.all([setBookingConfig(config, tenant), setDateOverrides(overrides, tenant)]);
    expect(native.settings.get(stableId)).toMatchObject({ mode: "request", maxPerDay: 4, defaultLengthMinutes: 45, bufferMinutes: 10,
      recordedVia: "native", bookableOverrides: [{ date: "2026-12-31", closed: true, label: "Closed" }] });
  });
  it("sends only owned field groups, without reading or submitting a companion snapshot", async () => {
    vi.stubEnv("STRELVA_BOOKING_STORE_READ", "postgres"); vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1");
    await Promise.all([setBookingConfig(config, tenant), setDateOverrides(overrides, tenant)]);
    const saves = nativeCalls.filter(call => call.name === "write_tenant_booking_settings_fields");
    expect(saves).toHaveLength(2);
    expect(nativeCalls.some(call => call.name === "read_tenant_booking_context" || call.name === "upsert_tenant_booking_settings")).toBe(false);
    expect(Object.keys(saves.find(call => call.args.p_kind === "config")!.args.p_settings as object).sort()).toEqual([
      "bookableHours", "bufferMinutes", "defaultLengthMinutes", "legacyRequiresPayment", "maxAdvanceDays", "minNoticeMinutes", "timezone",
    ]);
    expect(Object.keys(saves.find(call => call.args.p_kind === "overrides")!.args.p_settings as object)).toEqual(["bookableOverrides"]);
    expect(native.settings.get(stableId)).toMatchObject({ mode: "request", maxPerDay: 4, defaultLengthMinutes: 45, bufferMinutes: 10 });
  });
  it("rejects unknown native scope before writing rollback cache", async () => {
    vi.stubEnv("STRELVA_BOOKING_STORE_READ", "postgres"); vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1");
    await expect(setBookingConfig(config, "unknown-owner")).rejects.toThrow();
    await expect(setDateOverrides(overrides, "unknown-owner")).rejects.toThrow();
    expect(cache.writes).toEqual([]);
  });
  it("refuses selected native write/read failures without mutating or serving a stale cache", async () => {
    vi.stubEnv("STRELVA_BOOKING_STORE_READ", "postgres"); vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1");
    cache.rows.set(`reb:booking:config:${tenant}`, config); cache.rows.set(`reb:booking:overrides:${tenant}`, overrides);
    const before = structuredClone(native.settings.get(stableId)); nativeFailure = "write";
    await expect(setBookingConfig(config, tenant)).rejects.toThrow();
    await expect(setDateOverrides(overrides, tenant)).rejects.toThrow();
    expect(cache.writes).toEqual([]); expect(native.settings.get(stableId)).toEqual(before);
    nativeFailure = "read";
    await expect(getBookingConfig(tenant)).rejects.toThrow(); await expect(getDateOverrides(tenant)).rejects.toThrow();
    // Narrow primary writes need no companion/context read and remain authoritative.
    await setBookingConfig(config, tenant); await setDateOverrides(overrides, tenant);
    expect(native.settings.get(stableId)).toMatchObject({ defaultLengthMinutes: 45, bufferMinutes: 10 });
  });
});

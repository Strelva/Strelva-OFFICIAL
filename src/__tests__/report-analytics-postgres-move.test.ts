import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());
vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));
vi.mock("@/lib/tenants", () => ({
  getTenantConfig: vi.fn(async () => ({ id: "gldf", siteUrl: "https://www.gldf.com" })),
}));

import { setRedisMoveDb, type RedisMoveDb } from "@/lib/storage/redis-move";
import {
  getLastReportSentAt,
  getReportCadence,
  isReportDue,
  markReportSent,
  setReportCadence,
} from "@/lib/report-cadence";
import { getAnalyticsConfig, setAnalyticsConfig } from "@/lib/analytics";

const DAY_MS = 24 * 60 * 60 * 1000;
// Mid-month, so a monthly tenant sent 10 days ago is not due.
const NOW = new Date("2026-10-15T15:00:00Z");

function fakeRedis(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    store,
    get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return "OK";
    }),
  };
}

type Handler = (args: Record<string, unknown>) => { data: unknown; error: { message?: string; code?: string } | null } | Promise<never>;
function fakeDb(handlers: Record<string, Handler>) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const db: RedisMoveDb = {
    rpc(name, args) {
      calls.push({ name, args });
      const handler = handlers[name];
      if (!handler) return Promise.resolve({ data: null, error: { message: `unexpected ${name}` } });
      return Promise.resolve(handler(args));
    },
  };
  return { db, calls };
}

const missingFunction = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
const failing = () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });

let redis: ReturnType<typeof fakeRedis>;
beforeEach(() => {
  redis = fakeRedis();
  mockGetRedis.mockReturnValue(redis);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  setRedisMoveDb(undefined);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("report cadence and last-sent, Postgres first", () => {
  it("uses the Postgres row when it has one", async () => {
    redis.store.set("reb:report-cadence:gldf", "monthly");
    setRedisMoveDb(fakeDb({ read_tenant_report_state: () => ({ data: { cadence: "weekly", lastSentAt: NOW.getTime() - 7 * DAY_MS }, error: null }) }).db);
    expect(await getReportCadence("gldf")).toBe("weekly");
    const decision = await isReportDue("gldf", NOW);
    expect(decision).toEqual({ send: true, cadence: "weekly", lastSentAt: NOW.getTime() - 7 * DAY_MS });
  });

  it("falls back to the reb: keys when Postgres has no row", async () => {
    redis.store.set("reb:report-cadence:gldf", "weekly");
    redis.store.set("reb:report-sent:gldf", String(NOW.getTime() - 2 * DAY_MS));
    setRedisMoveDb(fakeDb({ read_tenant_report_state: () => ({ data: null, error: null }) }).db);
    expect(await getReportCadence("gldf")).toBe("weekly");
    expect(await isReportDue("gldf", NOW)).toEqual({ send: false, cadence: "weekly", lastSentAt: NOW.getTime() - 2 * DAY_MS });
  });

  it("falls back to the reb: keys when Postgres errors or the migration is missing", async () => {
    redis.store.set("reb:report-cadence:gldf", "weekly");
    for (const handler of [failing, missingFunction]) {
      setRedisMoveDb(fakeDb({ read_tenant_report_state: handler }).db);
      expect(await getReportCadence("gldf")).toBe("weekly");
    }
  });

  it("falls back when Postgres does not answer in time", async () => {
    vi.useFakeTimers();
    try {
      redis.store.set("reb:report-cadence:gldf", "weekly");
      setRedisMoveDb({ rpc: () => new Promise(() => undefined) });
      const pending = getReportCadence("gldf");
      await vi.advanceTimersByTimeAsync(1600);
      expect(await pending).toBe("weekly");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never sends twice when only the Redis marker records the last send", async () => {
    // Postgres has a row (cadence copied) but its marker missed the last send.
    redis.store.set("reb:report-sent:gldf", String(NOW.getTime() - 10 * DAY_MS));
    setRedisMoveDb(fakeDb({ read_tenant_report_state: () => ({ data: { cadence: "monthly", lastSentAt: NOW.getTime() - 40 * DAY_MS }, error: null }) }).db);
    const decision = await isReportDue("gldf", NOW);
    expect(decision.send).toBe(false);
    expect(decision.lastSentAt).toBe(NOW.getTime() - 10 * DAY_MS);
    expect(await getLastReportSentAt("gldf")).toBe(NOW.getTime() - 10 * DAY_MS);
  });

  it("uses the Postgres marker when the Redis one was lost", async () => {
    setRedisMoveDb(fakeDb({ read_tenant_report_state: () => ({ data: { cadence: null, lastSentAt: NOW.getTime() - 10 * DAY_MS }, error: null }) }).db);
    expect(await isReportDue("gldf", NOW)).toEqual({ send: false, cadence: "monthly", lastSentAt: NOW.getTime() - 10 * DAY_MS });
  });

  it("defaults to monthly and first-send with neither store", async () => {
    mockGetRedis.mockReturnValue(null);
    setRedisMoveDb(null);
    expect(await isReportDue("gldf", NOW)).toEqual({ send: true, cadence: "monthly", lastSentAt: null });
  });

  it("marks a send in both stores", async () => {
    const { db, calls } = fakeDb({ mark_tenant_report_sent: () => ({ data: { lastSentAt: NOW.getTime() }, error: null }) });
    setRedisMoveDb(db);
    await markReportSent("gldf", NOW.getTime());
    expect(calls).toEqual([{ name: "mark_tenant_report_sent", args: { p_tenant_id: "gldf", p_sent_at: NOW.toISOString(), p_via: "dual_write" } }]);
    expect(redis.store.get("reb:report-sent:gldf")).toBe(String(NOW.getTime()));
  });

  it("still marks Redis and never throws when Postgres fails", async () => {
    setRedisMoveDb(fakeDb({ mark_tenant_report_sent: failing }).db);
    await expect(markReportSent("gldf", NOW.getTime())).resolves.toBeUndefined();
    expect(redis.store.get("reb:report-sent:gldf")).toBe(String(NOW.getTime()));
    expect(console.error).toHaveBeenCalled();
  });

  it("never throws when both stores fail", async () => {
    redis.set.mockRejectedValue(new Error("redis down"));
    setRedisMoveDb(fakeDb({ mark_tenant_report_sent: failing }).db);
    await expect(markReportSent("gldf", NOW.getTime())).resolves.toBeUndefined();
  });

  it("sets cadence in both stores", async () => {
    const { db, calls } = fakeDb({ set_tenant_report_cadence: () => ({ data: { cadence: "weekly" }, error: null }) });
    setRedisMoveDb(db);
    expect(await setReportCadence("gldf", "weekly")).toBe("weekly");
    expect(calls[0]).toEqual({ name: "set_tenant_report_cadence", args: { p_tenant_id: "gldf", p_cadence: "weekly", p_via: "dual_write" } });
    expect(redis.store.get("reb:report-cadence:gldf")).toBe("weekly");
  });

  it("refuses a cadence change Postgres could not save, and leaves Redis alone", async () => {
    redis.store.set("reb:report-cadence:gldf", "monthly");
    setRedisMoveDb(fakeDb({ set_tenant_report_cadence: failing }).db);
    await expect(setReportCadence("gldf", "weekly")).rejects.toThrow("Report cadence could not be saved");
    expect(redis.store.get("reb:report-cadence:gldf")).toBe("monthly");
  });

  it("writes Redis alone before the migration is applied or for a Redis-only tenant", async () => {
    for (const handler of [missingFunction, () => ({ data: null, error: { message: "tenant_report_unknown_tenant" } })]) {
      setRedisMoveDb(fakeDb({ set_tenant_report_cadence: handler }).db);
      expect(await setReportCadence("gldf", "weekly")).toBe("weekly");
      expect(redis.store.get("reb:report-cadence:gldf")).toBe("weekly");
      redis.store.delete("reb:report-cadence:gldf");
    }
  });

  it("DUAL_WRITE_PG=0 keeps Postgres out of reads and writes", async () => {
    vi.stubEnv("DUAL_WRITE_PG", "0");
    const { db, calls } = fakeDb({});
    setRedisMoveDb(db);
    redis.store.set("reb:report-cadence:gldf", "weekly");
    expect(await getReportCadence("gldf")).toBe("weekly");
    await setReportCadence("gldf", "monthly");
    await markReportSent("gldf", NOW.getTime());
    expect(calls).toEqual([]);
  });
});

describe("analytics config, Postgres first", () => {
  const pgConfig = { gscProperty: "sc-domain:pg.example.test", ga4PropertyId: "111", updatedAt: "2026-10-01T00:00:00.000Z" };
  const redisConfig = { gscProperty: "sc-domain:redis.example.test", ga4PropertyId: "222", updatedAt: "2026-09-01T00:00:00.000Z" };

  it("uses the Postgres row when it has one", async () => {
    redis.store.set("analytics:cfg:gldf", redisConfig);
    setRedisMoveDb(fakeDb({ read_tenant_analytics_config: () => ({ data: pgConfig, error: null }) }).db);
    expect(await getAnalyticsConfig("gldf")).toEqual({ tenantId: "gldf", ...pgConfig });
  });

  it("falls back to analytics:cfg when Postgres has no row or fails", async () => {
    redis.store.set("analytics:cfg:gldf", redisConfig);
    for (const handler of [() => ({ data: null, error: null }), failing, missingFunction]) {
      setRedisMoveDb(fakeDb({ read_tenant_analytics_config: handler }).db);
      expect(await getAnalyticsConfig("gldf")).toEqual({ tenantId: "gldf", ...redisConfig });
    }
  });

  it("still derives the GSC default from siteUrl when neither store has a property", async () => {
    setRedisMoveDb(fakeDb({ read_tenant_analytics_config: () => ({ data: { gscProperty: null, ga4PropertyId: "9", updatedAt: null }, error: null }) }).db);
    expect((await getAnalyticsConfig("gldf")).gscProperty).toBe("sc-domain:gldf.com");
  });

  it("writes the merged config to both stores", async () => {
    const { db, calls } = fakeDb({
      read_tenant_analytics_config: () => ({ data: pgConfig, error: null }),
      write_tenant_analytics_config: () => ({ data: { status: "written" }, error: null }),
    });
    setRedisMoveDb(db);
    const next = await setAnalyticsConfig("gldf", { ga4PropertyId: "333" });
    expect(next.gscProperty).toBe(pgConfig.gscProperty);
    expect(next.ga4PropertyId).toBe("333");
    const write = calls.find((c) => c.name === "write_tenant_analytics_config");
    expect(write?.args).toMatchObject({ p_tenant_id: "gldf", p_via: "dual_write", p_config: { gscProperty: pgConfig.gscProperty, ga4PropertyId: "333" } });
    expect(redis.store.get("analytics:cfg:gldf")).toMatchObject({ gscProperty: pgConfig.gscProperty, ga4PropertyId: "333" });
  });

  it("throws when Postgres cannot save, and leaves Redis alone", async () => {
    redis.store.set("analytics:cfg:gldf", redisConfig);
    setRedisMoveDb(fakeDb({ read_tenant_analytics_config: () => ({ data: null, error: null }), write_tenant_analytics_config: failing }).db);
    await expect(setAnalyticsConfig("gldf", { ga4PropertyId: "333" })).rejects.toThrow("Analytics config could not be saved");
    expect(redis.store.get("analytics:cfg:gldf")).toEqual(redisConfig);
  });

  it("writes Redis alone before the migration is applied", async () => {
    setRedisMoveDb(fakeDb({ read_tenant_analytics_config: missingFunction, write_tenant_analytics_config: missingFunction }).db);
    await setAnalyticsConfig("gldf", { ga4PropertyId: "444" });
    expect(redis.store.get("analytics:cfg:gldf")).toMatchObject({ ga4PropertyId: "444" });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

// Mutable mock so individual tests can swap in a null client (no-Redis path).
const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  zadd: vi.fn(),
  zrange: vi.fn(),
  zremrangebyrank: vi.fn(),
};
let redisClient: typeof mockRedis | null = mockRedis;

vi.mock("../lib/redis", () => ({
  getRedis: () => redisClient,
}));

const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock("../lib/logger", () => ({ logger: loggerMock }));

import { recordHeartbeat, checkHeartbeats, CRON_MAX_AGE_SECONDS } from "../lib/heartbeat";
import { recordMailSend, getMailLog } from "../lib/storage/mail-log";
import { alertOnce } from "../lib/monitoring";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  redisClient = mockRedis;
});

describe("cron heartbeat", () => {
  it("monitors every scheduled business cron", () => {
    expect(CRON_MAX_AGE_SECONDS).toHaveProperty("monthly-report");
    expect(CRON_MAX_AGE_SECONDS).toHaveProperty("order-review-request");
  });

  it("records a heartbeat under reb:heartbeat:{cron} with a TTL", async () => {
    mockRedis.set.mockResolvedValue("OK");
    await recordHeartbeat("weekly-report", { ok: true, processed: 3 });
    expect(mockRedis.set).toHaveBeenCalledTimes(1);
    const [key, payload, opts] = mockRedis.set.mock.calls[0];
    expect(key).toBe("reb:heartbeat:weekly-report");
    expect(payload).toMatchObject({ cron: "weekly-report", ok: true, processed: 3 });
    expect(opts).toMatchObject({ ex: expect.any(Number) });
  });

  it("never throws into the cron when the write fails", async () => {
    mockRedis.set.mockRejectedValue(new Error("redis down"));
    await expect(recordHeartbeat("staleness")).resolves.toBeUndefined();
  });

  it("flags a missing heartbeat as stale and a fresh one as healthy", async () => {
    const now = 1_000_000_000_000;
    // weekly-report fresh (1 min ago); everything else missing.
    mockRedis.get.mockImplementation((key: string) =>
      key === "reb:heartbeat:weekly-report"
        ? Promise.resolve({ cron: "weekly-report", ts: now - 60_000, ok: true })
        : Promise.resolve(null),
    );
    const statuses = await checkHeartbeats(now);
    const weekly = statuses.find((s) => s.cron === "weekly-report")!;
    const missing = statuses.find((s) => s.cron === "staleness")!;
    expect(weekly.stale).toBe(false);
    expect(weekly.lastOk).toBe(true);
    expect(missing.stale).toBe(true);
    expect(missing.lastSeen).toBeNull();
  });

  it("flags a heartbeat older than its max-age as stale", async () => {
    const now = 1_000_000_000_000;
    const tooOld = now - (CRON_MAX_AGE_SECONDS["staleness"] + 3600) * 1000;
    mockRedis.get.mockImplementation((key: string) =>
      key === "reb:heartbeat:staleness"
        ? Promise.resolve({ cron: "staleness", ts: tooOld, ok: true })
        : Promise.resolve(null),
    );
    const statuses = await checkHeartbeats(now);
    expect(statuses.find((s) => s.cron === "staleness")!.stale).toBe(true);
  });

  it("does not false-alarm when Redis is unavailable", async () => {
    redisClient = null;
    const statuses = await checkHeartbeats();
    expect(statuses.every((s) => s.stale === false)).toBe(true);
  });
});

describe("mail-send log", () => {
  it("records a send to a sorted set and trims to the cap", async () => {
    mockRedis.zadd.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.zremrangebyrank.mockResolvedValue(0);
    await recordMailSend("gldf", "weekly_report", { ok: true, messageId: "abc", to: "x@y.com" });
    expect(mockRedis.zadd).toHaveBeenCalledTimes(1);
    const [key, entry] = mockRedis.zadd.mock.calls[0];
    expect(key).toBe("reb:maillog:gldf");
    const record = JSON.parse(entry.member);
    expect(record).toMatchObject({ tenant: "gldf", kind: "weekly_report", ok: true, messageId: "abc" });
    expect(mockRedis.zremrangebyrank).toHaveBeenCalled();
  });

  it("never throws into the send path on a log failure", async () => {
    mockRedis.zadd.mockRejectedValue(new Error("redis down"));
    await expect(recordMailSend("gldf", "weekly_report", { ok: false, error: "boom" })).resolves.toBeUndefined();
  });

  it("reads recent records newest-first and drops malformed entries", async () => {
    mockRedis.zrange.mockResolvedValue([
      JSON.stringify({ tenant: "gldf", kind: "weekly_report", ok: true, ts: 2 }),
      "not-json",
      JSON.stringify({ tenant: "gldf", kind: "weekly_report", ok: false, ts: 1 }),
    ]);
    const records = await getMailLog("gldf");
    expect(records).toHaveLength(2);
    expect(records[0].ts).toBe(2);
    expect(mockRedis.zrange).toHaveBeenCalledWith("reb:maillog:gldf", 0, 49, { rev: true });
  });

  it("returns an empty log when Redis is unavailable", async () => {
    redisClient = null;
    expect(await getMailLog("gldf")).toEqual([]);
  });
});

describe("alertOnce dedup", () => {
  it("rolls medium severity into a counter instead of paging", async () => {
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    await alertOnce("slow_thing", "medium", { tenant: "gldf" });
    expect(mockRedis.incr).toHaveBeenCalledWith("reb:alert-count:medium:slow_thing");
    expect(mockRedis.expire).toHaveBeenCalledWith("reb:alert-count:medium:slow_thing", 24 * 3600, "NX");
    // medium never pages
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it("fires a high alert once and suppresses the duplicate within the window", async () => {
    // First SET NX returns OK (fresh), second returns null (already set).
    mockRedis.set.mockResolvedValueOnce("OK").mockResolvedValueOnce(null);
    await alertOnce("cron_stale", "high", { cron: "weekly-report" });
    await alertOnce("cron_stale", "high", { cron: "weekly-report" });
    expect(mockRedis.set).toHaveBeenCalledTimes(2);
    // alert() (logger.error) ran only on the fresh first call.
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
  });

  it("falls through to a plain alert when Redis is unavailable", async () => {
    redisClient = null;
    await alertOnce("cron_stale", "high", { cron: "x" });
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    redisClient = mockRedis;
  });
});

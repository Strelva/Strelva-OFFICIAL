import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());
const mockGetActivity = vi.hoisted(() => vi.fn());
const mockGetAllTenants = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockGetEffectiveSubscriptionStatus = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));
vi.mock("@/lib/storage", () => ({
  getActivity: (...args: unknown[]) => mockGetActivity(...args),
}));
vi.mock("@/lib/tenants", () => ({
  getAllTenants: (...args: unknown[]) => mockGetAllTenants(...args),
  getTenantConfig: (...args: unknown[]) => mockGetTenantConfig(...args),
  // Real pure impl — cheaper to reproduce than to stub per test.
  isActiveTenant: (t: { active?: boolean }) => t.active !== false,
}));
vi.mock("@/lib/subscription", () => ({
  getEffectiveSubscriptionStatus: (...args: unknown[]) => mockGetEffectiveSubscriptionStatus(...args),
}));

import {
  recordDailyEngagement,
  getEngagement7d,
  getTenantAtRisk,
  getAtRiskTenants,
} from "@/lib/churn";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Same key shape as churn.ts. */
function dayKey(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * DAY_MS).toISOString().slice(0, 10);
}
function engagementKey(tenant: string, offsetDays: number): string {
  return `reb:engagement:${tenant}:${dayKey(offsetDays)}`;
}
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/** A Map-backed fake of the Upstash client (only set + mget). */
function fakeRedis() {
  const store = new Map<string, number>();
  return {
    store,
    set: vi.fn(async (key: string, value: number) => {
      store.set(key, value);
      return "OK";
    }),
    mget: vi.fn(async (...keys: string[]) => keys.map((k) => (store.has(k) ? store.get(k)! : null))),
  };
}

function tenant(overrides: Record<string, unknown>) {
  return { active: true, siteName: "Site", subscriptionStatus: "active", ...overrides };
}

beforeEach(() => vi.clearAllMocks());

describe("recordDailyEngagement + getEngagement7d", () => {
  it("rolls the last 7 daily counts and ignores days outside the window", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);

    // Counts for today .. 6 days ago sum to 28.
    const counts = [1, 2, 3, 4, 5, 6, 7];
    for (let i = 0; i < counts.length; i++) {
      await recordDailyEngagement("gldf", counts[i], dayKey(i));
    }
    // An 8th day (outside the 7-day window) must not be counted.
    await recordDailyEngagement("gldf", 100, dayKey(7));

    expect(redis.store.get(engagementKey("gldf", 0))).toBe(1);
    expect(await getEngagement7d("gldf")).toBe(28);
  });

  it("writes the per-day key with a TTL", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    await recordDailyEngagement("gldf", 5, dayKey(0));
    expect(redis.set).toHaveBeenCalledWith(
      engagementKey("gldf", 0),
      5,
      expect.objectContaining({ ex: expect.any(Number) })
    );
  });

  it("getEngagement7d returns 0 with no data", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    expect(await getEngagement7d("empty")).toBe(0);
  });
});

describe("getTenantAtRisk — each reason fires", () => {
  it("flags long owner inactivity", async () => {
    const redis = fakeRedis();
    redis.store.set(engagementKey("t", 0), 4); // has AI use, so only inactivity fires
    mockGetRedis.mockReturnValue(redis);
    mockGetTenantConfig.mockResolvedValue(tenant({ id: "t" }));
    mockGetActivity.mockResolvedValue([{ time: isoDaysAgo(24) }]);
    mockGetEffectiveSubscriptionStatus.mockResolvedValue("active");

    const s = await getTenantAtRisk("t");
    expect(s.atRisk).toBe(true);
    expect(s.reasons).toEqual(["No owner activity in 24 days"]);
    expect(s.daysSinceActivity).toBe(24);
    expect(s.engagement7d).toBe(4);
  });

  it("flags zero AI use for an active, subscribed tenant once history exists", async () => {
    const redis = fakeRedis();
    for (let i = 0; i < 6; i++) redis.store.set(engagementKey("t", i), 0); // 6 recorded 0-days
    mockGetRedis.mockReturnValue(redis);
    mockGetTenantConfig.mockResolvedValue(tenant({ id: "t" }));
    mockGetActivity.mockResolvedValue([{ time: isoDaysAgo(1) }]); // recent → no inactivity
    mockGetEffectiveSubscriptionStatus.mockResolvedValue("active");

    const s = await getTenantAtRisk("t");
    expect(s.reasons).toEqual(["No AI use in 7 days"]);
    expect(s.engagement7d).toBe(0);
  });

  it("does NOT flag zero AI use before enough history exists (cold start)", async () => {
    const redis = fakeRedis();
    redis.store.set(engagementKey("t", 0), 0); // only 1 recorded day — not enough
    mockGetRedis.mockReturnValue(redis);
    mockGetTenantConfig.mockResolvedValue(tenant({ id: "t" }));
    mockGetActivity.mockResolvedValue([{ time: isoDaysAgo(1) }]); // recent → no inactivity
    mockGetEffectiveSubscriptionStatus.mockResolvedValue("active");

    const s = await getTenantAtRisk("t");
    expect(s.atRisk).toBe(false);
    expect(s.reasons).toEqual([]);
  });

  it("flags past_due subscriptions", async () => {
    const redis = fakeRedis();
    redis.store.set(engagementKey("t", 0), 3);
    mockGetRedis.mockReturnValue(redis);
    mockGetTenantConfig.mockResolvedValue(tenant({ id: "t", subscriptionStatus: "past_due" }));
    mockGetActivity.mockResolvedValue([{ time: isoDaysAgo(1) }]);
    mockGetEffectiveSubscriptionStatus.mockResolvedValue("past_due");

    const s = await getTenantAtRisk("t");
    expect(s.reasons).toEqual(["Subscription past due"]);
    expect(s.subscriptionStatus).toBe("past_due");
  });

  it("flags cancelled subscriptions", async () => {
    const redis = fakeRedis();
    redis.store.set(engagementKey("t", 0), 3);
    mockGetRedis.mockReturnValue(redis);
    mockGetTenantConfig.mockResolvedValue(tenant({ id: "t", subscriptionStatus: "cancelled" }));
    mockGetActivity.mockResolvedValue([{ time: isoDaysAgo(1) }]);
    mockGetEffectiveSubscriptionStatus.mockResolvedValue("cancelled");

    const s = await getTenantAtRisk("t");
    expect(s.reasons).toEqual(["Subscription cancelled"]);
  });

  it("returns not-at-risk for a healthy tenant", async () => {
    const redis = fakeRedis();
    redis.store.set(engagementKey("t", 0), 6);
    mockGetRedis.mockReturnValue(redis);
    mockGetTenantConfig.mockResolvedValue(tenant({ id: "t" }));
    mockGetActivity.mockResolvedValue([{ time: isoDaysAgo(2) }]);
    mockGetEffectiveSubscriptionStatus.mockResolvedValue("active");

    const s = await getTenantAtRisk("t");
    expect(s.atRisk).toBe(false);
    expect(s.reasons).toEqual([]);
  });

  it("returns an empty signal for an unknown tenant", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    mockGetTenantConfig.mockResolvedValue(null);
    const s = await getTenantAtRisk("nope");
    expect(s).toEqual({
      tenantId: "nope",
      atRisk: false,
      reasons: [],
      daysSinceActivity: null,
      engagement7d: 0,
      subscriptionStatus: null,
    });
  });
});

describe("getAtRiskTenants", () => {
  it("returns only at-risk tenants, worst first", async () => {
    const redis = fakeRedis();
    redis.store.set(engagementKey("a", 0), 5); // healthy has AI use
    redis.store.set(engagementKey("b", 0), 5); // cancelled has AI use → 1 reason
    // c: 6 recorded 0-days → enough history to flag no-AI-use
    for (let i = 0; i < 6; i++) redis.store.set(engagementKey("c", i), 0);
    mockGetRedis.mockReturnValue(redis);

    mockGetAllTenants.mockResolvedValue([
      tenant({ id: "a", siteName: "Alpha" }),
      tenant({ id: "b", siteName: "Bravo" }),
      tenant({ id: "c", siteName: "Charlie" }),
    ]);
    mockGetActivity.mockImplementation((id: string) =>
      Promise.resolve([{ time: id === "c" ? isoDaysAgo(40) : isoDaysAgo(2) }])
    );
    mockGetEffectiveSubscriptionStatus.mockImplementation((id: string) =>
      Promise.resolve(id === "b" ? "cancelled" : "active")
    );

    const result = await getAtRiskTenants();
    // a is healthy (excluded); c has 2 reasons (inactivity + no AI), b has 1.
    expect(result.map((s) => s.tenantId)).toEqual(["c", "b"]);
    expect(result[0].reasons).toEqual(["No owner activity in 40 days", "No AI use in 7 days"]);
    expect(result[1].reasons).toEqual(["Subscription cancelled"]);
  });
});

describe("degrades without Redis", () => {
  it("engagement7d reads 0 and inactivity still computes; no-AI is suppressed with no history", async () => {
    mockGetRedis.mockReturnValue(null);
    mockGetTenantConfig.mockResolvedValue(tenant({ id: "t" }));
    mockGetActivity.mockResolvedValue([{ time: isoDaysAgo(25) }]);
    mockGetEffectiveSubscriptionStatus.mockResolvedValue("active");

    const s = await getTenantAtRisk("t");
    expect(s.engagement7d).toBe(0);
    expect(s.atRisk).toBe(true);
    // Without Redis there is no recorded history, so "no AI use" cannot fire —
    // only the inactivity reason, computed from tenant data, remains.
    expect(s.reasons).toEqual(["No owner activity in 25 days"]);
  });

  it("getEngagement7d returns 0 when Redis is unconfigured", async () => {
    mockGetRedis.mockReturnValue(null);
    expect(await getEngagement7d("t")).toBe(0);
    await expect(recordDailyEngagement("t", 5)).resolves.toBeUndefined();
  });
});

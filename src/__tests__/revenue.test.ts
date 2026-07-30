import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());
vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));

import { listBuildPayments, buildRevenueSummary } from "@/lib/revenue";

const P1 = { sessionId: "s1", amountCents: 150_000, currency: "usd", createdAt: "2026-06-10T00:00:00Z" };
const P2 = { sessionId: "s2", amountCents: 50_000, currency: "usd", createdAt: "2026-06-12T00:00:00Z" };

/**
 * Build a fake Redis client that exercises the sorted-set index path
 * (zcard > 0 → zrange REV → mget). sessionIds are ordered newest-first
 * (as zrange REV would return them); records must align positionally.
 */
function fakeRedisWithIndex(sessionIds: string[], records: unknown[]) {
  return {
    zcard: vi.fn().mockResolvedValue(sessionIds.length),
    zrange: vi.fn().mockResolvedValue(sessionIds),
    mget: vi.fn().mockResolvedValue(records),
    zadd: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
  };
}

/**
 * Build a fake Redis client that forces the KEYS fallback path
 * (zcard returns 0 → keys → mget).
 */
function fakeRedisKeysPath(keys: string[], records: unknown[]) {
  return {
    zcard: vi.fn().mockResolvedValue(0),
    zrange: vi.fn().mockResolvedValue([]),
    mget: vi.fn().mockResolvedValue(records),
    zadd: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue(keys),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("revenue", () => {
  it("returns [] without Redis", async () => {
    mockGetRedis.mockReturnValue(null);
    expect(await listBuildPayments()).toEqual([]);
  });

  it("returns [] when there are no payment keys", async () => {
    // zcard returns 0 (empty index), keys fallback also returns empty
    mockGetRedis.mockReturnValue(fakeRedisKeysPath([], []));
    expect(await listBuildPayments()).toEqual([]);
  });

  it("sorts payments newest-first and drops null records", async () => {
    // zrange REV returns session ids newest-first (s2 Jun 12 > s1 Jun 10);
    // "gone" has no record (null) and must be filtered out.
    mockGetRedis.mockReturnValue(
      fakeRedisWithIndex(["s2", "s1", "gone"], [P2, P1, null])
    );
    const list = await listBuildPayments();
    expect(list.map((p) => p.sessionId)).toEqual(["s2", "s1"]);
  });

  it("summarizes total collected", async () => {
    mockGetRedis.mockReturnValue(fakeRedisWithIndex(["s2", "s1"], [P2, P1]));
    const summary = await buildRevenueSummary();
    expect(summary.totalCents).toBe(200_000);
    expect(summary.count).toBe(2);
    expect(summary.currency).toBe("usd");
  });
});

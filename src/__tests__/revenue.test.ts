import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());
vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));

import { listBuildPayments, buildRevenueSummary } from "@/lib/revenue";

const P1 = { sessionId: "s1", amountCents: 150_000, currency: "usd", createdAt: "2026-06-10T00:00:00Z" };
const P2 = { sessionId: "s2", amountCents: 50_000, currency: "usd", createdAt: "2026-06-12T00:00:00Z" };

function fakeRedis(keys: string[], records: unknown[]) {
  return {
    keys: vi.fn().mockResolvedValue(keys),
    mget: vi.fn().mockResolvedValue(records),
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
    mockGetRedis.mockReturnValue(fakeRedis([], []));
    expect(await listBuildPayments()).toEqual([]);
  });

  it("sorts payments newest-first and drops null records", async () => {
    mockGetRedis.mockReturnValue(
      fakeRedis(["reb:build-payment:s1", "reb:build-payment:s2", "reb:build-payment:gone"], [P1, P2, null])
    );
    const list = await listBuildPayments();
    expect(list.map((p) => p.sessionId)).toEqual(["s2", "s1"]);
  });

  it("summarizes total collected", async () => {
    mockGetRedis.mockReturnValue(fakeRedis(["a", "b"], [P1, P2]));
    const summary = await buildRevenueSummary();
    expect(summary.totalCents).toBe(200_000);
    expect(summary.count).toBe(2);
    expect(summary.currency).toBe("usd");
  });
});

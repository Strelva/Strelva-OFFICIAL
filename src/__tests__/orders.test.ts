import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory Redis covering exactly what orders.ts uses.
const store = new Map<string, unknown>();
const zsets = new Map<string, Map<string, number>>();
let clock = 1_000;

const mockRedis = {
  set: async (k: string, v: unknown, opts?: { nx?: boolean }) => {
    if (opts?.nx && store.has(k)) return null;
    store.set(k, v);
    return "OK";
  },
  get: async (k: string) => store.get(k) ?? null,
  mget: async (...keys: string[]) => keys.map((k) => store.get(k) ?? null),
  zadd: async (k: string, { score, member }: { score: number; member: string }) => {
    const z = zsets.get(k) ?? new Map<string, number>();
    z.set(member, score);
    zsets.set(k, z);
    return 1;
  },
  zrange: async (k: string, start: number, stop: number, opts?: { rev?: boolean }) => {
    const z = zsets.get(k) ?? new Map<string, number>();
    let arr = [...z.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
    if (opts?.rev) arr = arr.reverse();
    return arr.slice(start, stop + 1);
  },
  zremrangebyrank: async () => 0,
};

vi.mock("@/lib/redis", () => ({ getRedis: () => mockRedis }));

// orders.ts stamps createdAt from Date.now via new Date(); advance a fake clock
// so ordering + the 30-day window are deterministic.
beforeEach(() => {
  store.clear();
  zsets.clear();
  clock = Date.UTC(2026, 5, 1);
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  vi.useFakeTimers();
  vi.setSystemTime(clock);
});

import { recordOrder, getOrders, getOrderSummary } from "@/lib/orders";

describe("orders store", () => {
  it("records an order and reads it back", async () => {
    await recordOrder("t1", { amountCents: 2499, currency: "USD", items: [{ name: "Dried Mango", quantity: 2 }], externalId: "o1" });
    const orders = await getOrders("t1");
    expect(orders).toHaveLength(1);
    expect(orders[0].amountCents).toBe(2499);
    expect(orders[0].itemCount).toBe(2);
  });

  it("is idempotent on externalId — a retried beacon doesn't double-count", async () => {
    await recordOrder("t1", { amountCents: 1000, currency: "USD", items: [], externalId: "dup" });
    const second = await recordOrder("t1", { amountCents: 1000, currency: "USD", items: [], externalId: "dup" });
    expect(second).toBeNull();
    expect(await getOrders("t1")).toHaveLength(1);
  });

  it("returns newest orders first", async () => {
    await recordOrder("t1", { amountCents: 100, currency: "USD", items: [], externalId: "first" });
    clock += 60_000;
    vi.setSystemTime(clock);
    await recordOrder("t1", { amountCents: 200, currency: "USD", items: [], externalId: "second" });
    const orders = await getOrders("t1");
    expect(orders[0].externalId).toBe("second");
  });

  it("summarizes revenue, count, and best sellers", async () => {
    await recordOrder("t1", { amountCents: 2499, currency: "USD", items: [{ name: "Mango", quantity: 2 }], externalId: "a" });
    await recordOrder("t1", { amountCents: 1500, currency: "USD", items: [{ name: "Mango", quantity: 1 }, { name: "Apricot", quantity: 3 }], externalId: "b" });
    const s = await getOrderSummary("t1", 30);
    expect(s.orderCount).toBe(2);
    expect(s.revenueCents).toBe(3999);
    expect(s.currency).toBe("USD");
    expect(s.topProducts[0]).toEqual({ name: "Mango", quantity: 3 });
  });

  it("excludes orders outside the window", async () => {
    await recordOrder("t1", { amountCents: 5000, currency: "USD", items: [], externalId: "old" });
    clock += 40 * 24 * 60 * 60 * 1000; // 40 days later
    vi.setSystemTime(clock);
    await recordOrder("t1", { amountCents: 1000, currency: "USD", items: [], externalId: "new" });
    const s = await getOrderSummary("t1", 30);
    expect(s.orderCount).toBe(1);
    expect(s.revenueCents).toBe(1000);
  });
});

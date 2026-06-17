import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));

import {
  adjustStars,
  InsufficientStarsError,
  resolveTier,
  saveMember,
} from "@/lib/rewards/memberRepositoryKv";
import type { Member } from "@/lib/rewards/types";

/**
 * Stateful in-memory Redis double. JS is single-threaded, so each hincrby/hset
 * call runs to completion before the next — exactly the serialization Redis
 * gives us on the real server. That's what makes the concurrency assertions
 * below meaningful: Promise.all fans out N calls that the runtime interleaves
 * at await points, and the fake mutates shared state the same way Redis would.
 */
function fakeRedis() {
  const hashes = new Map<string, Map<string, string>>();
  const sets = new Map<string, Set<string>>();

  function hash(key: string): Map<string, string> {
    let h = hashes.get(key);
    if (!h) {
      h = new Map();
      hashes.set(key, h);
    }
    return h;
  }

  return {
    _hashes: hashes,
    hset: vi.fn(async (key: string, obj: Record<string, unknown>) => {
      const h = hash(key);
      for (const [k, v] of Object.entries(obj)) h.set(k, String(v));
      return Object.keys(obj).length;
    }),
    hgetall: vi.fn(async (key: string) => {
      const h = hashes.get(key);
      if (!h || h.size === 0) return null;
      return Object.fromEntries(h.entries());
    }),
    hincrby: vi.fn(async (key: string, field: string, amount: number) => {
      const h = hash(key);
      const next = (parseInt(h.get(field) ?? "0", 10) || 0) + amount;
      h.set(field, String(next));
      return next;
    }),
    sadd: vi.fn(async (key: string, member: string) => {
      let s = sets.get(key);
      if (!s) {
        s = new Set();
        sets.set(key, s);
      }
      const had = s.has(member);
      s.add(member);
      return had ? 0 : 1;
    }),
  };
}

const TENANT = "gldf";
const EMAIL = "snapper@example.com";

function baseMember(overrides: Partial<Member> = {}): Member {
  return {
    email: EMAIL,
    starsAvailable: 0,
    starsLifetime: 0,
    tier: "snapper",
    tierOverride: null,
    displayName: null,
    birthday: null,
    favoriteFruit: null,
    badges: [],
    subscriptionBonusClaimed: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveTier", () => {
  it("derives super-snapper at/above the threshold and snapper below", () => {
    expect(resolveTier(499, null)).toBe("snapper");
    expect(resolveTier(500, null)).toBe("super-snapper");
    expect(resolveTier(10_000, null)).toBe("super-snapper");
  });

  it("honors a manual override regardless of lifetime", () => {
    expect(resolveTier(0, "super-snapper")).toBe("super-snapper");
    expect(resolveTier(10_000, "snapper")).toBe("snapper");
  });
});

describe("adjustStars", () => {
  it("returns null for a member that does not exist", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    const result = await adjustStars(TENANT, "ghost@example.com", 50);
    expect(result).toBeNull();
    expect(redis.hincrby).not.toHaveBeenCalled();
  });

  it("earns: increments both starsAvailable and starsLifetime via hincrby", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    await saveMember(TENANT, baseMember({ starsAvailable: 100, starsLifetime: 100 }));

    const updated = await adjustStars(TENANT, EMAIL, 50);
    expect(updated?.starsAvailable).toBe(150);
    expect(updated?.starsLifetime).toBe(150);
    expect(redis.hincrby).toHaveBeenCalledWith(
      expect.stringContaining(EMAIL),
      "starsAvailable",
      50
    );
    expect(redis.hincrby).toHaveBeenCalledWith(
      expect.stringContaining(EMAIL),
      "starsLifetime",
      50
    );
  });

  it("redeems: decrements only starsAvailable, never starsLifetime", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    await saveMember(TENANT, baseMember({ starsAvailable: 100, starsLifetime: 300 }));

    const updated = await adjustStars(TENANT, EMAIL, -40);
    expect(updated?.starsAvailable).toBe(60);
    expect(updated?.starsLifetime).toBe(300);
  });

  it("rejects an overspend, rolls back the balance, and keeps it intact", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    await saveMember(TENANT, baseMember({ starsAvailable: 30, starsLifetime: 30 }));

    await expect(adjustStars(TENANT, EMAIL, -50)).rejects.toBeInstanceOf(
      InsufficientStarsError
    );

    // Balance must be exactly what it was — the decrement was rolled back.
    const after = redis._hashes.get(
      `reb:rewards:${TENANT}:member:${EMAIL}`
    );
    expect(after?.get("starsAvailable")).toBe("30");
  });

  it("promotes the tier when lifetime crosses the threshold", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    await saveMember(
      TENANT,
      baseMember({ starsAvailable: 490, starsLifetime: 490, tier: "snapper" })
    );

    const updated = await adjustStars(TENANT, EMAIL, 20);
    expect(updated?.starsLifetime).toBe(510);
    expect(updated?.tier).toBe("super-snapper");
    expect(redis.hset).toHaveBeenCalledWith(
      expect.stringContaining(EMAIL),
      { tier: "super-snapper" }
    );
  });

  it("never demotes below a tierOverride", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    await saveMember(
      TENANT,
      baseMember({
        starsAvailable: 0,
        starsLifetime: 0,
        tier: "super-snapper",
        tierOverride: "super-snapper",
      })
    );

    const updated = await adjustStars(TENANT, EMAIL, 10);
    expect(updated?.tier).toBe("super-snapper");
  });

  it("concurrent earns do not lose updates (atomic increment)", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    await saveMember(TENANT, baseMember({ starsAvailable: 0, starsLifetime: 0 }));

    // 20 concurrent earns of 10. A read-modify-write would lose updates here;
    // hincrby must land all of them.
    await Promise.all(
      Array.from({ length: 20 }, () => adjustStars(TENANT, EMAIL, 10))
    );

    const h = redis._hashes.get(`reb:rewards:${TENANT}:member:${EMAIL}`);
    expect(h?.get("starsAvailable")).toBe("200");
    expect(h?.get("starsLifetime")).toBe("200");
  });

  it("concurrent redeems never overspend a balance", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    // 100 stars, ten concurrent attempts to redeem 20 each (would need 200).
    await saveMember(TENANT, baseMember({ starsAvailable: 100, starsLifetime: 100 }));

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => adjustStars(TENANT, EMAIL, -20))
    );

    const ok = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof InsufficientStarsError
    ).length;

    // Exactly five redemptions of 20 fit in a 100 balance; the rest must reject.
    expect(ok).toBe(5);
    expect(rejected).toBe(5);

    const h = redis._hashes.get(`reb:rewards:${TENANT}:member:${EMAIL}`);
    const finalBalance = parseInt(h?.get("starsAvailable") ?? "0", 10);
    expect(finalBalance).toBe(0);
    expect(finalBalance).toBeGreaterThanOrEqual(0); // never negative
  });
});

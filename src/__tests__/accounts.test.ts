import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Operator account store (org layer). Backed by an in-memory Redis fake so we
 * exercise the real read-modify-write, the tenant reverse-lookup, single-account
 * membership (repoint), the recomputed bundle total, and MRR gating.
 */

// Minimal in-memory Redis implementing exactly what accounts.ts uses.
const store = new Map<string, unknown>();
const sets = new Map<string, Set<string>>();
const fakeRedis = {
  get: async (k: string) => (store.has(k) ? store.get(k) : null),
  set: async (k: string, v: unknown) => {
    store.set(k, v);
    return "OK";
  },
  del: async (k: string) => {
    store.delete(k);
    sets.delete(k);
    return 1;
  },
  mget: async (...keys: string[]) => keys.map((k) => (store.has(k) ? store.get(k) : null)),
  sadd: async (k: string, m: string) => {
    const s = sets.get(k) ?? new Set<string>();
    s.add(m);
    sets.set(k, s);
    return 1;
  },
  srem: async (k: string, m: string) => {
    sets.get(k)?.delete(m);
    return 1;
  },
  smembers: async (k: string) => Array.from(sets.get(k) ?? []),
};

vi.mock("@/lib/redis", () => ({ getRedis: () => fakeRedis }));

import {
  createAccount,
  getAccount,
  getAllAccounts,
  getAccountForTenant,
  linkTenantToAccount,
  unlinkTenant,
  setAccountSubscription,
  accountMrrCents,
} from "@/lib/accounts";

beforeEach(() => {
  store.clear();
  sets.clear();
});

describe("accounts store", () => {
  it("creates an account, indexes it, and pre-links sites", async () => {
    const acct = await createAccount({ name: "Andy Anderson", tenantIds: ["cocard-anderson"] });
    expect(acct.id).toContain("andy-anderson");
    expect(acct.tenantIds).toEqual(["cocard-anderson"]);

    const all = await getAllAccounts();
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe("Andy Anderson");

    // reverse lookup resolves the owning account
    const owner = await getAccountForTenant("cocard-anderson");
    expect(owner?.id).toBe(acct.id);
  });

  it("links + unlinks sites and keeps the reverse lookup in sync", async () => {
    const acct = await createAccount({ name: "Andy" });
    await linkTenantToAccount(acct.id, "cocard-anderson");
    await linkTenantToAccount(acct.id, "vermont-unlimited");

    let fresh = await getAccount(acct.id);
    expect(fresh?.tenantIds.sort()).toEqual(["cocard-anderson", "vermont-unlimited"]);

    await unlinkTenant(acct.id, "vermont-unlimited");
    fresh = await getAccount(acct.id);
    expect(fresh?.tenantIds).toEqual(["cocard-anderson"]);
    expect(await getAccountForTenant("vermont-unlimited")).toBeNull();
  });

  it("a site belongs to at most one account — linking repoints it", async () => {
    const a = await createAccount({ name: "Account A", tenantIds: ["site-x"] });
    const b = await createAccount({ name: "Account B" });
    await linkTenantToAccount(b.id, "site-x"); // steal it

    expect((await getAccount(a.id))?.tenantIds).toEqual([]);
    expect((await getAccount(b.id))?.tenantIds).toEqual(["site-x"]);
    expect((await getAccountForTenant("site-x"))?.id).toBe(b.id);
  });

  it("snapshots a bundled subscription and recomputes the total", async () => {
    const acct = await createAccount({ name: "Andy", tenantIds: ["cocard-anderson", "vermont-unlimited"] });
    const updated = await setAccountSubscription(acct.id, {
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      status: "active",
      items: [
        { tenantId: "cocard-anderson", label: "CoCard Anderson", amountCents: 19900 },
        { tenantId: "vermont-unlimited", label: "Vermont Unlimited", amountCents: 15100 },
      ],
    });
    expect(updated?.subscription?.amountCents).toBe(35000); // recomputed, not trusted from input
    expect(updated?.stripeCustomerId).toBe("cus_123");
    expect(accountMrrCents(updated!)).toBe(35000);
  });

  it("MRR is zero for a non-active subscription", async () => {
    const acct = await createAccount({ name: "Churned Co" });
    const updated = await setAccountSubscription(acct.id, {
      status: "canceled",
      items: [{ tenantId: "x", label: "X", amountCents: 19900 }],
    });
    expect(accountMrrCents(updated!)).toBe(0);
  });
});

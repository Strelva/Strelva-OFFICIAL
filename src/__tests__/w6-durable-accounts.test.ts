import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ redis: new Map<string, unknown>(), redisReads: [] as string[], rows: new Map<string, unknown[]>(), fail: false, days: 7 }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => ({
  get: async (key: string) => { state.redisReads.push(key); return state.redis.get(key) ?? null; },
  smembers: async () => [],
  mget: async (...keys: string[]) => keys.map(key => state.redis.get(key) ?? null),
}) }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: vi.fn(async () => [{ id: "one" }, { id: "two" }]) }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
import { getAccount, getAccountForTenant, getAllAccounts } from "@/lib/accounts";
import { setClientRecordDb } from "@/platform/client-records/mirror";

const account = { id: "bundle", name: "Two sites", tenantIds: ["one", "two"], status: "active", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-07T12:00:00Z", subscription: { items: [], amountCents: 30000 } };
beforeEach(() => {
  state.redis.clear(); state.redisReads.length = 0; state.rows.clear(); state.fail = false; state.days = 7;
  vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", "account_grouping");
  vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
  for (const tenant of account.tenantIds) state.rows.set(tenant, [{ recordId: account.id, payload: account, capturedAt: account.updatedAt }]);
  setClientRecordDb({ rpc: async (name, args) => state.fail ? { data: null, error: { message: "unavailable" } }
    : { data: name === "client_record_parity_streak" ? { days: state.days } : state.rows.get(String(args.p_tenant_id)) ?? [], error: null } });
});
afterEach(() => { setClientRecordDb(undefined); vi.unstubAllEnvs(); });

describe("durable account grouping reads", () => {
  it("resolves bundled billing after global and reverse Redis indexes disappear", async () => {
    expect(await getAccountForTenant("one")).toMatchObject(account);
    expect(await getAccount("bundle")).toMatchObject(account);
    const all = await getAllAccounts();
    expect(all).toHaveLength(1); expect(all[0]).toMatchObject(account);
  });
  it("keeps the exact Redis recipient grouping when flags are off", async () => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", "");
    state.redis.set("account-of:one", "old"); state.redis.set("account:old", { ...account, id: "old" });
    expect((await getAccountForTenant("one"))?.id).toBe("old");
    expect(await getAccount("bundle")).toBeNull(); expect(await getAllAccounts()).toEqual([]);
  });
  it("fails closed without reading Redis when requested durable authority is unavailable or unqualified", async () => {
    state.redis.set("account-of:one", "old"); state.redis.set("account:old", { ...account, id: "old" });
    state.fail = true;
    await expect(getAccountForTenant("one")).rejects.toThrow("client_records_parity_unavailable");
    expect(state.redisReads).toEqual([]);
    state.fail = false; state.days = 6;
    await expect(getAccountForTenant("one")).rejects.toThrow("client_records_cutover_not_qualified");
    expect(state.redisReads).toEqual([]);
  });
  it("does not return a stale grouping payload that excludes the requested site", async () => {
    state.rows.set("one", [{ recordId: account.id, payload: { ...account, tenantIds: ["two"] }, capturedAt: account.updatedAt }]);
    expect(await getAccountForTenant("one")).toBeNull();
  });
});

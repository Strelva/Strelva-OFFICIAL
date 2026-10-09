import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isolatedRedisAvailable, startIsolatedRedis, type IsolatedRedis } from "./support/isolated-redis";
const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => holder.client }));
vi.mock("@/lib/tenants", () => ({ invalidateDomainMapCache: vi.fn() }));
import { clearTenantDomainClaims } from "@/lib/domains";
import { REMOVE_OWNED_KEY } from "@/lib/deprovision";
import { unlinkTenant } from "@/lib/accounts";
vi.mock("@/lib/workspace-ports", () => ({ workspacePorts: () => ({ clientRecords: async () => ({ mirrorClientRecord: async () => true, mirrorClientRecordRemoval: async () => true }) }) }));

// Prepared actual-Lua qualification. This lane does not start a Redis process;
// the coordinator must explicitly grant its isolated verification window.
describe.skipIf(!isolatedRedisAvailable || process.env.STRELVA_TENANT_CLEANUP_REDIS_PROOF !== "1")("exact shared cleanup on isolated Redis", () => {
  let redis: IsolatedRedis;
  beforeAll(async () => { redis = await startIsolatedRedis("tenant-cleanup-receipts"); holder.client = redis.client; });
  afterAll(async () => { if (redis) await redis.stop(); });
  beforeEach(() => { redis.cli("FLUSHDB"); });
  it("atomically clears only the target's current claims, including claims absent from stale configuration", async () => {
    const other = { tenantId: "other-site", domain: "other.example.test", status: "verified" };
    redis.cli("SET", "reb:domain-claims", JSON.stringify({ "owned.example.test": { tenantId: "fictional-cleanup" }, "orphan.example.test": { tenantId: "fictional-cleanup" }, "other.example.test": other }));
    expect((await clearTenantDomainClaims({ id: "fictional-cleanup" })).sort()).toEqual(["orphan.example.test", "owned.example.test"]);
    expect(JSON.parse(redis.cli("GET", "reb:domain-claims") as string)).toEqual({ "other.example.test": other });
  });
  it("shared email invites and reassigned event/reply blobs are retained after an ownership change", async () => {
    for (const [key, field] of [["reb:invites:shared@example.test", "tenant"], ["event:shared", "tenantId"], ["reb:inquiry-reply-target:shared", "tenantId"]]) {
      const value = JSON.stringify({ [field!]: "other-site", receipt: "retain" });
      redis.cli("SET", key!, value);
      expect(await redis.client.eval(REMOVE_OWNED_KEY, [key!], ["fictional-cleanup", field!])).toBe(0);
      expect(redis.cli("GET", key!)).toBe(value);
    }
  });
  it("removes only the target from a shared account and preserves subscription/provider fields", async () => {
    const account = { id: "shared", name: "Shared fictional", status: "active", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", tenantIds: ["fictional-cleanup", "other-site"], subscription: { items: [{ tenantId: "other-site", amountCents: 1234 }] }, stripeCustomerId: "retained-fixture" };
    redis.cli("SET", "account-of:fictional-cleanup", "shared");
    redis.cli("SET", "account-of:other-site", "shared");
    redis.cli("SET", "account:shared", JSON.stringify(account));
    expect((await unlinkTenant("shared", "fictional-cleanup", { readRedisForCleanup: true }))?.tenantIds).toEqual(["other-site"]);
    expect(JSON.parse(redis.cli("GET", "account:shared") as string)).toMatchObject({ tenantIds: ["other-site"], stripeCustomerId: account.stripeCustomerId, subscription: { items: account.subscription.items } });
    expect(redis.cli("GET", "account-of:other-site")).toBe("shared");
  });
});

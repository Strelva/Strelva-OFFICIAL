import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startIsolatedRedis, type IsolatedRedis } from "./support/isolated-redis";
import { tenantCleanupPostgres } from "./support/tenant-cleanup-postgres";

const holder = vi.hoisted(() => ({ redis: null as unknown, db: null as unknown }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => holder.redis }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => holder.db }));
import { runDeprovision, readDeprovisionCleanup } from "@/lib/deprovision";

const enabled = process.env.STRELVA_TENANT_CLEANUP_NATIVE_PROOF === "1";
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

// Root-owned execution window only. The database must already have the actual
// complete forward migration chain, including guarded teardown + cleanup CAS.
// No fake tables/functions; all reads, checkpoints and final writes are native.
describe.skipIf(!enabled)("two cleanup workers on actual Postgres and Redis", () => {
  let redis: IsolatedRedis;
  let db: ReturnType<typeof tenantCleanupPostgres>;
  beforeAll(async () => {
    const connection = process.env.STRELVA_TENANT_CLEANUP_PSQL;
    if (!connection) throw new Error("STRELVA_TENANT_CLEANUP_PSQL must be JSON psql argv for the coordinator's migrated local cluster");
    db = tenantCleanupPostgres(connection);
    holder.db = db;
    redis = await startIsolatedRedis("tenant-cleanup-concurrent");
    holder.redis = redis.client;
    vi.stubEnv("VERCEL_API_TOKEN", ""); vi.stubEnv("VERCEL_TOKEN", "");
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
  });
  afterAll(async () => { if (redis) await redis.stop(); vi.unstubAllEnvs(); });

  it("keeps a native checkpoint through index loss, rejects the stale worker and converges both exact-receipt retries", async () => {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `cleanup-race-${suffix}`, other = `cleanup-other-${suffix}`, accountId = `shared-${suffix}`;
    const index = `account-of:${tenantId}`, accountKey = `account:${accountId}`;
    db.query("insert into public.tenants(id,site_name) values (:'v0','Race fictional'),(:'v1','Other fictional');", [tenantId, other]);
    const account = { id: accountId, name: "Shared fictional", status: "active", createdAt: "2026-10-08T00:00:00Z", updatedAt: "2026-10-08T00:00:00Z", tenantIds: [tenantId, other], stripeCustomerId: "retained-fictional", subscription: { items: [{ tenantId: other, amountCents: 1234 }] } };
    await redis.client.set(index, accountId); await redis.client.set(`account-of:${other}`, accountId); await redis.client.set(accountKey, account);
    await redis.client.set("reb:domain-claims", { "race.example.test": { tenantId }, "other.example.test": { tenantId: other, status: "verified" } });
    await redis.client.set("reb:invites:shared@example.test", { tenant: other, role: "owner" });
    await redis.client.set(`connections:${other}:google`, { retained: true });
    const deleted = await db.rpc("deprovision_tenant_guarded", { p_tenant_id: tenantId, p_force: false, p_require_inquiry_export: false, p_retain_receipts: true });
    expect(deleted.error).toBeNull();
    const original = await readDeprovisionCleanup(tenantId);
    expect(original).toMatchObject({ revision: 0, redisComplete: false, providerComplete: false });
    expect(db.query("select count(*) from public.tenants where id=:'v0';", [tenantId])).toBe("0");

    const staleCaptured = gate(), deliverStale = gate(), indexRemoved = gate(), failSave = gate();
    let delayedRead = true, injectedSave = false;
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    holder.db = {
      from: db.from,
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args: structuredClone(args) });
        const response = await db.rpc(name, args);
        // B's actual native revision-zero read is delayed in transport. A then
        // checkpoints revision one; no synthetic stale receipt is constructed.
        if (name === "tenant_cleanup_receipt" && delayedRead) {
          delayedRead = false; staleCaptured.release(); await deliverStale.promise;
        }
        return response;
      },
    };
    holder.redis = { ...redis.client, async set(key: string, value: unknown, options?: Parameters<typeof redis.client.set>[2]) {
      if (key === accountKey && !injectedSave) {
        injectedSave = true;
        expect(await redis.client.get(index)).toBeNull();
        indexRemoved.release(); await failSave.promise;
        throw new Error("injected account SET failure after reverse-index deletion");
      }
      return redis.client.set(key, value, options);
    } };
    const retry = () => runDeprovision({ tenantId, tenant: null, dryRun: false, cleanupReceiptId: original!.id });
    const workerB = retry();
    // Attach rejection handling before releasing either transport barrier.
    const rejectedB = expect(workerB).rejects.toThrow("revision_conflict_reload_receipt");
    await staleCaptured.promise;
    const workerA = retry();
    try {
      await Promise.race([indexRemoved.promise, workerA.then(() => { throw new Error("worker_A_finished_before_injected_account_save"); })]);
      const checkpoint = await db.rpc("tenant_cleanup_receipt", { p_slug: tenantId });
      expect(checkpoint.error).toBeNull();
      expect(checkpoint.data).toMatchObject({ revision: 1, redisComplete: false, summary: { redis: expect.arrayContaining([expect.objectContaining({ target: accountKey, deleted: false })]) } });
      deliverStale.release(); await rejectedB;
      expect(await redis.client.get(accountKey)).toMatchObject({ tenantIds: [tenantId, other] });
    } finally { deliverStale.release(); failSave.release(); }
    expect(await workerA).toMatchObject({ ok: false, cleanup: { revision: 2, redisComplete: false, complete: false } });
    const retained = await readDeprovisionCleanup(tenantId);
    expect(retained?.summary).toMatchObject({ redis: expect.arrayContaining([expect.objectContaining({ target: accountKey })]) });
    // Both callers now reload through the real reader and use that exact id.
    expect(await retry()).toMatchObject({ ok: false, cleanup: { redisComplete: true, providerComplete: false, complete: false } });
    expect(await retry()).toMatchObject({ ok: false, cleanup: { redisComplete: true, providerComplete: false, complete: false } });
    expect(await redis.client.get(accountKey)).toMatchObject({ tenantIds: [other], stripeCustomerId: account.stripeCustomerId, subscription: account.subscription });
    expect(await redis.client.get(`account-of:${other}`)).toBe(accountId);
    expect(await redis.client.get("reb:domain-claims")).toEqual({ "other.example.test": { tenantId: other, status: "verified" } });
    expect(await redis.client.get("reb:invites:shared@example.test")).toEqual({ tenant: other, role: "owner" });
    expect(await redis.client.get(`connections:${other}:google`)).toEqual({ retained: true });
    expect(db.query("select count(*) from public.tenants where id=:'v0';", [other])).toBe("1");
    expect(calls.some(call => call.name === "record_tenant_client_record" && call.args.p_tenant_id === other && call.args.p_mode === "replace")).toBe(true);
    // Real mirror removal after tenant deletion reports unknown tenant and queues
    // repair. Preserve this evidence; it is not a successful Postgres removal.
    expect(redis.cli("ZRANGE", "reb:client-records:pending", "0", "-1")).toContain(`account_grouping|${tenantId}|${accountId}`);
    const final = await readDeprovisionCleanup(tenantId);
    expect(final?.summary).toMatchObject({ redis: expect.arrayContaining([expect.objectContaining({ target: accountKey, deleted: true })]) });
    // Retained receipts intentionally remain in this disposable database. No
    // cleanup deletes its evidence or removes the retired-slug fence.
  }, 30_000);
});

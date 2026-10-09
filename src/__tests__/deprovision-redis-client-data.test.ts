import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isolatedRedisAvailable, startIsolatedRedis, type IsolatedRedis } from "./support/isolated-redis";

// Postgres is a contract mock in this Redis-focused fixture. Native guarded
// teardown/CAS behavior is qualified by the separate migrated-DB race fixture.
const holder = vi.hoisted(() => ({
  client: null as unknown, db: null as unknown, rpcs: [] as string[],
  receipt: { id: "27410000-0000-4000-8000-000000000020", tenantId: "acme", revision: 0, databaseDeleted: true,
    redisComplete: false, providerComplete: false, complete: false, summary: { redis: [] as Array<{ target: string; deleted: boolean }> } },
}));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => holder.client }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => holder.db }));
vi.mock("@/lib/vercel", () => ({ isVercelConfigured: () => false, deleteVercelProject: vi.fn() }));
import { runDeprovision, tenantRedisPatterns } from "@/lib/deprovision";

let redis: IsolatedRedis;
const cli = (...args: string[]) => redis.cli(...args);

function seedClient(slug: string) {
  cli("ZADD", `leads:${slug}`, "1", "lead_a");
  cli("SET", `lead:${slug}:lead_a`, JSON.stringify({ id: "lead_a" }));
  cli("ZADD", `orders:${slug}`, "1", "ord_1");
  cli("SET", `order:${slug}:ord_1`, JSON.stringify({ id: "ord_1" }));
  cli("ZADD", `events:${slug}`, "1", `evt_${slug}`);
  cli("SET", `event:evt_${slug}`, JSON.stringify({ id: `evt_${slug}`, tenantId: slug }));
  cli("SET", `threads:${slug}:t1`, JSON.stringify({ id: "t1" }));
  cli("SET", `connections:${slug}:google`, JSON.stringify({ ciphertext: "encrypted-fixture" }));
  cli("SET", `reb:booking:config:${slug}`, JSON.stringify({ timezone: "UTC" }));
  cli("SET", `reb:booking:overrides:${slug}`, JSON.stringify([]));
  cli("HSET", `reb:rewards:${slug}:members`, "m1", "10");
  cli("SET", `analytics:cfg:${slug}`, JSON.stringify({ ga4PropertyId: "1" }));
  cli("SET", `goal:${slug}`, "more calls");
  cli("SET", `reb:reply-voice:${slug}`, "approve");
  cli("ZADD", `reb:spam-pit:${slug}`, "1", "spam_1");
  cli("SET", `reb:spam-pit:item:${slug}:spam_1`, JSON.stringify({ id: "spam_1" }));
  cli("SET", `reb:client-email:${slug}`, "on");
  cli("SET", `crm:${slug}`, JSON.stringify({ stage: "live" }));
}

describe.skipIf(!isolatedRedisAvailable)("deprovision clears the client's Redis data (isolated Redis)", () => {
  beforeAll(async () => { redis = await startIsolatedRedis("deprovision"); holder.client = redis.client; });
  afterAll(async () => { if (redis) await redis.stop(); });
  beforeEach(() => {
    cli("FLUSHDB"); holder.rpcs.length = 0;
    vi.stubEnv("STRELVA_LEADS_AUTHORITY", "redis");
    vi.stubEnv("STRELVA_TENANT_RECEIPT_RETENTION", "0");
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "0");
    Object.assign(holder.receipt, { revision: 0, redisComplete: false, providerComplete: false, complete: false, summary: { redis: [] } });
    holder.db = {
      from: () => ({ select: () => ({ eq: async () => ({ count: 0, error: null }) }) }),
      rpc: async (name: string, args: Record<string, unknown>) => {
        holder.rpcs.push(name);
        if (name === "tenant_cleanup_teardown_blockers") return { data: [{ publications: 0, reservations: 0, booking_grants: 0, bookings: 0 }], error: null };
        if (name === "deprovision_tenant_guarded") return { data: { counts: { tenants: 1 }, paused: 0, cleanup: structuredClone(holder.receipt) }, error: null };
        if (name === "tenant_cleanup_receipt") return { data: structuredClone(holder.receipt), error: null };
        if (name === "finish_tenant_deprovision_cleanup") {
          if (args.p_receipt_id !== holder.receipt.id || args.p_tenant_id !== holder.receipt.tenantId) return { data: null, error: { message: "tenant_cleanup_receipt_changed" } };
          if (args.p_expected_revision !== holder.receipt.revision) return { data: null, error: { message: "tenant_cleanup_revision_conflict" } };
          const incoming = structuredClone(args.p_summary as typeof holder.receipt.summary);
          const previous = holder.receipt.summary.redis.filter(action => action.target.startsWith("account:"));
          if (args.p_redis_complete === true && previous.some(old => !incoming.redis.some(action => action.target === old.target && action.deleted === true))) return { data: null, error: { message: "tenant_cleanup_pending_account" } };
          incoming.redis.push(...previous.filter(old => !incoming.redis.some(action => action.target === old.target)));
          holder.receipt.summary = incoming;
          holder.receipt.revision++;
          holder.receipt.redisComplete ||= args.p_redis_complete === true;
          holder.receipt.providerComplete ||= args.p_provider_complete === true;
          holder.receipt.complete = holder.receipt.redisComplete && holder.receipt.providerComplete;
          return { data: structuredClone(holder.receipt), error: null };
        }
        throw new Error(`Unexpected teardown RPC: ${name}`);
      },
    };
  });

  afterEach(() => vi.unstubAllEnvs());

  it("covers every client store the spec lists, pinned to the tenant", () => {
    const patterns = tenantRedisPatterns("acme");
    for (const stem of ["leads:acme", "lead:acme:", "orders:acme", "order:acme:", "events:acme", "threads:acme:", "connections:acme:",
      "reb:booking:config:acme", "reb:booking:overrides:acme", "reb:rewards:acme:", "account-of:acme", "analytics:cfg:acme",
      "reb:reply-voice:acme", "reb:content-autonomy:acme", "goal:acme", "reb:client-email:acme", "reb:spam-pit:acme", "reb:spam-pit:item:acme:",
      "google-meta:acme", "calendly-meta:acme"]) {
      expect(patterns.some((p) => p.startsWith(stem)), stem).toBe(true);
    }
    expect(patterns.some((p) => p.startsWith("crm:"))).toBe(false);
  });

  it("dry run finds the keys and deletes nothing; execute deletes only this tenant's client data", async () => {
    seedClient("acme");
    seedClient("acmeco");
    cli("SET", "account-of:acme", "acct-1");
    cli("SET", "account-of:acmeco", "acct-1");
    const sharedAccount = { id: "acct-1", name: "Acme", tenantIds: ["acme", "acmeco"], status: "active", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", stripeCustomerId: "retained-fictional", subscription: { items: [{ tenantId: "acmeco", amountCents: 1234 }] } };
    cli("SET", "account:acct-1", JSON.stringify(sharedAccount));
    const before = (cli("DBSIZE") as number);

    const dry = await runDeprovision({ tenantId: "acme", tenant: null, dryRun: true });
    expect(dry.ok).toBe(true);
    const found = dry.summary.redis!.map((a) => a.target);
    expect(found).toEqual(expect.arrayContaining(["leads:acme", "order:acme:ord_1", "event:evt_acme", "connections:acme:google", "reb:spam-pit:item:acme:spam_1", "account-of:acme"]));
    expect(found).not.toContain("event:evt_acmeco");
    expect(cli("DBSIZE")).toBe(before);
    expect(JSON.parse(cli("GET", "account:acct-1") as string)).toEqual(sharedAccount);
    expect(holder.rpcs).toEqual(["tenant_cleanup_teardown_blockers"]);

    const done = await runDeprovision({ tenantId: "acme", tenant: null, dryRun: false });
    expect(done).toMatchObject({ ok: false, databaseDeleted: true, cleanup: { id: holder.receipt.id, revision: 2, redisComplete: true, providerComplete: false, complete: false } });
    expect(done.summary.vercel).toContainEqual(expect.objectContaining({ deleted: false }));
    expect(holder.receipt.summary.redis).toContainEqual(expect.objectContaining({ target: "account:acct-1", deleted: true }));
    expect(holder.rpcs.filter(name => name === "finish_tenant_deprovision_cleanup")).toHaveLength(2);
    expect(holder.rpcs).toContain("deprovision_tenant_guarded");
    const left = (cli("KEYS", "*") as string[]).sort();
    expect(left.filter((k) => /(^|:)acme(:|$)/.test(k))).toEqual(["crm:acme"]);
    expect(cli("EXISTS", "leads:acmeco", "event:evt_acmeco", "connections:acmeco:google", "account-of:acmeco")).toBe(4);
    expect(JSON.parse(cli("GET", "account:acct-1") as string)).toMatchObject({ tenantIds: ["acmeco"], stripeCustomerId: sharedAccount.stripeCustomerId, subscription: sharedAccount.subscription });
  });

  it("refuses execution when PostgreSQL is unavailable and preserves Redis", async () => {
    seedClient("acme"); holder.db = null;
    const before = cli("DBSIZE");
    await expect(runDeprovision({ tenantId: "acme", tenant: null, dryRun: false })).rejects.toThrow("tenant_teardown_database_unavailable");
    expect(cli("DBSIZE")).toBe(before);
    expect(holder.rpcs).toEqual([]);
  });

  it("refuses a protected tenant before touching Redis", async () => {
    seedClient("gldf");
    const before = cli("DBSIZE");
    const result = await runDeprovision({ tenantId: "gldf", tenant: null, dryRun: false });
    expect(result).toMatchObject({ ok: false, refusalReason: "protected_tenant" });
    expect(cli("DBSIZE")).toBe(before);
  });
});

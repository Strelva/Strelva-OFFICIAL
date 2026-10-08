import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isolatedRedisAvailable, startIsolatedRedis, type IsolatedRedis } from "./support/isolated-redis";

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => holder.client }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
import { rekeyTenantRedis } from "@/lib/tenant-rename";
import { CLIENT_RECORD_PENDING_KEY, pendingPayloadKey } from "@/platform/client-records/mirror";
import { repairPendingClientRecords } from "@/platform/client-records/move";

describe.skipIf(!isolatedRedisAvailable)("durable client-record repairs across rename", () => {
  let redis: IsolatedRedis;
  beforeAll(async () => { redis = await startIsolatedRedis("client-record-rename"); holder.client = redis.client; });
  afterAll(async () => { await redis?.stop(); });
  beforeEach(() => { redis.cli("FLUSHDB"); vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1"); vi.stubEnv("DUAL_WRITE_PG", "1"); });
  afterEach(() => vi.unstubAllEnvs());
  function seed(member: string, at: string, value: string, score: number) {
    redis.cli("SET", pendingPayloadKey(member), JSON.stringify({ recordId: member.split("|").slice(2).join("|"), payload: { value }, capturedAt: at }));
    redis.cli("ZADD", CLIENT_RECORD_PENDING_KEY, String(score), member);
  }
  it("keeps expired-source snapshots repairable under the new tenant and leaves others scoped", async () => {
    seed("orders|old|o1", "2026-10-07T12:00:00Z", "retained order", 10);
    seed("orders|oldtown|o2", "2026-10-07T12:00:00Z", "other tenant", 20);
    await expect(rekeyTenantRedis("old", "new")).resolves.toMatchObject({ redisErrors: [] });
    expect(redis.cli("GET", pendingPayloadKey("orders|old|o1"))).toBeNull();
    expect(redis.cli("ZRANGE", CLIENT_RECORD_PENDING_KEY, "0", "-1", "WITHSCORES")).toEqual([["orders|new|o1", 10], ["orders|oldtown|o2", 20]]);
    const rpc = vi.fn(async () => ({ data: { status: "recorded" }, error: null }));
    expect(await repairPendingClientRecords({ db: { rpc } })).toMatchObject({ repaired: 2, remaining: 0 });
    expect(rpc).toHaveBeenCalledWith("record_tenant_client_record", expect.objectContaining({ p_tenant_id: "new", p_record_id: "o1", p_payload: { value: "retained order" } }));
  });
  it("merges newer snapshots, keeps earliest first replies, and survives a stale worker acknowledgement", async () => {
    seed("orders|old|o1", "2026-10-07T12:00:00Z", "older order", 10);
    seed("orders|new|o1", "2026-10-07T13:00:00Z", "newer order", 20);
    seed("inquiry_reply|old|q1", "2026-10-07T12:00:00Z", "first reply", 30);
    seed("inquiry_reply|new|q1", "2026-10-07T13:00:00Z", "later reply", 40);
    await rekeyTenantRedis("old", "new");
    await rekeyTenantRedis("old", "new");
    redis.cli("ZREM", CLIENT_RECORD_PENDING_KEY, "orders|old|o1");
    expect(JSON.parse(String(redis.cli("GET", pendingPayloadKey("orders|new|o1")))).payload.value).toBe("newer order");
    expect(JSON.parse(String(redis.cli("GET", pendingPayloadKey("inquiry_reply|new|q1")))).payload.value).toBe("first reply");
    expect(redis.cli("ZCARD", CLIENT_RECORD_PENDING_KEY)).toBe(2);
  });
  it("does not change the repair queue while the rollout flag is off", async () => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "0");
    seed("orders|old|o1", "2026-10-07T12:00:00Z", "order", 10);
    await rekeyTenantRedis("old", "new");
    expect(redis.cli("ZSCORE", CLIENT_RECORD_PENDING_KEY, "orders|old|o1")).toBe(10);
    expect(redis.cli("GET", pendingPayloadKey("orders|old|o1"))).not.toBeNull();
  });
});

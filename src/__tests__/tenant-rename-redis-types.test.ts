import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isolatedRedisAvailable, startIsolatedRedis, type IsolatedRedis } from "./support/isolated-redis";

// Real Redis on a disposable Unix socket: WRONGTYPE errors, Lua, RENAME and
// TTLs behave exactly as in production.
const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/redis", () => ({ getRedis: () => holder.client }));
import { rekeyTenantRedis } from "@/lib/tenant-rename";

let redis: IsolatedRedis;
const cli = (...args: string[]) => redis.cli(...args);

describe.skipIf(!isolatedRedisAvailable)("tenant rename moves every Redis type (isolated Redis)", () => {
  beforeAll(async () => { redis = await startIsolatedRedis("rename-types"); holder.client = redis.client; });
  afterAll(async () => { if (redis) await redis.stop(); });
  beforeEach(() => { cli("FLUSHDB"); });

  it("moves sorted sets, hashes, sets, lists and strings with their TTLs, and leaves other tenants alone", async () => {
    cli("ZADD", "leads:old", "100", "lead_a", "200", "lead_b");
    cli("EXPIRE", "leads:old", "7200");
    cli("SET", "lead:old:lead_a", JSON.stringify({ id: "lead_a", tenant: "old" }), "EX", "3600");
    cli("ZADD", "orders:old", "5", "ord_1");
    cli("HSET", "reb:rewards:old:members", "m1", "120", "m2", "40");
    cli("SADD", "reb:rewards:old:tiers", "gold", "silver");
    cli("RPUSH", "reb:rewards:old:txns", "t1", "t2", "t3");
    cli("ZADD", "reb:spam-pit:old", "1", "spam_1");
    cli("SET", "reb:spam-pit:item:old:spam_1", JSON.stringify({ id: "spam_1", reason: "honeypot" }), "EX", "600");
    cli("SET", "reb:booking:config:old", JSON.stringify({ timezone: "America/New_York" }));
    cli("ZADD", "leads:oldtown", "1", "lead_other");

    const result = await rekeyTenantRedis("old", "new");

    expect(result.redisErrors).toEqual([]);
    expect(result.movedKeys).toBe(9);
    expect(result.rewrittenBlobs).toBe(1);
    expect(cli("ZRANGE", "leads:new", "0", "-1", "WITHSCORES")).toEqual([["lead_a", 100], ["lead_b", 200]]);
    expect(cli("TTL", "leads:new")).toBeGreaterThan(7000);
    expect(JSON.parse(cli("GET", "lead:new:lead_a") as string)).toEqual({ id: "lead_a", tenant: "new" });
    expect(cli("TTL", "lead:new:lead_a")).toBeGreaterThan(3500);
    expect(cli("ZRANGE", "orders:new", "0", "-1")).toEqual(["ord_1"]);
    expect(cli("HGETALL", "reb:rewards:new:members")).toEqual({ m1: "120", m2: "40" });
    expect((cli("SMEMBERS", "reb:rewards:new:tiers") as string[]).sort()).toEqual(["gold", "silver"]);
    expect(cli("LRANGE", "reb:rewards:new:txns", "0", "-1")).toEqual(["t1", "t2", "t3"]);
    expect(cli("ZRANGE", "reb:spam-pit:new", "0", "-1")).toEqual(["spam_1"]);
    expect(cli("TTL", "reb:spam-pit:item:new:spam_1")).toBeGreaterThan(500);
    expect(cli("TTL", "reb:booking:config:new")).toBe(-1);
    expect(cli("KEYS", "*:old:*")).toEqual([]);
    expect(cli("EXISTS", "leads:old")).toBe(0);
    expect(cli("ZRANGE", "leads:oldtown", "0", "-1")).toEqual(["lead_other"]);
  });

  it("merges into keys already written under the new slug without overwriting them", async () => {
    cli("ZADD", "leads:old", "100", "lead_a", "300", "lead_shared");
    cli("ZADD", "leads:new", "500", "lead_shared", "600", "lead_new");
    cli("EXPIRE", "leads:new", "9000");
    cli("HSET", "reb:rewards:old:members", "m1", "120", "m2", "40");
    cli("HSET", "reb:rewards:new:members", "m1", "999");
    cli("SADD", "reb:rewards:old:tiers", "gold");
    cli("SADD", "reb:rewards:new:tiers", "bronze");
    cli("RPUSH", "reb:rewards:old:txns", "t1");
    cli("RPUSH", "reb:rewards:new:txns", "t9");

    const result = await rekeyTenantRedis("old", "new");

    expect(result.redisErrors).toEqual([]);
    expect(cli("ZRANGE", "leads:new", "0", "-1", "WITHSCORES")).toEqual([["lead_a", 100], ["lead_shared", 500], ["lead_new", 600]]);
    expect(cli("TTL", "leads:new")).toBeGreaterThan(8900);
    expect(cli("HGETALL", "reb:rewards:new:members")).toEqual({ m1: "999", m2: "40" });
    expect((cli("SMEMBERS", "reb:rewards:new:tiers") as string[]).sort()).toEqual(["bronze", "gold"]);
    expect(cli("LRANGE", "reb:rewards:new:txns", "0", "-1")).toEqual(["t9", "t1"]);
    expect(cli("EXISTS", "leads:old", "reb:rewards:old:members", "reb:rewards:old:tiers", "reb:rewards:old:txns")).toBe(0);
  });

  it("is safe to re-run and keeps moving the rest of a pattern after one key fails", async () => {
    cli("ZADD", "leads:old", "1", "lead_a");
    cli("SET", "lead:old:lead_a", JSON.stringify({ id: "lead_a" }));
    cli("SET", "lead:old:lead_b", JSON.stringify({ id: "lead_b" }));
    const client = redis.client;
    const realEval = client.eval;
    let failed = false;
    client.eval = async (script, keys, args) => {
      if (!failed && keys[0] === "lead:old:lead_a") { failed = true; throw new Error("Redis unavailable"); }
      return realEval(script, keys, args);
    };
    try {
      const first = await rekeyTenantRedis("old", "new");
      expect(first.redisErrors).toEqual(["lead:old:lead_a: Redis unavailable"]);
      expect(cli("EXISTS", "lead:new:lead_b", "leads:new")).toBe(2);
      expect(cli("EXISTS", "lead:old:lead_a")).toBe(1);
    } finally {
      client.eval = realEval;
    }
    const second = await rekeyTenantRedis("old", "new");
    expect(second.redisErrors).toEqual([]);
    expect(cli("EXISTS", "lead:new:lead_a", "lead:new:lead_b", "leads:new")).toBe(3);
    expect(cli("KEYS", "*old*")).toEqual([]);
  });
});

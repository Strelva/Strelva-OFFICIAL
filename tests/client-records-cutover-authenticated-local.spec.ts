import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";
import { startLocalRedis, startUpstashBridge } from "../scripts/scrubbed-copy/redis";
import { fixture, linkedTenant, literal, localSql, secretMarker, storePayload, stores } from "./support/runtime-data-native";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Auth/SQL and installed owned-loopback Redis bridge tooling.");
test.setTimeout(180_000);
test("all 13 stores backfill with measured parity; real durable reads and writes survive owned Redis outage and refuse unqualified cutover", async ({ browser }) => {
  const f = await fixture(browser, "cutover-owner");
  const directory = mkdtempSync("/tmp/strelva-runtime-redis.");
  const local = await startLocalRedis(directory, `${directory}/r.sock`);
  const bridge = await startUpstashBridge({ socket: local.socket, token: randomUUID(), host: "127.0.0.1" });
  const redis = new Redis({ url: bridge.url, token: bridge.token, retry: { retries: 0 } });
  const envKeys = ["SUPABASE_URL", "STRELVA_CLIENT_RECORDS_READ", "STRELVA_CLIENT_RECORDS_DUAL_WRITE", "DUAL_WRITE_PG", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  let paritySnapshot: string | null = null;
  try {
    process.env.SUPABASE_URL = f.env.url;
    process.env.UPSTASH_REDIS_REST_URL = bridge.url; process.env.UPSTASH_REDIS_REST_TOKEN = bridge.token;
    process.env.STRELVA_CLIENT_RECORDS_READ = stores.join(","); process.env.STRELVA_CLIENT_RECORDS_DUAL_WRITE = "1"; process.env.DUAL_WRITE_PG = "1";
    const tenant = await linkedTenant(f);
    const id = "native-record", at = "2026-10-08T12:00:00Z";
    await redis.set(`order:${tenant.id}:${id}`, storePayload("orders", tenant.id)); await redis.zadd(`orders:${tenant.id}`, { score: 1, member: id });
    await redis.set(`threads:${tenant.id}:${id}`, storePayload("threads", tenant.id)); await redis.zadd(`threads:${tenant.id}:index`, { score: 1, member: id });
    await redis.set(`connections:${tenant.id}:google`, storePayload("provider_connections", tenant.id));
    await redis.set(`google-meta:${tenant.id}`, { locationId: "fixture-only-location" });
    await redis.set(`reb:goal:${tenant.id}`, "unused-key-control"); await redis.set(`goal:${tenant.id}`, "Fictional goal");
    await redis.hset(`reb:rewards:${tenant.id}:member:fixture@example.test`, { email: "fixture@example.test", createdAt: at, points: "0" });
    await redis.lpush(`reb:rewards:${tenant.id}:txns:fixture@example.test`, JSON.stringify({ id, timestamp: at, points: 0 }));
    await redis.set(`reb:spam-pit:item:${tenant.id}:${id}`, storePayload("spam_held", tenant.id)); await redis.zadd(`reb:spam-pit:${tenant.id}`, { score: 1, member: id });
    await redis.zadd(`reb:inquiry-timeline:${tenant.id}:${id}`, { score: 1, member: JSON.stringify({ at, kind: "fixture" }) });
    await redis.set(`reb:inquiry-delivery:${tenant.id}:${id}:reply`, { inquiryId: id, status: "accepted", acceptedAt: at });
    await redis.set(`reb:booking:config:${tenant.id}`, { timezone: "UTC", enabled: false });
    await redis.set(`account-of:${tenant.id}`, id); await redis.set(`account:${id}`, storePayload("account_grouping", tenant.id));
    // No DB overrides, mocked SQL, fake Redis client or provider calls.
    const { backfillClientRecords, checkClientRecordParity, readAllClientRecords } = await import("../src/platform/client-records/move");
    const { readRecords } = await import("../src/lib/client-records");
    const { saveConnection, getConnection } = await import("../src/lib/connections");
    const { recordOrder } = await import("../src/lib/orders");
    for (const store of stores) {
      const copied = await backfillClientRecords(store, tenant.id, { apply: true });
      expect(copied.redisRecords, store).toBeGreaterThan(0); expect(copied.failed, store).toEqual([]);
      const parity = await checkClientRecordParity(store, tenant.id);
      expect(parity, store).toMatchObject({ ok: true, missing: [], mismatched: [], recorded: true });
      expect((await readAllClientRecords(store, tenant.id)).length, store).toBeGreaterThan(0);
    }
    const denied = createClient(f.env.url, f.env.anon, { auth: { persistSession: false } });
    expect((await denied.rpc("read_tenant_client_records_page", { p_tenant_id: tenant.id, p_store: "orders", p_limit: 100, p_before: null, p_after_record_id: null })).error).not.toBeNull();
    // Qualification is global across tenants. This disposable fixture replays
    // seven days; it proves the cutover guard, not seven observed calendar days.
    paritySnapshot = localSql("select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.tenant_client_record_parity p;");
    localSql(`insert into public.tenant_client_record_parity(store,tenant_stable_id,checked_on,ok,redis_count,postgres_count,missing,mismatched) select s,t.stable_id,((clock_timestamp() at time zone 'UTC')::date-n),true,1,1,0,0 from public.tenants t cross join unnest(array[${stores.map(literal).join(",")}]) s cross join generate_series(0,6) n on conflict(store,tenant_stable_id,checked_on) do update set ok=true,missing=0,mismatched=0;`);
    for (const store of stores) {
      let fallbackReads = 0;
      const rows = await readRecords(store, tenant.id, async () => { fallbackReads++; return [{ stale: true }]; });
      expect(rows.length, store).toBeGreaterThan(0); expect(fallbackReads, store).toBe(0);
    }
    await bridge.close(); await local.stop(false);
    // Only this test's bridge and Redis stopped; the app's bridge is untouched.
    await saveConnection({ tenantId: tenant.id, provider: "google", accessToken: secretMarker, status: "connected" });
    expect(await getConnection(tenant.id, "google")).toMatchObject({ status: "connected", accessToken: secretMarker });
    const order = { externalId: "native-owned-redis-outage", amountCents: 0, currency: "usd", items: [], verification: "site-signature" as const };
    const first = await recordOrder(tenant.id, order); const retry = await recordOrder(tenant.id, order);
    expect(first?.id).toBeTruthy(); expect(retry).toBeNull();
    expect((await readAllClientRecords("orders", tenant.id)).filter(row => row.payload.externalId === order.externalId)).toHaveLength(1);
    localSql(`update public.tenant_client_record_parity set ok=false where tenant_stable_id=${literal(tenant.stableId)}::uuid and checked_on=(clock_timestamp() at time zone 'UTC')::date;`);
    let fallbackReads = 0;
    await expect(readRecords("orders", tenant.id, async () => { fallbackReads++; return []; })).rejects.toThrow("client_records_cutover_not_qualified");
    await expect(recordOrder(tenant.id, { ...order, externalId: "must-not-write" })).rejects.toThrow("client_records_cutover_not_qualified");
    expect(fallbackReads).toBe(0);
    expect((await readAllClientRecords("orders", tenant.id)).some(row => row.payload.externalId === "must-not-write")).toBe(false);
  } finally {
    if (paritySnapshot !== null) localSql(`begin; delete from public.tenant_client_record_parity; insert into public.tenant_client_record_parity select * from jsonb_populate_recordset(null::public.tenant_client_record_parity,${literal(paritySnapshot)}::jsonb); commit;`);
    for (const key of envKeys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    await bridge.close().catch(() => {}); await local.stop(false).catch(() => {}); rmSync(directory, { recursive: true, force: true }); await f.close();
  }
});

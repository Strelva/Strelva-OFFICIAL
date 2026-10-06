import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isolatedRedisAvailable, startIsolatedRedis, type IsolatedRedis } from "./support/isolated-redis";

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/redis", () => ({ getRedis: () => holder.client }));
vi.mock("@/lib/db/client", () => ({ getSupabase: () => null }));

import {
  CLIENT_RECORD_PENDING_KEY,
  CLIENT_RECORD_STORES,
  canonicalJson,
  clientRecordHash,
  mirrorClientRecord,
  parsePendingMember,
  setClientRecordDb,
  type ClientRecordDb,
} from "@/platform/client-records/mirror";
import {
  backfillClientRecords,
  checkClientRecordParity,
  clientRecordReadSource,
  readThroughFlag,
  repairPendingClientRecords,
} from "@/platform/client-records/move";
import { CLIENT_RECORD_STORE_DEFINITIONS, timelineRecord } from "@/platform/client-records/stores";
import { getSpam, recordSpam } from "@/lib/spam-pit";
import { setBookingConfig } from "@/lib/storage/booking-store";
import { countClientRedisKeys } from "../../scripts/count-client-redis-keys";
import { parseMoveArgs, runClientRecordMove } from "../../scripts/client-records-move-plan";

/** In-memory stand-in for the service-role RPCs, with the same contract. */
function fakeDb() {
  const rows = new Map<string, { hash: string; payload: Record<string, unknown>; capturedAt: string; removed: boolean; via: string }>();
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const state = { fail: false, streak: 0, streakError: false, readError: false };
  const db: ClientRecordDb = {
    rpc(name, args) {
      calls.push({ name, args });
      const result = (() => {
        if (state.fail) return { data: null, error: { message: "connection refused" } };
        const k = (store: unknown, tenant: unknown, id: unknown) => `${tenant}|${store}|${id}`;
        switch (name) {
          case "record_tenant_client_record": {
            const key = k(args.p_store, args.p_tenant_id, args.p_record_id);
            const prior = rows.get(key);
            if (args.p_mode === "remove") { if (prior) prior.removed = true; return { data: { status: prior ? "removed" : "unchanged" }, error: null }; }
            if (prior && args.p_mode === "keep_first" && String(args.p_captured_at) >= prior.capturedAt) return { data: { status: "kept" }, error: null };
            if (prior && prior.hash === args.p_payload_hash) return { data: { status: "unchanged" }, error: null };
            rows.set(key, { hash: String(args.p_payload_hash), payload: args.p_payload as Record<string, unknown>, capturedAt: String(args.p_captured_at), removed: false, via: String(args.p_via) });
            return { data: { status: prior ? "updated" : "recorded", workspaceId: null }, error: null };
          }
          case "read_tenant_client_record_digests": {
            const out: Record<string, string> = {};
            for (const [key, row] of rows) {
              const [tenant, store, id] = key.split("|");
              if (tenant === args.p_tenant_id && store === args.p_store && !row.removed) out[id!] = row.hash;
            }
            return { data: out, error: null };
          }
          case "read_tenant_client_records": {
            if (state.readError) return { data: null, error: { message: "timeout" } };
            const out = [...rows].filter(([key, row]) => key.startsWith(`${args.p_tenant_id}|${args.p_store}|`) && !row.removed)
              .map(([key, row]) => ({ recordId: key.split("|")[2], payload: row.payload, capturedAt: row.capturedAt }))
              .sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1));
            return { data: out, error: null };
          }
          case "record_client_record_parity": return { data: { ok: args.p_missing === 0 && args.p_mismatched === 0 }, error: null };
          case "client_record_parity_streak": return state.streakError ? { data: null, error: { message: "x" } } : { data: { days: state.streak }, error: null };
          default: return { data: null, error: { message: `unknown rpc ${name}` } };
        }
      })();
      return Promise.resolve(result);
    },
  };
  return { db, rows, calls, state };
}

let redis: IsolatedRedis;
const cli = (...args: string[]) => redis.cli(...args);

describe("client-record hashing", () => {
  it("hashes the same content the same regardless of key order or undefined fields", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[1,{"y":2,"z":1}]},"b":1}');
    expect(clientRecordHash({ a: 1, b: 2 })).toBe(clientRecordHash({ b: 2, a: 1 }));
    expect(clientRecordHash({ a: 1 })).not.toBe(clientRecordHash({ a: 2 }));
  });
  it("parses pending members and rejects unknown stores", () => {
    expect(parsePendingMember("spam_held|gldf|spam_1")).toEqual({ store: "spam_held", tenant: "gldf", recordId: "spam_1" });
    expect(parsePendingMember("inquiry_timeline|gldf|lead_1:abc")).toEqual({ store: "inquiry_timeline", tenant: "gldf", recordId: "lead_1:abc" });
    expect(parsePendingMember("orders|gldf|x")).toBeNull();
    expect(parsePendingMember("spam_held||x")).toBeNull();
  });
});

describe.skipIf(!isolatedRedisAvailable)("client-record move pattern (isolated Redis, in-memory Postgres)", () => {
  let fake: ReturnType<typeof fakeDb>;
  beforeAll(async () => { redis = await startIsolatedRedis("client-records"); holder.client = redis.client; });
  afterAll(async () => { if (redis) await redis.stop(); });
  beforeEach(() => {
    cli("FLUSHDB");
    fake = fakeDb();
    setClientRecordDb(fake.db);
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1");
    vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", "");
    vi.stubEnv("DUAL_WRITE_PG", "");
  });
  afterEach(() => { vi.unstubAllEnvs(); setClientRecordDb(undefined); });

  it("dual-write is off by default and writes nothing to Postgres", async () => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "");
    const spam = await recordSpam("acme", { reason: "honeypot", email: "bot@example.test" });
    expect(spam).not.toBeNull();
    expect(fake.calls).toEqual([]);
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1");
    vi.stubEnv("DUAL_WRITE_PG", "0");
    await recordSpam("acme", { reason: "honeypot" });
    expect(fake.calls).toEqual([]);
  });

  it("dual-writes held spam, and a Postgres failure never fails the submission; repair copies it later", async () => {
    const first = await recordSpam("acme", { reason: "honeypot", name: "Ada", fields: { company: "Acme" } });
    expect(fake.rows.get(`acme|spam_held|${first!.id}`)).toMatchObject({ via: "dual_write" });
    expect((await checkClientRecordParity("spam_held", "acme")).ok).toBe(true);

    fake.state.fail = true;
    const second = await recordSpam("acme", { reason: "turnstile" });
    expect(second?.reason).toBe("turnstile");
    expect(cli("ZRANGE", CLIENT_RECORD_PENDING_KEY, "0", "-1")).toEqual([`spam_held|acme|${second!.id}`]);
    const parity = await checkClientRecordParity("spam_held", "acme", { record: false }).catch((e: Error) => e);
    expect(parity).toBeInstanceOf(Error);

    fake.state.fail = false;
    expect(await checkClientRecordParity("spam_held", "acme")).toMatchObject({ ok: false, missing: [second!.id] });
    const repaired = await repairPendingClientRecords();
    expect(repaired).toMatchObject({ checked: 1, repaired: 1, remaining: 0 });
    expect(fake.rows.get(`acme|spam_held|${second!.id}`)).toMatchObject({ via: "repair" });
    expect((await checkClientRecordParity("spam_held", "acme")).ok).toBe(true);
  });

  it("repair drops an expired record instead of looping, and keeps a failed retry queued", async () => {
    cli("ZADD", CLIENT_RECORD_PENDING_KEY, "1", "spam_held|acme|spam_gone", "2", "booking_config|acme|config");
    cli("SET", "reb:booking:config:acme", JSON.stringify({ timezone: "UTC" }));
    fake.state.fail = true;
    expect(await repairPendingClientRecords()).toMatchObject({ dropped: 1, failed: 1, remaining: 1 });
    fake.state.fail = false;
    expect(await repairPendingClientRecords()).toMatchObject({ repaired: 1, remaining: 0 });
  });

  it("backfill is a dry run by default and idempotent when applied; parity finds an injected mismatch", async () => {
    cli("SET", "reb:booking:config:acme", JSON.stringify({ timezone: "America/New_York", slotMinutes: 30 }));
    cli("SET", "reb:booking:overrides:acme", JSON.stringify([{ date: "2026-12-25", closed: true }]));

    const dry = await backfillClientRecords("booking_config", "acme", { apply: false });
    expect(dry).toMatchObject({ redisRecords: 2, written: 0 });
    expect(fake.calls).toEqual([]);

    expect(await backfillClientRecords("booking_config", "acme", { apply: true })).toMatchObject({ written: 2, failed: [] });
    expect(await backfillClientRecords("booking_config", "acme", { apply: true })).toMatchObject({ written: 0, unchanged: 2 });

    // A changed Redis value without a dual-write is caught.
    cli("SET", "reb:booking:config:acme", JSON.stringify({ timezone: "UTC" }));
    expect(await checkClientRecordParity("booking_config", "acme")).toMatchObject({ ok: false, mismatched: ["config"], missing: [] });
    // A dual-written save brings it back into parity.
    await setBookingConfig({ timezone: "UTC" } as never, "acme");
    expect((await checkClientRecordParity("booking_config", "acme")).ok).toBe(true);
  });

  it("a timeline event and the first reply have the same identity in Redis and Postgres", async () => {
    const member = JSON.stringify({ tenantId: "acme", inquiryId: "lead_a", type: "received", summary: "Received", outcome: "recorded", at: "2026-10-05T12:00:00.000Z" });
    cli("ZADD", "reb:inquiry-timeline:acme:lead_a", "1", member);
    const fromRedis = await CLIENT_RECORD_STORE_DEFINITIONS.inquiry_timeline.readRedis(redis.client as never, "acme");
    expect(fromRedis).toEqual([timelineRecord("lead_a", member)]);
    await mirrorClientRecord("inquiry_timeline", "acme", timelineRecord("lead_a", member)!);
    expect((await checkClientRecordParity("inquiry_timeline", "acme")).ok).toBe(true);

    cli("SET", "reb:inquiry-delivery:acme:lead_a:reply", JSON.stringify({ inquiryId: "lead_a", status: "accepted", acceptedAt: "2026-10-05T13:00:00Z" }));
    cli("SET", "reb:inquiry-delivery:acme:lead_a:send_message", JSON.stringify({ inquiryId: "lead_a", status: "delivered", acceptedAt: "2026-10-05T12:30:00Z" }));
    cli("SET", "reb:inquiry-delivery:acme:lead_b:reply", JSON.stringify({ inquiryId: "lead_b", status: "failed" }));
    const replies = await CLIENT_RECORD_STORE_DEFINITIONS.inquiry_reply.readRedis(redis.client as never, "acme");
    expect(replies).toEqual([{ recordId: "lead_a", payload: { firstReplyAt: "2026-10-05T12:30:00Z", by: "strelva", action: "send_message" }, capturedAt: "2026-10-05T12:30:00Z" }]);
  });

  it("reads stay on Redis until the store's flag is on and parity has held 7 days, and fall back on failure", async () => {
    expect(await clientRecordReadSource("spam_held")).toBe("redis");
    expect(fake.calls).toEqual([]);
    vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", "spam_held,booking_config");
    fake.state.streak = 6;
    expect(await clientRecordReadSource("spam_held")).toBe("redis");
    fake.state.streak = 7;
    expect(await clientRecordReadSource("spam_held")).toBe("postgres");
    expect(await clientRecordReadSource("account_grouping")).toBe("redis");
    fake.state.streakError = true;
    expect(await clientRecordReadSource("spam_held")).toBe("redis");
    fake.state.streakError = false;

    // Flipped: an item past Redis's TTL is still served from Postgres.
    const kept = await recordSpam("acme", { reason: "honeypot", name: "Real customer" });
    cli("DEL", `reb:spam-pit:item:acme:${kept!.id}`);
    expect((await getSpam("acme")).map((s) => s.id)).toEqual([kept!.id]);
    // A failed Postgres read serves Redis instead of nothing.
    fake.state.readError = true;
    expect(await getSpam("acme")).toEqual([]);
    expect(await readThroughFlag("spam_held", "acme", async () => "redis", () => "postgres")).toBe("redis");
  });

  it("counts order and reward keys without reading a value", async () => {
    cli("ZADD", "orders:gldf", "1", "o1");
    cli("SET", "order:gldf:o1", "{}");
    cli("SET", "order:gldf:o2", "{}");
    cli("HSET", "reb:rewards:gldf:members", "m1", "1");
    const scan = async function* (match: string) {
      let cursor = "0";
      do { const [next, keys] = await redis.client.scan(cursor, { match, count: 100 }); cursor = String(next); yield* keys; } while (cursor !== "0");
    };
    expect(await countClientRedisKeys(scan)).toEqual({
      orders_index: { total: 1, byTenant: { gldf: 1 } },
      order: { total: 2, byTenant: { gldf: 2 } },
      rewards: { total: 1, byTenant: { gldf: 1 } },
    });
  });
});

describe("client-records move script guard", () => {
  const deps = () => ({
    tenants: vi.fn(async () => ["a", "b"]),
    backfill: vi.fn(async (store: string, tenant: string, apply: boolean) => ({ store, tenant, apply, redisRecords: 1, written: apply ? 1 : 0, unchanged: 0, failed: [] }) as never),
    parity: vi.fn(async (store: string, tenant: string) => ({ store, tenant, ok: true, redisCount: 0, postgresCount: 0, missing: [], mismatched: [], postgresOnly: 0, recorded: true }) as never),
    log: vi.fn(),
  });
  it("defaults to a dry run over every store and tenant", async () => {
    const d = deps();
    const out = await runClientRecordMove({ ...parseMoveArgs(["backfill"]), databaseUrl: "https://prod.supabase.co" }, d);
    expect(out.apply).toBe(false);
    expect(d.backfill).toHaveBeenCalledTimes(CLIENT_RECORD_STORES.length * 2);
    expect(d.backfill.mock.calls.every((c) => c[2] === false)).toBe(true);
  });
  it("refuses --apply and parity against a non-local database without Jacob's yes", async () => {
    await expect(runClientRecordMove({ ...parseMoveArgs(["backfill", "--apply"]), databaseUrl: "https://prod.supabase.co" }, deps())).rejects.toThrow(/Jacob's yes/);
    await expect(runClientRecordMove({ ...parseMoveArgs(["parity"]), databaseUrl: "https://prod.supabase.co" }, deps())).rejects.toThrow(/Jacob's yes/);
    await expect(runClientRecordMove({ ...parseMoveArgs(["backfill", "--apply"]) }, deps())).rejects.toThrow(/no database/);
    const ok = await runClientRecordMove({ ...parseMoveArgs(["backfill", "gldf", "--apply", "--store=spam_held"]), databaseUrl: "http://127.0.0.1:54321" }, deps());
    expect(ok.totals.written).toBe(1);
  });
  it("rejects unknown stores and options", () => {
    expect(() => parseMoveArgs(["backfill", "--store=orders"])).toThrow(/Unknown store/);
    expect(() => parseMoveArgs(["parity", "--apply"])).toThrow(/no --apply/);
    expect(() => parseMoveArgs(["delete"])).toThrow(/Usage/);
  });
});

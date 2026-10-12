import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  redisRecords: new Map<string, { recordId: string; payload: Record<string, unknown>; capturedAt: string }[]>(),
  redisDown: false,
}));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
vi.mock("@/platform/client-records/stores", async () => {
  const { CLIENT_RECORD_STORES } = await vi.importActual<typeof import("@/platform/client-records/mirror")>("@/platform/client-records/mirror");
  const definitions = Object.fromEntries(CLIENT_RECORD_STORES.map((store) => [store, {
    mode: "replace",
    removalIsIntentional: false,
    readRedis: async (_redis: unknown, tenant: string) => {
      if (holder.redisDown) throw new Error("redis connection refused");
      return holder.redisRecords.get(`${store}|${tenant}`) ?? [];
    },
  }]));
  return { CLIENT_RECORD_STORE_DEFINITIONS: definitions };
});

import { CLIENT_RECORD_STORES, clientRecordHash, type ClientRecordDb } from "@/platform/client-records/mirror";
import { runClientRecordParitySweep } from "@/platform/client-records/parity-sweep";

/** Postgres stand-in: digests per store/tenant, and the parity table keyed
 *  like the real unique (store, tenant, day). Every RPC name is logged. */
function fakeDb(options: { digestsFail?: string; recordFail?: boolean } = {}) {
  const digests = new Map<string, Record<string, string>>();
  const parity = new Map<string, { ok: boolean; missing: number; mismatched: number }>();
  const calls: string[] = [];
  const db: ClientRecordDb = {
    rpc(name, args) {
      calls.push(name);
      const result = (() => {
        if (name === "read_tenant_client_record_digests") {
          if (options.digestsFail === args.p_tenant_id) return { data: null, error: { message: "timeout" } };
          return { data: digests.get(`${args.p_store}|${args.p_tenant_id}`) ?? {}, error: null };
        }
        if (name === "record_client_record_parity") {
          if (options.recordFail) return { data: null, error: { message: "permission denied" } };
          const missing = Number(args.p_missing), mismatched = Number(args.p_mismatched);
          parity.set(`${args.p_store}|${args.p_tenant_id}|2026-10-08`, { ok: missing === 0 && mismatched === 0, missing, mismatched });
          return { data: { ok: true }, error: null };
        }
        return { data: null, error: { message: `unexpected rpc ${name}` } };
      })();
      return Promise.resolve(result);
    },
  };
  return { db, digests, parity, calls };
}

const redis = {} as never;
const tenants = async () => ["gldf", "rohlax"];
const record = (id: string, payload: Record<string, unknown>) => ({ recordId: id, payload, capturedAt: "2026-10-07T00:00:00.000Z" });

beforeEach(() => {
  holder.redisRecords.clear();
  holder.redisDown = false;
});

describe("client-records parity sweep", () => {
  it("does nothing when the dual-write is off", async () => {
    const { db, calls } = fakeDb();
    const result = await runClientRecordParitySweep({ enabled: () => false, tenants, redis, db });
    expect(result.status).toBe("disabled");
    expect(calls).toEqual([]);
  });

  it("follows STRELVA_CLIENT_RECORDS_DUAL_WRITE and DUAL_WRITE_PG by default", async () => {
    const { db, calls } = fakeDb();
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1");
    vi.stubEnv("DUAL_WRITE_PG", "0");
    expect((await runClientRecordParitySweep({ tenants, redis, db })).status).toBe("disabled");
    vi.stubEnv("DUAL_WRITE_PG", "");
    expect((await runClientRecordParitySweep({ tenants, redis, db })).status).toBe("ran");
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "");
    calls.length = 0;
    expect((await runClientRecordParitySweep({ tenants, redis, db })).status).toBe("disabled");
    expect(calls).toEqual([]);
    vi.unstubAllEnvs();
  });

  it("is unconfigured without Redis or a database, and writes nothing", async () => {
    const { db, calls } = fakeDb();
    expect((await runClientRecordParitySweep({ enabled: () => true, tenants, redis: null, db })).status).toBe("unconfigured");
    expect((await runClientRecordParitySweep({ enabled: () => true, tenants, redis, db: null })).status).toBe("unconfigured");
    expect(calls).toEqual([]);
  });

  it("only reads digests and records parity: never writes a client row", async () => {
    const { db, digests, parity, calls } = fakeDb();
    holder.redisRecords.set("spam_held|gldf", [record("a", { n: 1 }), record("b", { n: 2 })]);
    digests.set("spam_held|gldf", { a: clientRecordHash({ n: 1 }), b: "stale" });
    holder.redisRecords.set("booking_config|rohlax", [record("cfg", { open: true })]);
    const result = await runClientRecordParitySweep({ enabled: () => true, tenants, redis, db });
    expect(new Set(calls)).toEqual(new Set(["read_tenant_client_record_digests", "record_client_record_parity"]));
    expect(result.recorded).toBe(CLIENT_RECORD_STORES.length * 2);
    expect(result.outOfParity).toBe(2);
    expect(parity.get("spam_held|gldf|2026-10-08")).toEqual({ ok: false, missing: 0, mismatched: 1 });
    expect(parity.get("booking_config|rohlax|2026-10-08")).toEqual({ ok: false, missing: 1, mismatched: 0 });
    expect(parity.get("inquiry_reply|gldf|2026-10-08")?.ok).toBe(true);
    expect(result.failed).toBe(0);
  });

  it("a same-day rerun keeps one row per store, tenant and day", async () => {
    const { db, parity } = fakeDb();
    await runClientRecordParitySweep({ enabled: () => true, tenants, redis, db });
    await runClientRecordParitySweep({ enabled: () => true, tenants, redis, db });
    expect(parity.size).toBe(CLIENT_RECORD_STORES.length * 2);
  });

  it("records nothing when Redis is down, so the day never counts", async () => {
    holder.redisDown = true;
    const { db, parity } = fakeDb();
    const result = await runClientRecordParitySweep({ enabled: () => true, tenants, redis, db });
    expect(parity.size).toBe(0);
    expect(result.recorded).toBe(0);
    expect(result.failed).toBe(CLIENT_RECORD_STORES.length * 2);
    expect(result.stores.every((s) => s.status === "not_recorded")).toBe(true);
  });

  it("skips a whole store when one tenant's digest read fails", async () => {
    const { db, parity } = fakeDb({ digestsFail: "rohlax" });
    const result = await runClientRecordParitySweep({ enabled: () => true, tenants, redis, db });
    expect(parity.size).toBe(0);
    expect(result.stores[0]!.errors[0]).toEqual({ tenant: "rohlax", reason: "client_records_digests_failed: timeout" });
  });

  it("reports a failed parity record and a failed tenant list", async () => {
    const { db } = fakeDb({ recordFail: true });
    const failedRecord = await runClientRecordParitySweep({ enabled: () => true, tenants, redis, db });
    expect(failedRecord.recorded).toBe(0);
    expect(failedRecord.failed).toBe(CLIENT_RECORD_STORES.length * 2);
    const failedList = await runClientRecordParitySweep({ enabled: () => true, tenants: async () => { throw new Error("tenants down"); }, redis, db });
    expect(failedList.failed).toBe(1);
    expect(failedList.recorded).toBe(0);
  });

  it("skips stores it can't reach before the deadline", async () => {
    const { db } = fakeDb();
    let t = 0;
    const result = await runClientRecordParitySweep({ enabled: () => true, tenants, redis, db, deadlineMs: 10, now: () => (t += 6) });
    expect(result.stores.filter((s) => s.status === "skipped").length).toBeGreaterThan(0);
    expect(result.stores[0]!.status).toBe("recorded");
  });
});

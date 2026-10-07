/**
 * Backfill, parity, repair and the per-store read flag for the client-record
 * move (see mirror.ts for the whole pattern).
 */
import { getRedis } from "@/platform/infra/redis";
import {
  CLIENT_RECORD_PENDING_KEY,
  CLIENT_RECORD_STORES,
  clientRecordDb,
  clientRecordHash,
  parsePendingMember,
  pendingPayloadKey,
  type PendingRecord,
  writeClientRecord,
  type ClientRecord,
  type ClientRecordDb,
  type ClientRecordStore,
} from "./mirror";
import { CLIENT_RECORD_STORE_DEFINITIONS, type ClientRecordRedis } from "./stores";

export const PARITY_DAYS_REQUIRED = 7;

function redisReader(): ClientRecordRedis | null {
  return getRedis() as unknown as ClientRecordRedis | null;
}

export interface BackfillReport {
  store: ClientRecordStore;
  tenant: string;
  apply: boolean;
  redisRecords: number;
  written: number;
  unchanged: number;
  failed: { recordId: string; reason: string }[];
}

/** Copies what Redis still holds for one store and tenant. Dry run unless
 *  `apply`: a dry run reads Redis and writes nothing anywhere. Idempotent. */
export async function backfillClientRecords(
  store: ClientRecordStore,
  tenant: string,
  options: { apply: boolean; redis?: ClientRecordRedis | null; db?: ClientRecordDb | null },
): Promise<BackfillReport> {
  const redis = options.redis === undefined ? redisReader() : options.redis;
  const definition = CLIENT_RECORD_STORE_DEFINITIONS[store];
  const records = redis ? await definition.readRedis(redis, tenant) : [];
  const report: BackfillReport = { store, tenant, apply: options.apply, redisRecords: records.length, written: 0, unchanged: 0, failed: [] };
  if (!options.apply) return report;
  const db = options.db === undefined ? clientRecordDb() : options.db;
  if (!db) throw new Error("client_records_db_unconfigured");
  for (const record of records) {
    const result = await writeClientRecord(store, tenant, record, "backfill", definition.mode, db);
    if (result.status === "failed" || result.status === "skipped") report.failed.push({ recordId: record.recordId, reason: result.reason });
    else if (result.status === "unchanged" || result.status === "kept") report.unchanged++;
    else report.written++;
  }
  return report;
}

export interface ParityReport {
  store: ClientRecordStore;
  tenant: string;
  ok: boolean;
  redisCount: number;
  postgresCount: number;
  /** In Redis, not in Postgres. */
  missing: string[];
  /** In both, different content. keep_first stores compare the earliest value. */
  mismatched: string[];
  /** In Postgres only: Redis expired or trimmed it. Expected, not a failure. */
  postgresOnly: number;
  recorded: boolean;
}

/** Compares Redis and Postgres for one store and tenant by record hash, and
 *  records the day's result (unless `record: false`). */
export async function checkClientRecordParity(
  store: ClientRecordStore,
  tenant: string,
  options: { redis?: ClientRecordRedis | null; db?: ClientRecordDb | null; record?: boolean } = {},
): Promise<ParityReport> {
  const redis = options.redis === undefined ? redisReader() : options.redis;
  const db = options.db === undefined ? clientRecordDb() : options.db;
  if (!redis || !db) throw new Error("client_records_parity_unconfigured");
  const records = await CLIENT_RECORD_STORE_DEFINITIONS[store].readRedis(redis, tenant);
  const { data, error } = await db.rpc("read_tenant_client_record_digests", { p_tenant_id: tenant, p_store: store });
  if (error) throw new Error(`client_records_digests_failed: ${error.message ?? error.code ?? "error"}`);
  const digests = (data && typeof data === "object" ? data : {}) as Record<string, string>;
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const record of records) {
    const stored = digests[record.recordId];
    if (!stored) missing.push(record.recordId);
    else if (stored !== clientRecordHash(record.payload) && CLIENT_RECORD_STORE_DEFINITIONS[store].mode !== "keep_first") mismatched.push(record.recordId);
  }
  const redisIds = new Set(records.map((r) => r.recordId));
  const postgresCount = Object.keys(digests).length;
  const report: ParityReport = {
    store, tenant, ok: missing.length === 0 && mismatched.length === 0,
    redisCount: records.length, postgresCount, missing, mismatched,
    postgresOnly: Object.keys(digests).filter((id) => !redisIds.has(id)).length,
    recorded: false,
  };
  if (options.record !== false) report.recorded = await recordClientRecordParity(report, db);
  return report;
}

/** Records one compared result: one row per store, tenant and UTC day (a
 *  same-day rerun overwrites it). The only write parity ever makes. */
export async function recordClientRecordParity(report: ParityReport, db: ClientRecordDb): Promise<boolean> {
  const saved = await db.rpc("record_client_record_parity", {
    p_store: report.store, p_tenant_id: report.tenant, p_redis_count: report.redisCount, p_postgres_count: report.postgresCount,
    p_missing: report.missing.length, p_mismatched: report.mismatched.length,
  });
  return !saved.error;
}

export function clientRecordReadStores(): Set<ClientRecordStore> {
  const raw = process.env.STRELVA_CLIENT_RECORDS_READ ?? "";
  return new Set(raw.split(",").map((s) => s.trim()).filter((s): s is ClientRecordStore => (CLIENT_RECORD_STORES as readonly string[]).includes(s)));
}

/**
 * Where reads for a store come from. Redis unless the store's read flag is on
 * AND parity has held for 7 consecutive days. Without the flag this does no
 * I/O. Any doubt (no database, a failed streak read) answers Redis.
 */
export async function clientRecordReadSource(store: ClientRecordStore, db: ClientRecordDb | null = null): Promise<"redis" | "postgres"> {
  if (!clientRecordReadStores().has(store)) return "redis";
  const client = db ?? clientRecordDb();
  if (!client) return "redis";
  try {
    const { data, error } = await client.rpc("client_record_parity_streak", { p_store: store });
    if (error) return "redis";
    const days = Number((data as { days?: unknown } | null)?.days ?? 0);
    return days >= PARITY_DAYS_REQUIRED ? "postgres" : "redis";
  } catch {
    return "redis";
  }
}

/** Postgres read of one store for one tenant, newest first. */
export async function readClientRecords(store: ClientRecordStore, tenant: string, limit = 100, db: ClientRecordDb | null = clientRecordDb()): Promise<ClientRecord[]> {
  if (!db) throw new Error("client_records_db_unconfigured");
  const { data, error } = await db.rpc("read_tenant_client_records", { p_tenant_id: tenant, p_store: store, p_limit: limit, p_before: null });
  if (error) throw new Error(`client_records_read_failed: ${error.message ?? "error"}`);
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = row as { recordId: string; payload: Record<string, unknown>; capturedAt: string };
    return { recordId: r.recordId, payload: r.payload, capturedAt: r.capturedAt };
  });
}

/** Complete keyset read: no 1000-record ceiling or timestamp-only cursor. */
export async function readAllClientRecords(store: ClientRecordStore, tenant: string, db: ClientRecordDb | null = clientRecordDb()): Promise<ClientRecord[]> {
  if (!db) throw new Error("client_records_db_unconfigured");
  const rows: ClientRecord[] = [];
  let before: string | null = null;
  let after: string | null = null;
  for (;;) {
    const { data, error } = await db.rpc("read_tenant_client_records_page", { p_tenant_id: tenant, p_store: store, p_limit: 1000, p_before: before, p_after_record_id: after });
    if (error || !Array.isArray(data)) throw new Error("client_records_page_failed");
    const page = data as ClientRecord[];
    rows.push(...page);
    if (page.length < 1000) return rows;
    const last = page[page.length - 1]!;
    if (last.capturedAt === before && last.recordId === after) throw new Error("client_records_cursor_stalled");
    before = last.capturedAt; after = last.recordId;
  }
}

export async function findCalendlyTenant(userUri: string): Promise<string | null> {
  if ((await clientRecordReadSource("provider_metadata")) !== "postgres") return null;
  const result = await clientRecordDb()?.rpc("find_client_calendly_tenant", { p_user_uri: userUri });
  if (result?.error) return null;
  return typeof result?.data === "string" ? result.data : null;
}

/**
 * Reads one store through the flag, falling back to Redis on any Postgres
 * failure so a flipped store never serves less than Redis would.
 */
export async function readThroughFlag<T>(store: ClientRecordStore, tenant: string, fromRedis: () => Promise<T>, fromPostgres: (records: ClientRecord[]) => T): Promise<T> {
  if ((await clientRecordReadSource(store)) !== "postgres") return fromRedis();
  try {
    return fromPostgres(await readAllClientRecords(store, tenant));
  } catch (error) {
    console.error("[client-records] Postgres read failed; serving Redis", { store, tenant, error: error instanceof Error ? error.message : String(error) });
    return fromRedis();
  }
}

export interface RepairReport {
  checked: number;
  repaired: number;
  failed: number;
  dropped: number;
  remaining: number;
}

/** Retries queued dual-write failures by re-reading the record from Redis. */
export async function repairPendingClientRecords(
  options: { limit?: number; redis?: (ClientRecordRedis & { zrem(key: string, ...members: string[]): Promise<unknown>; zcard(key: string): Promise<number>; del(...keys: string[]): Promise<unknown> }) | null; db?: ClientRecordDb | null } = {},
): Promise<RepairReport> {
  const redis = (options.redis === undefined ? getRedis() : options.redis) as
    | (ClientRecordRedis & { zrem(key: string, ...members: string[]): Promise<unknown>; zcard(key: string): Promise<number>; del(...keys: string[]): Promise<unknown> })
    | null;
  const db = options.db === undefined ? clientRecordDb() : options.db;
  const report: RepairReport = { checked: 0, repaired: 0, failed: 0, dropped: 0, remaining: 0 };
  if (!redis || !db) return report;
  const members = ((await redis.zrange<unknown[]>(CLIENT_RECORD_PENDING_KEY, 0, Math.max(0, (options.limit ?? 200) - 1))) ?? []).map(String);
  const byTenant = new Map<string, ClientRecord[]>();
  for (const member of members) {
    report.checked++;
    const parsed = parsePendingMember(member);
    if (!parsed) { await redis.zrem(CLIENT_RECORD_PENDING_KEY, member); report.dropped++; continue; }
    const definition = CLIENT_RECORD_STORE_DEFINITIONS[parsed.store];
    const cacheKey = `${parsed.store}|${parsed.tenant}`;
    const snapshot = await redis.get<PendingRecord>(pendingPayloadKey(member));
    if (!snapshot && !byTenant.has(cacheKey)) byTenant.set(cacheKey, await definition.readRedis(redis, parsed.tenant));
    const record = snapshot ?? byTenant.get(cacheKey)?.find((r) => r.recordId === parsed.recordId);
    let result;
    if (record) result = await writeClientRecord(parsed.store, parsed.tenant, record, "repair", definition.mode, db);
    else if (definition.removalIsIntentional) result = await writeClientRecord(parsed.store, parsed.tenant, { recordId: parsed.recordId, remove: true }, "repair", "replace", db);
    else { await redis.zrem(CLIENT_RECORD_PENDING_KEY, member); report.dropped++; continue; }
    if (result.status === "failed" || result.status === "skipped") { report.failed++; continue; }
    await redis.zrem(CLIENT_RECORD_PENDING_KEY, member);
    await redis.del(pendingPayloadKey(member));
    report.repaired++;
  }
  report.remaining = Number(await redis.zcard(CLIENT_RECORD_PENDING_KEY));
  return report;
}

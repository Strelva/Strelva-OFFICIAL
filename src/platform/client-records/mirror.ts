/**
 * Client data moving out of Redis into Postgres (`tenant_client_records`).
 *
 * The reusable move pattern, applied per store:
 *   1. dual-write  mirrorClientRecord: every Redis write is also copied to
 *                  Postgres. Off unless STRELVA_CLIENT_RECORDS_DUAL_WRITE=1
 *                  (and DUAL_WRITE_PG is not 0). Bounded, never throws: a
 *                  failure is queued in `reb:client-records:pending` and
 *                  retried by repairPendingClientRecords (lead-mirror cron).
 *   2. backfill    backfillClientRecords (move.ts): copies what Redis holds,
 *                  dry run unless asked to apply.
 *   3. parity      checkClientRecordParity (move.ts): Redis vs Postgres record
 *                  hashes per tenant, recorded per day.
 *   4. read flip   clientRecordReadSource (move.ts): Postgres only when the
 *                  store is listed in STRELVA_CLIENT_RECORDS_READ and parity
 *                  has held 7 consecutive days.
 *
 * Redis keys keep their frozen names and stay as the cache.
 */
import { createHash } from "node:crypto";
import { getSupabase } from "@/lib/db/client";
import { dualWritePgEnabled } from "@/lib/db/dual-write";
import { getRedis } from "@/lib/redis";

export const CLIENT_RECORD_STORES = [
  "spam_held",
  "inquiry_timeline",
  "inquiry_reply",
  "booking_config",
  "account_grouping",
] as const;
export type ClientRecordStore = (typeof CLIENT_RECORD_STORES)[number];
export type ClientRecordMode = "replace" | "keep_first";
export type ClientRecordVia = "dual_write" | "repair" | "backfill";

export interface ClientRecord {
  recordId: string;
  payload: Record<string, unknown>;
  capturedAt: string;
}

export const CLIENT_RECORD_PENDING_KEY = "reb:client-records:pending";
export const CLIENT_RECORD_TIMEOUT_MS = 1500;
const PENDING_KEEP = 5000;

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };
type RpcCall = PromiseLike<RpcResult> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResult> };
export type ClientRecordDb = { rpc(name: string, args: Record<string, unknown>): RpcCall };

let override: { db: ClientRecordDb | null } | null = null;
/** Tests and scripts may supply their own client (null = unconfigured). */
export function setClientRecordDb(db: ClientRecordDb | null | undefined): void {
  override = db === undefined ? null : { db };
}
export function clientRecordDb(): ClientRecordDb | null {
  if (override) return override.db;
  return getSupabase() as unknown as ClientRecordDb | null;
}

export function clientRecordDualWriteEnabled(): boolean {
  return process.env.STRELVA_CLIENT_RECORDS_DUAL_WRITE === "1" && dualWritePgEnabled();
}

/** Stable JSON: object keys sorted at every level, so Redis and Postgres
 *  copies of the same record hash the same regardless of key order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function clientRecordHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

/** Wraps a non-object Redis value so every record payload is an object. */
export function asPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : { value: value ?? null };
}

export type ClientRecordWriteResult =
  | { status: "recorded" | "updated" | "unchanged" | "kept" | "removed"; workspaceId: string | null }
  | { status: "skipped"; reason: "disabled" | "unconfigured" }
  | { status: "failed"; reason: string };

async function call(name: string, args: Record<string, unknown>, db: ClientRecordDb): Promise<RpcResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const builder = db.rpc(name, args);
  const request = builder.abortSignal ? builder.abortSignal(controller.signal) : builder;
  const timeout = new Promise<RpcResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ data: null, error: { message: "client_record_timeout" } });
    }, CLIENT_RECORD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Promise.resolve(request), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** One write to Postgres. Never throws; `failed` is returned instead. */
export async function writeClientRecord(
  store: ClientRecordStore,
  tenant: string,
  record: ClientRecord | { recordId: string; remove: true; capturedAt?: string },
  via: ClientRecordVia,
  mode: ClientRecordMode = "replace",
  db: ClientRecordDb | null = clientRecordDb(),
): Promise<ClientRecordWriteResult> {
  if (!db) return { status: "skipped", reason: "unconfigured" };
  const removal = "remove" in record;
  try {
    const payload = removal ? null : record.payload;
    const { data, error } = await call("record_tenant_client_record", {
      p_tenant_id: tenant,
      p_store: store,
      p_record_id: record.recordId,
      p_payload: payload,
      p_payload_hash: payload ? clientRecordHash(payload) : null,
      p_captured_at: record.capturedAt ?? new Date().toISOString(),
      p_via: via,
      p_mode: removal ? "remove" : mode,
    }, db);
    if (error) return { status: "failed", reason: error.message ?? error.code ?? "error" };
    const row = (data ?? {}) as { status?: string; workspaceId?: string | null };
    if (row.status === "recorded" || row.status === "updated" || row.status === "unchanged" || row.status === "kept" || row.status === "removed") {
      return { status: row.status, workspaceId: row.workspaceId ?? null };
    }
    return { status: "failed", reason: "unexpected_response" };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
}

export function pendingMember(store: ClientRecordStore, tenant: string, recordId: string): string {
  return `${store}|${tenant}|${recordId}`;
}

export function parsePendingMember(member: string): { store: ClientRecordStore; tenant: string; recordId: string } | null {
  const first = member.indexOf("|");
  const second = first < 0 ? -1 : member.indexOf("|", first + 1);
  if (first <= 0 || second <= first + 1 || second === member.length - 1) return null;
  const store = member.slice(0, first) as ClientRecordStore;
  if (!CLIENT_RECORD_STORES.includes(store)) return null;
  return { store, tenant: member.slice(first + 1, second), recordId: member.slice(second + 1) };
}

async function rememberPending(store: ClientRecordStore, tenant: string, recordId: string, reason: string): Promise<void> {
  console.error("[client-records] record not copied to Postgres", { store, tenant, recordId, reason });
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.zadd(CLIENT_RECORD_PENDING_KEY, { score: Date.now(), member: pendingMember(store, tenant, recordId) });
    await redis.zremrangebyrank(CLIENT_RECORD_PENDING_KEY, 0, -(PENDING_KEEP + 1));
  } catch {
    // The Redis copy still exists; backfill and parity find it.
  }
}

/**
 * Dual-write one record. Call it after the Redis write succeeded. Never
 * throws and never fails the client's request.
 */
export async function mirrorClientRecord(
  store: ClientRecordStore,
  tenant: string,
  record: ClientRecord,
  mode: ClientRecordMode = "replace",
): Promise<ClientRecordWriteResult> {
  if (!clientRecordDualWriteEnabled()) return { status: "skipped", reason: "disabled" };
  const result = await writeClientRecord(store, tenant, record, "dual_write", mode);
  if (result.status === "failed") await rememberPending(store, tenant, record.recordId, result.reason);
  return result;
}

/** Dual-write a removal (the record left Redis on purpose). Never throws. */
export async function mirrorClientRecordRemoval(store: ClientRecordStore, tenant: string, recordId: string): Promise<ClientRecordWriteResult> {
  if (!clientRecordDualWriteEnabled()) return { status: "skipped", reason: "disabled" };
  const result = await writeClientRecord(store, tenant, { recordId, remove: true }, "dual_write");
  if (result.status === "failed") await rememberPending(store, tenant, recordId, result.reason);
  return result;
}

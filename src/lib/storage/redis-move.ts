/**
 * Moving a Redis-only value into Postgres without a cutover day.
 *
 * Pattern (Systems catalog section 5): the app writes Postgres and the old
 * Redis key, and reads Postgres first. When Postgres has no row, is not
 * configured, does not have the migration yet, or fails, the read falls back
 * to the Redis key. The Redis key is never renamed or deleted.
 *
 * OVERLAP: the money-data stream is building a generic "Redis to Postgres
 * move" module. This is the small local version used by report cadence and
 * analytics config; fold it into that module once both land.
 *
 * Kill switch: DUAL_WRITE_PG=0 turns Postgres off for both reads and writes
 * here, so the store behaves exactly as the Redis-only code did.
 */
import { getSupabase } from "../db/client";
import { dualWritePgEnabled } from "../db/dual-write";

export const REDIS_MOVE_TIMEOUT_MS = 1500;

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };
export type RedisMoveDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult> };

export type RedisMoveFailure = "unconfigured" | "schema_missing" | "unknown_tenant" | "invalid" | "timeout" | "error";
export type RedisMoveResult = { ok: true; data: unknown } | { ok: false; reason: RedisMoveFailure; message: string };

let override: { db: RedisMoveDb | null } | null = null;

/** Tests and scripts may supply their own client (null = unconfigured, undefined = default). */
export function setRedisMoveDb(db: RedisMoveDb | null | undefined): void {
  override = db === undefined ? null : { db };
}

function moveDb(): RedisMoveDb | null {
  if (!dualWritePgEnabled()) return null;
  if (override) return override.db;
  return getSupabase() as unknown as RedisMoveDb | null;
}

function classify(error: { message?: string; code?: string }): RedisMoveFailure {
  const detail = `${error.code ?? ""} ${error.message ?? ""}`;
  if (/_unknown_tenant/.test(detail)) return "unknown_tenant";
  if (/_invalid\b/.test(detail)) return "invalid";
  if (/PGRST202|42883|42P01|does not exist|Could not find the function/.test(detail)) return "schema_missing";
  return "error";
}

/** One bounded RPC. Never throws: the caller decides what a failure means. */
export async function callRedisMoveRpc(
  name: string,
  args: Record<string, unknown>,
  timeoutMs: number = REDIS_MOVE_TIMEOUT_MS,
): Promise<RedisMoveResult> {
  const db = moveDb();
  if (!db) return { ok: false, reason: "unconfigured", message: "Postgres is not configured" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve(db.rpc(name, args)),
      new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), timeoutMs); }),
    ]);
    if (result === "timeout") return { ok: false, reason: "timeout", message: `${name} did not answer in ${timeoutMs}ms` };
    if (result.error) return { ok: false, reason: classify(result.error), message: result.error.message ?? "unknown error" };
    return { ok: true, data: result.data };
  } catch (error) {
    return { ok: false, reason: "error", message: error instanceof Error ? error.message : String(error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * A failure that means "Postgres is not in play yet" (no client, kill switch,
 * migration not applied, or a tenant that only exists in Redis). Writes then
 * go to Redis alone, exactly as before the move.
 */
export function postgresNotInPlay(result: RedisMoveResult): boolean {
  return !result.ok && (result.reason === "unconfigured" || result.reason === "schema_missing" || result.reason === "unknown_tenant");
}

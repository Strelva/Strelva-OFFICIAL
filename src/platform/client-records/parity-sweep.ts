/**
 * The daily client-records parity run (cron `client-records-parity`), so the
 * 7-day streak that gates STRELVA_CLIENT_RECORDS_READ runs itself.
 *
 * Read-only toward client data: it reads Redis and the Postgres digests and
 * never writes `tenant_client_records` (no backfill, no repair). Its only
 * write is the parity row per store, tenant and UTC day
 * (`record_client_record_parity`, upsert, so a same-day rerun overwrites).
 *
 * A store is recorded only when every tenant compared cleanly that run. If
 * one tenant's compare fails, nothing is recorded for that store, so that day
 * never counts toward the streak: an incomplete check can't flip a read.
 */
import { getRedis } from "@/platform/infra/redis";
import { clientRecordDb, clientRecordDualWriteEnabled, CLIENT_RECORD_STORES, type ClientRecordDb, type ClientRecordStore } from "./mirror";
import { checkClientRecordParity, recordClientRecordParity, type ParityReport } from "./move";
import type { ClientRecordRedis } from "./stores";

export interface ParitySweepStore {
  store: ClientRecordStore;
  status: "recorded" | "not_recorded" | "skipped";
  tenants: number;
  outOfParity: string[];
  errors: { tenant: string; reason: string }[];
}

export interface ParitySweepResult {
  status: "disabled" | "unconfigured" | "ran";
  stores: ParitySweepStore[];
  recorded: number;
  outOfParity: number;
  failed: number;
}

export interface ParitySweepDeps {
  enabled?: () => boolean;
  tenants: () => Promise<string[]>;
  redis?: ClientRecordRedis | null;
  db?: ClientRecordDb | null;
  /** Stop starting new stores after this; unreached stores are `skipped`. */
  deadlineMs?: number;
  now?: () => number;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function runClientRecordParitySweep(deps: ParitySweepDeps): Promise<ParitySweepResult> {
  const result: ParitySweepResult = { status: "ran", stores: [], recorded: 0, outOfParity: 0, failed: 0 };
  if (!(deps.enabled ?? clientRecordDualWriteEnabled)()) return { ...result, status: "disabled" };
  const redis = deps.redis === undefined ? (getRedis() as unknown as ClientRecordRedis | null) : deps.redis;
  const db = deps.db === undefined ? clientRecordDb() : deps.db;
  if (!db || !redis) return { ...result, status: "unconfigured", failed: 1 };
  const now = deps.now ?? Date.now;
  const started = now();
  let tenants: string[];
  try {
    tenants = await deps.tenants();
  } catch (error) {
    return { ...result, failed: 1, stores: CLIENT_RECORD_STORES.map((store) => ({ store, status: "not_recorded", tenants: 0, outOfParity: [], errors: [{ tenant: "*", reason: message(error) }] })) };
  }
  for (const store of CLIENT_RECORD_STORES) {
    const entry: ParitySweepStore = { store, status: "not_recorded", tenants: tenants.length, outOfParity: [], errors: [] };
    result.stores.push(entry);
    if (deps.deadlineMs !== undefined && now() - started > deps.deadlineMs) { entry.status = "skipped"; continue; }
    const reports: ParityReport[] = [];
    for (const tenant of tenants) {
      try {
        reports.push(await checkClientRecordParity(store, tenant, { redis, db, record: false }));
      } catch (error) {
        entry.errors.push({ tenant, reason: message(error) });
      }
    }
    entry.outOfParity = reports.filter((r) => !r.ok).map((r) => r.tenant);
    result.outOfParity += entry.outOfParity.length;
    if (entry.errors.length) { result.failed += entry.errors.length; continue; }
    let all = true;
    for (const report of reports) {
      if (await recordClientRecordParity(report, db)) result.recorded++;
      else { all = false; entry.errors.push({ tenant: report.tenant, reason: "record_failed" }); result.failed++; }
    }
    entry.status = all ? "recorded" : "not_recorded";
  }
  return result;
}

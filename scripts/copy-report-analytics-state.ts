#!/usr/bin/env npx tsx
/**
 * Copy report cadence, last-sent markers and analytics config from Redis into
 * Postgres (`tenant_report_state`, `tenant_analytics_config`).
 *
 *   npx tsx scripts/copy-report-analytics-state.ts                    # dry run, every tenant (default)
 *   npx tsx scripts/copy-report-analytics-state.ts gldf               # dry run, one tenant
 *   npx tsx scripts/copy-report-analytics-state.ts --apply            # local database only
 *   npx tsx scripts/copy-report-analytics-state.ts --apply --i-have-jacobs-yes   # production, Jacob's call
 *
 * A dry run reads tenants straight from Postgres, the three Redis keys per
 * tenant (`reb:report-cadence:*`, `reb:report-sent:*`, `analytics:cfg:*`) and
 * what Postgres already holds. It writes nothing anywhere and sends nothing.
 *
 * --apply writes only what is missing, through the same RPCs the app uses,
 * marked 'backfill' so the database never replaces a newer value. It refuses
 * unless SUPABASE_URL is a loopback host or --i-have-jacobs-yes is passed.
 * Needs 20261007194000_tenant_report_and_analytics_state.sql applied first.
 */
import { getSupabase } from "../src/platform/infra/db/client";
import { getRedis } from "../src/platform/infra/redis";
import { getAllTenants } from "../src/lib/tenants";
import { callRedisMoveRpc, type RedisMoveResult } from "../src/lib/storage/redis-move";
import {
  parseCopyArgs,
  runReportAnalyticsCopy,
  type CopyTenant,
  type CopyWriteResult,
  type PostgresReportAnalyticsState,
  type RedisReportAnalyticsState,
} from "./report-analytics-copy";

async function tenants(): Promise<CopyTenant[]> {
  const db = getSupabase();
  if (!db) return (await getAllTenants()).map((t) => ({ id: t.id, siteName: t.siteName }));
  const { data, error } = await db.from("tenants").select("id, site_name").order("id");
  if (error) throw new Error(`Tenant read failed: ${error.message}`);
  return (data ?? []).map((row) => ({ id: row.id, siteName: row.site_name }));
}

async function redisState(tenantId: string): Promise<RedisReportAnalyticsState> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis is not configured; there is nothing to copy from.");
  const [cadence, sent, config] = await Promise.all([
    redis.get<string>(`reb:report-cadence:${tenantId}`),
    redis.get<string | number>(`reb:report-sent:${tenantId}`),
    redis.get<{ gscProperty?: string | null; ga4PropertyId?: string | null; updatedAt?: string | null }>(`analytics:cfg:${tenantId}`),
  ]);
  const ms = sent == null ? null : typeof sent === "number" ? sent : Number.parseInt(sent, 10);
  return {
    cadence: cadence === "weekly" || cadence === "monthly" ? cadence : null,
    lastSentAt: ms !== null && Number.isFinite(ms) ? ms : null,
    config: config && typeof config === "object"
      ? { gscProperty: config.gscProperty || null, ga4PropertyId: config.ga4PropertyId || null, updatedAt: config.updatedAt || null }
      : null,
  };
}

function unwrap(result: RedisMoveResult, what: string): unknown {
  if (!result.ok) throw new Error(`Postgres ${what} read failed: ${result.reason} (${result.message}). Is 20261007194000_tenant_report_and_analytics_state.sql applied?`);
  return result.data;
}

async function postgresState(tenantId: string): Promise<PostgresReportAnalyticsState> {
  const [state, config] = await Promise.all([
    callRedisMoveRpc("read_tenant_report_state", { p_tenant_id: tenantId }, 10_000),
    callRedisMoveRpc("read_tenant_analytics_config", { p_tenant_id: tenantId }, 10_000),
  ]);
  const row = unwrap(state, "report state") as { cadence?: unknown; lastSentAt?: unknown } | null;
  return {
    cadence: row?.cadence === "weekly" || row?.cadence === "monthly" ? row.cadence : null,
    lastSentAt: typeof row?.lastSentAt === "number" ? row.lastSentAt : null,
    hasConfig: unwrap(config, "analytics config") !== null,
  };
}

const asWrite = (result: RedisMoveResult): CopyWriteResult => (result.ok ? { ok: true } : { ok: false, reason: `${result.reason}: ${result.message}` });

async function main() {
  const options = parseCopyArgs(process.argv.slice(2));
  const outcome = await runReportAnalyticsCopy({ ...options, databaseUrl: process.env.SUPABASE_URL }, {
    tenants,
    redis: redisState,
    postgres: getSupabase() ? postgresState : null,
    setCadence: async (tenantId, cadence) => asWrite(await callRedisMoveRpc("set_tenant_report_cadence", { p_tenant_id: tenantId, p_cadence: cadence, p_via: "backfill" }, 10_000)),
    markSent: async (tenantId, sentAt) => asWrite(await callRedisMoveRpc("mark_tenant_report_sent", { p_tenant_id: tenantId, p_sent_at: sentAt, p_via: "backfill" }, 10_000)),
    writeConfig: async (tenantId, config) => asWrite(await callRedisMoveRpc("write_tenant_analytics_config", { p_tenant_id: tenantId, p_config: config, p_via: "backfill" }, 10_000)),
    log: options.json ? () => undefined : (line) => console.log(line),
  });
  if (options.json) console.log(JSON.stringify(outcome, null, 2));
  if (outcome.totals.failed > 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

#!/usr/bin/env npx tsx
/**
 * Read-only production readiness snapshot for Strelva 1.0.0.
 *
 *   npx tsx --env-file=<prod env file> scripts/production-readiness-snapshot.ts --i-have-jacobs-yes
 *   npx tsx --env-file=<prod env file> scripts/production-readiness-snapshot.ts --i-have-jacobs-yes --json
 *
 * Refuses to run without --i-have-jacobs-yes. Reads only:
 *   - Postgres through PostgREST: head counts and column selects (no RPC, no writes);
 *   - optional SNAPSHOT_DATABASE_URL: one READ ONLY transaction that lists
 *     supabase_migrations.schema_migrations versions via psql;
 *   - Auth: user counts (identities are never kept or printed);
 *   - Redis: SCAN, TYPE and ZCARD/LLEN/SCARD/HLEN. A fixed-key GET reads only the client-email policy enum. Never SET/DEL.
 * Prints counts and flags only: env secrets as present/absent, no customer data.
 * The logic and its tests live in scripts/readiness-snapshot.ts and
 * src/__tests__/production-readiness-snapshot.test.ts.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import {
  assertNoSensitiveOutput,
  countResult,
  type CountResponse,
  missingTable,
  formatReport,
  parseSnapshotArgs,
  requireJacobsYes,
  runReadinessSnapshot,
  type AuthUserSummary,
  type DbCount,
  type DbFilter,
  type ReadOnlyDb,
  type ReadOnlyRedis,
} from "./readiness-snapshot";

type Query = {
  eq(column: string, value: unknown): Query;
  not(column: string, operator: string, value: unknown): Query;
  is(column: string, value: null): Query;
  gte(column: string, value: string): Query;
  order(column: string, options: { ascending: boolean }): Query;
  limit(n: number): Query;
} & PromiseLike<{ data: unknown; count: number | null; error: { message?: string; code?: string } | null }>;

type SelectOnly = { from(table: string): { select(columns: string, options?: { count?: "exact"; head?: boolean }): Query } };

function applyFilters(query: Query, filters: DbFilter[] = []): Query {
  let q = query;
  for (const filter of filters) {
    if (filter.op === "eq") q = q.eq(filter.column, filter.value);
    else if (filter.op === "not_null") q = q.not(filter.column, "is", null);
    else if (filter.op === "is_null") q = q.is(filter.column, null);
    else q = q.gte(filter.column, filter.value);
  }
  return q;
}

/** Exposes `.from(t).select(...)` and nothing else: no insert/update/delete/rpc. */
function readOnlyDb(url: string, key: string): ReadOnlyDb {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const db = { from: (table: string) => ({ select: (columns: string, options?: { count?: "exact"; head?: boolean }) => client.from(table).select(columns, options) }) } as unknown as SelectOnly;
  return {
    async count(table, filters): Promise<DbCount> {
      const result = countResult((await applyFilters(db.from(table).select("*", { count: "exact", head: true }), filters)) as CountResponse);
      if (result.ok || result.missing) return result;
      // A head-only count of a missing table can come back 204 with no error and
      // no count. A zero-row GET carries PostgREST's error body, so it can tell.
      const probe = (await db.from(table).select("*").limit(0)) as CountResponse;
      if (probe.error) return { ok: false, missing: missingTable(probe.error) || probe.status === 404, reason: probe.error.message || "unknown" };
      return result;
    },
    async rows(table, columns, options) {
      let q = applyFilters(db.from(table).select(columns), options?.filters);
      if (options?.orderBy) q = q.order(options.orderBy.column, { ascending: options.orderBy.ascending });
      if (options?.limit) q = q.limit(options.limit);
      const { data, error } = await q;
      if (error) return { ok: false, missing: missingTable(error), reason: error.message ?? error.code ?? "unknown" };
      return { ok: true, rows: (Array.isArray(data) ? data : []) as never[] };
    },
  };
}

function readOnlyRedis(url: string, token: string): ReadOnlyRedis {
  const redis = new Redis({ url, token });
  return {
    async clientEmailOverride(tenantId) {
      const value = await redis.get(`reb:client-email:${tenantId}`);
      return value === "on" || value === "off" ? value : value === null ? "absent" : "unknown";
    },
    async scan(cursor, options) {
      const [next, keys] = await redis.scan(cursor, options);
      return [String(next), keys];
    },
    type: (key) => redis.type(key),
    async cardinality(key, type) {
      if (type === "zset") return redis.zcard(key);
      if (type === "list") return redis.llen(key);
      if (type === "set") return redis.scard(key);
      if (type === "hash") return redis.hlen(key);
      return null;
    },
  };
}

async function authUsers(url: string, key: string): Promise<AuthUserSummary> {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const since = Date.now() - 30 * 86_400_000;
  const summary: AuthUserSummary = { total: 0, emailConfirmed: 0, signedInLast30Days: 0 };
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Auth user count failed: ${error.message}`);
    for (const user of data.users) {
      summary.total++;
      if (user.email_confirmed_at) summary.emailConfirmed++;
      if (user.last_sign_in_at && Date.parse(user.last_sign_in_at) >= since) summary.signedInLast30Days++;
    }
    if (data.users.length < 1000) break;
  }
  return summary;
}

/** One READ ONLY transaction through psql; the URL goes in PGDATABASE-free argv only for psql. */
function schemaMigrations(databaseUrl: string): string[] {
  const sql = "BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout = '10s'; SELECT version FROM supabase_migrations.schema_migrations ORDER BY version; COMMIT;";
  const result = spawnSync("psql", [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", timeout: 30_000 });
  if (result.status !== 0) throw new Error(`schema_migrations read failed (psql exit ${result.status ?? "signal"}).`);
  return result.stdout.split("\n").map((line) => line.trim()).filter((line) => /^\d{14}$/.test(line));
}

async function main() {
  const options = parseSnapshotArgs(process.argv.slice(2));
  requireJacobsYes(options);
  const env = process.env;
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const repoMigrations = readdirSync(migrationsDir).filter((f) => /^\d{14}_.+\.sql$/.test(f)).map((f) => f.replace(/\.sql$/, ""));

  const report = await runReadinessSnapshot(options, {
    db: url && key ? readOnlyDb(url, key) : null,
    redis: env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? readOnlyRedis(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN) : null,
    authUsers: url && key ? () => authUsers(url, key) : null,
    appliedVersions: env.SNAPSHOT_DATABASE_URL ? async () => schemaMigrations(env.SNAPSHOT_DATABASE_URL!) : null,
    repoMigrations,
    env,
    log: (line) => console.log(line),
  });
  const text = options.json ? JSON.stringify(report, null, 2) : formatReport(report).join("\n");
  assertNoSensitiveOutput(text);
  console.log(text);
  if (!report.silentRollout.safe) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

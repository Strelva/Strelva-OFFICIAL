#!/usr/bin/env node
/**
 * PostgREST runs a STABLE or IMMUTABLE function in a read-only transaction,
 * so one that reaches a row lock (FOR UPDATE / FOR NO KEY UPDATE / FOR SHARE /
 * FOR KEY SHARE), itself or through any function it calls, fails every call
 * from supabase-js with 25006 "cannot execute SELECT FOR ... in a read-only
 * transaction". psql and the SQL checks never see it: their transactions are
 * read-write. This walks the public schema of a migrated database and names
 * each such function with the call path to the lock.
 *
 *   node scripts/check-readonly-rpcs.mjs <postgres-url>   # loopback only
 *
 * Repair true readers by moving authorization locks out of their read paths.
 * Mutations must retain their locks; the scanner never proves writer safety.
 */
import { execFileSync } from "node:child_process";
import { findReadonlyLockPaths } from "./lib/readonly-rpcs.mjs";
import * as postgresModule from "./release-safety/postgres.ts";
const { isLocalUrl, pgEnv } = postgresModule.default ?? postgresModule;

const url = process.argv[2] || process.env.STRELVA_LOCAL_DB_URL || "";
if (!url) throw new Error("Pass the disposable database URL.");
if (!isLocalUrl(url)) throw new Error("Refusing a non-loopback database.");

const sql = `select coalesce(json_agg(json_build_object('name', p.proname, 'volatility', p.provolatile, 'signature', p.oid::regprocedure::text, 'body', p.prosrc)), '[]')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'`;
const rows = JSON.parse(execFileSync("psql", [url, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { env: pgEnv(), encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));

const findings = findReadonlyLockPaths(rows);
if (findings.length) {
  console.error(`${findings.length} STABLE/IMMUTABLE function(s) reach a row lock and fail through PostgREST (25006):`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`Read-only RPCs: ${rows.length} public functions checked; none reach a row lock.`);

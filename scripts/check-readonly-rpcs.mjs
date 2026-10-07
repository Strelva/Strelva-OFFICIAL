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
 * Fix a finding by declaring the reader VOLATILE (it takes locks, so it is),
 * or by moving the lock out of the read path.
 */
import { execFileSync } from "node:child_process";

const url = process.argv[2] || process.env.STRELVA_LOCAL_DB_URL || "";
if (!url) throw new Error("Pass the disposable database URL.");
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Refusing a non-loopback database.");

const sql = `select coalesce(json_agg(json_build_object('name', p.proname, 'volatility', p.provolatile, 'body', pg_get_functiondef(p.oid))), '[]')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'`;
const rows = JSON.parse(execFileSync("psql", [url, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));

const LOCK = /\bfor\s+(?:no\s+key\s+update|key\s+share|share|update)\b(?!\s+each\b)/i;
const bodies = new Map();
for (const row of rows) {
  // Comments can mention a lock without taking one.
  const body = row.body.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  bodies.set(row.name, [...(bodies.get(row.name) ?? []), { volatility: row.volatility, body }]);
}
const names = [...bodies.keys()];
const callPattern = new RegExp(`(?:public\\.)?\\b(${names.map((name) => name.replace(/[^a-z0-9_]/gi, "")).join("|")})\\s*\\(`, "gi");
const callees = (body) => new Set([...body.matchAll(callPattern)].map((match) => match[1].toLowerCase()).filter((name) => bodies.has(name)));

const memo = new Map();
function lockPath(name, seen = new Set()) {
  if (memo.has(name)) return memo.get(name);
  if (seen.has(name)) return null;
  seen.add(name);
  let path = null;
  for (const { body } of bodies.get(name)) {
    if (LOCK.test(body)) { path = [name]; break; }
    for (const callee of callees(body)) {
      if (callee === name) continue;
      const below = lockPath(callee, seen);
      if (below) { path = [name, ...below]; break; }
    }
    if (path) break;
  }
  memo.set(name, path);
  return path;
}

const findings = [];
for (const [name, defs] of bodies) {
  if (!defs.some((def) => def.volatility === "s" || def.volatility === "i")) continue;
  const path = lockPath(name);
  if (path) findings.push(`${name}: ${path.join(" -> ")}`);
}
findings.sort();
if (findings.length) {
  console.error(`${findings.length} STABLE/IMMUTABLE function(s) reach a row lock and fail through PostgREST (25006):`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`Read-only RPCs: ${bodies.size} public functions checked; none reach a row lock.`);

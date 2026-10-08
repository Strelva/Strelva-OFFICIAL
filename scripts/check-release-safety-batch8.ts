#!/usr/bin/env npx tsx
/**
 * Proposed batch 8 (readers fix + w6): forward → rollback → forward with the
 * same catalog/ACL comparison as check:release-safety, on top of batches 0–7
 * and 7A in packet order, in a private Unix-socket cluster. Opt-in until the
 * batch is promoted into `batches`; it never touches a hosted database.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./release-safety/batches.json";
import { createTempPostgres } from "./release-safety/temp-postgres";
import { catalog, command, sql, type Catalog } from "./release-safety/postgres";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migrations = join(root, "supabase/migrations");
type Item = { file: string; sha256: string; rollback?: string };

function differences(actual: Catalog, expected: Catalog): Record<string, string[]> {
  const changes: Record<string, string[]> = {};
  for (const kind of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const before = expected[kind] ?? {}, after = actual[kind] ?? {};
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    if (changed.length) changes[kind] = changed.sort();
  }
  return changes;
}
/** psql failures name a private diagnostics file; surface its first ERROR line. */
function firstError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const path = /diagnostics: (\S+)/.exec(message)?.[1];
  const log = path && existsSync(path) ? readFileSync(path, "utf8") : message;
  return (log.split("\n").find((line) => line.includes("ERROR")) ?? message).slice(0, 300);
}
function apply(url: string, item: Item) {
  const file = join(migrations, item.file);
  if (createHash("sha256").update(readFileSync(file)).digest("hex") !== item.sha256) throw new Error("Forward migration digest drift: " + item.file);
  sql(url, { file });
}

function main() {
  const batch8 = manifest.proposed.find((entry) => entry.batch === "8");
  if (!batch8) throw new Error("Proposed batch 8 is missing from batches.json.");
  const items: Item[] = batch8.items;
  for (const item of items) if (item.rollback !== "rollback-" + item.file) throw new Error("Rollback companion is not rollback-<file>: " + item.file);
  // 7A has no pinned manifest yet; its four files are taken from disk in order.
  const batch7a = readdirSync(migrations).filter((name) => /^2026100915[1-4]000_.+\.sql$/.test(name)).sort();
  if (batch7a.length !== 4) throw new Error("Expected the four batch 7A files.");
  const temporary = createTempPostgres();
  const { cluster } = temporary;
  const socket = join(cluster, "socket");
  mkdirSync(socket, { mode: 0o700 });
  const port = 61_000 + (process.pid + 1500) % 3000;
  const admin = `postgresql:///postgres?host=${encodeURIComponent(socket)}&port=${port}&application_name=release-safety-batch8`;
  try {
    command("initdb", ["-D", join(cluster, "data"), "--locale=C", "--encoding=UTF8", "--auth=trust", "--no-instructions"]);
    command("pg_ctl", ["-D", join(cluster, "data"), "-l", join(cluster, "postgres.log"), "-o", `-F -k '${socket}' -c listen_addresses='' -p ${port}`, "-w", "start"]);
    temporary.recordPostmaster();
    sql(admin, { file: join(root, "scripts/sql/local-supabase-shim.sql") });
    for (const item of manifest.baseline) apply(admin, item);
    for (const batch of manifest.batches) for (const item of batch) apply(admin, item);
    for (const file of batch7a) sql(admin, { file: join(migrations, file) });
    console.log(`Applied baseline, batches 0-${manifest.batches.length - 1} and 7A (${batch7a.length} files).`);
    const before = catalog(admin, root);
    for (const item of items) apply(admin, item);
    const forward = catalog(admin, root);
    console.log(`Batch 8: ${items.length} files forward.`);
    // Every companion runs in reverse order even after a refusal, so one run
    // reports every failing file and the full remaining catalog difference.
    const refused: string[] = [];
    for (const item of [...items].reverse()) {
      try { sql(admin, { file: join(migrations, item.rollback!) }); }
      catch (error) { refused.push(`${item.rollback}: ${firstError(error)}`); }
    }
    const restored = differences(catalog(admin, root), before);
    for (const line of refused) console.error("Rollback refused: " + line);
    if (Object.keys(restored).length) {
      console.error("Batch 8 rollback left catalog differences from the pre-batch-8 catalog:");
      for (const [kind, keys] of Object.entries(restored)) console.error(`  ${kind} (${keys.length}): ${keys.join(", ")}`);
    }
    if (refused.length || Object.keys(restored).length) throw new Error(`Batch 8 rollback: ${refused.length} companion(s) refused; catalog ${Object.keys(restored).length ? "not " : ""}restored.`);
    for (const item of items) apply(admin, item);
    const again = differences(catalog(admin, root), forward);
    if (Object.keys(again).length) throw new Error("Batch 8 second forward differs: " + JSON.stringify(again));
    console.log(`Batch 8: ${items.length} forward, rollback, forward; catalog/ACL restored and reproduced.`);
  } finally {
    temporary.cleanup();
  }
}
try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : "Local batch 8 rehearsal failed.");
  process.exitCode = 1;
}

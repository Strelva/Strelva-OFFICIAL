#!/usr/bin/env npx tsx
/** Consistent dump → fresh database → row count comparison. Local fixtures by default. */
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { command, databaseUrl, identifier, pgBinary, pgEnv, requireLocal, sql } from "./release-safety/postgres";

export type TableCounts = Record<string, string>;
export function compareCounts(source: TableCounts, restored: TableCounts): void {
  const changed = [...new Set([...Object.keys(source), ...Object.keys(restored)])].filter((table) => source[table] !== restored[table]);
  if (changed.length) throw new Error(`Row count mismatch in ${changed.length} table(s).`);
}

export function tableCounts(url: string, snapshot?: string): TableCounts {
  // Discover and count tables inside the same transaction/snapshot as pg_dump.
  // JSON strings preserve bigint counts without rounding them through JS numbers.
  const snapshotSql = snapshot ? `set transaction snapshot '${snapshot}';` : "";
  const output = command("psql", ["--dbname=" + url, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], `begin isolation level repeatable read read only;
${snapshotSql}
select 'select coalesce(jsonb_object_agg(table_name,row_count),''{}''::jsonb) from (' ||
  coalesce(string_agg(format('select %L::text as table_name, count(*)::text as row_count from %I.%I',
    jsonb_build_array(ns.nspname,c.relname)::text, ns.nspname,c.relname), ' union all ' order by ns.nspname,c.relname),
    'select null::text as table_name, null::text as row_count where false') || ') counts'
from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
where c.relkind in ('r','p') and ns.nspname not like 'pg_%' and ns.nspname <> 'information_schema'
\\gexec
rollback;`);
  return JSON.parse(output);
}

export async function rehearse(source: string, admin: string, output: string, jacobsYes = false) {
  // Both guards run before filesystem mutation or any connection.
  requireLocal(source, jacobsYes);
  requireLocal(admin, jacobsYes);
  const out = resolve(output);
  const repo = dirname(dirname(fileURLToPath(import.meta.url)));
  const location = relative(repo, out);
  if (!location || (!location.startsWith("../") && location !== "..")) throw new Error("Backup output must be outside the repository.");
  mkdirSync(out, { mode: 0o700, recursive: false });
  chmodSync(out, 0o700);
  const name = "strelva_restore_" + randomUUID().replaceAll("-", "").slice(0, 20);
  const target = databaseUrl(admin, name);
  const started = performance.now();
  const keeper = spawn(pgBinary("psql"), ["--dbname=" + source, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { env: pgEnv(), stdio: ["pipe", "pipe", "ignore"] });
  const lines = createInterface({ input: keeper.stdout });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const exported = new Promise<string>((accept, reject) => {
      lines.once("line", accept);
      keeper.once("error", () => reject(new Error("Could not start source snapshot process.")));
      keeper.once("exit", () => reject(new Error("Source snapshot process exited early.")));
      timer = setTimeout(() => reject(new Error("Source snapshot export timed out.")), 30_000);
    });
    keeper.stdin.on("error", () => { /* Failure is reported by snapshot/process checks. */ });
    keeper.stdin.write("begin isolation level repeatable read read only;\nselect pg_export_snapshot();\n");
    const snapshot = (await exported).trim();
    clearTimeout(timer);
    if (!/^[\da-f]+-[\da-f]+-\d+$/i.test(snapshot)) throw new Error("Could not export a consistent source snapshot.");
    const counts = tableCounts(source, snapshot);
    const dump = join(out, "database.dump");
    // The private parent directory protects partial dumps too.
    command("pg_dump", ["--dbname=" + source, "--format=custom", "--snapshot=" + snapshot, "--file=" + dump]);
    chmodSync(dump, 0o600);
    const dumpSeconds = (performance.now() - started) / 1000;
    keeper.stdin.end("rollback;\n\\q\n");
    sql(admin, { text: `create database ${identifier(name)} template template0;` });
    const restoreStarted = performance.now();
    // Roles are required by RLS policy definitions. Never copy login rights or passwords.
    const roles: string[] = JSON.parse(sql(source, { text: "select coalesce(json_agg(rolname),'[]') from pg_roles where rolname not like 'pg_%';" }));
    const existing = new Set<string>(JSON.parse(sql(admin, { text: "select json_agg(rolname) from pg_roles;" })));
    for (const role of roles) if (!existing.has(role)) sql(admin, { text: `create role ${identifier(role)} nologin;` });
    command("pg_restore", ["--exit-on-error", "--no-owner", "--no-acl", "--dbname=" + target, dump]);
    const restored = tableCounts(target);
    compareCounts(counts, restored);
    const receipt = {
      database: name, dumpBytes: statSync(dump).size, dumpSeconds: Number(dumpSeconds.toFixed(3)),
      restoreSeconds: Number(((performance.now() - restoreStarted) / 1000).toFixed(3)),
      tables: Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([table, count]) => ({ table: JSON.parse(table) as string[], source: count, restored: restored[table] })),
      rowCountsMatch: true,
      scope: "Schema/data restore with ownership and ACLs omitted; not hosted Auth, storage or Redis recovery.",
    };
    writeFileSync(join(out, "restore-receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
    return receipt;
  } finally {
    clearTimeout(timer);
    lines.close();
    if (keeper.exitCode === null) keeper.kill();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const yes = args.includes("--i-have-jacobs-yes");
  const values = args.filter((arg) => arg !== "--i-have-jacobs-yes");
  try {
    if (values.length !== 6 || values[0] !== "--source-env" || values[2] !== "--target-admin-env" || values[4] !== "--out") throw new Error("Usage: pnpm exec tsx scripts/rehearse-database-restore.ts --source-env <name> --target-admin-env <name> --out <fresh-private-directory> [--i-have-jacobs-yes]");
    const source = process.env[values[1]!];
    const admin = process.env[values[3]!];
    if (!source || !admin) throw new Error("Named source and target environment variables are required.");
    const receipt = await rehearse(source, admin, values[5]!, yes);
    console.log(`Restore passed: ${receipt.tables.length} tables, ${receipt.dumpBytes} bytes, dump ${receipt.dumpSeconds}s, restore ${receipt.restoreSeconds}s. Private receipt retained.`);
  } catch (error) {
    console.error(error instanceof Error && !("code" in error) ? error.message : "Restore rehearsal failed; inspect the private artifact.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main();

#!/usr/bin/env npx tsx
/**
 * Batch 8 is forward-only schema. Prove permission recovery → reactivation
 * with exact public catalog/data equality, preserving later security repairs.
 * Legacy schema reversal is separately covered by batches 0–7. Local only.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
const recovery = join(root, "scripts/release-safety");
function fingerprint(url: string): string {
  return sql(url, { text: readFileSync(join(recovery, "runtime-catalog.sql"), "utf8") + "\nselect pg_temp.batch8_runtime_fingerprint();" });
}
function recover(url: string, file: string, expected = fingerprint(url)) {
  command("psql", ["--dbname=" + url, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "expected_runtime_fingerprint=" + expected, "-f", join(recovery, file)]);
}
function data(url: string): string {
  return sql(url, { text: `create or replace function pg_temp.runtime_rows() returns jsonb language plpgsql as $$
    declare relation record; result jsonb := '{}'::jsonb; rows jsonb;
    begin
      for relation in select tablename from pg_tables where schemaname='public' order by tablename loop
        execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r',relation.tablename) into rows;
        result := result || jsonb_build_object(relation.tablename,rows);
      end loop;
      return result;
    end $$; select pg_temp.runtime_rows();` });
}
function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);
}
function expectRefusal(url: string, action: () => void, message: string, reason: string) {
  const before = catalog(url, root), rows = data(url);
  let refused = false;
  try { action(); } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const path = /diagnostics: (\S+)/.exec(message)?.[1];
    refused = (path && existsSync(path) ? readFileSync(path, "utf8") : message).includes(reason);
  }
  if (!refused) throw new Error(message + " unexpectedly accepted");
  assertEqual(catalog(url, root), before, message + " changed public catalog");
  assertEqual(data(url), rows, message + " changed public rows");
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
  const args = process.argv.slice(2), tails: string[] = [];
  for (let i = 0; i < args.length; i += 2) {
    const file = args[i + 1];
    if (args[i] !== "--tail" || !file || !/^\d{14}_[a-z0-9_]+\.sql$/.test(file)) throw new Error("Expected --tail <forward-migration.sql>");
    tails.push(file);
  }
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
    sql(admin, { text: `insert into public.users(id,email,verified_at) values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@release.example',now()),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','unverified@release.example',null);
      insert into public.tenants(id,site_name,active,subscription_status,subscription_plan) values('release-fixture','Release Fixture',true,'active','growth');
      insert into public.memberships(user_id,tenant_id,role) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','release-fixture','owner');
      insert into public.content(tenant_id,section,data) values('release-fixture','hero','{"headline":"Before 1.0"}');` });
    const legacy = () => sql(admin, { file: join(recovery, "legacy-behavior.sql") });
    legacy();
    const before = catalog(admin, root);
    recover(admin, "capture-batch8-runtime-baseline.sql");
    expectRefusal(admin, () => recover(admin, "capture-batch8-runtime-baseline.sql"), "Overwrite baseline", "already exists");
    for (const item of items) apply(admin, item);
    recover(admin, "capture-batch8-runtime-scope.sql");
    for (const file of tails) sql(admin, { file: join(migrations, file) });
    // Commit a real contract's fictional accepted/ambiguous/bounced provider
    // evidence so row equality proves more than an empty database's counts.
    command("psql", ["--dbname=" + admin, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"], readFileSync(join(root, "tests/inquiry-decision-notice-events-schema.sql"), "utf8").replace(/^rollback;$/m, "commit;"));
    const forward = catalog(admin, root), rows = data(admin);
    const added = Object.keys(forward.functions ?? {}).filter((key) => !Object.hasOwn(before.functions ?? {}, key));
    expectRefusal(admin, () => recover(admin, "disable-batch8-runtime.sql", "0".repeat(64)), "Wrong approved hash", "batch8_runtime_recovery_catalog_drift");
    expectRefusal(admin, () => recover(admin, "enable-batch8-runtime.sql"), "Enable before disable", "batch8_runtime_recovery_wrong_state");
    sql(admin, { text: "grant execute on function public.read_owner_decision_website_preview(uuid,uuid,text,text) to anon;" });
    expectRefusal(admin, () => recover(admin, "disable-batch8-runtime.sql"), "Browser privilege bypass", "batch8_runtime_recovery_browser_exposure");
    sql(admin, { text: "revoke execute on function public.read_owner_decision_website_preview(uuid,uuid,text,text) from anon;" });
    // A inherited grant cannot be removed by revoking the direct service ACL.
    sql(admin, { text: "create role batch8_inherited noinherit; grant execute on function public.read_owner_decision_website_preview(uuid,uuid,text,text) to batch8_inherited; grant batch8_inherited to service_role;" });
    expectRefusal(admin, () => recover(admin, "disable-batch8-runtime.sql"), "Inherited privilege bypass", "batch8_runtime_recovery_inherited_execute");
    sql(admin, { text: "revoke batch8_inherited from service_role; revoke execute on function public.read_owner_decision_website_preview(uuid,uuid,text,text) from batch8_inherited; drop role batch8_inherited;" });
    sql(admin, { text: "create role batch8_browser_bridge inherit;" });
    for (let round = 1; round <= 2; round++) {
      recover(admin, "disable-batch8-runtime.sql");
      const disabled = catalog(admin, root);
      const revoked: string[] = JSON.parse(sql(admin, { text: "select coalesce(jsonb_agg(signature order by signature),'[]'::jsonb) from release_runtime_recovery.batch8_grants;" }));
      const changes = differences(disabled, forward);
      assertEqual(Object.keys(changes), ["functions"], "Permission recovery changed schema");
      assertEqual(changes.functions, revoked, "Permission recovery changed nonselected functions");
      for (const key of revoked) {
        const actual = disabled.functions?.[key] as Record<string, unknown>, expected = forward.functions?.[key] as Record<string, unknown>;
        assertEqual({ ...actual, acl: expected.acl }, expected, "Recovery changed function body or owner: " + key);
      }
      if (sql(admin, { text: "select exists(select 1 from release_runtime_recovery.batch8_grants where has_function_privilege('service_role',function_oid,'execute'));" }) !== "f") throw new Error("Disabled service RPC still executable");
      expectRefusal(admin, () => sql(admin, { text: "begin; set local role service_role; select public.read_owner_decision_website_preview(null::uuid,null::uuid,null::text,null::text); rollback;" }), "Actual disabled RPC invocation", "permission denied for function read_owner_decision_website_preview");
      assertEqual(data(admin), rows, "Recovery changed customer/provider evidence");
      if (sql(admin, { text: "select has_schema_privilege('anon','release_runtime_recovery','usage') or has_schema_privilege('authenticated','release_runtime_recovery','usage') or has_schema_privilege('service_role','release_runtime_recovery','usage');" }) !== "f") throw new Error("Recovery metadata exposed");
      legacy();
      expectRefusal(admin, () => recover(admin, "disable-batch8-runtime.sql"), "Duplicate disable", "batch8_runtime_recovery_wrong_state");
      // Prove source drift is refused before restore and never reopened.
      sql(admin, { text: "create function public.runtime_recovery_drift_probe() returns boolean language sql as $$ select true $$;" });
      expectRefusal(admin, () => recover(admin, "enable-batch8-runtime.sql"), "Unreviewed catalog drift", "batch8_runtime_recovery_catalog_drift");
      sql(admin, { text: "drop function public.runtime_recovery_drift_probe();" });
      // Role memberships/attributes are outside the public object catalog.
      // Refusals must leave service grants dark and protected recovery disabled.
      for (const drift of [
        { label: "Direct disabled-phase browser inheritance", apply: "grant service_role to authenticated;", undo: "revoke service_role from authenticated;" },
        { label: "Transitive disabled-phase browser inheritance", apply: "grant service_role to batch8_browser_bridge; grant batch8_browser_bridge to authenticated;", undo: "revoke batch8_browser_bridge from authenticated; revoke service_role from batch8_browser_bridge;" },
        { label: "Disabled-phase browser superuser", apply: "alter role anon superuser;", undo: "alter role anon nosuperuser;" },
      ]) {
        sql(admin, { text: drift.apply });
        expectRefusal(admin, () => recover(admin, "enable-batch8-runtime.sql"), drift.label, "batch8_runtime_recovery_role_drift");
        if (sql(admin, { text: "select (select state='disabled' from release_runtime_recovery.batch8_state where singleton) and not exists(select 1 from release_runtime_recovery.batch8_grants where has_function_privilege('service_role',function_oid,'execute'));" }) !== "t") throw new Error(drift.label + " reopened service execution");
        sql(admin, { text: drift.undo });
      }
      recover(admin, "enable-batch8-runtime.sql");
      assertEqual(catalog(admin, root), forward, "Reactivation did not reproduce entire secured catalog");
      assertEqual(data(admin), rows, "Reactivation changed retained evidence");
      legacy();
      console.log(`Runtime recovery round ${round}: ${revoked.length} introduced service RPCs dark; entire forward schema/bodies/owners preserved; exact all-public rows retained; legacy auth/content/billing passed; exact catalog/ACL reproduced.`);
    }
    const receipt = { scope: "local forward-only batch8 schema; permission recovery only; no hosted/provider effects exercised", files: items.length, correctiveTails: tails,
      introducedFunctions: added.length, tables: Object.keys(forward.tables ?? {}).length, runtimeRecoveryRounds: 2,
      exactCatalogReproduced: true, exactPublicRowsPreserved: true, legacyBehavior: true, failClosed: ["baseline overwrite", "wrong approved hash", "wrong state", "catalog drift", "browser privilege bypass", "inherited privilege bypass", "actual denied RPC invocation", "disabled-phase direct/transitive browser inheritance", "disabled-phase superuser drift"] };
    const out = join(root, "output/release-safety", "batch8-" + Date.now());
    mkdirSync(out, { recursive: true, mode: 0o700 });
    writeFileSync(join(out, "runtime-recovery-receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
    console.log("Local permission recovery receipt: " + out);
  } finally {
    temporary.cleanup();
  }
}
try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : "Local batch 8 rehearsal failed.");
  process.exitCode = 1;
}

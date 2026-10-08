#!/usr/bin/env npx tsx
/**
 * Proposed batch 8 (readers fix + w6): forward → rollback → forward with the
 * same catalog/ACL comparison as check:release-safety, on top of batches 0–7
 * and 7A in packet order, in a private Unix-socket cluster. Opt-in until the
 * batch is promoted into `batches`; it never touches a hosted database.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyReleaseInventory } from "./release-safety/inventory";
import manifest from "./release-safety/batches.json";
import { createTempPostgres } from "./release-safety/temp-postgres";
import { catalog, command, sql, type Catalog } from "./release-safety/postgres";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migrations = join(root, "supabase/migrations");
type Item = { file: string; sha256: string; rollback?: string; rollbackStatus?: string; rollbackKind?: string };

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
function recovery(url: string, authorized = true, fixture = "") {
  const file = join(root, "scripts/release-safety/rollback-batch8-empty-schema.sql");
  const args = ["--dbname=" + url, "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "--set=batch8_empty_recovery_authorized=" + authorized, "--set=batch8_callers_disabled=true"];
  // Refused fixtures share this connection and roll back on its failure;
  // immutable history is never deleted or bypassed to clean up the proof.
  return fixture ? command("psql", args, "begin;\n" + fixture + "\n" + readFileSync(file, "utf8"))
    : command("psql", [...args, "--file=" + file]);
}
function refusedRecovery(url: string, expected: string, authorized = true, fixture = "") {
  const before = catalog(url, root);
  let refused = false;
  try { recovery(url, authorized, fixture); }
  catch (error) {
    if (!firstError(error).includes(expected)) throw error;
    refused = true;
  }
  if (!refused) throw new Error("Empty-schema recovery unexpectedly allowed " + expected);
  if (Object.keys(differences(catalog(url, root), before)).length) throw new Error("Refused recovery changed the public catalog.");
}

function main() {
  verifyReleaseInventory(root);
  const batch8 = manifest.proposed.find((entry) => entry.batch === "8");
  if (!batch8) throw new Error("Proposed batch 8 is missing from batches.json.");
  const items: Item[] = batch8.items;
  const missingCompanions = items.filter(item => !item.rollback).map(item => item.file);
  if (missingCompanions.length) throw new Error("Batch 8 missing rollback companions: " + missingCompanions.join(", "));
  for (const item of items) if (item.rollback !== "rollback-" + item.file && item.rollbackKind !== "manual") throw new Error("Rollback companion is not rollback-<file>: " + item.file);
  const hotfix = manifest.proposed.find(entry => entry.batch === "H");
  const batch7a = manifest.proposed.find(entry => entry.batch === "7A");
  if (!hotfix || !batch7a || batch7a.items.length !== 4) throw new Error("Pinned H and four-file 7A prerequisites are required.");
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
    for (const [index, batch] of manifest.batches.entries()) {
      if (index === 1) for (const item of hotfix.items) apply(admin, item);
      for (const item of batch) apply(admin, item);
    }
    for (const item of batch7a.items) apply(admin, item);
    console.log(`Applied baseline, batches 0-${manifest.batches.length - 1} and H/7A (${hotfix.items.length + batch7a.items.length} pinned files).`);
    sql(admin, { text: `insert into public.users(id,email,verified_at) values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@release.example',now()),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','unverified@release.example',null);
      insert into public.tenants(id,site_name,active,subscription_status,subscription_plan)
        values('release-fixture','Release Fixture',true,'active','growth');
      insert into public.memberships(user_id,tenant_id,role)
        values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','release-fixture','owner');
      insert into public.content(tenant_id,section,data) values('release-fixture','hero','{"headline":"Before 1.0"}');
      insert into public.workspaces(id,kind,name,created_by) values
        ('a8888888-8888-4888-8888-888888888888','customer','Empty recovery fixture','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');` });
    const legacy = () => sql(admin, { file: join(root, "scripts/release-safety/legacy-behavior.sql") });
    legacy();
    sql(admin, { file: join(root, "scripts/release-safety/capture-batch8-structural-baseline.sql") });
    const before = catalog(admin, root);
    for (const item of items) apply(admin, item);
    const forward = catalog(admin, root);
    command("psql", ["--dbname=" + admin, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "--set=batch8_capture_forward=true",
      "--file=" + join(root, "scripts/release-safety/capture-batch8-structural-baseline.sql")]);
    legacy();
    console.log(`Batch 8: ${items.length} files forward.`);
    // Every companion runs in reverse order even after a refusal, so one run
    // reports every failing file and the full remaining catalog difference.
    const refused: string[] = [];
    for (const item of [...items].reverse()) {
      try { sql(admin, { file: join(migrations, item.rollback!) }); }
      catch (error) { refused.push(`${item.rollback}: ${firstError(error)}`); }
    }
    if (!refused.length) {
      refusedRecovery(admin, "batch8_empty_recovery_explicit_authority", false);
      // Committed fictional accepted-send evidence must stop recovery before
      // any object changes. Cleanup here is solely in this private cluster.
      sql(admin, { text: `insert into public.business_outcome_report_deliveries(workspace_id,month,token,status)
        values('a8888888-8888-4888-8888-888888888888','2026-10-01','a8888888-8888-4888-8888-888888888889','accepted');` });
      refusedRecovery(admin, "batch8_empty_recovery_retained_evidence");
      if (sql(admin, { text: "select count(*) from public.business_outcome_report_deliveries where status='accepted'" }) !== "1") throw new Error("Recovery lost accepted-send evidence.");
      sql(admin, { text: "delete from public.business_outcome_report_deliveries where token='a8888888-8888-4888-8888-888888888889'" });
      refusedRecovery(admin, "batch8_empty_recovery_retained_flag_history", true, `
        insert into public.workspace_release_flag_changes(workspace_id,subject,from_state,to_state,reason,changed_by)
          values('a8888888-8888-4888-8888-888888888888','owner_decision_links','off','on','Fictional history refusal',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');`);
      refusedRecovery(admin, "batch8_empty_recovery_retained_flag_history", true, `
        insert into public.workspace_release_flags(workspace_id,flag,state,changed_by)
          values('a8888888-8888-4888-8888-888888888888','owner_decision_links','off','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');`);
      refusedRecovery(admin, "batch8_empty_recovery_retained_field", true, `
        insert into public.inquiry_events(workspace_id,connected_site_id,lead_id,kind,actor)
          values('a8888888-8888-4888-8888-888888888888','a8888888-8888-4888-8888-888888888887','lead_empty_recovery','captured','visitor');`);
      const noticeFixture = `
        insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,payload,created_by)
          values('a8888888-8888-4888-8888-888888888886','a8888888-8888-4888-8888-888888888888','test','test','{}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
        insert into public.application_states(work_id,workspace_id,candidate_spec)
          values('a8888888-8888-4888-8888-888888888886','a8888888-8888-4888-8888-888888888888','{}');
        insert into public.application_records(work_id,workspace_id,record_id,"values")
          values('a8888888-8888-4888-8888-888888888886','a8888888-8888-4888-8888-888888888888','empty-recovery','{}');`;
      for (const [column, value] of [["delivery", "'{\"accepted\":true}'::jsonb"], ["delivery_lease", "gen_random_uuid()"], ["delivery_lease_until", "clock_timestamp()"]]) {
        refusedRecovery(admin, "batch8_empty_recovery_retained_field", true, noticeFixture + `
          insert into public.internal_tool_notices(workspace_id,work_id,record_id,field_id,created_by,${column})
            values('a8888888-8888-4888-8888-888888888888','a8888888-8888-4888-8888-888888888886','empty-recovery','owner',
              'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',${value});`);
      }
      // Old constraint incompatibility occurs after some DDL; the helper's
      // transaction must restore all earlier objects as well as the fixture.
      refusedRecovery(admin, 'check constraint "owner_decisions_detail_check"', true, `
        select public.open_owner_decision('a8888888-8888-4888-8888-888888888888',jsonb_build_object(
          'kind','system.go_live','route','owner_decides','title','Retained detailed approval','detail',repeat('x',1001),
          'approveEffect','It proceeds','notYetEffect','Nothing proceeds','sourceLifecycle','website_document',
          'sourceId','empty-recovery','revisionHash',repeat('a',64)));`);
      const definition = sql(admin, { text: "select pg_get_functiondef('public.workspace_export_v3_categories()'::regprocedure)" });
      sql(admin, { text: "alter function public.workspace_export_v3_categories() set search_path=public" });
      refusedRecovery(admin, "batch8_empty_recovery_object_drift");
      sql(admin, { text: definition });
      recovery(admin);
      legacy();
      console.log("Empty-only structural completion refused populated evidence, all four fields, flags/history, incompatible old rows, missing authority and function drift atomically; legacy client probes passed.");
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
    legacy();
    console.log(`Batch 8: ${items.length} forward, rollback, forward; catalog/ACL restored and reproduced.`);
  } finally {
    temporary.cleanup();
  }
}
try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : "Local batch 8 rehearsal failed.");
  process.exitCode = 1;
}

#!/usr/bin/env npx tsx
/** Forward → rollback → forward for packet batches 0–7, in a private Unix-socket cluster. */
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./release-safety/batches.json";
import { catalog, command, sql, type Catalog } from "./release-safety/postgres";
import { rehearse } from "./rehearse-database-restore";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
type Migration = (typeof manifest.batches)[number][number];
function assertCatalog(actual: Catalog, expected: Catalog, label: string) {
  const changes: Record<string, string[]> = {};
  for (const [kind, before] of Object.entries(expected)) {
    const after = actual[kind] ?? {};
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    if (changed.length) changes[kind] = changed;
  }
  if (Object.keys(changes).length) throw new Error(`${label}: catalog differs: ${JSON.stringify(changes)}`);
}
function apply(url: string, item: Migration) {
  const file = join(root, "supabase/migrations", item.file);
  if (createHash("sha256").update(readFileSync(file)).digest("hex") !== item.sha256) throw new Error("Forward migration digest drift: " + item.file);
  sql(url, { file });
}
const reverse = (url: string, item: Migration) => sql(url, { file: join(root, "supabase/migrations", "rollback-" + item.file) });
const legacy = (url: string) => sql(url, { file: join(root, "scripts/release-safety/legacy-behavior.sql") });

function expectRefusal(url: string, operation: () => void, label: string) {
  const before = catalog(url, root);
  let refused = false;
  try { operation(); } catch { refused = true; }
  if (!refused) throw new Error(label + " was incorrectly accepted.");
  assertCatalog(catalog(url, root), before, label + " atomic refusal");
  console.log(label + " refused atomically.");
}

async function main() {
  const cluster = mkdtempSync(join(tmpdir(), "strelva-release-safety-"));
  chmodSync(cluster, 0o700);
  const socket = join(cluster, "socket");
  mkdirSync(socket, { mode: 0o700 });
  const port = 61_000 + process.pid % 3000;
  const admin = `postgresql:///postgres?host=${encodeURIComponent(socket)}&port=${port}&application_name=release-safety`;
  const receipt: { scope: string; batches: object[]; passed: boolean; restore?: Awaited<ReturnType<typeof rehearse>>; julyOrgLayer?: boolean } = {
    scope: "Local Postgres only; hosted/current deployed app not exercised", batches: [], passed: false,
  };
  let started = false;
  try {
    command("initdb", ["-D", join(cluster, "data"), "--locale=C", "--encoding=UTF8", "--auth=trust", "--no-instructions"]);
    command("pg_ctl", ["-D", join(cluster, "data"), "-l", join(cluster, "postgres.log"), "-o", `-F -k '${socket}' -c listen_addresses='' -p ${port}`, "-w", "start"]);
    started = true;
    sql(admin, { file: join(root, "scripts/sql/local-supabase-shim.sql") });
    for (const item of manifest.baseline) apply(admin, item);
    sql(admin, { text: `insert into public.users(id,email,verified_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@release.example',now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','unverified@release.example',null);
insert into public.tenants(id,site_name,active,subscription_status,subscription_plan)
 values('release-fixture','Release Fixture',true,'active','growth');
insert into public.memberships(user_id,tenant_id,role)
 values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','release-fixture','owner');
insert into public.content(tenant_id,section,data) values('release-fixture','hero','{"headline":"Before 1.0"}');` });
    const baseline = catalog(admin, root);
    legacy(admin);
    for (const [number, items] of manifest.batches.entries()) {
      const before = catalog(admin, root);
      for (const item of items) apply(admin, item);
      const forward = catalog(admin, root);
      legacy(admin);
      for (const signature of Object.keys(forward.functions ?? {}).filter((key) => !Object.hasOwn(before.functions!, key))) {
        const literal = ("public." + signature).replaceAll("'", "''");
        // Trigger-returning functions cannot be invoked as an RPC. Their ACLs are
        // still compared on rollback, but do not imply a browser-callable entry.
        if (sql(admin, { text: `select p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))
from pg_proc p where p.oid=to_regprocedure('${literal}');` }) !== "f") throw new Error("Introduced RPC exposed to browser role: " + signature);
      }
      for (const item of [...items].reverse()) reverse(admin, item);
      assertCatalog(catalog(admin, root), before, `Batch ${number} rollback`);
      legacy(admin);
      // Disposable test DB only: real recovery archives must be retained and renamed before a repeat reversal.
      sql(admin, { text: "drop schema if exists release_rollback_archive cascade;" });
      for (const item of items) apply(admin, item);
      assertCatalog(catalog(admin, root), forward, `Batch ${number} second forward`);
      legacy(admin);
      receipt.batches.push({ batch: number, files: items.length, forwardRollbackForward: true, catalogRestored: true, legacyBehavior: true });
      console.log(`Batch ${number}: ${items.length} forward, rollback, forward; catalog/ACL and legacy reads/writes/auth/billing passed.`);
    }
    expectRefusal(admin, () => reverse(admin, manifest.batches[3]![2]!), "Wrong-order rollback");
    expectRefusal(admin, () => sql(admin, { file: join(root, "supabase/migrations/rollback-org-layer-phase0.sql") }), "July rollback while 1.0 depends on it");
    sql(admin, { text: "create or replace function public.workspace_release_flag_names() returns text[] language sql immutable as $$ select array['drift']::text[] $$;" });
    expectRefusal(admin, () => reverse(admin, manifest.batches[7]![2]!), "Function drift rollback");
    apply(admin, manifest.batches[7]![2]!);
    sql(admin, { text: `insert into public.tenant_leads(tenant_stable_id,tenant_slug_at_capture,lead_id,submission_hash,name,captured_at,recorded_via,intake_state,held_reason)
select stable_id,id,'lead_held_rollback_proof','s123456789abcdef','Synthetic held lead',now(),'spam_hold','held_as_spam','fixture'
from public.tenants where id='release-fixture';` });
    for (const item of [...manifest.batches[7]!].reverse()) reverse(admin, item);
    reverse(admin, manifest.batches[6]!.at(-1)!);
    if (sql(admin, { text: "select count(*) from release_rollback_archive.m20261009113000_tenant_leads where lead_id='lead_held_rollback_proof';" }) !== "1") throw new Error("Held lead was not preserved in the private archive.");
    if (sql(admin, { text: "select has_schema_privilege('anon','release_rollback_archive','usage') or has_schema_privilege('authenticated','release_rollback_archive','usage') or has_schema_privilege('service_role','release_rollback_archive','usage');" }) !== "f") throw new Error("Recovery archive was exposed.");
    legacy(admin);
    console.log("Post-forward held lead preserved; archive inaccessible to app/browser roles.");
    for (let number = 6; number >= 0; number--) {
      const items = number === 6 ? manifest.batches[number]!.slice(0, -1) : manifest.batches[number]!;
      for (const item of [...items].reverse()) reverse(admin, item);
    }
    assertCatalog(catalog(admin, root), baseline, "Whole release rollback");
    legacy(admin);
    console.log("Whole release rollback restored Sept 30 public catalog and legacy behavior.");
    receipt.restore = await rehearse(admin, admin, join(cluster, "backup"));
    console.log(`Dump/restore: ${receipt.restore.tables.length} table counts match; ${receipt.restore.dumpBytes} bytes; dump ${receipt.restore.dumpSeconds}s, restore ${receipt.restore.restoreSeconds}s.`);
    const orgBefore = catalog(admin, root);
    sql(admin, { file: join(root, "supabase/migrations/rollback-org-layer-phase0.sql") });
    legacy(admin);
    sql(admin, { file: join(root, "supabase/migrations/20260729180000_org_layer_phase0_accounts.sql") });
    assertCatalog(catalog(admin, root), orgBefore, "July forward after rollback");
    legacy(admin);
    receipt.julyOrgLayer = true;
    receipt.passed = true;
    console.log("July org layer: forward, rollback, forward; legacy behavior and catalog passed.");
  } finally {
    if (started) command("pg_ctl", ["-D", join(cluster, "data"), "-m", "fast", "-w", "stop"]);
    writeFileSync(join(cluster, "release-safety-receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
    console.log("Private local rehearsal artifact: " + cluster);
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error && !("code" in error) ? error.message : "Local release-safety proof failed.");
  process.exitCode = 1;
});

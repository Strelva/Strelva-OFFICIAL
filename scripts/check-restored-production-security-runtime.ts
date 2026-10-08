#!/usr/bin/env npx tsx
/** Actual hosted PUBLIC dump → exact pending tuple, local sockets only. */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { command, identifier, requireLocal, pgEnv, type Catalog } from "./release-safety/postgres";
import manifest from "./release-safety/batches.json";
import originalScope from "./release-safety/original-batch8-scope.json";
import { verifyReleaseInventory } from "./release-safety/inventory";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const fileDigest = (file: string) => digest(readFileSync(file, "utf8"));
type Fingerprint = { count: string; hash: string; columns: string[]; retiredEmpty?: boolean };
type Snapshot = Record<string, Fingerprint>;

function main() {
  const argv = process.argv.slice(2), args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (!key || !value || args.has(key)) throw new Error("Expected unique --dump-directory, --inventory, --counts and --out arguments");
    args.set(key, resolve(value));
  }
  for (const key of args.keys()) if (!["--dump-directory", "--inventory", "--counts", "--out"].includes(key)) throw new Error("Unknown rehearsal argument");
  const dump = args.get("--dump-directory"), inventoryFile = args.get("--inventory"), countsFile = args.get("--counts"), out = args.get("--out");
  if (!dump || !inventoryFile || !countsFile || !out) throw new Error("Four rehearsal arguments required");
  if (existsSync(out)) throw new Error("Refusing reused output directory");
  const socket = join(tmpdir(), "strelva-restored-security-" + randomUUID().slice(0, 8));
  const port = 61_000 + process.pid % 3000;
  const target = `postgresql:///postgres?host=${encodeURIComponent(socket)}&port=${port}&application_name=restored-production-rehearsal`;
  requireLocal(target); // No override; host routing is selected before mutation.
  verifyReleaseInventory(root);
  const sourceInventory = JSON.parse(readFileSync(inventoryFile, "utf8")) as { rows: Array<{ snapshot: { migrations: string[] } }> };
  const applied = sourceInventory.rows[0]?.snapshot.migrations;
  if (!applied || new Set(applied).size !== applied.length || applied.some(value => !/^\d{14}$/.test(value))) throw new Error("Invalid hosted applied-version receipt");
  const allItems = [...manifest.baseline, ...manifest.batches.flat(), ...manifest.proposed.flatMap(batch => batch.items)];
  // This exact deployment order captures the original scope before any new
  // entrypoint can enter it. Remaining corrections retain manifest order.
  const prerequisites = [...manifest.baseline, ...manifest.batches.flat(), ...manifest.proposed.filter(batch => ["H", "7A"].includes(String(batch.batch))).flatMap(batch => batch.items)];
  const capturedNames = new Set([...prerequisites, ...originalScope.items].map(item => item.file));
  const orderedItems = [...prerequisites, ...originalScope.items, ...allItems.filter(item => !capturedNames.has(item.file))];
  if (orderedItems.length !== allItems.length || new Set(orderedItems.map(item => item.file)).size !== allItems.length) throw new Error("Original-scope order inventory mismatch");
  for (const item of originalScope.items) if (!allItems.some(current => current.file === item.file && current.sha256 === item.sha256)) throw new Error("Original scope source differs from candidate");
  const versions = new Set(allItems.map(item => item.file.slice(0, 14)));
  if (applied.some(version => !versions.has(version))) throw new Error("Hosted migration version absent from candidate inventory");
  const pending = orderedItems.filter(item => !applied.includes(item.file.slice(0, 14)));
  const expectedCounts = (JSON.parse(readFileSync(countsFile, "utf8")) as { rows: Array<{ counts: Record<string, string | number> }> }).rows[0]?.counts;
  if (!expectedCounts || !Object.keys(expectedCounts).length) throw new Error("Fresh public counts required");
  const space = statfsSync(dirname(out));
  if (Number(space.bavail) * Number(space.bsize) < 256 * 1024 * 1024) throw new Error("Insufficient local space for private cluster");
  mkdirSync(out, { mode: 0o700 });
  chmodSync(out, 0o700);
  mkdirSync(socket, { mode: 0o700 });
  const dataDirectory = join(out, "cluster"), log = join(out, "postgres.log");
  const receipt: Record<string, unknown> = { scope: "Local PostgreSQL PUBLIC schema/data, actual owners/ACLs; managed Auth/storage schema and provider effects not qualified", passed: false, appliedVersions: applied.length,
    orderBasis: "prerequisites baseline+batches+H+7A; original85; remaining manifest order including six security tail files", candidateForwards: allItems.length, pending: pending.map(item => ({ file: item.file, sha256: item.sha256 })), dumps: ["schema.sql", "data.sql", "roles.sql"].map(file => ({ file, sha256: fileDigest(join(dump, file)) })), completedMigrations: [], probes: [] };
  let started = false, phase = "initdb";
  function query(text: string): string {
    requireLocal(target);
    return command("psql", ["--dbname=" + target, "--username=postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", text]);
  }
  function runFile(file: string, singleTransaction = false) {
    requireLocal(target);
    command("psql", ["--dbname=" + target, "--username=postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", ...(singleTransaction ? ["--single-transaction"] : []), "-f", file]);
  }
  const runtimeHelpers = readFileSync(join(root, "scripts/release-safety/runtime-catalog.sql"), "utf8");
  function runtimeFingerprint() { return query(runtimeHelpers + "\nselect pg_temp.batch8_runtime_fingerprint();").split("\n").at(-1)!; }
  function recovery(file: string) {
    const fingerprint = runtimeFingerprint();
    command("psql", ["--dbname=" + target, "--username=postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "expected_runtime_fingerprint=" + fingerprint, "-f", join(root, "scripts/release-safety", file)]);
    return fingerprint;
  }
  function snapshots(baseline?: Snapshot): Snapshot {
    const result: Snapshot = {};
    const actualNames = new Set<string>(JSON.parse(query("select coalesce(jsonb_agg(relname),'[]'::jsonb) from pg_class where relnamespace='public'::regnamespace and relkind='r';")));
    const tables: Array<{ name: string; columns: string[] }> = baseline ? Object.entries(baseline).map(([name, row]) => ({ name, columns: row.columns })) : JSON.parse(query(`select jsonb_agg(jsonb_build_object('name',c.relname,'columns',(select jsonb_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped)) order by c.relname) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r';`));
    for (const table of tables) {
      if (!actualNames.has(table.name)) {
        const original = baseline?.[table.name];
        if (!original) throw new Error("Unknown original public relation missing after upgrade");
        // The audited grants migration deliberately retires exactly the two
        // original bootstrap seeds, after checking their exact seed set.
        // This is security metadata, retained in the verified private dump.
        const declaredSeedRetirement = table.name === "super_admin_bootstrap" && original.count === "2"
          && pending.some(item => item.file === "20261015110000_super_admin_grants.sql");
        if (original.count !== "0" && !declaredSeedRetirement) throw new Error("Populated original public relation removed by upgrade");
        result[table.name] = { ...original, retiredEmpty: original.count === "0" };
        continue;
      }
      const projected = table.columns.map(identifier).join(",");
      const row = JSON.parse(query(`select jsonb_build_object('count',count(*)::text,'hash',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\\n' order by to_jsonb(r)::text),''),'UTF8')),'hex')) from (select ${projected} from public.${identifier(table.name)}) r;`)) as { count: string; hash: string };
      result[table.name] = { ...row, columns: table.columns };
    }
    return result;
  }
  function assertSourceRows(actual: Snapshot, original: Snapshot) {
    for (const [name, row] of Object.entries(original)) {
      if (actual[name]?.count !== row.count || actual[name]?.hash !== row.hash) throw new Error("Existing public row projection changed; inspect private hashes");
    }
  }
  try {
    command("initdb", ["-D", dataDirectory, "--username=postgres", "--locale=C", "--encoding=UTF8", "--auth=trust", "--no-instructions"]);
    command("pg_ctl", ["-D", dataDirectory, "-l", log, "-o", `-F -k '${socket}' -c listen_addresses='' -p ${port}`, "-w", "start"]);
    started = true;
    receipt.postgres = command("psql", ["--version"]);
    phase = "platform compatibility shim";
    query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role authenticator nologin noinherit; create role supabase_admin nologin;
      create schema auth; create schema extensions; create schema vault; create publication supabase_realtime;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create table auth.identities(user_id uuid,identity_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub',''),nullif(current_setting('request.jwt.claim.sub',true),''))::uuid $$;
      create function auth.role() returns text language sql stable as $$ select coalesce(nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',''),nullif(current_setting('request.jwt.claim.role',true),'')) $$;
      grant usage on schema auth to anon,authenticated,service_role;`);
    runFile(join(dump, "roles.sql")); // Export contains timeout settings only, no passwords/login attributes.
    const schema = readFileSync(join(dump, "schema.sql"), "utf8");
    const sanitizedSchema = schema.replace(/^CREATE EXTENSION IF NOT EXISTS "supabase_vault"[^\n]*\n/gm, "");
    receipt.omittedPlatformExtension = "supabase_vault (no public dependent objects in source schema)";
    const schemaFile = join(out, "public-schema.sql");
    writeFileSync(schemaFile, sanitizedSchema, { mode: 0o600 });
    phase = "faithful public schema/owner/ACL restore";
    runFile(schemaFile);
    const originalCatalog = JSON.parse(query(readFileSync(join(root, "scripts/release-safety/catalog.sql"), "utf8"))) as Catalog;
    writeFileSync(join(out, "public-catalog-before.json"), JSON.stringify(originalCatalog) + "\n", { mode: 0o600 });
    receipt.sourceCatalogHash = digest(JSON.stringify(originalCatalog));
    const sourceData = readFileSync(join(dump, "data.sql"), "utf8");
    const blocks = [...sourceData.matchAll(/^COPY ([^\n]+)\n([\s\S]*?)^\\\.\s*$/gm)];
    const publicBlocks = blocks.filter(block => /^"?public"?\./.test(block[1] ?? ""));
    if (publicBlocks.length !== Object.keys(expectedCounts).length) throw new Error("Public COPY table inventory differs from fresh source counts");
    receipt.omittedManagedCopyRelations = blocks.length - publicBlocks.length;
    const publicDataFile = join(out, "public-data.sql");
    writeFileSync(publicDataFile, "set session_replication_role=replica;\n" + publicBlocks.map(block => block[0]).join("\n") + "\nset session_replication_role=origin;\n", { mode: 0o600 });
    phase = "public data restore";
    runFile(publicDataFile, true);
    const beforeRows = snapshots();
    for (const [name, count] of Object.entries(expectedCounts)) {
      const unqualified = name.startsWith("public.") ? name.slice(7) : name;
      if (beforeRows[unqualified]?.count !== String(count)) throw new Error("Restored count differs from fresh public-count receipt");
    }
    writeFileSync(join(out, "public-row-fingerprints-before.json"), JSON.stringify(beforeRows, null, 2) + "\n", { mode: 0o600 });
    receipt.restoredPublicTables = Object.keys(beforeRows).length;
    receipt.sourceCountsMatched = true;
    receipt.beforeDataHash = digest(JSON.stringify(beforeRows));
    console.log(`Restored ${Object.keys(beforeRows).length} PUBLIC tables with actual owners/ACLs; fresh source counts match.`);
    const firstOriginal = originalScope.items.find(item => pending.some(row => row.file === item.file))?.file;
    const lastOriginal = originalScope.items.filter(item => pending.some(row => row.file === item.file)).at(-1)?.file;
    if (firstOriginal !== originalScope.items[0]?.file || lastOriginal !== originalScope.items.at(-1)?.file) throw new Error("Requires wholly unapplied original batch8 for truthful scope capture");
    for (const item of pending) {
      if (item.file === firstOriginal) {
        phase = "capture original pre-batch8 baseline";
        receipt.recoveryBaselineHash = recovery("capture-batch8-runtime-baseline.sql");
      }
      phase = item.file;
      const file = join(root, "supabase/migrations", item.file);
      if (fileDigest(file) !== item.sha256) throw new Error("Pending source SHA256 drift");
      // Remove top-level transaction markers only. The per-file transaction
      // and its lock/statement budgets surround every actual SQL statement.
      const guarded = readFileSync(file, "utf8").replace(/^begin;\s*$/gmi, "").replace(/^commit;\s*$/gmi, "");
      const pendingFile = join(out, "pending.sql");
      writeFileSync(pendingFile, "set local lock_timeout='3s';\nset local statement_timeout='120s';\n" + guarded, { mode: 0o600 });
      runFile(pendingFile, true);
      (receipt.completedMigrations as string[]).push(item.file);
      if (item.file === lastOriginal) {
        phase = "capture original85 RPC scope";
        receipt.recoveryScopeCatalogHash = recovery("capture-batch8-runtime-scope.sql");
        receipt.originalScope = JSON.parse(query(`select jsonb_build_object('signatures',count(*),'serviceExecutable',(select count(*) from release_runtime_recovery.batch8_scope s join pg_proc p on p.oid=s.function_oid where has_function_privilege('service_role',p.oid,'execute')),'signatureHash',encode(sha256(convert_to(string_agg(signature,E'\\n' order by signature),'UTF8')),'hex')) from release_runtime_recovery.batch8_scope;`));
      }
    }
    phase = "existing public rows after upgrade";
    const afterRows = snapshots(beforeRows);
    writeFileSync(join(out, "public-row-fingerprints-after.json"), JSON.stringify(afterRows, null, 2) + "\n", { mode: 0o600 });
    assertSourceRows(afterRows, beforeRows);
    receipt.retiredEmptyOriginalTables = Object.keys(afterRows).filter(name => afterRows[name]?.retiredEmpty);
    receipt.declaredRetiredSeedMetadata = { table: "super_admin_bootstrap", sourceRows: beforeRows.super_admin_bootstrap?.count,
      sourceHash: beforeRows.super_admin_bootstrap?.hash, reason: "151100 exact seed-set guard retires unsafe allowlist; original seeds remain in verified private dump" };
    receipt.existingPublicRowsPreserved = true;
    receipt.afterDataHash = digest(JSON.stringify(afterRows));
    const finalCatalog = JSON.parse(query(readFileSync(join(root, "scripts/release-safety/catalog.sql"), "utf8"))) as Catalog;
    writeFileSync(join(out, "public-catalog-after.json"), JSON.stringify(finalCatalog) + "\n", { mode: 0o600 });
    receipt.finalCatalogHash = digest(JSON.stringify(finalCatalog));
    // Fictional regression probes each own their transaction/cleanup. The
    // final source-row hashes independently prove no real customer row moved.
    const legacyFile = join(out, "legacy-behavior.sql");
    writeFileSync(legacyFile, `begin;
      insert into public.users(id,email,verified_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@release.example',now()),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','unverified@release.example',null);
      insert into public.tenants(id,site_name,active,subscription_status,subscription_plan) values('release-fixture','Release Fixture',true,'active','growth');
      insert into public.memberships(user_id,tenant_id,role) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','release-fixture','owner');
      insert into public.content(tenant_id,section,data) values('release-fixture','hero','{"headline":"Before 1.0"}');
` + readFileSync(join(root,"scripts/release-safety/legacy-behavior.sql"),"utf8"), { mode: 0o600 });
    phase = "legacy content/read/write/auth/billing";
    runFile(legacyFile);
    (receipt.probes as string[]).push("legacy-behavior.sql");
    const probes = ["owner-decision-effects-schema.sql", "inquiry-lead-retention.sql", "inquiry-retention-lifecycle.sql"];
    for (const file of probes) {
      phase = file;
      runFile(join(root, "tests", file));
      (receipt.probes as string[]).push(file);
    }
    // The current durable compensation runner commits fictional rows; prove
    // it in a local clone so restored customer data remains an exact source.
    phase = "current durable compensation repository in isolated clone";
    query("create database restored_contract template postgres;");
    const runner = spawnSync("pnpm", ["exec", "vitest", "run", "--maxWorkers=2", "--testTimeout=30000", "--hookTimeout=30000", "src/__tests__/make-real-activation-repository.test.ts"], { cwd: root, env: { ...pgEnv(), PATH: "/opt/homebrew/opt/postgresql@18/bin:" + process.env.PATH, STRELVA_MAKE_REAL_PSQL: `--host=${socket} --port=${port} --username=postgres --dbname=restored_contract` }, encoding: "utf8", timeout: 120_000 });
    writeFileSync(join(out,"compensation-runner.log"), (runner.stdout ?? "") + (runner.stderr ?? ""), { mode: 0o600 });
    if (runner.error || runner.status !== 0) throw new Error("Current compensation repository failed; inspect private runner log");
    (receipt.probes as string[]).push("make-real-activation-repository.test.ts: current real RPCs on local clone");
    receipt.runtimeRecoveryRounds = [];
    const securedHash = runtimeFingerprint();
    for (let round = 1; round <= 2; round++) {
      phase = `runtime recovery round ${round} disable`;
      recovery("disable-batch8-runtime.sql");
      const grants = JSON.parse(query("select jsonb_build_object('capturedGrants',(select count(*) from release_runtime_recovery.batch8_grants),'stillExecutable',(select count(*) from release_runtime_recovery.batch8_grants where has_function_privilege('service_role',function_oid,'execute')),'retiredSignatures',(select count(*) from release_runtime_recovery.batch8_scope where retired));"));
      if (grants.stillExecutable !== 0) throw new Error("Captured service RPC remains executable while disabled");
      runFile(legacyFile);
      assertSourceRows(snapshots(beforeRows), beforeRows);
      phase = `runtime recovery round ${round} enable`;
      recovery("enable-batch8-runtime.sql");
      if (runtimeFingerprint() !== securedHash) throw new Error("Runtime recovery failed exact secured catalog restoration");
      assertSourceRows(snapshots(beforeRows), beforeRows);
      (receipt.runtimeRecoveryRounds as unknown[]).push({ round, ...grants, exactSecuredCatalogRestored: true, originalCustomerRowsPreserved: true, legacyBehaviorPassedWhileDisabled: true });
    }
    receipt.securedRuntimeCatalogHash = securedHash;
    phase = "post-probe source row integrity";
    assertSourceRows(snapshots(beforeRows), beforeRows);
    const migrationFiles = readdirSync(join(root, "supabase/migrations")).filter(file => /^\d{14}_.+\.sql$/.test(file)).sort();
    if (migrationFiles.length !== allItems.length || pending.some(item => fileDigest(join(root, "supabase/migrations", item.file)) !== item.sha256)) throw new Error("Candidate inventory drift after proof");
    receipt.passed = true;
    console.log(`Actual PUBLIC dump upgrade passed: ${pending.length} pending migrations; ${probes.length} SQL probes; existing source-row hashes preserved.`);
  } catch (error) {
    receipt.failedPhase = phase;
    receipt.failure = error instanceof Error ? error.message : "Private rehearsal failed";
    throw new Error(`Restored production rehearsal failed at ${phase}; inspect private receipt/diagnostics in ${out}.`);
  } finally {
    writeFileSync(join(out, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
    if (started || existsSync(join(dataDirectory, "postmaster.pid"))) {
      try { command("pg_ctl", ["-D", dataDirectory, "-m", "fast", "-w", "stop"]); }
      catch { command("pg_ctl", ["-D", dataDirectory, "-m", "immediate", "-w", "stop"]); }
    }
    // Customer payload copies and the stopped cluster stay private for review.
    // Socket files alone are disposable after confirmed shutdown.
    rmSync(socket, { recursive: true, force: true });
  }
}
try { main(); } catch (error) { console.error(error instanceof Error ? error.message : "Private local rehearsal failed"); process.exitCode = 1; }

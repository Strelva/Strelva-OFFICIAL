/**
 * Orchestration for the scrubbed production copy. The CLI is
 * scripts/scrubbed-production-copy.ts; the runbook is
 * docs/operations/scrubbed-production-copy.md.
 *
 *   create   read the source once (read-only), scrub in memory, verify no
 *            original email/phone/secret survived, then build the local
 *            Postgres cluster, local Redis and dev files from the scrubbed files.
 *   serve    run the copy for `pnpm dev` or manual inspection.
 *   dry-run  run scripts/convert-tenant-to-workspace.ts for every copied active
 *            tenant against the copy, then apply each plan through the real
 *            conversion RPC in a rolled-back transaction.
 */
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, type WriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Pseudonymizer } from "./pseudonymize";
import {
  DERIVED_REDIS_FAMILIES, TABLES_LEFT_OUT, TABLE_POLICIES, classifyRedisKey, columnsToRead, familyById, policyKey,
  scrubRedisKey, scrubRedisValue, scrubRow, uncoveredColumns, valueKindFor, type RedisRecord, type RowContext,
} from "./policy";
import {
  LOCAL_OPERATOR, addLocalOperator, buildExportSql, buildLoadSql, destinationColumns, exportSourceRows, foreignKeyOrphans,
  initCluster, psql, psqlFile, psqlTargetFromUrl, readSourceCatalog, rehearseConversion, repoMigrations, run, splitMigrations,
  startCluster, type ExportPlanItem, type LocalCluster, type PsqlTarget, type RehearsalResult,
} from "./postgres";
import { RespClient, ReadOnlyRestSource, loadRedisRecords, startLocalRedis, startUpstashBridge, type FetchLike, type LocalRedis, type UpstashBridge } from "./redis";
import {
  RefusalError, assertCleanParentEnv, assertExplicitSource, assertLocalDestinationUrl, assertLocalOutputDir, assertOutboundDisabled,
  copyEnvironment, parseEnvFile, renderEnvFile,
} from "./safety";
import { assertManifestHasNoPersonalData, emptyTenantCounts, findLeaks, fingerprint, increment, type CopyManifest, type TenantCounts } from "./manifest";

export const COPY_MARKER = ".strelva-scrubbed-copy";

export interface CopyHooks {
  /** Website documents are rehashed with the app's own hash (src/products/websites). */
  documentHash?: RowContext["documentHash"];
  /** Lead capture dedupe hash (src/lib/leads.ts), recomputed from scrubbed values. */
  leadHash?: RowContext["leadHash"];
  /** Dev-file projection with the app's own mappers (src/lib/tenants, content-store, booking-store). */
  projectDevFiles?: (input: { devDir: string; tenants: Array<Record<string, unknown>>; content: Array<Record<string, unknown>>; bookings: Array<Record<string, unknown>> }) => Promise<void> | void;
  fetcher?: FetchLike;
  log?: (line: string) => void;
}

export interface CreateOptions {
  out: string;
  source?: string;
  sourceRedis?: string;
  confirmed: boolean;
  skipRedis: boolean;
  includeInactive: boolean;
  replace: boolean;
  saltFile: string;
  repoRoot: string;
  destDatabaseUrl?: string;
  grandfathered?: string;
  env: Record<string, string | undefined>;
}

function paths(out: string) {
  return {
    marker: path.join(out, COPY_MARKER),
    scrubbed: path.join(out, "scrubbed"),
    redisFile: path.join(out, "scrubbed", "redis.jsonl"),
    pgData: path.join(out, "postgres", "data"),
    pgLog: path.join(out, "postgres", "postgres.log"),
    redisData: path.join(out, "redis"),
    dev: path.join(out, "dev"),
    env: path.join(out, "copy.env"),
    state: path.join(out, "state.json"),
    manifest: path.join(out, "manifest.json"),
    report: path.join(out, "dry-run-report.json"),
  };
}

export function loadOrCreateSalt(file: string): string {
  if (existsSync(file)) {
    const salt = readFileSync(file, "utf8").trim();
    if (!/^[0-9a-f]{64}$/.test(salt)) throw new RefusalError(`${file} is not a 32-byte hex salt.`);
    return salt;
  }
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const salt = randomBytes(32).toString("hex");
  writeFileSync(file, `${salt}\n`, { mode: 0o600 });
  return salt;
}

async function requireCommands(names: string[]): Promise<void> {
  const missing: string[] = [];
  for (const name of names) {
    const found = await run("sh", ["-c", `command -v ${name}`]);
    if (found.code !== 0) missing.push(name);
  }
  if (missing.length) throw new RefusalError(`missing local commands: ${missing.join(", ")}. Put PostgreSQL 18 binaries and redis-server on PATH.`);
}

function shortTempDir(prefix: string): string {
  // Unix socket paths are limited to about 104 bytes; keep them short.
  return mkdtempSync(path.join("/tmp", prefix));
}

function randomPort(): number {
  return 61000 + Math.floor(Math.random() * 3000);
}

function writeJsonLine(stream: WriteStream, value: unknown): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

function closeStream(stream: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => { stream.end(() => resolve()); stream.on("error", reject); });
}

function dirState(out: string): { exists: boolean; empty: boolean; isCopy: boolean } {
  if (!existsSync(out)) return { exists: false, empty: true, isCopy: false };
  const entries = readdirSync(out);
  return { exists: true, empty: entries.length === 0, isCopy: entries.includes(COPY_MARKER) };
}

function readTextFiles(dir: string): Array<{ name: string; text: string }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".json") || name.endsWith(".jsonl")).map((name) => ({ name: path.join(path.basename(dir), name), text: readFileSync(path.join(dir, name), "utf8") }));
}

/** Every refusal that does not need the network. Exported for the refusal tests. */
export function preflightCreate(options: CreateOptions) {
  assertCleanParentEnv(options.env);
  const source = assertExplicitSource({ source: options.source, sourceRedis: options.sourceRedis, confirmed: options.confirmed, skipRedis: options.skipRedis }, options.env);
  assertLocalOutputDir(options.out, { repoRoot: options.repoRoot, replace: options.replace, ...dirState(options.out) });
  if (options.destDatabaseUrl) assertLocalDestinationUrl("--dest-database-url", options.destDatabaseUrl);
  if (options.grandfathered && !/^[a-z0-9-]+(,[a-z0-9-]+)*$/.test(options.grandfathered)) throw new RefusalError("--grandfathered takes comma-separated tenant slugs.");
  return source;
}

export async function createCopy(options: CreateOptions, hooks: CopyHooks = {}): Promise<CopyManifest> {
  const log = hooks.log ?? (() => undefined);
  const source = preflightCreate(options);
  await requireCommands(["psql", "initdb", "pg_ctl", ...(options.skipRedis ? [] : ["redis-server"])]);
  const p = paths(options.out);
  const salt = loadOrCreateSalt(options.saltFile);
  const pseudo = new Pseudonymizer(salt);

  if (existsSync(options.out) && options.replace) {
    for (const entry of readdirSync(options.out)) rmSync(path.join(options.out, entry), { recursive: true, force: true });
  }
  for (const dir of [options.out, p.scrubbed, path.dirname(p.pgData), p.redisData, p.dev]) mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(options.out, 0o700);
  writeFileSync(p.marker, "Scrubbed production copy. Local only. Never commit or upload.\n", { mode: 0o600 });

  // 1. Source catalog and the export plan. Unknown columns stop the run.
  const sourceTarget = psqlTargetFromUrl(source.databaseUrl);
  log("Reading the source catalog (read-only)...");
  const catalog = await readSourceCatalog(sourceTarget, options.repoRoot, TABLE_POLICIES);
  const plan: ExportPlanItem[] = [];
  const absent: string[] = [];
  const uncovered: string[] = [];
  for (const policy of TABLE_POLICIES) {
    const columns = catalog.columns.get(policyKey(policy));
    if (!columns) {
      if (!policy.optional) throw new RefusalError(`the source has no ${policyKey(policy)} table; is --source the Strelva production database?`);
      absent.push(policyKey(policy));
      continue;
    }
    uncovered.push(...uncoveredColumns(policy, columns).map((column) => `${policyKey(policy)}.${column}`));
    plan.push({ policy, columns: columnsToRead(policy, columns) });
  }
  if (uncovered.length) {
    throw new RefusalError(`source columns without a scrub rule: ${uncovered.join(", ")}. Add a rule in scripts/scrubbed-copy/policy.ts before copying.`);
  }

  // 2. Rows: stream, scrub, write. Nothing unscrubbed touches disk.
  log("Exporting and scrubbing Postgres rows...");
  const streams = new Map<string, WriteStream>();
  const tableCounts: Record<string, number> = {};
  const tenants = new Map<string, TenantCounts>();
  const stableToSlug = new Map<string, string>();
  const projection = { tenants: [] as Array<Record<string, unknown>>, content: [] as Array<Record<string, unknown>>, bookings: [] as Array<Record<string, unknown>> };
  const context: RowContext = { documentHashes: new Map(), documentHash: hooks.documentHash, leadHash: hooks.leadHash };
  const policyByKey = new Map(plan.map((item) => [policyKey(item.policy), item.policy]));
  for (const item of plan) {
    streams.set(policyKey(item.policy), createWriteStream(path.join(p.scrubbed, `${policyKey(item.policy)}.jsonl`), { mode: 0o600 }));
  }
  await exportSourceRows(sourceTarget, buildExportSql(plan, options.includeInactive), (table, row) => {
    const policy = policyByKey.get(table);
    if (!policy) throw new Error(`Unexpected table in export: ${table}`);
    const scrubbed = scrubRow(pseudo, policy, row, context);
    writeJsonLine(streams.get(table)!, scrubbed);
    increment(tableCounts, table);
    if (table === "public.tenants") {
      const slug = String(scrubbed.id);
      const stable = typeof scrubbed.stable_id === "string" ? scrubbed.stable_id : null;
      tenants.set(slug, emptyTenantCounts(slug, stable, scrubbed.active === true));
      if (stable) stableToSlug.set(stable, slug);
      projection.tenants.push(scrubbed);
    }
    if (table === "public.content") projection.content.push(scrubbed);
    if (table === "public.bookings") projection.bookings.push(scrubbed);
    const slug = typeof scrubbed.tenant_id === "string" ? scrubbed.tenant_id
      : typeof scrubbed.tenant_stable_id === "string" ? stableToSlug.get(scrubbed.tenant_stable_id) : table === "public.tenants" ? String(scrubbed.id) : undefined;
    if (slug && tenants.has(slug)) increment(tenants.get(slug)!.postgresRows, table);
  });
  await Promise.all([...streams.values()].map(closeStream));
  const tenantSlugs = [...tenants.keys()].sort();

  // 3. Redis: read only included families; count the rest by name only.
  let redisSummary: CopyManifest["redis"] = null;
  let redisRecords: RedisRecord[] = [];
  if (source.redisUrl) {
    log("Exporting and scrubbing Redis keys (read-only commands only)...");
    const sourceRedis = new ReadOnlyRestSource(source.redisUrl, options.env.SCRUBBED_COPY_SOURCE_REDIS_REST_TOKEN!.trim(), hooks.fetcher);
    const keys = await sourceRedis.scanAll();
    const included: Array<{ key: string; family: string; tenant: string | null }> = [];
    const keysLeftOut: Record<string, number> = {};
    const unclassifiedKeys: string[] = [];
    for (const key of keys) {
      const match = classifyRedisKey(key, tenantSlugs);
      if (!match) { unclassifiedKeys.push(key); continue; }
      if (match.included) included.push({ key, family: match.family, tenant: match.tenant });
      else {
        increment(keysLeftOut, match.family);
        increment(tenants.get(match.tenant)!.redisKeysLeftOut, match.family);
      }
    }
    const read = await sourceRedis.readKeys(included.map((item) => item.key));
    const raw: Array<{ key: string; family: string; tenant: string | null; data: NonNullable<(typeof read)[number]["data"]>; expireAtMs: number | null }> = [];
    read.forEach((value, index) => { if (value.data) raw.push({ ...included[index]!, data: value.data, expireAtMs: value.expireAtMs }); });

    // Derived keys: event bodies from each tenant's event index, account records from account-of links.
    const keySet = new Set(keys);
    const eventKeys = new Map<string, string>();
    const accountKeys = new Map<string, string>();
    for (const record of raw) {
      if (record.family === "events-index" && record.data.type === "zset") {
        for (const [member] of record.data.value) if (!member.trim().startsWith("{") && keySet.has(`event:${member}`)) eventKeys.set(`event:${member}`, record.tenant!);
      }
      if (record.family === "account-link" && record.data.type === "string" && keySet.has(`account:${record.data.value}`)) accountKeys.set(`account:${record.data.value}`, record.tenant!);
    }
    const derived = [...[...eventKeys].map(([key, tenant]) => ({ key, tenant, family: DERIVED_REDIS_FAMILIES.event })),
      ...[...accountKeys].map(([key, tenant]) => ({ key, tenant, family: DERIVED_REDIS_FAMILIES.account }))];
    const derivedRead = await sourceRedis.readKeys(derived.map((item) => item.key));
    derivedRead.forEach((value, index) => { if (value.data) raw.push({ ...derived[index]!, data: value.data, expireAtMs: value.expireAtMs }); });
    if (keySet.has("accounts:index") && accountKeys.size) {
      const [index] = await sourceRedis.readKeys(["accounts:index"]);
      const copied = new Set([...accountKeys.keys()].map((key) => key.slice("account:".length)));
      if (index?.data?.type === "set") raw.push({ key: "accounts:index", family: DERIVED_REDIS_FAMILIES.accountsIndex, tenant: null, data: { type: "set", value: index.data.value.filter((id) => copied.has(id)) }, expireAtMs: index.expireAtMs });
    }

    const keyCounts: Record<string, number> = {};
    redisRecords = raw.map((record) => {
      const family = familyById(record.family);
      const scrubbed: RedisRecord = {
        key: scrubRedisKey(pseudo, record.key, family),
        family: record.family,
        tenant: record.tenant,
        data: scrubRedisValue(pseudo, valueKindFor(record.family), record.data, Boolean(family?.emailKeySegment)),
        expireAtMs: record.expireAtMs,
      };
      increment(keyCounts, record.family);
      if (record.tenant && tenants.has(record.tenant)) increment(tenants.get(record.tenant)!.redisKeys, record.family);
      return scrubbed;
    }).sort((a, b) => a.key.localeCompare(b.key));
    const stream = createWriteStream(p.redisFile, { mode: 0o600 });
    for (const record of redisRecords) writeJsonLine(stream, record);
    await closeStream(stream);
    // Derived keys (event bodies, account records, the account index) are not
    // tenant-prefixed; they count as copied, not as unclassified.
    const copiedKeys = new Set(raw.map((record) => record.key));
    const unclassified = unclassifiedKeys.filter((key) => !copiedKeys.has(key)).length;
    redisSummary = { keys: keyCounts, keysLeftOut, keysUnclassified: unclassified, keysExpiredBeforeLoad: 0 };
  }

  // 4. Dev files for the app's no-database readers.
  if (hooks.projectDevFiles) await hooks.projectDevFiles({ devDir: p.dev, ...projection });

  // 5. Leak check before anything is loaded: no original email, phone or secret may survive.
  const files = [...readTextFiles(p.scrubbed), ...readTextFiles(p.dev)];
  const leaks = findLeaks(files, pseudo.originals);
  if (leaks.length) {
    rmSync(p.scrubbed, { recursive: true, force: true });
    rmSync(p.dev, { recursive: true, force: true });
    throw new Error(`Leak check failed (${leaks.map((leak) => `${leak.kind} in ${leak.file}`).join(", ")}). The scrubbed files were deleted; fix the policy before retrying.`);
  }

  // 6. Local Postgres: source schema level, load, then pending migrations.
  log("Building the local Postgres copy...");
  const migrations = splitMigrations(repoMigrations(options.repoRoot), catalog.migrations);
  let cluster: LocalCluster | null = null;
  let target: PsqlTarget;
  let socketDir: string | null = null;
  const port = randomPort();
  if (options.destDatabaseUrl) {
    target = psqlTargetFromUrl(options.destDatabaseUrl);
    const empty = (await psql(target, "SELECT to_regclass('public.tenants') IS NULL;")).trim();
    if (empty !== "t") throw new RefusalError("--dest-database-url already has a tenants table; use an empty local database.");
  } else {
    await initCluster(p.pgData);
    socketDir = shortTempDir("strelva-copy-pg.");
    cluster = await startCluster(p.pgData, socketDir, port, p.pgLog);
    target = cluster.target;
  }
  let orphans: Record<string, number> = {};
  const columnsNotLoaded: string[] = [];
  try {
    await psqlFile(target, path.join(options.repoRoot, "scripts/sql/local-supabase-shim.sql"));
    for (const migration of migrations.beforeLoad) await psqlFile(target, migration.file);
    const destColumns = await destinationColumns(target, plan.map((item) => item.policy));
    const loadItems = plan.map((item) => {
      const key = policyKey(item.policy);
      const dest = new Set(destColumns.get(key) ?? []);
      const columns = item.columns.filter((column) => dest.has(column));
      columnsNotLoaded.push(...item.columns.filter((column) => !dest.has(column)).map((column) => `${key}.${column}`));
      return { relation: key, file: path.join(p.scrubbed, `${key}.jsonl`), columns: destColumns.has(key) ? columns : [] };
    });
    await psql(target, buildLoadSql(loadItems));
    for (const migration of migrations.afterLoad) {
      log(`  pending migration ${path.basename(migration.file)}`);
      await psqlFile(target, migration.file);
    }
    await addLocalOperator(target);
    orphans = await foreignKeyOrphans(target);
  } finally {
    if (cluster) await cluster.stop();
    if (socketDir) rmSync(socketDir, { recursive: true, force: true });
  }

  // 7. Local Redis.
  if (redisSummary) {
    log("Loading the local Redis copy...");
    const redisSocketDir = shortTempDir("strelva-copy-redis.");
    const redis = await startLocalRedis(p.redisData, path.join(redisSocketDir, "redis.sock"));
    try {
      const client = await RespClient.connect(redis.socket);
      const loaded = await loadRedisRecords(client, redisRecords);
      client.close();
      redisSummary.keysExpiredBeforeLoad = loaded.expired;
    } finally {
      await redis.stop(true);
      rmSync(redisSocketDir, { recursive: true, force: true });
    }
  }

  // 8. Environment and receipt.
  const envExtra: Record<string, string> = { STRIPE_BILLING_GRANDFATHER_TENANTS: options.grandfathered ?? "" };
  writeFileSync(p.env, renderEnvFile(copyEnvironment(envExtra, {})), { mode: 0o600 });
  writeFileSync(p.state, `${JSON.stringify({ version: 1, port, managedCluster: !options.destDatabaseUrl, redis: Boolean(redisSummary) }, null, 2)}\n`, { mode: 0o600 });
  const manifest: CopyManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    source: { postgresHost: fingerprint(new URL(source.databaseUrl).hostname), redisHost: source.redisUrl ? fingerprint(new URL(source.redisUrl).hostname) : null },
    saltFingerprint: fingerprint(salt),
    tenantSelection: options.includeInactive ? "all" : "active",
    schema: {
      sourceMigrations: catalog.migrations.length,
      appliedBeforeLoad: migrations.beforeLoad.length,
      appliedAfterLoad: migrations.afterLoad.map((migration) => path.basename(migration.file)),
      sourceOnlyMigrations: migrations.sourceOnly,
    },
    postgres: { tables: tableCounts, tablesAbsentInSource: absent, columnsNotLoaded, leftOut: TABLES_LEFT_OUT, foreignKeyOrphans: orphans },
    redis: redisSummary,
    tenants: tenantSlugs.map((slug) => tenants.get(slug)!),
    leakCheck: { passed: true, emailsChecked: pseudo.originals.emails.size, phonesChecked: pseudo.originals.phones.size, secretsChecked: pseudo.originals.secrets.size, filesChecked: files.length },
    localOperator: { email: LOCAL_OPERATOR.email, note: "Local-only super admin added to the copy so conversion can be rehearsed." },
  };
  assertManifestHasNoPersonalData(manifest, pseudo.originals);
  writeFileSync(p.manifest, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return manifest;
}

// ---------------------------------------------------------------------------
// Running the copy
// ---------------------------------------------------------------------------

export interface RunningCopy {
  target: PsqlTarget | null;
  bridge: UpstashBridge | null;
  env: Record<string, string>;
  stop(): Promise<void>;
}

/** Validates copy.env (refuses if any outbound switch was re-enabled), then starts the local services. */
export async function startCopy(out: string, options: { bridgePort?: number; bridgeHost?: string; env: Record<string, string | undefined> }): Promise<RunningCopy> {
  assertCleanParentEnv(options.env);
  const p = paths(out);
  if (!existsSync(p.marker) || !existsSync(p.env) || !existsSync(p.state)) throw new RefusalError(`${out} is not a scrubbed copy (run create first).`);
  const fileEnv = parseEnvFile(readFileSync(p.env, "utf8"));
  assertOutboundDisabled(fileEnv);
  const state = JSON.parse(readFileSync(p.state, "utf8")) as { port: number; managedCluster: boolean; redis: boolean };
  await requireCommands(["psql", "pg_ctl", ...(state.redis ? ["redis-server"] : [])]);
  const stops: Array<() => Promise<void>> = [];
  let target: PsqlTarget | null = null;
  let bridge: UpstashBridge | null = null;
  const extra: Record<string, string> = { STRIPE_BILLING_GRANDFATHER_TENANTS: fileEnv.STRIPE_BILLING_GRANDFATHER_TENANTS ?? "" };
  try {
    if (state.managedCluster) {
      const socketDir = shortTempDir("strelva-copy-pg.");
      const cluster = await startCluster(p.pgData, socketDir, state.port, p.pgLog);
      target = cluster.target;
      stops.push(async () => { await cluster.stop(); rmSync(socketDir, { recursive: true, force: true }); });
    }
    if (state.redis) {
      const socketDir = shortTempDir("strelva-copy-redis.");
      const redis: LocalRedis = await startLocalRedis(p.redisData, path.join(socketDir, "redis.sock"));
      stops.push(async () => { await redis.stop(true); rmSync(socketDir, { recursive: true, force: true }); });
      bridge = await startUpstashBridge({ socket: redis.socket, token: randomBytes(24).toString("hex"), host: options.bridgeHost, port: options.bridgePort });
      const running = bridge;
      stops.unshift(() => running.close());
      extra.UPSTASH_REDIS_REST_URL = bridge.url;
      extra.UPSTASH_REDIS_REST_TOKEN = bridge.token;
    }
  } catch (error) {
    for (const stop of stops) await stop().catch(() => undefined);
    throw error;
  }
  const env = copyEnvironment(extra, options.env);
  return {
    target,
    bridge,
    env,
    async stop() { for (const stop of stops) await stop().catch(() => undefined); },
  };
}

export interface DryRunEntry {
  slug: string;
  planned: boolean;
  error?: string;
  counts?: Record<string, number>;
  skippedFields?: string[];
  commandId?: string;
  digest?: string;
  rehearsal?: RehearsalResult;
}

export interface DryRunReport {
  version: 1;
  createdAt: string;
  tenants: DryRunEntry[];
  summary: { tenants: number; planned: number; rehearsedOk: number; failed: number };
}

function runChild(command: string, args: string[], env: Record<string, string>, cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: env as NodeJS.ProcessEnv, cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function lastJsonObject(stdout: string): Record<string, unknown> | null {
  const start = stdout.search(/^\{/m);
  if (start === -1) return null;
  try {
    return JSON.parse(stdout.slice(start)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Plan every copied active tenant with the real conversion CLI (dry run, no
 * writes), then apply each plan in a rolled-back transaction on the copy.
 */
export async function dryRunCopy(out: string, options: { repoRoot: string; env: Record<string, string | undefined>; tenants?: string[]; rehearse: boolean; log?: (line: string) => void }): Promise<DryRunReport> {
  const log = options.log ?? (() => undefined);
  const p = paths(out);
  const manifest = JSON.parse(readFileSync(p.manifest, "utf8")) as CopyManifest;
  const slugs = (options.tenants?.length ? options.tenants : manifest.tenants.filter((tenant) => tenant.active).map((tenant) => tenant.slug)).sort();
  const running = await startCopy(out, { env: options.env });
  const entries: DryRunEntry[] = [];
  try {
    const tsx = path.join(options.repoRoot, "node_modules/.bin/tsx");
    for (const slug of slugs) {
      log(`Planning ${slug}...`);
      const result = await runChild(tsx, ["--tsconfig", path.join(options.repoRoot, "tsconfig.json"), path.join(options.repoRoot, "scripts/convert-tenant-to-workspace.ts"), slug, "--json"], running.env, p.dev);
      const outcome = lastJsonObject(result.stdout);
      const plan = outcome?.plan as { payload: unknown; commandId: string; digest: string; counts: Record<string, number>; skipped: Array<{ field: string }> } | undefined;
      if (result.code !== 0 || !plan) {
        entries.push({ slug, planned: false, error: (result.stderr.split("\n").find((line) => line.trim() && !/Deprecation|trace-deprecation/.test(line)) ?? "conversion CLI failed").slice(0, 200) });
        continue;
      }
      const entry: DryRunEntry = { slug, planned: true, counts: plan.counts, skippedFields: plan.skipped.map((item) => item.field), commandId: plan.commandId, digest: plan.digest };
      if (options.rehearse && running.target) entry.rehearsal = await rehearseConversion(running.target, { slug, payload: plan.payload, commandId: plan.commandId, digest: plan.digest });
      entries.push(entry);
    }
  } finally {
    await running.stop();
  }
  const report: DryRunReport = {
    version: 1,
    createdAt: new Date().toISOString(),
    tenants: entries,
    summary: {
      tenants: entries.length,
      planned: entries.filter((entry) => entry.planned).length,
      rehearsedOk: entries.filter((entry) => entry.rehearsal?.applied).length,
      failed: entries.filter((entry) => !entry.planned || (options.rehearse && entry.rehearsal && !entry.rehearsal.applied)).length,
    },
  };
  assertManifestHasNoPersonalData(report);
  writeFileSync(p.report, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return report;
}

export function defaultSaltFile(): string {
  return path.join(os.homedir(), ".config", "strelva", "scrubbed-copy.salt");
}

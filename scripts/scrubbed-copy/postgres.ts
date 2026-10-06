/**
 * Postgres plumbing for the scrubbed copy, through the psql/pg_ctl binaries the
 * SQL checks already use (the repo has no Postgres driver dependency).
 *
 * Source: one REPEATABLE READ READ ONLY transaction. The session proves it is
 * read-only before the first row is read, and rows stream straight into the
 * scrubber, so unscrubbed data is never written to disk.
 *
 * Destination: a throwaway cluster that listens on a unix socket only, built the
 * way scripts/check-workspace-upgrade.sh builds one (shared shim, real
 * migrations). Data loads at the source's migration level, then the pending
 * migrations run on top, which is the production upgrade path.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isLoopbackHost } from "./safety";
import { policyKey, type TablePolicy } from "./policy";

export interface PsqlTarget {
  /** libpq environment: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PGSSLMODE. */
  env: Record<string, string>;
}

/** Credentials go through the environment, never argv, so they stay out of `ps`. */
export function psqlTargetFromUrl(value: string): PsqlTarget {
  const url = new URL(value);
  const host = url.searchParams.get("host") || url.hostname;
  const env: Record<string, string> = {
    PGHOST: host,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres",
  };
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  else if (!isLoopbackHost(url.hostname) && !host.startsWith("/")) env.PGSSLMODE = "require";
  return { env };
}

export function socketTarget(socketDir: string, port: number, user: string): PsqlTarget {
  return { env: { PGHOST: socketDir, PGPORT: String(port), PGUSER: user, PGDATABASE: "postgres" } };
}

/**
 * The minimum environment for local tools. PostgreSQL on macOS refuses to start
 * without a valid LC_ALL ("postmaster became multithreaded during startup").
 */
export function toolEnv(): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    LC_ALL: process.env.LC_ALL || "en_US.UTF-8",
    LANG: process.env.LANG || "en_US.UTF-8",
  };
}

function baseEnv(target: PsqlTarget): Record<string, string> {
  return {
    ...toolEnv(),
    PGAPPNAME: "strelva-scrubbed-copy",
    PGCONNECT_TIMEOUT: "15",
    ...target.env,
  };
}

export interface RunResult { code: number; stdout: string; stderr: string }

export function run(command: string, args: string[], options: { env?: Record<string, string>; input?: string; cwd?: string } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const env = options.env ?? toolEnv();
    const child = spawn(command, args, { env: env as NodeJS.ProcessEnv, cwd: options.cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.end(options.input ?? "");
  });
}

/** Run a SQL script through psql; throws with psql's first error line. */
export async function psql(target: PsqlTarget, sql: string, extraArgs: string[] = []): Promise<string> {
  const result = await run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", ...extraArgs, "-f", "-"], { env: baseEnv(target), input: sql });
  if (result.code !== 0) throw new Error(`psql failed: ${firstErrorLine(result.stderr)}`);
  return result.stdout;
}

export async function psqlFile(target: PsqlTarget, file: string): Promise<void> {
  const result = await run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], { env: baseEnv(target) });
  if (result.code !== 0) throw new Error(`${path.basename(file)} failed: ${firstErrorLine(result.stderr)}`);
}

function firstErrorLine(stderr: string): string {
  return stderr.split("\n").find((line) => /ERROR|FATAL|error/.test(line))?.trim().slice(0, 400) ?? stderr.trim().slice(0, 400);
}

export function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unexpected identifier ${JSON.stringify(name)}`);
  return `"${name}"`;
}

function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// Source (read-only)
// ---------------------------------------------------------------------------

export interface SourceCatalog {
  columns: Map<string, string[]>;
  migrations: string[];
}

/**
 * Catalog only: which policy tables exist, their columns, and applied migration
 * versions. Reuses scripts/workspace-target-snapshot.sql for relations and
 * migration history, so the copy agrees with the target check.
 */
export async function readSourceCatalog(target: PsqlTarget, repoRoot: string, policies: TablePolicy[]): Promise<SourceCatalog> {
  const snapshot = JSON.parse((await psql(target, readFileSync(path.join(repoRoot, "scripts/workspace-target-snapshot.sql"), "utf8"))).trim()) as {
    migrations: Array<{ version: string }> | null;
  };
  const wanted = policies.map((policy) => `(${literal(policy.schema)},${literal(policy.table)})`).join(",");
  const columnsJson = await psql(target, `BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT COALESCE(json_object_agg(table_schema || '.' || table_name, columns), '{}'::json) FROM (
  SELECT table_schema, table_name, json_agg(column_name::text ORDER BY ordinal_position) AS columns
  FROM information_schema.columns
  WHERE (table_schema, table_name) IN (${wanted})
  GROUP BY table_schema, table_name
) c;
COMMIT;`);
  const columns = new Map(Object.entries(JSON.parse(columnsJson.trim()) as Record<string, string[]>));
  return { columns, migrations: (snapshot.migrations ?? []).map((migration) => String(migration.version)).sort() };
}

const SCOPE_FILTER: Record<TablePolicy["scope"], (tenants: string) => string> = {
  all: () => "TRUE",
  tenants: (tenants) => `id IN (${tenants})`,
  tenant_id: (tenants) => `tenant_id IN (${tenants})`,
  tenant_id_or_null: (tenants) => `(tenant_id IS NULL OR tenant_id IN (${tenants}))`,
  tenant_stable_id: (tenants) => `tenant_stable_id IN (SELECT stable_id FROM public.tenants WHERE id IN (${tenants}))`,
  tenant_stable_id_or_null: (tenants) => `(tenant_stable_id IS NULL OR tenant_stable_id IN (SELECT stable_id FROM public.tenants WHERE id IN (${tenants})))`,
};

export interface ExportPlanItem { policy: TablePolicy; columns: string[] }

/** The whole export as one read-only psql script. Exported so tests can inspect it. */
export function buildExportSql(plan: ExportPlanItem[], includeInactive: boolean): string {
  const tenants = `SELECT id FROM public.tenants${includeInactive ? "" : " WHERE active"}`;
  const lines = [
    "\\set ON_ERROR_STOP on",
    "\\set FETCH_COUNT 500",
    "\\pset format unaligned",
    "\\pset tuples_only on",
    "\\pset pager off",
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;",
    "SET LOCAL statement_timeout = '300s';",
    "\\echo @@strelva-read-only",
    "SHOW transaction_read_only;",
  ];
  for (const item of plan) {
    const cols = item.columns.map(quoteIdent).join(", ");
    const relation = `${quoteIdent(item.policy.schema)}.${quoteIdent(item.policy.table)}`;
    // Deterministic order, so two copies of the same source compare byte for byte.
    // Policy column lists start with their key columns, which are plain scalars.
    const order = item.columns.includes("id")
      ? " ORDER BY \"id\""
      : ` ORDER BY ${item.columns.slice(0, 4).map((_, index) => index + 1).join(", ")}`;
    lines.push(`\\echo @@strelva-table ${policyKey(item.policy)}`);
    lines.push(`SELECT row_to_json(t)::text FROM (SELECT ${cols} FROM ${relation} WHERE ${SCOPE_FILTER[item.policy.scope](tenants)}${order}) t;`);
  }
  lines.push("COMMIT;", "\\echo @@strelva-end");
  return `${lines.join("\n")}\n`;
}

/**
 * Stream every row to `onRow`. Refuses to read a single row unless the server
 * reported the transaction as read-only.
 */
export async function exportSourceRows(target: PsqlTarget, sql: string, onRow: (table: string, row: Record<string, unknown>) => void): Promise<void> {
  const child = spawn("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"], { env: baseEnv(target) as NodeJS.ProcessEnv, stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end(sql);
  const lines = createInterface({ input: child.stdout });
  let state: "start" | "await-read-only" | "rows" = "start";
  let table = "";
  let ended = false;
  let failure: Error | null = null;
  for await (const line of lines) {
    if (failure) continue;
    if (line === "@@strelva-read-only") { state = "await-read-only"; continue; }
    if (state === "await-read-only") {
      if (line.trim() !== "on") { failure = new Error("The source session is not read-only; stopping before any row is read."); child.kill("SIGTERM"); continue; }
      state = "rows";
      continue;
    }
    if (line.startsWith("@@strelva-table ")) { table = line.slice("@@strelva-table ".length); continue; }
    if (line === "@@strelva-end") { ended = true; continue; }
    if (state !== "rows" || !table || !line) continue;
    try {
      onRow(table, JSON.parse(line) as Record<string, unknown>);
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      child.kill("SIGTERM");
    }
  }
  const code = await new Promise<number>((resolve) => child.on("close", (exitCode) => resolve(exitCode ?? 1)));
  if (failure) throw failure;
  if (code !== 0 || !ended) throw new Error(`Source export failed: ${firstErrorLine(stderr) || "psql exited early"}`);
}

// ---------------------------------------------------------------------------
// Local cluster
// ---------------------------------------------------------------------------

export interface LocalCluster {
  target: PsqlTarget;
  dataDir: string;
  socketDir: string;
  port: number;
  stop(): Promise<void>;
}

export async function initCluster(dataDir: string): Promise<void> {
  const result = await run("initdb", ["-D", dataDir, "--locale=C", "--encoding=UTF8", "--auth=trust", "--no-instructions"]);
  if (result.code !== 0) throw new Error(`initdb failed: ${firstErrorLine(result.stderr)}`);
}

/** No TCP listener: listen_addresses='' and a private socket directory. */
export async function startCluster(dataDir: string, socketDir: string, port: number, logFile: string): Promise<LocalCluster> {
  const result = await run("pg_ctl", ["-D", dataDir, "-l", logFile, "-o", `-F -k '${socketDir}' -c listen_addresses='' -p ${port}`, "-w", "start"]);
  if (result.code !== 0) throw new Error(`pg_ctl start failed; see ${logFile}`);
  const user = (await run("id", ["-un"])).stdout.trim();
  return {
    target: socketTarget(socketDir, port, user),
    dataDir,
    socketDir,
    port,
    async stop() { await run("pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "stop"]); },
  };
}

export function repoMigrations(repoRoot: string): Array<{ version: string; file: string }> {
  const dir = path.join(repoRoot, "supabase/migrations");
  return readdirSync(dir).filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort().map((name) => ({ version: name.slice(0, 14), file: path.join(dir, name) }));
}

export interface MigrationSplit {
  beforeLoad: Array<{ version: string; file: string }>;
  afterLoad: Array<{ version: string; file: string }>;
  sourceOnly: string[];
}

/**
 * Before the load: exactly what the source has applied. After the load: what
 * the repository has and the source does not yet (the pending production rollout).
 */
export function splitMigrations(repo: Array<{ version: string; file: string }>, applied: string[]): MigrationSplit {
  const appliedSet = new Set(applied);
  const repoSet = new Set(repo.map((migration) => migration.version));
  return {
    beforeLoad: repo.filter((migration) => appliedSet.has(migration.version)),
    afterLoad: repo.filter((migration) => !appliedSet.has(migration.version)),
    sourceOnly: applied.filter((version) => !repoSet.has(version)),
  };
}

/** Destination column lists, to load only what both sides have. */
export async function destinationColumns(target: PsqlTarget, policies: TablePolicy[]): Promise<Map<string, string[]>> {
  const wanted = policies.map((policy) => `(${literal(policy.schema)},${literal(policy.table)})`).join(",");
  const out = await psql(target, `SELECT COALESCE(json_object_agg(table_schema || '.' || table_name, columns), '{}'::json) FROM (
  SELECT table_schema, table_name, json_agg(column_name::text ORDER BY ordinal_position) AS columns
  FROM information_schema.columns WHERE (table_schema, table_name) IN (${wanted}) GROUP BY table_schema, table_name) c;`);
  return new Map(Object.entries(JSON.parse(out.trim()) as Record<string, string[]>));
}

/**
 * Load scrubbed JSONL files with triggers and FK checks off (a restore keeps the
 * source's ids and stable ids exactly), then bring identity sequences forward.
 */
export function buildLoadSql(items: Array<{ relation: string; file: string; columns: string[] }>): string {
  const lines = ["\\set ON_ERROR_STOP on", "SET session_replication_role = replica;", "CREATE TEMP TABLE _scrubbed_rows(j jsonb);"];
  for (const item of items) {
    if (!item.columns.length) continue;
    const cols = item.columns.map(quoteIdent).join(", ");
    const [schema, table] = item.relation.split(".") as [string, string];
    const relation = `${quoteIdent(schema)}.${quoteIdent(table)}`;
    lines.push(`\\copy _scrubbed_rows(j) FROM ${literal(item.file)} WITH (FORMAT csv, QUOTE E'\\x01', DELIMITER E'\\x02')`);
    lines.push(`INSERT INTO ${relation} (${cols}) OVERRIDING SYSTEM VALUE SELECT ${item.columns.map((column) => `r.${quoteIdent(column)}`).join(", ")} FROM _scrubbed_rows, jsonb_populate_record(NULL::${relation}, j) r;`);
    lines.push("TRUNCATE _scrubbed_rows;");
  }
  lines.push(`DO $$
DECLARE c record; seq text;
BEGIN
  FOR c IN SELECT n.nspname, t.relname, a.attname FROM pg_attribute a JOIN pg_class t ON t.oid = a.attrelid JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname IN ('public','auth') AND t.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped LOOP
    seq := pg_get_serial_sequence(format('%I.%I', c.nspname, c.relname), c.attname);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, GREATEST(COALESCE((SELECT max(%I) FROM %I.%I), 0), 1))', seq, c.attname, c.nspname, c.relname);
    END IF;
  END LOOP;
END $$;`);
  return `${lines.join("\n")}\n`;
}

/** Rows whose foreign key points at nothing, per constraint. Zero everywhere means joins survived. */
export async function foreignKeyOrphans(target: PsqlTarget): Promise<Record<string, number>> {
  const out = await psql(target, `CREATE TEMP TABLE _fk_orphans(name text, orphans bigint);
DO $$
DECLARE c record; child_cols text; parent_cols text; join_cond text; n bigint;
BEGIN
  FOR c IN SELECT con.conname, con.conrelid, con.confrelid, con.conkey, con.confkey FROM pg_constraint con
    JOIN pg_namespace ns ON ns.oid = con.connamespace WHERE con.contype = 'f' AND ns.nspname IN ('public','auth') LOOP
    SELECT string_agg(format('c.%I', a.attname), ',' ORDER BY k.ord), string_agg(format('c.%I = p.%I', a.attname, pa.attname), ' AND ' ORDER BY k.ord)
      INTO child_cols, join_cond
      FROM unnest(c.conkey, c.confkey) WITH ORDINALITY AS k(child, parent, ord)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.child
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = k.parent;
    EXECUTE format('SELECT count(*) FROM %s c WHERE (%s) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)',
      c.conrelid::regclass, replace(child_cols, ',', ') IS NOT NULL AND ('), c.confrelid::regclass, join_cond) INTO n;
    IF n > 0 THEN INSERT INTO _fk_orphans VALUES (c.conrelid::regclass::text || '.' || c.conname, n); END IF;
  END LOOP;
END $$;
SELECT COALESCE(json_object_agg(name, orphans), '{}'::json) FROM _fk_orphans;`);
  return JSON.parse(out.trim().split("\n").pop() ?? "{}") as Record<string, number>;
}

export const LOCAL_OPERATOR = {
  id: "5c0bbed0-0000-4000-8000-00000000c0de",
  email: "operator@scrubbed.strelva.test",
};

/** A local-only super admin, so conversion can be rehearsed without any real operator identity. */
export async function addLocalOperator(target: PsqlTarget): Promise<void> {
  await psql(target, `INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${LOCAL_OPERATOR.id}', '${LOCAL_OPERATOR.email}', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, verified_at) VALUES ('${LOCAL_OPERATOR.id}', '${LOCAL_OPERATOR.email}', now())
  ON CONFLICT (id) DO UPDATE SET verified_at = COALESCE(public.users.verified_at, now());
INSERT INTO public.super_admins (user_id, email) VALUES ('${LOCAL_OPERATOR.id}', '${LOCAL_OPERATOR.email}') ON CONFLICT DO NOTHING;`);
}

export interface RehearsalResult {
  applied: boolean;
  error?: string;
  receipt?: { workspaceId?: string; alreadyConverted?: boolean; counts?: Record<string, number> };
}

/** Apply one planned conversion through the real RPC, inside a transaction that is always rolled back. */
export async function rehearseConversion(target: PsqlTarget, input: { slug: string; payload: unknown; commandId: string; digest: string }): Promise<RehearsalResult> {
  const tag = `scrubbed_${Math.random().toString(36).slice(2, 10)}`;
  const payload = JSON.stringify(input.payload);
  if (payload.includes(`$${tag}$`)) throw new Error("Payload collides with the quoting tag.");
  const sql = `BEGIN;
SELECT public.convert_tenant_to_business(${literal(LOCAL_OPERATOR.email)}, ${literal(input.slug)}, $${tag}$${payload}$${tag}$::jsonb, ${literal(input.commandId)}::uuid, ${literal(input.digest)})::text;
ROLLBACK;`;
  try {
    const out = (await psql(target, sql)).trim().split("\n").filter(Boolean).pop() ?? "{}";
    const receipt = JSON.parse(out) as Record<string, unknown>;
    return {
      applied: true,
      receipt: {
        workspaceId: typeof receipt.workspaceId === "string" ? receipt.workspaceId : undefined,
        alreadyConverted: Boolean(receipt.alreadyConverted),
        counts: receipt.counts && typeof receipt.counts === "object" ? receipt.counts as Record<string, number> : undefined,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { applied: false, error: /([a-z_]+(?:_[a-z]+)+)/.exec(message.replace(/^psql failed: /, ""))?.[1] ?? "conversion_failed" };
  }
}

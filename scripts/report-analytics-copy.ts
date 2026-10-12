/**
 * Copy report cadence, last-sent markers and analytics config from Redis into
 * Postgres (Systems catalog section 5). Logic only; the CLI is
 * scripts/copy-report-analytics-state.ts. Readers and writers are injected so
 * a dry run is provably read-only.
 *
 * Every write uses via = 'backfill', which the database treats as "fill only
 * what is missing": it never replaces a cadence or config already in Postgres
 * and never moves a last-sent marker backwards. Rerun freely. The Redis keys
 * are only read, never renamed or deleted.
 */
import { isLocalDatabaseUrl } from "./tenant-conversion";

export interface CopyTenant {
  id: string;
  siteName: string;
}

export interface RedisReportAnalyticsState {
  cadence: "weekly" | "monthly" | null;
  lastSentAt: number | null;
  config: { gscProperty: string | null; ga4PropertyId: string | null; updatedAt: string | null } | null;
}

export interface PostgresReportAnalyticsState {
  cadence: "weekly" | "monthly" | null;
  lastSentAt: number | null;
  hasConfig: boolean;
}

export type CopyWriteResult = { ok: true } | { ok: false; reason: string };

export interface CopyDeps {
  tenants(): Promise<CopyTenant[]>;
  /** The three Redis values for one tenant. Read-only. */
  redis(tenantId: string): Promise<RedisReportAnalyticsState>;
  /** What Postgres already holds; null when there is no database to ask. */
  postgres: ((tenantId: string) => Promise<PostgresReportAnalyticsState | null>) | null;
  setCadence(tenantId: string, cadence: "weekly" | "monthly"): Promise<CopyWriteResult>;
  markSent(tenantId: string, sentAtIso: string): Promise<CopyWriteResult>;
  writeConfig(tenantId: string, config: NonNullable<RedisReportAnalyticsState["config"]>): Promise<CopyWriteResult>;
  log(line: string): void;
}

export interface CopyOptions {
  tenant?: string;
  apply: boolean;
  jacobsYes: boolean;
  databaseUrl?: string;
}

export interface CopyTenantReport {
  tenantId: string;
  redis: { cadence: string | null; lastSentAt: string | null; config: boolean };
  /** What a copy would add. null when Postgres was not checked. */
  toCopy: { cadence: boolean; lastSent: boolean; config: boolean } | null;
  copied: string[];
  failed: { item: string; reason: string }[];
}

export interface CopyOutcome {
  mode: "dry-run" | "apply";
  database: "local" | "not local" | "not configured";
  tenants: CopyTenantReport[];
  totals: { cadence: number; lastSent: number; config: number; copied: number; failed: number };
}

export function parseCopyArgs(argv: string[]): CopyOptions & { json: boolean } {
  const unknown = argv.filter((arg) => arg.startsWith("--") && !/^--(?:apply|dry-run|json|i-have-jacobs-yes)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown flag(s): ${unknown.join(", ")}`);
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  if (positional.length > 1) throw new Error("Usage: copy-report-analytics-state [tenant-slug] [--apply] [--json]");
  const apply = argv.includes("--apply");
  if (apply && argv.includes("--dry-run")) throw new Error("Choose --dry-run or --apply, not both.");
  if (positional[0] && !/^[a-z0-9-]+$/.test(positional[0])) throw new Error(`"${positional[0]}" is not a tenant slug.`);
  return { tenant: positional[0], apply, jacobsYes: argv.includes("--i-have-jacobs-yes"), json: argv.includes("--json") };
}

export async function runReportAnalyticsCopy(options: CopyOptions, deps: CopyDeps): Promise<CopyOutcome> {
  const database = options.databaseUrl ? (isLocalDatabaseUrl(options.databaseUrl) ? "local" : "not local") : "not configured";
  if (options.apply) {
    if (database === "not configured") throw new Error("Refusing --apply: no database is configured (SUPABASE_URL).");
    if (database === "not local" && !options.jacobsYes) {
      throw new Error("Refusing --apply: the database is not a local loopback host. A production copy needs Jacob's yes (--i-have-jacobs-yes).");
    }
  }
  const all = await deps.tenants();
  const tenants = options.tenant ? all.filter((t) => t.id === options.tenant) : all;
  if (options.tenant && tenants.length === 0) throw new Error(`No tenant "${options.tenant}".`);

  const log = deps.log;
  log(`Report and analytics state copy: ${options.apply ? "APPLY" : "dry run (writes nothing)"}`);
  log(`  database: ${database}`);
  const reports: CopyTenantReport[] = [];
  for (const tenant of tenants) {
    const redis = await deps.redis(tenant.id);
    const pg = deps.postgres ? await deps.postgres(tenant.id) : null;
    const checked = deps.postgres !== null;
    const toCopy = checked
      ? {
          cadence: redis.cadence !== null && !pg?.cadence,
          lastSent: redis.lastSentAt !== null && (pg?.lastSentAt == null || pg.lastSentAt < redis.lastSentAt),
          config: redis.config !== null && !pg?.hasConfig,
        }
      : null;
    const report: CopyTenantReport = {
      tenantId: tenant.id,
      redis: {
        cadence: redis.cadence,
        lastSentAt: redis.lastSentAt === null ? null : new Date(redis.lastSentAt).toISOString(),
        config: redis.config !== null,
      },
      toCopy,
      copied: [],
      failed: [],
    };
    if (options.apply) {
      // Without a Postgres read, offer everything Redis has; the database keeps what it already has.
      const plan = toCopy ?? { cadence: redis.cadence !== null, lastSent: redis.lastSentAt !== null, config: redis.config !== null };
      const attempt = async (item: string, run: () => Promise<CopyWriteResult>) => {
        const result = await run();
        if (result.ok) report.copied.push(item);
        else report.failed.push({ item, reason: result.reason });
      };
      if (plan.cadence && redis.cadence) await attempt("cadence", () => deps.setCadence(tenant.id, redis.cadence!));
      if (plan.lastSent && redis.lastSentAt !== null) await attempt("lastSent", () => deps.markSent(tenant.id, new Date(redis.lastSentAt!).toISOString()));
      if (plan.config && redis.config) await attempt("config", () => deps.writeConfig(tenant.id, redis.config!));
    }
    reports.push(report);
    const items = [
      redis.cadence ? `cadence ${redis.cadence}` : null,
      report.redis.lastSentAt ? `last sent ${report.redis.lastSentAt.slice(0, 10)}` : null,
      redis.config ? "analytics config" : null,
    ].filter(Boolean);
    const pending = toCopy ? Object.entries(toCopy).filter(([, v]) => v).map(([k]) => k) : null;
    log(`  ${tenant.id} (${tenant.siteName}): Redis has ${items.length ? items.join(", ") : "nothing"}` +
      (pending === null ? ", Postgres not checked" : `; to copy: ${pending.length ? pending.join(", ") : "nothing"}`) +
      (options.apply ? ` -> copied ${report.copied.join(", ") || "nothing"}, failed ${report.failed.length}` : ""));
    for (const failure of report.failed) log(`    failed ${failure.item}: ${failure.reason}`);
  }
  const count = (pick: keyof NonNullable<CopyTenantReport["toCopy"]>) => reports.filter((r) => r.toCopy?.[pick]).length;
  const outcome: CopyOutcome = {
    mode: options.apply ? "apply" : "dry-run",
    database,
    tenants: reports,
    totals: {
      cadence: count("cadence"),
      lastSent: count("lastSent"),
      config: count("config"),
      copied: reports.reduce((n, r) => n + r.copied.length, 0),
      failed: reports.reduce((n, r) => n + r.failed.length, 0),
    },
  };
  log(`  total: ${reports.length} tenant(s); to copy ${outcome.totals.cadence} cadence, ${outcome.totals.lastSent} last-sent, ${outcome.totals.config} config` +
    (options.apply ? `; copied ${outcome.totals.copied}, failed ${outcome.totals.failed}` : ""));
  if (!options.apply) log("  Dry run only. Rerun with --apply against a local database to write.");
  return outcome;
}

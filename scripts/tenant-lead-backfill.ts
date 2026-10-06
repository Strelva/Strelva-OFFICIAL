/**
 * Copy client leads still in Redis into Postgres `tenant_leads` (Strelva
 * Reborn section 0). Logic only; the CLI is scripts/backfill-tenant-leads.ts.
 * Readers and the writer are injected so a dry run is provably read-only.
 *
 * Idempotent: the store treats a lead id it already has as a no-op, and the
 * same submission inside five minutes as a duplicate. Rerun freely.
 */
import type { LeadRecord } from "../src/lib/leads";
import type { LeadMirrorResult } from "../src/lib/lead-mirror";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** True only for a loopback database host. Anything else is production-like. */
export function isLocalDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return LOOPBACK.has(host) || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

export interface BackfillTenant {
  id: string;
  siteName: string;
}

export interface BackfillDeps {
  tenants(): Promise<BackfillTenant[]>;
  /** Redis window for one tenant, newest first. Read-only. */
  leads(tenantId: string): Promise<LeadRecord[]>;
  /** Lead ids already in Postgres for this tenant; null when there is no database to ask. */
  existing: ((tenantId: string) => Promise<Set<string> | null>) | null;
  write(tenantId: string, lead: LeadRecord): Promise<LeadMirrorResult>;
  /** Clears a lead from the failed-copy list once it is in Postgres. */
  clearPending(tenantId: string, leadId: string): Promise<void>;
  log(line: string): void;
  now?: () => number;
}

export interface BackfillOptions {
  tenant?: string;
  apply: boolean;
  jacobsYes: boolean;
  databaseUrl?: string;
}

export interface BackfillTenantReport {
  tenantId: string;
  inRedis: number;
  alreadyInPostgres: number | null;
  toCopy: number | null;
  oldest: string | null;
  expiringIn14Days: number;
  recorded: number;
  exists: number;
  duplicate: number;
  failed: { leadId: string; reason: string }[];
}

export interface BackfillOutcome {
  mode: "dry-run" | "apply";
  database: "local" | "not local" | "not configured";
  tenants: BackfillTenantReport[];
  totals: { inRedis: number; toCopy: number | null; recorded: number; exists: number; duplicate: number; failed: number };
}

export function parseBackfillArgs(argv: string[]): BackfillOptions & { json: boolean } {
  const unknown = argv.filter((arg) => arg.startsWith("--") && !/^--(?:apply|dry-run|json|i-have-jacobs-yes)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown flag(s): ${unknown.join(", ")}`);
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  if (positional.length > 1) throw new Error("Usage: backfill-tenant-leads [tenant-slug] [--apply] [--json]");
  const apply = argv.includes("--apply");
  if (apply && argv.includes("--dry-run")) throw new Error("Choose --dry-run or --apply, not both.");
  if (positional[0] && !/^[a-z0-9-]+$/.test(positional[0])) throw new Error(`"${positional[0]}" is not a tenant slug.`);
  return { tenant: positional[0], apply, jacobsYes: argv.includes("--i-have-jacobs-yes"), json: argv.includes("--json") };
}

const WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const SOON_MS = 14 * 24 * 60 * 60 * 1000;

export async function runLeadBackfill(options: BackfillOptions, deps: BackfillDeps): Promise<BackfillOutcome> {
  const database = options.databaseUrl ? (isLocalDatabaseUrl(options.databaseUrl) ? "local" : "not local") : "not configured";
  if (options.apply) {
    if (database === "not configured") throw new Error("Refusing --apply: no database is configured (SUPABASE_URL).");
    if (database === "not local" && !options.jacobsYes) {
      throw new Error("Refusing --apply: the database is not a local loopback host. A production backfill needs Jacob's yes (--i-have-jacobs-yes).");
    }
  }
  const now = (deps.now ?? Date.now)();
  const all = await deps.tenants();
  const tenants = options.tenant ? all.filter((t) => t.id === options.tenant) : all;
  if (options.tenant && tenants.length === 0) throw new Error(`No tenant "${options.tenant}".`);

  const log = deps.log;
  log(`Client lead backfill: ${options.apply ? "APPLY" : "dry run (writes nothing)"}`);
  log(`  database: ${database}`);
  const reports: BackfillTenantReport[] = [];
  for (const tenant of tenants) {
    const leads = await deps.leads(tenant.id);
    const existing = deps.existing ? await deps.existing(tenant.id) : null;
    const missing = existing ? leads.filter((lead) => !existing.has(lead.id)) : leads;
    const times = leads.map((lead) => Date.parse(lead.createdAt)).filter(Number.isFinite);
    const report: BackfillTenantReport = {
      tenantId: tenant.id,
      inRedis: leads.length,
      alreadyInPostgres: existing ? leads.length - missing.length : null,
      toCopy: existing ? missing.length : null,
      oldest: times.length ? new Date(Math.min(...times)).toISOString() : null,
      expiringIn14Days: times.filter((t) => t + WINDOW_MS - now < SOON_MS).length,
      recorded: 0,
      exists: 0,
      duplicate: 0,
      failed: [],
    };
    if (options.apply) {
      // Oldest first, so the double-submit window keeps the earliest copy.
      for (const lead of [...missing].reverse()) {
        const result = await deps.write(tenant.id, lead);
        if (result.status === "failed" || result.status === "skipped") {
          report.failed.push({ leadId: lead.id, reason: result.reason });
        } else {
          report[result.status]++;
          await deps.clearPending(tenant.id, lead.id);
        }
      }
    }
    reports.push(report);
    log(`  ${tenant.id} (${tenant.siteName}): ${report.inRedis} in Redis` +
      (report.alreadyInPostgres === null ? ", Postgres not checked" : `, ${report.alreadyInPostgres} already in Postgres, ${report.toCopy} to copy`) +
      (report.oldest ? `, oldest ${report.oldest.slice(0, 10)}` : "") +
      (report.expiringIn14Days ? `, ${report.expiringIn14Days} expire from Redis within 14 days` : "") +
      (options.apply ? ` -> recorded ${report.recorded}, already there ${report.exists}, duplicate ${report.duplicate}, failed ${report.failed.length}` : ""));
    for (const failure of report.failed.slice(0, 5)) log(`    failed ${failure.leadId}: ${failure.reason}`);
  }
  const sum = (pick: (r: BackfillTenantReport) => number) => reports.reduce((total, r) => total + pick(r), 0);
  const outcome: BackfillOutcome = {
    mode: options.apply ? "apply" : "dry-run",
    database,
    tenants: reports,
    totals: {
      inRedis: sum((r) => r.inRedis),
      toCopy: reports.every((r) => r.toCopy !== null) ? sum((r) => r.toCopy ?? 0) : null,
      recorded: sum((r) => r.recorded),
      exists: sum((r) => r.exists),
      duplicate: sum((r) => r.duplicate),
      failed: sum((r) => r.failed.length),
    },
  };
  log(`  total: ${outcome.totals.inRedis} leads in Redis across ${reports.length} tenant(s)` +
    (outcome.totals.toCopy === null ? "" : `, ${outcome.totals.toCopy} to copy`) +
    (options.apply ? `; recorded ${outcome.totals.recorded}, failed ${outcome.totals.failed}` : ""));
  if (!options.apply) log("  Dry run only. Rerun with --apply against a local database to write.");
  return outcome;
}

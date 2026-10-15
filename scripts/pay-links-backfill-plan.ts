/**
 * Core of scripts/pay-links-backfill.ts, kept free of I/O so it is tested
 * directly. Copies legacy Redis pay links into agency_pay_links (rail
 * 'platform_legacy'). A dry run reads Redis and writes nothing. Redis command
 * receipts (reb:paylink:command:*) are intentionally not migrated: they only
 * make a retried create or expire return the same answer, and a retry after the
 * move runs against the Postgres command receipts instead.
 */
import { createHash } from "node:crypto";
import { canonicalJson } from "../src/platform/client-records/mirror";
import { normalizePayLinkSlug, type PayLinkConfig } from "../src/platform/infra/pay-links";
import { isLocalDatabaseUrl } from "./tenant-conversion";

export interface BackfillOptions {
  apply: boolean;
  jacobsYes: boolean;
  json: boolean;
  verify: boolean;
  legacyAgency?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseBackfillArgs(argv: string[]): BackfillOptions {
  const unknown = argv.filter((arg) => !/^--(?:apply|json|verify|i-have-jacobs-yes|legacy-agency=.+)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown option: ${unknown.join(", ")}`);
  const legacy = argv.find((arg) => arg.startsWith("--legacy-agency="))?.slice("--legacy-agency=".length);
  if (legacy !== undefined && !UUID.test(legacy)) throw new Error("--legacy-agency must be an agency workspace id (uuid).");
  const options = { apply: argv.includes("--apply"), jacobsYes: argv.includes("--i-have-jacobs-yes"), json: argv.includes("--json"), verify: argv.includes("--verify"), legacyAgency: legacy };
  if (options.apply && options.verify) throw new Error("--verify only reads; it cannot be combined with --apply.");
  return options;
}

export interface PlannedRow { record: PayLinkConfig; sourceHash: string }
export interface BackfillPlan { total: number; ownerless: number; invalid: Array<{ slug: string; reason: string }>; rows: PlannedRow[] }

export const payLinkSourceHash = (record: PayLinkConfig) => createHash("sha256").update(canonicalJson(record)).digest("hex");

function invalidReason(record: PayLinkConfig): string | null {
  const slug = normalizePayLinkSlug(record.slug);
  if (!slug) return "no valid slug";
  if (slug === "index" || slug === "rohlax") return "reserved slug";
  if (!record.door) return "no door";
  const fixed = typeof record.amountCents === "number";
  const range = typeof record.minCents === "number" && typeof record.maxCents === "number";
  if (fixed === range) return fixed ? "both a fixed amount and a range" : "no amount";
  return null;
}

export function planBackfill(records: PayLinkConfig[], legacyAgency?: string): BackfillPlan {
  const invalid: BackfillPlan["invalid"] = [];
  const rows: PlannedRow[] = [];
  let ownerless = 0;
  for (const record of records) {
    const reason = invalidReason(record);
    if (reason) { invalid.push({ slug: String(record.slug), reason }); continue; }
    if (!record.agencyWorkspaceId) ownerless += 1;
    rows.push({ record, sourceHash: payLinkSourceHash(record) });
  }
  void legacyAgency;
  return { total: records.length, ownerless, invalid, rows };
}

export interface BackfillDeps {
  list(): Promise<PayLinkConfig[]>;
  write(record: PayLinkConfig, hash: string, legacyAgency: string | null): Promise<"inserted" | "unchanged" | "conflict">;
  /** Legacy-rail links currently in Postgres, mapped back to the legacy shape. */
  stored(): Promise<PayLinkConfig[]>;
  log(line: string): void;
}

/** What a faithful copy keeps equal. Timestamps compare as instants, not strings. */
function comparable(record: PayLinkConfig, legacyAgency?: string) {
  return canonicalJson({
    slug: record.slug, clientName: record.clientName, door: record.door, tenantId: record.tenantId ?? null, leadSlug: record.leadSlug ?? null,
    amountCents: record.amountCents ?? null, minCents: record.minCents ?? null, maxCents: record.maxCents ?? null, customCopy: record.customCopy ?? null,
    returnUrl: record.returnUrl ?? null, agencyWorkspaceId: record.agencyWorkspaceId ?? legacyAgency ?? null, agencyDisplayName: record.agencyDisplayName ?? null,
    businessWorkspaceId: record.businessWorkspaceId ?? null, createdAt: Date.parse(record.createdAt) || null, revoked: Boolean(record.revokedAt),
  });
}

export async function runBackfill(options: BackfillOptions & { databaseUrl?: string }, deps: BackfillDeps) {
  const database = options.databaseUrl ? (isLocalDatabaseUrl(options.databaseUrl) ? "local" : "not local") : "not configured";
  const plan = planBackfill(await deps.list(), options.legacyAgency);
  const result = { mode: options.verify ? "verify" : options.apply ? "apply" : "dry run", database, total: plan.total, ownerless: plan.ownerless, invalid: plan.invalid,
    inserted: 0, unchanged: 0, conflicts: 0, missing: [] as string[], different: [] as string[] };
  if (options.verify) {
    const stored = new Map((await deps.stored()).map((record) => [record.slug, record]));
    for (const { record } of plan.rows) {
      const found = stored.get(record.slug);
      if (!found) result.missing.push(record.slug);
      else if (comparable(found) !== comparable(record, options.legacyAgency)) result.different.push(record.slug);
    }
    deps.log(`verify: ${plan.rows.length} in Redis, ${result.missing.length} missing, ${result.different.length} different`);
    return result;
  }
  if (options.apply) {
    if (database === "not configured") throw new Error("Refusing --apply: no database is configured.");
    if (database === "not local" && !options.jacobsYes) throw new Error("Refusing --apply: the database is not a local loopback host. A production backfill needs Jacob's yes (--i-have-jacobs-yes).");
    if (plan.ownerless > 0 && !options.legacyAgency) throw new Error(`${plan.ownerless} legacy links have no owning agency. Pass --legacy-agency=<agency workspace id> (Jacob's choice).`);
    for (const { record, sourceHash } of plan.rows) {
      const outcome = await deps.write(record, sourceHash, options.legacyAgency ?? null);
      if (outcome === "inserted") result.inserted += 1;
      else if (outcome === "unchanged") result.unchanged += 1;
      else result.conflicts += 1;
    }
  }
  deps.log(`${options.apply ? "copied" : "would copy"} ${plan.rows.length} of ${plan.total} legacy links (${plan.ownerless} without an owner, ${plan.invalid.length} invalid)`);
  for (const item of plan.invalid) deps.log(`skipped ${item.slug}: ${item.reason}`);
  return result;
}

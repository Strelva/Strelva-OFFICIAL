/**
 * Core tenant deprovision logic — shared between the admin API route
 * (src/app/api/admin/tenants/[id]/deprovision/route.ts) and the CLI script
 * (scripts/deprovision-tenant.ts).
 *
 * This module owns the SAFETY GUARDS (denylist, active-subscription refusal)
 * and the full multi-store purge (Postgres → Redis → Vercel). The caller
 * controls whether writes actually execute (dryRun flag) and supplies the
 * tenant config it already looked up.
 *
 * The script's interactive reconfirmation prompt (re-type the slug) is handled
 * in the script itself, not here — the API route performs the equivalent check
 * server-side (confirmSlug === id in the request body).
 */

import { RESERVED_SUBDOMAINS } from "@/lib/tenant-host";
import { leadAuthorityIsPostgres } from "./lead-reads";
import { getSupabase } from "@/platform/infra/db/client";
import { getRedis } from "@/platform/infra/redis";
import type { TenantConfig } from "@/lib/types";
import { clearTenantDomainClaims } from "@/lib/domains";
import { deleteVercelProject, isVercelConfigured } from "@/lib/vercel";
import { authoritativePatterns } from "@/lib/tenant-rename";
import { getAccountForTenant, unlinkTenant } from "@/lib/accounts";

// Real tenants that must never be torn down by accident. A backstop only —
// the live "has paid" guard is the primary defense (this set drifts stale).
export const PROTECTED_TENANTS = new Set(["gldf", "rohlax"]);

// Slugs must never become Redis glob syntax, including when force is set.
export function isValidDeprovisionTenantId(id: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/.test(id) && !RESERVED_SUBDOMAINS.has(id);
}

// Subscription states that indicate a real billing relationship exists.
const PAYING_STATUSES = new Set(["active", "trialing", "past_due"]);

// Every public table carrying a tenant_id, purged child-first. Kept in sync with
// src/platform/infra/db/database.types.ts (asserted by src/__tests__/deprovision-coverage.test.ts).
// `tenants` (keyed by id) is deleted last, after its children are gone.
export const TENANT_SCOPED_TABLES = [
  "activity_log", "audit_logs", "auto_approval_streaks", "bookings",
  "build_payments", "chat_messages", "chat_sessions", "chat_threads",
  "collection_entries", "reviews", "suggestions", "content", "content_versions",
  "domain_claims", "draft_content", "draft_page_config", "inbox_items",
  "integrations", "invites", "mail_log", "memberships", "newsletter_subscribers",
  "inquiry_record_overlays", "inquiry_publication_claims", "inquiry_workspaces", "job_economics",
  "page_config", "pay_links", "reward_members", "reward_transactions",
  "scan_history", "scan_results", "search_console_data", "site_metrics",
  "site_snapshots", "social_posts", "subscription_items", "unified_events",
  "proposals", "weekly_briefs",
] as const;

// Tables that carry a tenant_id but belong to a business workspace's own
// website (20261001120000_website_documents.sql). They are deliberately NOT
// swept: their tenant foreign keys are `on delete restrict`. A tenant that a
// workspace website still publishes to, or reserved, is refused before any
// deletion (refusalReason "workspace_website"); release it through the
// workspace first. The Postgres purge itself is one transaction
// (deprovision_tenant_rows, 20261007100000_atomic_tenant_teardown.sql), so a
// late failure never leaves the tenant partially erased.
export const WORKSPACE_OWNED_TENANT_TABLES = [
  "website_document_publications", "website_hosted_tenant_reservations",
] as const;

// The tenant delete removes these through ON DELETE CASCADE. Count them for
// dry runs and receipts without changing the atomic teardown's explicit sweep.
export const CASCADED_TENANT_TABLES = ["tenant_track_signing_keys"] as const;

// Finding 19 resolved in Wave 6: preserve the five tables as historical
// receipts. STRELVA_TENANT_RECEIPT_RETENTION=1 selects the atomic adapter
// that records counts and expires draft grants; off uses the original RPC.
// Retention is indefinite pending an explicit later deletion policy/yes.
export const TENANT_TABLES_SWEEP_UNDECIDED = [] as const;
export const TENANT_TABLES_RETAINED_AS_RECEIPTS = [
  "agency_managed_website_draft_grants", "agency_managed_website_draft_preparations",
  "agency_managed_website_draft_revisions", "outside_write_receipts", "report_snapshots",
] as const;

// Tables keyed on the tenant's stable_id are not swept by slug either; the
// `tenants` delete settles them through their foreign keys:
//   tenant_leads            kept (20261007110000): stamped tenant_deleted_at; a lead
//                           in no business is purged 365 days later with a receipt
//   tenant_workspace_links  on delete set null (the business and receipt stay)
//   tenant_workspace_unlinks no foreign key (unlink receipts stay)

// Global Redis caches that include this tenant; safe to bust (they rebuild).
const GLOBAL_CACHE_KEYS = ["reb:tenants:all", "reb:domain-map", "reb:portfolio:summary"];

export interface StoreAction {
  target: string;
  found: number | string;
  deleted: boolean;
  detail?: string;
}

export interface DeprovisionResult {
  ok: boolean;
  /** Non-null when a safety guard refused the operation. */
  refusalReason?: "invalid_tenant_id" | "protected_tenant" | "active_subscription" | "workspace_website";
  refusalDetail?: string;
  tenantId: string;
  executed: boolean;
  pgRowTotal: number;
  summary: Record<string, StoreAction[]>;
}

// The Supabase client is strongly typed to literal table names; a generic sweep
// over the tenant-scoped tables needs dynamic access, so we narrow to a minimal
// structural view of just the builder methods this module uses.
type PgError = { message: string } | null;
type DynTable = {
  select(cols: string, opts: { count: "exact"; head: true }): { eq(col: string, val: string): PromiseLike<{ count: number | null; error: PgError }> };
  delete(): { eq(col: string, val: string): PromiseLike<{ error: PgError }> };
};

function dyn(table: string): DynTable | null {
  const db = getSupabase();
  return db ? (db.from(table as never) as unknown as DynTable) : null;
}

async function countRows(table: string, tenantId: string): Promise<number> {
  const t = dyn(table);
  if (!t) return 0;
  const col = table === "tenants" ? "id" : "tenant_id";
  const { count, error } = await t.select("*", { count: "exact", head: true }).eq(col, tenantId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

type TeardownRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: PgError }>;
function rpc(): TeardownRpc | null {
  const db = getSupabase();
  return db ? ((name, args) => (db.rpc as unknown as TeardownRpc)(name, args)) : null;
}

/** Workspace website rows that hold this tenant (service-role SQL; the tables revoke direct reads). */
async function workspaceWebsiteBlockers(tenantId: string): Promise<{ publications: number; reservations: number }> {
  const call = rpc();
  if (!call) return { publications: 0, reservations: 0 };
  const { data, error } = await call("tenant_teardown_blockers", { p_tenant_id: tenantId });
  if (error) throw new Error(`tenant_teardown_blockers: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { publications?: number | string; reservations?: number | string } | undefined;
  return { publications: Number(row?.publications ?? 0), reservations: Number(row?.reservations ?? 0) };
}

/** Pause every stored System adopted from this tenant (pause_tenant_systems). */
export async function pauseStoredSystems(tenantId: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const call = rpc();
  if (!call) return { ok: true, count: 0 };
  try {
    const { data, error } = await call("pause_tenant_systems", { p_tenant_id: tenantId });
    if (error) return { ok: false, error: (error.message ?? "unknown error").slice(0, 200) };
    return { ok: true, count: Number(data ?? 0) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 200) : "unknown error" };
  }
}

/** Delete every tenant-scoped row and the tenant in one transaction. */
async function deleteTenantRowsAtomically(tenantId: string, force: boolean): Promise<{ counts: Record<string, number>; paused: number }> {
  const call = rpc();
  if (!call) throw new Error("tenant_teardown_database_unavailable");
  const { data, error } = await call("deprovision_tenant_guarded", {
    p_tenant_id: tenantId, p_force: force,
    p_require_inquiry_export: leadAuthorityIsPostgres(),
    p_retain_receipts: process.env.STRELVA_TENANT_RECEIPT_RETENTION === "1",
  });
  if (error) throw new Error(`deprovision_tenant_rows: ${error.message}`);
  const result = data as { counts?: Record<string, unknown>; paused?: number } | null;
  if (!result?.counts || !Number.isFinite(result.paused)) throw new Error("tenant_teardown_invalid_receipt");
  return { counts: Object.fromEntries(Object.entries(result.counts).map(([table, n]) => [table, Number(n)])), paused: result.paused! };
}

/** Per-tenant Redis key patterns, with the tenant id pinned to its KNOWN
 *  position. A bare "id appears anywhere" match would delete OTHER tenants' keys
 *  for an unlucky id. Wildcards are SCANned; exact keys checked with EXISTS. */
export function tenantRedisPatterns(tenantId: string, ownerEmail?: string): string[] {
  // Client data that Redis holds as the only copy (leads, orders, threads,
  // connections with encrypted secrets, booking config, rewards, settings,
  // spam held for review) is the same registry a rename moves, so the two
  // can't drift. The operator's own CRM record about this client is Strelva's
  // data, not the client's, and stays.
  const clientData = authoritativePatterns(tenantId).filter(
    (pattern) => pattern !== `crm:${tenantId}` && pattern !== `reb:crm-lock:${tenantId}`,
  );
  const p = [
    ...clientData,
    `events:${tenantId}`, // event index; its id-keyed blobs are found by value below
    `account-of:${tenantId}`, // multi-site grouping reverse lookup
    `calendly-meta:${tenantId}`,
    ...(process.env.STRELVA_TENANT_RECEIPT_RETENTION === "1" ? [`reb:client-records:pending-payload:*|${tenantId}|*`] : []),
    `reb:content:${tenantId}:*`,
    `reb:chat:${tenantId}:*`,
    `reb:rewards:${tenantId}:*`,
    `reb:page-config:${tenantId}`,
    `reb:maillog:${tenantId}`,
    `reb:scan:${tenantId}`,
    `reb:scan:hist:${tenantId}`,
    `reb:site-audit:${tenantId}`,
    `reb:inquiry-delivery:${tenantId}:*`,
    `reb:inquiry-delivery-claim:${tenantId}:*`,
    `reb:inquiry-delivery-provider:${tenantId}:*`,
    `reb:inquiry-delivery-event:${tenantId}:*`,
    `reb:inquiry-timeline:${tenantId}:*`,
    `reb:inquiry-budget:${tenantId}:*`,
    `reb:inquiry-reply:${tenantId}:*`,
    `reb:inquiry-reply-state:${tenantId}:*`,
    `reb:inquiry-capture-repair:${tenantId}`,
    `reb:inquiry-capture-repair-job:${tenantId}:*`,
    `reb:inquiry-capture-repair-claim:${tenantId}:*`,
    // This reverse index is keyed by an opaque reply address. The value is
    // tenant-scoped and is filtered in findTenantRedisKeys before deletion.
    `reb:inquiry-reply-target:*`,
  ];
  if (ownerEmail) p.push(`reb:invites:${ownerEmail.toLowerCase()}`);
  return [...new Set(p)];
}

/** Event blobs are keyed by event id, not tenant. The tenant's index names
 *  them; a blob is only taken when it still says it belongs to this tenant. */
export async function findTenantEventBlobKeys(tenantId: string): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = ((await redis.zrange<string[]>(`events:${tenantId}`, 0, -1)) ?? []).map(String);
  const found: string[] = [];
  for (const id of ids) {
    const blob = await redis.get<{ tenantId?: unknown }>(`event:${id}`);
    if (blob && typeof blob === "object" && blob.tenantId === tenantId) found.push(`event:${id}`);
  }
  return found;
}

export async function findTenantRedisKeys(patterns: string[], tenantId?: string): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  const found = new Set<string>();
  for (const pattern of patterns) {
    if (!pattern.includes("*")) {
      if (await redis.exists(pattern)) found.add(pattern);
      continue;
    }
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match: pattern, count: 500 });
      cursor = String(next);
      for (const k of keys) {
        if (pattern === "reb:inquiry-reply-target:*" && tenantId) {
          const raw = await redis.get<unknown>(k);
          let value: unknown = raw;
          if (typeof raw === "string") {
            try { value = JSON.parse(raw); } catch { value = null; }
          }
          if (!value || typeof value !== "object" || (value as { tenantId?: unknown }).tenantId !== tenantId) continue;
        }
        found.add(k);
      }
    } while (cursor !== "0");
  }
  return [...found];
}

export interface DeprovisionOptions {
  /** The tenant id (slug) being deprovisioned. */
  tenantId: string;
  /** The already-fetched tenant config (or null if none exists — still sweeps for orphans). */
  tenant: TenantConfig | null;
  /** When false (default), counts rows and describes actions without deleting anything. */
  dryRun?: boolean;
  /** Override the PROTECTED_TENANTS denylist and the active-subscription refusal. */
  force?: boolean;
  /** Leave the {tenantId}-site Vercel project in place. */
  keepVercel?: boolean;
}

/**
 * Run the full tenant purge (or a dry-run discovery pass). Returns a structured
 * result the caller can use to build a report or a JSON response.
 *
 * Safety guards (denylist + active-subscription) run before any writes.
 * The result has `ok: false` + `refusalReason` when a guard fires.
 *
 * All store operations are performed with the Supabase service-role client and
 * the Redis connection from the existing lib singletons — no new clients needed.
 */
export async function runDeprovision(opts: DeprovisionOptions): Promise<DeprovisionResult> {
  const { tenantId, tenant, dryRun = true, force = false, keepVercel = false } = opts;
  const executed = !dryRun;
  const summary: Record<string, StoreAction[]> = { postgres: [], redis: [], vercel: [] };

  if (!isValidDeprovisionTenantId(tenantId)) {
    return { ok: false, refusalReason: "invalid_tenant_id", refusalDetail: "Invalid tenant id.", tenantId, executed: false, pgRowTotal: 0, summary };
  }

  // Guard 1: hardcoded denylist.
  if (PROTECTED_TENANTS.has(tenantId) && !force) {
    return {
      ok: false,
      refusalReason: "protected_tenant",
      refusalDetail: `"${tenantId}" is in the protected-tenant list and cannot be deprovisioned. Contact the operator.`,
      tenantId,
      executed: false,
      pgRowTotal: 0,
      summary,
    };
  }

  if (executed && !getSupabase()) throw new Error("tenant_teardown_database_unavailable");

  // Guard 2: live "has paid" signal — the denylist drifts stale as clients onboard.
  const buildPayments = await countRows("build_payments", tenantId);
  const paying =
    (tenant?.subscriptionStatus && PAYING_STATUSES.has(tenant.subscriptionStatus)) ||
    buildPayments > 0;
  if (paying && !force) {
    return {
      ok: false,
      refusalReason: "active_subscription",
      refusalDetail: `"${tenantId}" appears to be a paying client (subscription=${tenant?.subscriptionStatus ?? "?"}, build_payments=${buildPayments}). Use --force only if you are certain.`,
      tenantId,
      executed: false,
      pgRowTotal: 0,
      summary,
    };
  }

  // Guard 3: a workspace website still publishes to, or reserved, this
  // tenant. Refuse before anything is deleted; --force cannot override it
  // because the restricting foreign keys would roll the purge back anyway.
  const blockers = await workspaceWebsiteBlockers(tenantId);
  if (blockers.publications + blockers.reservations > 0) {
    return {
      ok: false,
      refusalReason: "workspace_website",
      refusalDetail: `"${tenantId}" is held by a workspace website (publications=${blockers.publications}, reservations=${blockers.reservations}). Release it through the business workspace first. Nothing was deleted.`,
      tenantId,
      executed: false,
      pgRowTotal: 0,
      summary,
    };
  }

  // Check before pausing any System or touching Redis/Vercel. The atomic
  // teardown repeats this guard under the tenant lock, so a stale export
  // cannot authorize teardown after a fresh lead arrived.
  if (executed && leadAuthorityIsPostgres()) {
    const call = rpc();
    if (!call) throw new Error("inquiry_export_guard_unavailable");
    const checked = await call("assert_tenant_inquiry_export", { p_tenant_id: tenantId });
    if (checked.error) throw new Error(`inquiry_export_guard: ${checked.error.message}`);
  }

  // Postgres: count (always), then purge every table and the tenant in one
  // transaction. A failure throws here, before Redis or Vercel are touched.
  let pgTotal = 0;
  const found: Array<[string, number]> = [];
  for (const table of [...TENANT_SCOPED_TABLES, ...CASCADED_TENANT_TABLES, "tenants"]) {
    const n = await countRows(table, tenantId);
    pgTotal += n;
    if (n > 0) found.push([table, n]);
  }
  // Stored Systems pause inside the same transaction as the purge. A
  // refusal or failed delete must leave both the records and lifecycle intact.
  if (!executed) summary.postgres!.push({ target: "systems", found: "?", deleted: false, detail: "would pause any stored Systems (dry run)" });
  if (process.env.STRELVA_TENANT_RECEIPT_RETENTION === "1") {
    for (const table of TENANT_TABLES_RETAINED_AS_RECEIPTS) {
      summary.postgres!.push({ target: table, found: await countRows(table, tenantId), deleted: false,
        detail: "kept as historical receipts; outstanding draft grants expire on teardown" });
    }
  }
  const receipt = executed ? await deleteTenantRowsAtomically(tenantId, force) : null;
  const removed = receipt?.counts ?? {};
  if (receipt) summary.postgres!.push({ target: "systems", found: receipt.paused, deleted: false, detail: "stored Systems paused; records kept" });
  for (const [table, n] of found) {
    const cascaded = CASCADED_TENANT_TABLES.some(candidate => candidate === table) && (removed.tenants ?? 0) > 0;
    summary.postgres!.push({ target: table, found: n, deleted: executed && ((removed[table] ?? 0) > 0 || cascaded) });
  }

  // Redis: per-tenant keys (pinned patterns) + global cache busts.
  const redis = getRedis();
  const tenantKeys = [
    ...(await findTenantEventBlobKeys(tenantId)),
    ...(await findTenantRedisKeys(tenantRedisPatterns(tenantId, tenant?.ownerEmail ?? undefined), tenantId)),
  ];
  // The multi-site account blob is shared with other sites: take this site out
  // of it (and its line item) rather than deleting it.
  const account = await getAccountForTenant(tenantId).catch(() => null);
  if (account) {
    if (executed) await unlinkTenant(account.id, tenantId);
    summary.redis!.push({ target: `account:${account.id}`, found: 1, deleted: executed, detail: "site removed from the account grouping" });
  }
  for (let i = 0; executed && redis && i < tenantKeys.length; i += 500) await redis.del(...tenantKeys.slice(i, i + 500));
  for (const k of tenantKeys) summary.redis!.push({ target: k, found: 1, deleted: executed });

  // Domain claims live in one shared map — clear just this tenant's entries.
  if (tenant) {
    const claimed = await clearTenantDomainClaims(tenant, executed);
    for (const d of claimed) {
      summary.redis!.push({ target: `domain-claim ${d}`, found: 1, deleted: executed });
    }
  }
  if (executed && redis) await redis.del(...GLOBAL_CACHE_KEYS);
  for (const k of GLOBAL_CACHE_KEYS) {
    summary.redis!.push({
      target: k,
      found: "cache",
      deleted: executed,
      detail: "global cache invalidated",
    });
  }

  // Vercel: the {tenantId}-site project (env + domains go with it).
  if (keepVercel) {
    summary.vercel!.push({
      target: `${tenantId}-site`,
      found: "?",
      deleted: false,
      detail: "skipped (keepVercel)",
    });
  } else if (!isVercelConfigured()) {
    summary.vercel!.push({
      target: `${tenantId}-site`,
      found: "?",
      deleted: false,
      detail: "VERCEL_API_TOKEN not set — onboarding likely never created it",
    });
  } else if (executed) {
    const r = await deleteVercelProject(`${tenantId}-site`);
    summary.vercel!.push({
      target: `${tenantId}-site`,
      found: "?",
      deleted: r.ok,
      detail: r.ok ? "deleted (or already absent)" : r.error,
    });
  } else {
    summary.vercel!.push({
      target: `${tenantId}-site`,
      found: "?",
      deleted: false,
      detail: "would delete (dry run)",
    });
  }

  return { ok: true, tenantId, executed, pgRowTotal: pgTotal, summary };
}

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

import { z } from "zod";
import { RESERVED_SUBDOMAINS } from "@/lib/tenant-host";
import { leadAuthorityIsPostgres } from "./lead-reads";
import { getSupabase } from "@/platform/infra/db/client";
import { getRedis } from "@/platform/infra/redis";
import type { TenantConfig } from "@/lib/types";
import { clearTenantDomainClaims } from "@/lib/domains";
import { deleteVercelProject, isVercelConfigured } from "@/lib/vercel";
import { authoritativePatterns } from "@/lib/tenant-rename";
import { unlinkTenant } from "@/lib/accounts";

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
// This receipt outlives tenant deletion and fences slug reuse until cleanup.
// It is read through service-role RPCs, never counted by a direct table sweep.
export const TENANT_CLEANUP_RECEIPT_TABLES = ["tenant_deprovision_cleanup"] as const;

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
  databaseDeleted?: boolean;
  cleanup?: CleanupReceipt;
}

const cleanupSchema = z.object({
  id: z.string().uuid(), tenantId: z.string(), databaseDeleted: z.literal(true),
  redisComplete: z.boolean(), providerComplete: z.boolean(), complete: z.boolean(),
}).passthrough();
export type CleanupReceipt = z.infer<typeof cleanupSchema>;

/** An outstanding native receipt remains available after the tenant is gone. */
export async function readDeprovisionCleanup(tenantId: string): Promise<CleanupReceipt | null> {
  const call = rpc();
  if (!call) throw new Error("tenant_cleanup_database_unavailable");
  const result = await call("tenant_cleanup_receipt", { p_slug: tenantId });
  if (result.error) throw new Error("tenant_cleanup_receipt_unavailable");
  return result.data === null ? null : cleanupSchema.parse(result.data);
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
async function workspaceWebsiteBlockers(tenantId: string): Promise<{ publications: number; reservations: number; bookingGrants: number; bookings: number }> {
  const call = rpc();
  if (!call) throw new Error("tenant_teardown_blockers_unavailable");
  const { data, error } = await call("tenant_cleanup_teardown_blockers", { p_tenant_id: tenantId });
  if (error) throw new Error(`tenant_teardown_blockers: ${error.message}`);
  const count = z.union([z.number(), z.string().regex(/^\d+$/)]).pipe(z.coerce.number().int().nonnegative());
  const row = z.object({ publications: count, reservations: count, booking_grants: count, bookings: count })
    .safeParse(Array.isArray(data) ? data[0] : data);
  if (!row.success) throw new Error("tenant_teardown_blockers_unavailable");
  return { publications: row.data.publications, reservations: row.data.reservations,
    bookingGrants: row.data.booking_grants, bookings: row.data.bookings };
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
async function deleteTenantRowsAtomically(tenantId: string, force: boolean): Promise<{ counts: Record<string, number>; paused: number; cleanup: CleanupReceipt }> {
  const call = rpc();
  if (!call) throw new Error("tenant_teardown_database_unavailable");
  const { data, error } = await call("deprovision_tenant_guarded", {
    p_tenant_id: tenantId, p_force: force,
    p_require_inquiry_export: leadAuthorityIsPostgres(),
    p_retain_receipts: process.env.STRELVA_TENANT_RECEIPT_RETENTION === "1",
  });
  if (error) throw new Error(`deprovision_tenant_rows: ${error.message}`);
  const result = data as { counts?: Record<string, unknown>; paused?: number; cleanup?: unknown } | null;
  if (!result?.counts || !Number.isFinite(result.paused)) throw new Error("tenant_teardown_invalid_receipt");
  return { counts: Object.fromEntries(Object.entries(result.counts).map(([table, n]) => [table, Number(n)])), paused: result.paused!, cleanup: cleanupSchema.parse(result.cleanup) };
}

/** Per-tenant Redis key patterns, with the tenant id pinned to its KNOWN
 *  position. A bare "id appears anywhere" match would delete OTHER tenants' keys
 *  for an unlucky id. Wildcards are SCANned; exact keys checked with EXISTS. */
export function tenantRedisPatterns(tenantId: string, _ownerEmail?: string): string[] {
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
  // Invites are email-keyed/shared; ownership is rechecked before removal.
  p.push("reb:invites:*");
  return [...new Set(p)];
}

/** Event blobs are keyed by event id, not tenant. The tenant's index names
 *  them; a blob is only taken when it still says it belongs to this tenant. */
export async function findTenantEventBlobKeys(tenantId: string): Promise<string[]> {
  const redis = getRedis();
  if (!redis) throw new Error("tenant_cleanup_redis_unavailable");
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
  if (!redis) throw new Error("tenant_cleanup_redis_unavailable");
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
        if ((pattern === "reb:inquiry-reply-target:*" || pattern === "reb:invites:*") && tenantId) {
          const raw = await redis.get<unknown>(k);
          let value: unknown = raw;
          if (typeof raw === "string") {
            try { value = JSON.parse(raw); } catch { value = null; }
          }
          if (!value || typeof value !== "object" || (pattern === "reb:invites:*"
            ? (value as { tenant?: unknown }).tenant !== tenantId
            : (value as { tenantId?: unknown }).tenantId !== tenantId)) continue;
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
  /** Retry only this persisted cleanup; never delete a newly created tenant. */
  cleanupReceiptId?: string;
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
  const { tenantId, tenant, dryRun = true, force = false } = opts;
  const executed = !dryRun;
  const summary: Record<string, StoreAction[]> = { postgres: [], redis: [], vercel: [] };

  if (!isValidDeprovisionTenantId(tenantId)) {
    return { ok: false, refusalReason: "invalid_tenant_id", refusalDetail: "Invalid tenant id.", tenantId, executed: false, pgRowTotal: 0, summary };
  }

  if (opts.cleanupReceiptId) {
    if (!executed) throw new Error("tenant_cleanup_retry_requires_execution");
    const cleanup = await readDeprovisionCleanup(tenantId);
    if (!cleanup || cleanup.id !== opts.cleanupReceiptId) throw new Error("tenant_cleanup_receipt_changed");
    if (cleanup.complete) return { ok: true, tenantId, executed: false, databaseDeleted: true, pgRowTotal: 0, summary, cleanup };
    return finishCleanup(opts, cleanup, 0, summary);
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
  if (blockers.publications + blockers.reservations + blockers.bookingGrants + blockers.bookings > 0) {
    return {
      ok: false,
      refusalReason: "workspace_website",
      refusalDetail: `"${tenantId}" is held by workspace-owned records (publications=${blockers.publications}, reservations=${blockers.reservations}, booking grants=${blockers.bookingGrants}, bookings=${blockers.bookings}). Release it through the business workspace first. Nothing was deleted.`,
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

  if (executed && receipt) return finishCleanup(opts, receipt.cleanup, pgTotal, summary);
  return discoverCleanup(opts, pgTotal, summary);
}

/** Dry-run discovery makes no deletion or availability claim. */
async function discoverCleanup(opts: DeprovisionOptions, pgRowTotal: number, summary: Record<string, StoreAction[]>): Promise<DeprovisionResult> {
  let ok = true;
  try {
    const keys = [...await findTenantEventBlobKeys(opts.tenantId), ...await findTenantRedisKeys(tenantRedisPatterns(opts.tenantId), opts.tenantId)];
    for (const key of keys) summary.redis!.push({ target: key, found: 1, deleted: false });
    for (const domain of await clearTenantDomainClaims({ id: opts.tenantId }, false)) summary.redis!.push({ target: `domain-claim ${domain}`, found: 1, deleted: false });
  } catch {
    ok = false;
    summary.redis!.push({ target: "discovery", found: "unknown", deleted: false, detail: "Redis discovery unavailable; no empty-store claim." });
  }
  for (const key of GLOBAL_CACHE_KEYS) summary.redis!.push({ target: key, found: "cache", deleted: false, detail: "would invalidate (dry run)" });
  summary.vercel!.push({ target: `${opts.tenantId}-site`, found: "unknown", deleted: false, detail: "not deleted (dry run)" });
  return { ok, tenantId: opts.tenantId, executed: false, pgRowTotal, summary };
}

/** Shared Redis objects are edited atomically and retain every other tenant. */
export const REMOVE_OWNED_KEY = `
  local raw = redis.call('GET', KEYS[1])
  if not raw then return 0 end
  local value = cjson.decode(raw)
  if type(value) == 'table' and value[ARGV[2]] == ARGV[1] then return redis.call('DEL', KEYS[1]) end
  return 0
`;

async function finishCleanup(opts: DeprovisionOptions, receipt: CleanupReceipt, pgRowTotal: number, summary: Record<string, StoreAction[]>): Promise<DeprovisionResult> {
  const { tenantId, keepVercel = false } = opts;
  let redisComplete = receipt.redisComplete;
  let providerComplete = receipt.providerComplete;
  const previousActions = z.array(z.object({ target: z.string() }).passthrough()).safeParse(
    receipt.summary && typeof receipt.summary === "object" ? (receipt.summary as Record<string, unknown>).redis : []);
  const accountIds = new Set(previousActions.success ? previousActions.data
    .filter(action => action.target.startsWith("account:")).map(action => action.target.slice(8)) : []);
  // Retain retry identities even if discovery fails or Redis is absent on this
  // attempt. Otherwise an earlier removed reverse index would lose its target.
  for (const id of accountIds) summary.redis!.push({ target: `account:${id}`, found: 1, deleted: redisComplete,
    detail: redisComplete ? "shared grouping cleanup confirmed by the prior receipt" : "shared grouping cleanup pending" });
  if (!redisComplete) {
    const redis = getRedis();
    if (!redis) summary.redis!.push({ target: "tenant cleanup", found: "unknown", deleted: false, detail: "Redis unavailable; cleanup pending." });
    else try {
      const keys = [...await findTenantEventBlobKeys(tenantId), ...await findTenantRedisKeys(tenantRedisPatterns(tenantId), tenantId)];
      // Keep the canonical account lock and client-record mirror hooks. Save
      // its identity before unlinkTenant can remove the reverse index: a
      // partial write or process interruption must still be retryable.
      const accountId = await redis.get<string>(`account-of:${tenantId}`);
      if (accountId !== null && typeof accountId !== "string") throw new Error("tenant_cleanup_grouping_invalid");
      if (accountId) accountIds.add(accountId);
      if (accountIds.size) {
        for (const id of accountIds) if (!summary.redis!.some(action => action.target === `account:${id}`)) {
          summary.redis!.push({ target: `account:${id}`, found: 1, deleted: false, detail: "shared grouping cleanup pending" });
        }
        const checkpointCall = rpc();
        if (!checkpointCall) throw new Error("tenant_cleanup_grouping_checkpoint_failed");
        const checkpoint = await checkpointCall("finish_tenant_deprovision_cleanup", { p_tenant_id: tenantId, p_receipt_id: receipt.id,
          p_redis_complete: false, p_provider_complete: providerComplete, p_summary: summary });
        if (checkpoint.error) throw new Error("tenant_cleanup_grouping_checkpoint_failed");
        const recorded = cleanupSchema.parse(checkpoint.data);
        if (recorded.id !== receipt.id || recorded.tenantId !== tenantId) throw new Error("tenant_cleanup_grouping_checkpoint_failed");
        for (const id of accountIds) {
          const changed = await unlinkTenant(id, tenantId, { readRedisForCleanup: true });
          const readback = await redis.get<{ tenantIds?: unknown }>(`account:${id}`);
          if (!changed || !Array.isArray(readback?.tenantIds) || readback.tenantIds.includes(tenantId)) throw new Error("tenant_cleanup_grouping_unconfirmed");
          const action = summary.redis!.find(item => item.target === `account:${id}`)!;
          action.deleted = true; action.detail = "site removed from the shared grouping; account and subscription retained";
        }
      }
      for (const key of keys) {
        const field = key.startsWith("reb:invites:") ? "tenant"
          : key.startsWith("event:") || key.startsWith("reb:inquiry-reply-target:") ? "tenantId" : null;
        const removed = field ? await redis.eval<number>(REMOVE_OWNED_KEY, [key], [tenantId, field]) : await redis.del(key);
        if (typeof removed !== "number") throw new Error("tenant_cleanup_delete_unconfirmed");
        summary.redis!.push({ target: key, found: 1, deleted: removed > 0, ...(removed > 0 ? {} : { detail: "already absent or owned by another tenant" }) });
      }
      for (const domain of await clearTenantDomainClaims({ id: tenantId })) summary.redis!.push({ target: `domain-claim ${domain}`, found: 1, deleted: true });
      const invalidated = await redis.del(...GLOBAL_CACHE_KEYS);
      if (typeof invalidated !== "number") throw new Error("tenant_cleanup_cache_unconfirmed");
      for (const key of GLOBAL_CACHE_KEYS) summary.redis!.push({ target: key, found: "cache", deleted: true, detail: "global cache invalidated" });
      redisComplete = true;
    } catch {
      summary.redis!.push({ target: "tenant cleanup", found: "unknown", deleted: false, detail: "Redis cleanup failed; completed actions are retained and cleanup can be retried." });
    }
  }
  if (!providerComplete) {
    const target = `${tenantId}-site`;
    if (keepVercel || !isVercelConfigured()) summary.vercel!.push({ target, found: "unknown", deleted: false,
      detail: keepVercel ? "retained by request; complete purge and slug reuse remain blocked" : "Provider unavailable; absence is unverified and cleanup remains pending" });
    else try {
      const removed = await deleteVercelProject(target);
      providerComplete = removed.ok;
      summary.vercel!.push({ target, found: "unknown", deleted: removed.ok, detail: removed.ok ? "deleted (or confirmed absent)" : "Provider refused deletion; cleanup pending." });
    } catch {
      summary.vercel!.push({ target, found: "unknown", deleted: false, detail: "Provider deletion unconfirmed; cleanup pending." });
    }
  }
  const call = rpc();
  if (!call) throw new Error("tenant_cleanup_receipt_unavailable_after_database_removal");
  const saved = await call("finish_tenant_deprovision_cleanup", { p_tenant_id: tenantId, p_receipt_id: receipt.id,
    p_redis_complete: redisComplete, p_provider_complete: providerComplete, p_summary: summary });
  if (saved.error) throw new Error("tenant_cleanup_receipt_unavailable_after_database_removal");
  const cleanup = cleanupSchema.parse(saved.data);
  return { ok: cleanup.complete, tenantId, executed: true, databaseDeleted: true, pgRowTotal, summary, cleanup };
}

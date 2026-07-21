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

import { getSupabase } from "@/lib/db/client";
import { getRedis } from "@/lib/redis";
import type { TenantConfig } from "@/lib/types";
import { clearTenantDomainClaims } from "@/lib/domains";
import { deleteVercelProject, isVercelConfigured } from "@/lib/vercel";

// Real tenants that must never be torn down by accident. A backstop only —
// the live "has paid" guard is the primary defense (this set drifts stale).
export const PROTECTED_TENANTS = new Set(["gldf", "rohlax"]);

// Subscription states that indicate a real billing relationship exists.
const PAYING_STATUSES = new Set(["active", "trialing", "past_due"]);

// Every public table carrying a tenant_id, purged child-first. Kept in sync with
// src/lib/db/database.types.ts (asserted by src/__tests__/deprovision-coverage.test.ts).
// `tenants` (keyed by id) is deleted last, after its children are gone.
export const TENANT_SCOPED_TABLES = [
  "activity_log", "audit_logs", "auto_approval_streaks", "bookings",
  "build_payments", "chat_messages", "chat_sessions", "chat_threads",
  "collection_entries", "reviews", "suggestions", "content", "content_versions",
  "domain_claims", "draft_content", "draft_page_config", "inbox_items",
  "integrations", "invites", "mail_log", "memberships", "newsletter_subscribers",
  "page_config", "pay_links", "reward_members", "reward_transactions",
  "scan_history", "scan_results", "search_console_data", "site_metrics",
  "site_snapshots", "social_posts", "unified_events", "proposals", "weekly_briefs",
] as const;

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
  refusalReason?: "protected_tenant" | "active_subscription";
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

async function deleteRows(table: string, tenantId: string): Promise<void> {
  const t = dyn(table);
  if (!t) return;
  const col = table === "tenants" ? "id" : "tenant_id";
  const { error } = await t.delete().eq(col, tenantId);
  if (error) throw new Error(`${table}: ${error.message}`);
}

/** Per-tenant Redis key patterns, with the tenant id pinned to its KNOWN
 *  position. A bare "id appears anywhere" match would delete OTHER tenants' keys
 *  for an unlucky id. Wildcards are SCANned; exact keys checked with EXISTS. */
export function tenantRedisPatterns(tenantId: string, ownerEmail?: string): string[] {
  const p = [
    `reb:content:${tenantId}:*`,
    `reb:chat:${tenantId}:*`,
    `reb:rewards:${tenantId}:*`,
    `reb:page-config:${tenantId}`,
    `reb:maillog:${tenantId}`,
    `reb:scan:${tenantId}`,
    `reb:scan:hist:${tenantId}`,
    `reb:site-audit:${tenantId}`,
  ];
  if (ownerEmail) p.push(`reb:invites:${ownerEmail.toLowerCase()}`);
  return p;
}

export async function findTenantRedisKeys(patterns: string[]): Promise<string[]> {
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
      for (const k of keys) found.add(k);
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

  // Postgres: count (always) then optionally delete, child tables first.
  let pgTotal = 0;
  for (const table of [...TENANT_SCOPED_TABLES, "tenants"]) {
    const n = await countRows(table, tenantId);
    pgTotal += n;
    if (n === 0) continue;
    if (executed) await deleteRows(table, tenantId);
    summary.postgres.push({ target: table, found: n, deleted: executed });
  }

  // Redis: per-tenant keys (pinned patterns) + global cache busts.
  const redis = getRedis();
  const tenantKeys = await findTenantRedisKeys(
    tenantRedisPatterns(tenantId, tenant?.ownerEmail ?? undefined),
  );
  if (executed && redis && tenantKeys.length) await redis.del(...tenantKeys);
  for (const k of tenantKeys) summary.redis.push({ target: k, found: 1, deleted: executed });

  // Domain claims live in one shared map — clear just this tenant's entries.
  if (tenant) {
    const claimed = await clearTenantDomainClaims(tenant, executed);
    for (const d of claimed) {
      summary.redis.push({ target: `domain-claim ${d}`, found: 1, deleted: executed });
    }
  }
  if (executed && redis) await redis.del(...GLOBAL_CACHE_KEYS);
  for (const k of GLOBAL_CACHE_KEYS) {
    summary.redis.push({
      target: k,
      found: "cache",
      deleted: executed,
      detail: "global cache invalidated",
    });
  }

  // Vercel: the {tenantId}-site project (env + domains go with it).
  if (keepVercel) {
    summary.vercel.push({
      target: `${tenantId}-site`,
      found: "?",
      deleted: false,
      detail: "skipped (keepVercel)",
    });
  } else if (!isVercelConfigured()) {
    summary.vercel.push({
      target: `${tenantId}-site`,
      found: "?",
      deleted: false,
      detail: "VERCEL_API_TOKEN not set — onboarding likely never created it",
    });
  } else if (executed) {
    const r = await deleteVercelProject(`${tenantId}-site`);
    summary.vercel.push({
      target: `${tenantId}-site`,
      found: "?",
      deleted: r.ok,
      detail: r.ok ? "deleted (or already absent)" : r.error,
    });
  } else {
    summary.vercel.push({
      target: `${tenantId}-site`,
      found: "?",
      deleted: false,
      detail: "would delete (dry run)",
    });
  }

  return { ok: true, tenantId, executed, pgRowTotal: pgTotal, summary };
}

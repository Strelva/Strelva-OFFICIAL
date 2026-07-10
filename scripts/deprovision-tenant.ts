#!/usr/bin/env npx tsx
/**
 * Tenant deprovision / teardown — the inverse of src/lib/provisioning.ts.
 *
 * provisionTenant() is forward-recovery only (it never rolls back), so an
 * aborted or test onboard leaves orphan rows across Postgres + Redis + Vercel.
 * This script cleans up everything a tenant owns so a throwaway onboard can be
 * wiped back to zero.
 *
 * Postgres is the source of truth, so it is the primary target: every
 * tenant-scoped table is purged by tenant_id, then the `tenants` row itself.
 * Redis cache keys and the per-tenant Vercel project are torn down too, and the
 * tenant's domain-claims are cleared from the shared claim map.
 *
 * SAFETY (this deletes PRODUCTION data — .env.local points at prod):
 *   - DRY RUN BY DEFAULT. Nothing is deleted without --confirm.
 *   - Refuses anything that looks like a real client: a hardcoded denylist AND
 *     a live "has paid" signal (active subscription or any build payment).
 *   - On a real run it prints the target DB host + tenant identity and requires
 *     the operator to re-type the tenant id before deleting.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/deprovision-tenant.ts <tenantId>            # dry run (discovery)
 *   npx tsx --env-file=.env.local scripts/deprovision-tenant.ts <tenantId> --confirm  # execute (prompts)
 *
 * Flags:
 *   --confirm       Actually delete (default is a no-write dry run).
 *   --force         Override the real-client guards (denylist + has-paid).
 *   --keep-vercel   Leave the {tenantId}-site Vercel project in place.
 *   --json          Emit a machine-readable summary instead of the human report.
 */

import * as readline from "node:readline";
import { getSupabase } from "../src/lib/db/client";
import { getRedis } from "../src/lib/redis";
import { getTenantConfig } from "../src/lib/tenants";
import { clearTenantDomainClaims } from "../src/lib/domains";
import { deleteVercelProject, isVercelConfigured } from "../src/lib/vercel";

// Real tenants that must never be torn down by accident. A backstop only — the
// live "has paid" guard below is the primary defense (this set drifts stale).
const PROTECTED = new Set(["gldf", "rohlax"]);

// Subscription states that mean a real billing relationship exists.
const PAYING_STATUSES = new Set(["active", "trialing", "past_due"]);

// Every public table carrying a tenant_id, purged child-first. Kept in sync with
// src/lib/db/database.types.ts (asserted by deprovision-tenant.coverage.test.ts).
// `tenants` (keyed by id) is deleted last, after its children are gone.
const TENANT_SCOPED_TABLES = [
  "activity_log", "audit_logs", "auto_approval_streaks", "bookings",
  "build_payments", "chat_messages", "chat_sessions", "chat_threads",
  "collection_entries", "reviews", "suggestions", "content", "content_versions",
  "domain_claims", "draft_content", "draft_page_config", "inbox_items",
  "integrations", "invites", "mail_log", "memberships", "newsletter_subscribers",
  "page_config", "pay_links", "reward_members", "reward_transactions",
  "scan_history", "scan_results", "search_console_data", "site_metrics",
  "site_snapshots", "social_posts", "unified_events", "weekly_briefs",
] as const;

// Global Redis caches that include this tenant; safe to bust (they rebuild).
const GLOBAL_CACHE_KEYS = ["reb:tenants:all", "reb:domain-map", "reb:portfolio:summary"];

interface Flags {
  confirm: boolean;
  force: boolean;
  keepVercel: boolean;
  json: boolean;
}

function parseFlags(): { tenantId: string | undefined; flags: Flags } {
  const args = process.argv.slice(2);
  const tenantId = args.find((a) => !a.startsWith("--"));
  return {
    tenantId,
    flags: {
      confirm: args.includes("--confirm"),
      force: args.includes("--force"),
      keepVercel: args.includes("--keep-vercel"),
      json: args.includes("--json"),
    },
  };
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(`${question}: `, (a) => { rl.close(); resolve(a); }));
}

type StoreAction = { target: string; found: number | string; deleted: boolean; detail?: string };

// The Supabase client is strongly typed to literal table names; a generic sweep
// over the tenant-scoped tables needs dynamic access, so we narrow to a minimal
// structural view of just the builder methods this script uses.
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
 *  for an unlucky id — e.g. a tenant literally named "hist" matching
 *  reb:scan:hist:<everyTenant>, or "member" matching reb:rewards:<x>:member:<e>.
 *  Wildcards are SCANned; exact keys checked with EXISTS. */
function tenantRedisPatterns(tenantId: string, ownerEmail?: string): string[] {
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

async function findTenantRedisKeys(patterns: string[]): Promise<string[]> {
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
      cursor = String(next); // @upstash types this as string; coerce defensively
      for (const k of keys) found.add(k);
    } while (cursor !== "0");
  }
  return [...found];
}

async function main() {
  const { tenantId, flags } = parseFlags();
  if (!tenantId) {
    console.error("Usage: npx tsx --env-file=.env.local scripts/deprovision-tenant.ts <tenantId> [--confirm] [--force] [--keep-vercel]");
    process.exit(1);
  }
  if (!getSupabase()) {
    console.error("No Supabase client — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.local).");
    process.exit(1);
  }

  const tenant = await getTenantConfig(tenantId).catch(() => null);
  const dbHost = (() => {
    try { return new URL(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").host; }
    catch { return "(unknown)"; }
  })();

  // Identity + target banner — printed before anything is touched.
  const banner = "=".repeat(64);
  console.log(`\n${banner}`);
  console.log(`${flags.confirm ? "DEPROVISION" : "DEPROVISION (DRY RUN)"} — ${tenantId}`);
  console.log(banner);
  console.log(`  Target DB:   ${dbHost}`);
  if (tenant) {
    console.log(`  Site name:   ${tenant.siteName}`);
    console.log(`  Owner:       ${tenant.ownerEmail ?? "(none)"}`);
    console.log(`  Active:      ${tenant.active}`);
    console.log(`  Subscription:${" "}${tenant.subscriptionStatus ?? "(none)"}`);
    console.log(`  Created:     ${tenant.createdAt ?? "(unknown)"}`);
  } else {
    console.log("  No tenant record found — will still sweep for orphan rows/keys.");
  }
  console.log("");

  // Guard 1: hardcoded denylist (backstop).
  if (PROTECTED.has(tenantId) && !flags.force) {
    console.error(`REFUSED: "${tenantId}" is a protected tenant. Re-run with --force only if you are certain.\n`);
    process.exit(2);
  }
  // Guard 2: live "has paid" signal — the denylist drifts stale as clients onboard.
  const buildPayments = await countRows("build_payments", tenantId);
  const paying = (tenant?.subscriptionStatus && PAYING_STATUSES.has(tenant.subscriptionStatus)) || buildPayments > 0;
  if (paying && !flags.force) {
    console.error(`REFUSED: "${tenantId}" looks like a real client (subscription=${tenant?.subscriptionStatus ?? "?"}, build_payments=${buildPayments}). Re-run with --force only if you are certain.\n`);
    process.exit(2);
  }

  // Guard 3 (real runs only): require the operator to re-type the id.
  if (flags.confirm) {
    const typed = await prompt(`Type the tenant id "${tenantId}" to permanently delete it from ${dbHost}`);
    if (typed.trim() !== tenantId) {
      console.error("Confirmation did not match — aborting. Nothing deleted.\n");
      process.exit(2);
    }
  }

  const summary: Record<string, StoreAction[]> = { postgres: [], redis: [], vercel: [] };

  // --- Postgres (primary): count, then optionally delete, children first ---
  let pgTotal = 0;
  for (const table of [...TENANT_SCOPED_TABLES, "tenants"]) {
    const n = await countRows(table, tenantId);
    pgTotal += n;
    if (n === 0) continue;
    if (flags.confirm) await deleteRows(table, tenantId);
    summary.postgres.push({ target: table, found: n, deleted: flags.confirm });
  }

  // --- Redis: per-tenant keys (pinned patterns) + global cache busts ---
  const redis = getRedis();
  const tenantKeys = await findTenantRedisKeys(tenantRedisPatterns(tenantId, tenant?.ownerEmail));
  if (flags.confirm && redis && tenantKeys.length) await redis.del(...tenantKeys);
  for (const k of tenantKeys) summary.redis.push({ target: k, found: 1, deleted: flags.confirm });
  // Domain claims live in one shared map — clear just this tenant's entries.
  if (tenant) {
    const claimed = await clearTenantDomainClaims(tenant, flags.confirm);
    for (const d of claimed) summary.redis.push({ target: `domain-claim ${d}`, found: 1, deleted: flags.confirm });
  }
  if (flags.confirm && redis) await redis.del(...GLOBAL_CACHE_KEYS);
  for (const k of GLOBAL_CACHE_KEYS) summary.redis.push({ target: k, found: "cache", deleted: flags.confirm, detail: "global cache invalidated" });

  // --- Vercel: the {tenantId}-site project (env + domains go with it) ---
  if (flags.keepVercel) {
    summary.vercel.push({ target: `${tenantId}-site`, found: "?", deleted: false, detail: "skipped (--keep-vercel)" });
  } else if (!isVercelConfigured()) {
    summary.vercel.push({ target: `${tenantId}-site`, found: "?", deleted: false, detail: "VERCEL_API_TOKEN not set — onboarding likely never created it" });
  } else if (flags.confirm) {
    const r = await deleteVercelProject(`${tenantId}-site`);
    summary.vercel.push({ target: `${tenantId}-site`, found: "?", deleted: r.ok, detail: r.ok ? "deleted (or already absent)" : r.error });
  } else {
    summary.vercel.push({ target: `${tenantId}-site`, found: "?", deleted: false, detail: "would delete (dry run)" });
  }

  if (flags.json) {
    console.log(JSON.stringify({ tenantId, dbHost, executed: flags.confirm, pgRowTotal: pgTotal, summary }, null, 2));
    return;
  }

  const verb = flags.confirm ? "Deleted" : "Would delete";
  for (const [store, actions] of Object.entries(summary)) {
    if (!actions.length) continue;
    console.log(`  ${store.toUpperCase()}`);
    for (const a of actions) {
      const tail = a.detail ? `  — ${a.detail}` : "";
      console.log(`    ${a.deleted ? "[x]" : "[ ]"} ${a.target}  (${a.found})${tail}`);
    }
    console.log("");
  }
  console.log(`  ${verb} ${pgTotal} Postgres row(s) across ${summary.postgres.length} table(s).`);
  console.log(banner);
  if (!flags.confirm) {
    console.log("DRY RUN — nothing was deleted. Re-run with --confirm to execute.\n");
  } else {
    console.log("Done. If a table delete threw mid-run, re-running is safe (idempotent). Verify the tenant is gone from the admin Tenants list.\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

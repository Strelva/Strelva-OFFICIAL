#!/usr/bin/env npx tsx
/**
 * Tenant deprovision / teardown — the inverse of src/lib/provisioning.ts.
 *
 * provisionTenant() is forward-recovery only (it never rolls back), so an
 * aborted or test onboard leaves orphan rows across Postgres + Redis + Vercel
 * (+ a Sanity tenant doc while dual-write is still on). This script cleans up
 * everything a tenant owns so a throwaway onboard can be wiped back to zero.
 *
 * Postgres is the source of truth, so it is the primary target: every
 * tenant-scoped table is purged by tenant_id, then the `tenants` row itself.
 * Redis cache keys and the per-tenant Vercel project are torn down too, and the
 * Sanity `tenant` doc is best-effort deleted to remove the active:true mirror
 * that getTenantConfig() can otherwise fall back to (resurrecting the tenant).
 *
 * SAFETY:
 *   - DRY RUN BY DEFAULT. Nothing is deleted without --confirm.
 *   - A protected denylist (real paying tenants) is refused unless --force.
 *   - It prints the tenant's identity (name / owner / active / created) before
 *     acting so a human can verify it is the throwaway, not a live client.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/deprovision-tenant.ts <tenantId>            # dry run (discovery)
 *   npx tsx --env-file=.env.local scripts/deprovision-tenant.ts <tenantId> --confirm  # execute
 *
 * Flags:
 *   --confirm       Actually delete (default is a no-write dry run).
 *   --force         Override the protected-tenant denylist (use with care).
 *   --keep-vercel   Leave the {tenantId}-site Vercel project in place.
 *   --sanity        Also delete the Sanity tenant doc (default: on; --no-sanity to skip).
 *   --json          Emit a machine-readable summary instead of the human report.
 *
 * Run it against the SAME env the control plane uses (.env.local pulled from the
 * strelva Vercel project) — that points at production data. Hence the guards.
 */

import { getSupabase } from "../src/lib/db/client";
import { getRedis } from "../src/lib/redis";
import { getTenantConfig } from "../src/lib/tenants";
import { deleteVercelProject, isVercelConfigured } from "../src/lib/vercel";

// Real tenants that must never be torn down by accident. Mirrors the
// grandfather list spirit in AGENTS.md ("The Model"). --force overrides.
const PROTECTED = new Set(["gldf", "rohlax"]);

// Every public table carrying a tenant_id, purged child-first. Derived from
// src/lib/db/database.types.ts (all Tables whose Row has a tenant_id column).
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

// Global Redis caches that include this tenant and must be busted so a deleted
// tenant stops appearing in the all-tenants list / domain map.
const GLOBAL_CACHE_KEYS = ["reb:tenants:all", "reb:domain-map"];

interface Flags {
  confirm: boolean;
  force: boolean;
  keepVercel: boolean;
  sanity: boolean;
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
      sanity: !args.includes("--no-sanity"),
      json: args.includes("--json"),
    },
  };
}

type StoreAction = { target: string; found: number | string; deleted: boolean; detail?: string };

// The Supabase client is strongly typed to literal table names; a generic
// sweep over 35 tables needs dynamic access, so we narrow to a minimal
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

/** Scan for every reb:* key where tenantId appears as a full ':'-delimited
 *  segment (avoids substring collisions like tenant "spa" matching "spasm"). */
async function findTenantRedisKeys(tenantId: string): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  const found = new Set<string>();
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, { match: "reb:*", count: 500 });
    cursor = next;
    for (const k of keys) {
      if (k.split(":").includes(tenantId)) found.add(k);
    }
  } while (cursor !== "0");
  return [...found];
}

async function main() {
  const { tenantId, flags } = parseFlags();
  if (!tenantId) {
    console.error("Usage: npx tsx --env-file=.env.local scripts/deprovision-tenant.ts <tenantId> [--confirm] [--force] [--keep-vercel] [--no-sanity]");
    process.exit(1);
  }

  if (!getSupabase()) {
    console.error("No Supabase client — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.local).");
    process.exit(1);
  }

  const tenant = await getTenantConfig(tenantId).catch(() => null);
  const protectedHit = PROTECTED.has(tenantId);

  // Identity check — show who this is before touching anything.
  const banner = "=".repeat(64);
  console.log(`\n${banner}`);
  console.log(`${flags.confirm ? "DEPROVISION" : "DEPROVISION (DRY RUN)"} — ${tenantId}`);
  console.log(banner);
  if (tenant) {
    console.log(`  Site name:   ${tenant.siteName}`);
    console.log(`  Owner:       ${tenant.ownerEmail ?? "(none)"}`);
    console.log(`  Active:      ${tenant.active}`);
    console.log(`  Created:     ${tenant.createdAt ?? "(unknown)"}`);
    console.log(`  Delivery:    ${tenant.deliveryModel ?? "(unknown)"}`);
  } else {
    console.log("  No tenant record found — will still sweep for orphan rows/keys.");
  }
  console.log("");

  if (protectedHit && !flags.force) {
    console.error(`REFUSED: "${tenantId}" is a protected tenant. Re-run with --force only if you are certain.\n`);
    process.exit(2);
  }
  if (protectedHit && flags.force) {
    console.log(`!! "${tenantId}" is PROTECTED and --force was given. Proceeding under protest.\n`);
  }

  const summary: Record<string, StoreAction[]> = { postgres: [], redis: [], vercel: [], sanity: [] };

  // --- Postgres (primary): count, then optionally delete, children first ---
  let pgTotal = 0;
  for (const table of [...TENANT_SCOPED_TABLES, "tenants"]) {
    const n = await countRows(table, tenantId);
    pgTotal += n;
    if (n === 0) continue; // skip empties to keep the report readable
    if (flags.confirm) await deleteRows(table, tenantId);
    summary.postgres.push({ target: table, found: n, deleted: flags.confirm });
  }

  // --- Redis: per-tenant keys (scan) + explicit global cache busts ---
  const redis = getRedis();
  const tenantKeys = await findTenantRedisKeys(tenantId);
  if (tenant?.ownerEmail) tenantKeys.push(`reb:invites:${tenant.ownerEmail.toLowerCase()}`);
  if (flags.confirm && redis && tenantKeys.length) await redis.del(...tenantKeys);
  for (const k of tenantKeys) summary.redis.push({ target: k, found: 1, deleted: flags.confirm });
  // Global caches always busted on a real run so the tenant leaves the lists.
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

  // --- Sanity: best-effort delete the tenant doc (kills the active:true mirror) ---
  if (flags.sanity) {
    try {
      const { getSanityClient } = await import("../src/lib/sanity");
      if (flags.confirm) {
        await getSanityClient().delete(tenantId);
        summary.sanity.push({ target: `tenant doc ${tenantId}`, found: 1, deleted: true });
      } else {
        summary.sanity.push({ target: `tenant doc ${tenantId}`, found: "?", deleted: false, detail: "would delete (dry run, best-effort)" });
      }
    } catch (err) {
      summary.sanity.push({ target: `tenant doc ${tenantId}`, found: "?", deleted: false, detail: `skipped: ${err instanceof Error ? err.message : String(err)}` });
    }
    summary.sanity.push({ target: "content/audit docs", found: "n/a", deleted: false, detail: "left in Sanity (read-fallback only, slated for lockdown/decommission)" });
  }

  if (flags.json) {
    console.log(JSON.stringify({ tenantId, executed: flags.confirm, pgRowTotal: pgTotal, summary }, null, 2));
    return;
  }

  // --- Human report ---
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
    console.log("Done. Verify the tenant is gone from the admin Tenants list.\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

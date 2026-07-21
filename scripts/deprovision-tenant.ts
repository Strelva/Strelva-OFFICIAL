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
import { getTenantConfig } from "../src/lib/tenants";
import { runDeprovision } from "../src/lib/deprovision";

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

  // Guard 3 (real runs only): require the operator to re-type the id. The lib's
  // guards (denylist + has-paid) run inside runDeprovision, so any refusal there
  // is printed before exit. This prompt comes first so an obvious typo aborts
  // without even hitting the DB guards.
  if (flags.confirm) {
    const typed = await prompt(`Type the tenant id "${tenantId}" to permanently delete it from ${dbHost}`);
    if (typed.trim() !== tenantId) {
      console.error("Confirmation did not match — aborting. Nothing deleted.\n");
      process.exit(2);
    }
  }

  const result = await runDeprovision({
    tenantId,
    tenant: tenant ?? null,
    dryRun: !flags.confirm,
    force: flags.force,
    keepVercel: flags.keepVercel,
  });

  if (!result.ok) {
    console.error(`REFUSED: ${result.refusalDetail ?? result.refusalReason}\n`);
    process.exit(2);
  }

  if (flags.json) {
    console.log(JSON.stringify({ tenantId, dbHost, executed: result.executed, pgRowTotal: result.pgRowTotal, summary: result.summary }, null, 2));
    return;
  }

  const verb = result.executed ? "Deleted" : "Would delete";
  for (const [store, actions] of Object.entries(result.summary)) {
    if (!actions.length) continue;
    console.log(`  ${store.toUpperCase()}`);
    for (const a of actions) {
      const tail = a.detail ? `  — ${a.detail}` : "";
      console.log(`    ${a.deleted ? "[x]" : "[ ]"} ${a.target}  (${a.found})${tail}`);
    }
    console.log("");
  }
  console.log(`  ${verb} ${result.pgRowTotal} Postgres row(s) across ${result.summary.postgres.length} table(s).`);
  console.log(banner);
  if (!result.executed) {
    console.log("DRY RUN — nothing was deleted. Re-run with --confirm to execute.\n");
  } else {
    console.log("Done. If a table delete threw mid-run, re-running is safe (idempotent). Verify the tenant is gone from the admin Tenants list.\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

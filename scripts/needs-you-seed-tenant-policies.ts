#!/usr/bin/env npx tsx
/**
 * Move each business-linked tenant's content autonomy and review reply mode
 * into decision_policies (docs/product/specs/needs-you.md section 6, steps 1
 * and 5). One import receipt per tenant and kind records today's Redis value;
 * a choice the new floor or Strelva's default does not carry over is listed,
 * never migrated silently.
 *
 *   npx tsx scripts/needs-you-seed-tenant-policies.ts                     # dry run, every tenant
 *   npx tsx scripts/needs-you-seed-tenant-policies.ts gldf --json         # dry run, one tenant
 *   npx tsx scripts/needs-you-seed-tenant-policies.ts \
 *     --operator-user-id=<uuid> --operator-email=<email> --i-have-jacobs-yes   # write
 *
 * Dry run by default: it reads and prints the plan and writes nothing. It
 * refuses to read a non-local store, and refuses to write at all, without
 * --i-have-jacobs-yes. Writing needs a verified Strelva operator identity;
 * the database checks it again. Redis keys are never changed. It is
 * idempotent: kinds that already moved are skipped.
 */
import { getAllTenants } from "../src/lib/tenants";
import { getContentAutonomy } from "../src/lib/content-autonomy";
import { getReplyVoice } from "../src/lib/reviews/reply-voice";
import { createPostgresTenantSettings, planTenantSeed, type SeedStep } from "../src/platform/needs-you/tenant-settings";

function isLocal(url: string | undefined): boolean {
  if (!url) return true;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function flag(args: string[], name: string): string | null {
  const hit = args.find(arg => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const yes = args.includes("--i-have-jacobs-yes");
  const only = args.filter(arg => !arg.startsWith("--"));
  const stores = [process.env.UPSTASH_REDIS_REST_URL, process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL];
  if (!yes && !stores.every(isLocal)) {
    console.error("Refusing: a store is not local. Run against `pnpm scrubbed-copy` output, or pass --i-have-jacobs-yes.");
    process.exitCode = 1;
    return;
  }
  const operator = { userId: flag(args, "operator-user-id"), verifiedEmail: flag(args, "operator-email") };
  if (yes && (!operator.userId || !operator.verifiedEmail)) {
    console.error("Refusing: writing needs --operator-user-id and --operator-email of a verified Strelva operator.");
    process.exitCode = 1;
    return;
  }
  const port = createPostgresTenantSettings();
  const tenants = only.length ? only : (await getAllTenants()).map(t => t.id);
  const report: Array<{ tenantId: string; linked: boolean; steps: SeedStep[]; written: number; error?: string }> = [];
  for (const tenantId of tenants) {
    // Today's values come from Redis alone, never from a route already moved.
    const [contentAutonomy, voice] = await Promise.all([
      getContentAutonomy(tenantId, { enabled: false }),
      getReplyVoice(tenantId, { enabled: false }),
    ]);
    const routes = await port.read(tenantId).catch((error: unknown) => {
      report.push({ tenantId, linked: false, steps: [], written: 0, error: error instanceof Error ? error.message : "read failed" });
      return undefined;
    });
    if (routes === undefined) continue;
    if (!routes) { report.push({ tenantId, linked: false, steps: [], written: 0 }); continue; }
    const steps = planTenantSeed({ contentAutonomy, replyMode: voice.mode }, routes);
    let written = 0;
    if (yes) {
      for (const step of steps) {
        await port.write({
          tenantId, actor: { userId: operator.userId!, verifiedEmail: operator.verifiedEmail! }, layer: "owner",
          kind: step.kind, route: step.route, todayValue: step.todayValue, notMigrated: step.notMigrated, via: "seed",
        });
        written += 1;
      }
    }
    report.push({ tenantId, linked: true, steps, written });
  }
  if (json) console.log(JSON.stringify({ dryRun: !yes, report }, null, 2));
  else {
    console.log(yes ? "Writing." : "Dry run: nothing written. Pass --i-have-jacobs-yes with an operator identity to write.");
    for (const row of report) {
      if (row.error) { console.log(`${row.tenantId}: could not read (${row.error})`); continue; }
      if (!row.linked) { console.log(`${row.tenantId}: not linked to a business; Redis stays the authority`); continue; }
      if (!row.steps.length) { console.log(`${row.tenantId}: already moved`); continue; }
      for (const step of row.steps) {
        console.log(`${row.tenantId}: ${step.kind} today ${step.todayValue} -> owner row ${step.route ?? "none (Strelva's default)"}${yes ? " (written)" : ""}`);
        if (step.notMigrated) console.log(`  NOT MIGRATED: ${step.notMigrated}`);
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

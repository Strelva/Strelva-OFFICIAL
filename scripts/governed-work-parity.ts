#!/usr/bin/env npx tsx
/**
 * Governed-work dual-write PARITY CHECK — the soak verification for the Phase 2
 * Redis→Postgres cutover.
 *
 * The #8 dual-write shadows every governed Redis event into the `proposals` table
 * (best-effort, behind `GOVERNED_WORK_DUAL_WRITE`). Before flipping authority off
 * Redis, we must prove the shadow is COMPLETE and FAITHFUL: every governed event in
 * Redis has a matching `proposals` row. This script measures exactly that, read-only,
 * per tenant, using the SAME `isGovernedWorkEvent` / `eventToProposal` mapping the
 * shadow writer uses (so the check can't drift from the writer).
 *
 * Meaningful only AFTER: the #7 migration is applied, `database.types.ts` regenerated,
 * `GOVERNED_WORK_DUAL_WRITE=1` has been on long enough to shadow the live window. If
 * every event reads as MISSING and `getProposal` errors, the table isn't applied / the
 * flag was never on — the script says so instead of crying wolf.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/governed-work-parity.ts [--tenant <id>] [--limit <n>]
 */
import { getEvents } from "../src/lib/events";
import { isGovernedWorkEvent, eventToProposal } from "../src/lib/governed-work/shadow";
import { getProposal } from "../src/lib/governed-work/repository";
import { listAllTenants } from "../src/lib/db/repositories";

type TenantParity = {
  tenant: string;
  governed: number;
  matched: number;
  missing: string[]; // event ids in Redis with no proposal row
  mismatched: { id: string; field: string; redis: unknown; pg: unknown }[];
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function checkTenant(tenant: string, limit: number): Promise<TenantParity> {
  const out: TenantParity = { tenant, governed: 0, matched: 0, missing: [], mismatched: [] };
  const events = await getEvents(tenant, { limit });
  for (const event of events) {
    if (!isGovernedWorkEvent(event)) continue;
    const expected = eventToProposal(event);
    if (!expected) continue; // isGovernedWorkEvent + eventToProposal agree on scope
    out.governed++;
    const actual = await getProposal(event.id);
    if (!actual) {
      out.missing.push(event.id);
      continue;
    }
    // Compare the fields the writer sets (the ones that drive the cutover reads).
    const checks: [string, unknown, unknown][] = [
      ["tenantId", expected.tenantId, actual.tenantId],
      ["kind", expected.kind ?? null, actual.kind ?? null],
      ["entityType", expected.entityType, actual.entityType],
      ["source", expected.source, actual.source],
      ["status", expected.status, actual.status],
    ];
    const drift = checks.find(([, r, p]) => r !== p);
    if (drift) out.mismatched.push({ id: event.id, field: drift[0], redis: drift[1], pg: drift[2] });
    else out.matched++;
  }
  return out;
}

async function main() {
  const only = arg("--tenant");
  const limit = Number(arg("--limit") ?? 500);
  const tenants = only ? [only] : (await listAllTenants()).map((r) => r.id);

  console.log(`Governed-work parity check — ${tenants.length} tenant(s), window ${limit} events each\n`);

  let totGoverned = 0, totMatched = 0, totMissing = 0, totMismatch = 0, pgErrors = 0;
  for (const tenant of tenants) {
    let r: TenantParity;
    try {
      r = await checkTenant(tenant, limit);
    } catch (err) {
      pgErrors++;
      console.log(`  ${tenant}: ERROR — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    totGoverned += r.governed;
    totMatched += r.matched;
    totMissing += r.missing.length;
    totMismatch += r.mismatched.length;
    if (r.governed === 0) continue;
    const status = r.missing.length === 0 && r.mismatched.length === 0 ? "OK" : "DRIFT";
    console.log(
      `  [${status}] ${r.tenant}: ${r.matched}/${r.governed} matched` +
        (r.missing.length ? `, ${r.missing.length} missing` : "") +
        (r.mismatched.length ? `, ${r.mismatched.length} mismatched` : ""),
    );
    for (const m of r.missing.slice(0, 5)) console.log(`      missing: ${m}`);
    for (const m of r.mismatched.slice(0, 5)) console.log(`      mismatch ${m.id}.${m.field}: redis=${m.redis} pg=${m.pg}`);
  }

  console.log(
    `\nTOTAL: ${totMatched}/${totGoverned} matched, ${totMissing} missing, ${totMismatch} mismatched` +
      (pgErrors ? `, ${pgErrors} tenant(s) errored (table likely not applied / flag never on)` : ""),
  );
  if (totGoverned > 0 && totMissing === 0 && totMismatch === 0 && pgErrors === 0) {
    console.log("PARITY CLEAN — the Postgres shadow fully mirrors the governed Redis window. Safe to proceed with the cutover reads step.");
  } else if (totGoverned === 0) {
    console.log("No governed events in window — nothing to compare.");
  } else {
    console.log("PARITY NOT CLEAN — investigate missing/mismatched rows before flipping reads. (If everything is missing/errored, apply the #7 migration + enable GOVERNED_WORK_DUAL_WRITE first.)");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env npx tsx
/**
 * Gap-#3 re-sync: bring every change_request's shadow proposal to its CURRENT Redis
 * state (status + payload incl. metadata.workflowStatus), across ALL workflow
 * states — triaged/quoted/shipped/declined — not just pending.
 *
 * Why the plain governed-work backfill isn't enough: it is pending-only + insert-
 * only, so (a) shipped/declined CRs (status approved/dismissed) are skipped, and
 * (b) an already-present row (a CR created pending, then advanced) is left FROZEN at
 * creation without workflowStatus. Reading those from Postgres would serve stale
 * state. This upserts the current state so dropping the change_request read
 * exclusion is safe.
 *
 * Safe: additive re-sync of the shadow only; Redis stays authoritative, no Redis
 * writes. Best-effort per row. Idempotent (re-runnable).
 * Usage: npx tsx --env-file=.env.local scripts/backfill-change-request-workflow.ts
 */
import { getEvents } from "../src/lib/events";
import { changeRequestNewProposal } from "../src/lib/governed-work/shadow";
import { getProposal, insertProposal, updateProposalState } from "../src/lib/governed-work/repository";
import { listAllTenants } from "../src/lib/db/repositories";

async function main() {
  const tenants = (await listAllTenants()).map((r) => r.id);
  console.log(`Re-syncing change_request shadow proposals — ${tenants.length} tenant(s)\n`);

  let crs = 0, inserted = 0, updated = 0, failed = 0;
  for (const tenant of tenants) {
    const events = await getEvents(tenant, { limit: 1000 });
    for (const event of events) {
      if (event.type !== "change_request") continue;
      const proposal = changeRequestNewProposal(event);
      if (!proposal) continue;
      crs++;
      const existing = await getProposal(event.id);
      if (existing) {
        const row = await updateProposalState(event.id, { status: proposal.status ?? "pending", payload: proposal.payload });
        if (row) { updated++; console.log(`  [upd] ${tenant} ${event.id} -> ${proposal.status}/${(event.metadata?.workflowStatus as string) ?? "-"}`); }
        else { failed++; console.log(`  [!!]  ${tenant} ${event.id} — update returned null`); }
      } else {
        const row = await insertProposal(proposal);
        if (row) { inserted++; console.log(`  [ins] ${tenant} ${event.id} -> ${proposal.status}/${(event.metadata?.workflowStatus as string) ?? "-"}`); }
        else { failed++; console.log(`  [!!]  ${tenant} ${event.id} — insert returned null (table applied? flag on?)`); }
      }
    }
  }
  console.log(`\nDone: ${crs} change_requests; ${inserted} inserted, ${updated} updated, ${failed} failed.`);
  console.log("Then spot-check reconstruction against Redis before/after enabling reads.");
}
main().catch((e) => { console.error(e); process.exit(1); });

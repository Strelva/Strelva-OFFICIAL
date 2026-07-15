#!/usr/bin/env npx tsx
/**
 * One-time Redis→Postgres backfill of the CURRENT governed-work state — the
 * companion to the flag-gated dual-write shadow. The dual-write only shadows
 * events created AFTER the flag was enabled; this populates the proposals table
 * with the pending governed events that already existed, so the shadow reflects
 * the full current state and `governed-work-parity.ts` can read clean.
 *
 * Scope matches the writer/parity exactly: only PENDING governed events (the set
 * `isGovernedWorkEvent` + `eventToProposal` accept). Idempotent — `insertProposal`
 * is best-effort insert-only, so a row the dual-write already wrote is skipped
 * (unique-violation swallowed), never duplicated.
 *
 * Safe: additive (populates empty PG tables from Redis), touches no Redis data and
 * no authority — Redis stays the source of truth. Run AFTER the #7 migration is
 * applied. Usage: npx tsx --env-file=.env.local scripts/backfill-governed-work.ts
 */
import { getEvents } from "../src/lib/events";
import { isGovernedWorkEvent, eventToProposal } from "../src/lib/governed-work/shadow";
import { insertProposal, getProposal } from "../src/lib/governed-work/repository";
import { listAllTenants } from "../src/lib/db/repositories";

async function main() {
  const tenants = (await listAllTenants()).map((r) => r.id);
  console.log(`Backfilling governed-work proposals from Redis → Postgres — ${tenants.length} tenant(s)\n`);

  let governed = 0, inserted = 0, alreadyThere = 0;
  for (const tenant of tenants) {
    const events = await getEvents(tenant, { limit: 1000 });
    for (const event of events) {
      if (!isGovernedWorkEvent(event)) continue;
      const proposal = eventToProposal(event);
      if (!proposal) continue;
      governed++;
      if (await getProposal(event.id)) { alreadyThere++; continue; }
      const row = await insertProposal(proposal);
      if (row) { inserted++; console.log(`  [ins] ${tenant} ${event.id} (${proposal.kind ?? proposal.entityType})`); }
      else console.log(`  [??]  ${tenant} ${event.id} — insert returned null (check table applied + flag)`);
    }
  }
  console.log(`\nDone: ${governed} pending governed events; ${inserted} inserted, ${alreadyThere} already shadowed.`);
  console.log("Verify with: npx tsx --env-file=.env.local scripts/governed-work-parity.ts");
}
main().catch((e) => { console.error(e); process.exit(1); });

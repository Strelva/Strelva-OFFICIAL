/**
 * Governed-work durability reconciliation (#2 — the safe kernel).
 *
 * The dual-write shadow is best-effort: a swallowed Postgres write leaves a
 * governed event in Redis only, which the 90-day TTL then deletes — silent loss
 * of approval/decision history. As tenant count grows this stops being
 * theoretical. This sweep re-asserts the invariant "every governed event in Redis
 * has a CURRENT Postgres proposal row", so Postgres is a guaranteed-complete
 * durable mirror and the PG-authoritative reads are fully trustworthy.
 *
 * Idempotent + best-effort (reuses the null-safe repository writes). Non-zero
 * `drift` (rows it had to insert/update) means the live shadow is missing writes —
 * the cron alerts on it. Redis stays authoritative; this only ever ADDS/updates PG.
 */
import { getEvents } from "../events";
import { listAllTenants } from "../db/repositories";
import { isGovernedScopeEvent } from "./read";
import { eventToProposal, changeRequestNewProposal } from "./shadow";
import { getProposal, insertProposal, updateProposalState } from "./repository";

export type GovernedReconcileResult = {
  tenants: number;
  governed: number;
  inserted: number;
  updated: number;
  current: number;
  errors: string[];
};

export async function reconcileGovernedWork(opts?: { tenants?: string[]; limit?: number }): Promise<GovernedReconcileResult> {
  const tenants = opts?.tenants ?? (await listAllTenants()).map((r) => r.id);
  const limit = opts?.limit ?? 1000;
  const out: GovernedReconcileResult = { tenants: tenants.length, governed: 0, inserted: 0, updated: 0, current: 0, errors: [] };

  for (const tenant of tenants) {
    let events;
    try {
      events = await getEvents(tenant, { limit });
    } catch (err) {
      out.errors.push(`${tenant}: getEvents ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    for (const event of events) {
      if (!isGovernedScopeEvent(event)) continue;
      out.governed++;
      const existing = await getProposal(event.id);

      if (event.type === "change_request") {
        // change_request payload drifts as its workflow advances — always re-sync.
        const proposal = changeRequestNewProposal(event);
        if (!proposal) continue;
        if (existing) {
          const row = await updateProposalState(event.id, { status: proposal.status ?? "pending", payload: proposal.payload });
          if (row) out.updated++;
        } else {
          const row = await insertProposal(proposal);
          if (row) out.inserted++;
        }
        continue;
      }

      // Other governed events: the create-time snapshot is immutable (decisions +
      // executions are shadowed on their own paths), so only a MISSING row is drift.
      if (existing) { out.current++; continue; }
      const proposal = eventToProposal(event);
      if (!proposal) { out.current++; continue; } // resolved past the pending gate — nothing to insert
      const row = await insertProposal(proposal);
      if (row) out.inserted++;
    }
  }
  return out;
}

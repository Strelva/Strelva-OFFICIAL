import { bookingAgentVisibilityEnabled, bookingReadSource } from "./flags";
import { bookingStoreDb } from "./store";
import type { AgentHoldRatioCohort } from "./store";

/** Provisional engineering policy, not calibrated production guidance.
 * SQL owns the matching 24-hour capture window and minimum 15-minute maturity.
 * Actual confirmation deadlines must also have passed before a hold counts. */
export const AGENT_HOLD_RATIO_POLICY = { windowHours: 24, minimumMaturityMinutes: 15, minimumSample: 20, minimumConfirmationPercent: 20 } as const;

/** Observation only. Enabling this never enables booking admission or sends mail. */
export function agentHoldRatioAlertsEnabled(env: Partial<Record<string, string | undefined>> = process.env): boolean {
  return env.STRELVA_BOOKING_AGENT_RATIO_ALERTS?.trim() === "1";
}

export function agentHoldRatioIsLow(cohort: Pick<AgentHoldRatioCohort, "matureHolds" | "customerConfirmed">): boolean {
  return cohort.matureHolds >= AGENT_HOLD_RATIO_POLICY.minimumSample
    && cohort.customerConfirmed * 100 < cohort.matureHolds * AGENT_HOLD_RATIO_POLICY.minimumConfirmationPercent;
}

export function agentRequestProofLine(count: number | null): string | null {
  return count === null ? null : `${count} agent ${count === 1 ? "request" : "requests"}`;
}

/** Counts captured agent requests, including unconfirmed holds; never calls them bookings. */
export async function readAgentRequestProof(tenantId: string, from: string, to: string): Promise<string | null> {
  if (!bookingAgentVisibilityEnabled() || await bookingReadSource() !== "postgres") return null;
  const db = bookingStoreDb();
  if (!db) return null;
  const call = db.rpc("read_agent_booking_proof", { p_tenant_id: tenantId, p_from: from, p_to: to });
  const result = await (call.abortSignal ? call.abortSignal(AbortSignal.timeout(2000)) : call);
  if (result.error || typeof result.data !== "number" || !Number.isSafeInteger(result.data) || result.data < 0) return null;
  return agentRequestProofLine(result.data);
}

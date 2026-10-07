import { bookingAgentVisibilityEnabled, bookingReadSource } from "./flags";
import { bookingStoreDb } from "./store";

export function agentRequestProofLine(count: number | null): string | null {
  return count === null ? null : `${count} agent ${count === 1 ? "request" : "requests"}`;
}

/** Counts captured agent requests, including unconfirmed holds; never calls them bookings. */
export async function readAgentRequestProof(tenantId: string, from: string, to: string): Promise<string | null> {
  if (!bookingAgentVisibilityEnabled() || await bookingReadSource() !== "postgres") return null;
  const db = bookingStoreDb();
  if (!db) return null;
  const result = await db.rpc("read_agent_booking_proof", { p_tenant_id: tenantId, p_from: from, p_to: to });
  if (result.error || typeof result.data !== "number" || !Number.isSafeInteger(result.data) || result.data < 0) return null;
  return agentRequestProofLine(result.data);
}

import { bookingAgentVisibilityEnabled, bookingReadSource } from "./flags";
import { bookingStoreDb } from "./store";
import { z } from "zod";

export const agentBookingOutcomesSchema = z.object({
  businessName: z.string().min(1).max(160),
  discoveryCalls: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  discoveryCoverage: z.enum(["complete", "partial", "unknown"]),
  discoverySince: z.string().date().nullable(),
  holds: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  confirmations: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  completed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export type AgentBookingOutcomes = z.infer<typeof agentBookingOutcomesSchema>;

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

/** Aggregate-only discovery write. Search text, agent identity and customer data never leave the request. */
export async function recordAgentBusinessDiscoveries(scopes: string[]): Promise<boolean> {
  if (scopes.length === 0) return true;
  if (!bookingAgentVisibilityEnabled() || scopes.length > 10) return false;
  const db = bookingStoreDb();
  if (!db) return false;
  try {
    const call = db.rpc("record_agent_business_discovery", { p_scopes: [...new Set(scopes)] });
    const result = await (call.abortSignal ? call.abortSignal(AbortSignal.timeout(2000)) : call);
    // A successful lookup is returned only once its aggregate proof is recorded.
    if (result.error) return false;
    return typeof result.data === "number" && Number.isSafeInteger(result.data) && result.data > 0;
  } catch {
    return false;
  }
}

/** Counts distinct booking records and immutable confirmation/completion transitions. */
export async function readAgentBookingOutcomes(tenantId: string, from: string, to: string): Promise<AgentBookingOutcomes | null> {
  if (!bookingAgentVisibilityEnabled() || await bookingReadSource() !== "postgres") return null;
  const db = bookingStoreDb();
  if (!db) return null;
  try {
    const call = db.rpc("read_agent_booking_outcomes", { p_tenant_id: tenantId, p_from: from, p_to: to });
    const result = await (call.abortSignal ? call.abortSignal(AbortSignal.timeout(2000)) : call);
    if (result.error) return null;
    const parsed = agentBookingOutcomesSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function agentBookingOutcomesLine(outcomes: AgentBookingOutcomes | null): string | null {
  if (!outcomes) return null;
  const { businessName, discoveryCalls, discoveryCoverage, discoverySince, holds, confirmations, completed } = outcomes;
  const discovery = discoveryCoverage === "complete"
    ? `${discoveryCalls} recorded discovery ${discoveryCalls === 1 ? "appearance" : "appearances"}`
    : discoveryCoverage === "partial"
      ? `${discoveryCalls} recorded discovery ${discoveryCalls === 1 ? "appearance" : "appearances"} since ${discoverySince}; earlier coverage is unknown`
      : "discovery count unavailable; tracking was not established for this week";
  return `${businessName}: ${discovery}; ${holds} agent ${holds === 1 ? "booking hold" : "booking holds"}, ${confirmations} customer ${confirmations === 1 ? "confirmation" : "confirmations"}, and ${completed} completed ${completed === 1 ? "booking" : "bookings"} this week.`;
}

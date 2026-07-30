/**
 * Per-tenant client-email override — the operator's ability to ARM (or force
 * off) client lifecycle email for ONE verified client while the GLOBAL client
 * switch (`emailSendingPaused()` / EMAIL_SENDING_ENABLED) stays paused during the
 * test-tenant phase.
 *
 *   • "inherit" — follow the global switch (the safe default: no per-tenant
 *                 opinion, behaves exactly as before this store existed).
 *   • "on"      — allow client email for THIS tenant even if the global switch
 *                 is paused. Use only for a verified, gone-live client.
 *   • "off"     — block client email for THIS tenant even if the global switch
 *                 is on. A per-client kill switch.
 *
 * Stored as one string in Redis (`reb:client-email:{tenant}`, same `reb:`
 * wire-prefix + read-modify-write pattern as the other operator metadata stores).
 * Degrades to "inherit" without Redis, so a missing store can never fabricate an
 * "on" that turns email on for a client the operator didn't arm.
 *
 * This does NOT change the global default. The global switch still owns every
 * tenant that stays "inherit".
 */

import { getRedis } from "./redis";

export type ClientEmailOverride = "inherit" | "on" | "off";

/** The safe default: follow the global switch. */
export const DEFAULT_CLIENT_EMAIL_OVERRIDE: ClientEmailOverride = "inherit";

function key(tenant: string): string {
  return `reb:client-email:${tenant}`;
}

/** Read a tenant's client-email override. Defaults to "inherit". Null-safe. */
export async function getClientEmailOverride(tenant: string): Promise<ClientEmailOverride> {
  const redis = getRedis();
  if (!redis) return DEFAULT_CLIENT_EMAIL_OVERRIDE;
  try {
    const stored = await redis.get<string>(key(tenant));
    return stored === "on" || stored === "off" ? stored : DEFAULT_CLIENT_EMAIL_OVERRIDE;
  } catch {
    return DEFAULT_CLIENT_EMAIL_OVERRIDE;
  }
}

/** Set a tenant's client-email override. Best-effort; no-op without Redis. */
export async function setClientEmailOverride(
  tenant: string,
  state: ClientEmailOverride,
): Promise<ClientEmailOverride> {
  const value: ClientEmailOverride =
    state === "on" || state === "off" ? state : DEFAULT_CLIENT_EMAIL_OVERRIDE;
  const redis = getRedis();
  if (redis) await redis.set(key(tenant), value);
  return value;
}

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
 * Sending fails closed when the store is unavailable. The operator read can
 * explicitly request the inherited display default; it never authorizes mail.
 *
 * This does NOT change the global default. The global switch still owns every
 * tenant that stays "inherit".
 */

import { mirrorClientRecord } from "@/platform/client-records/mirror";
import { readThroughFlag, clientRecordReadSource } from "@/platform/client-records/move";
import { getSupabase } from "@/platform/infra/db/client";
import { getRedis } from "@/platform/infra/redis";

export type ClientEmailOverride = "inherit" | "on" | "off";

/** The safe default: follow the global switch. */
export const DEFAULT_CLIENT_EMAIL_OVERRIDE: ClientEmailOverride = "inherit";

function key(tenant: string): string {
  return `reb:client-email:${tenant}`;
}

/** A missing value inherits; an unavailable or malformed policy holds sending. */
export async function getClientEmailOverride(tenant: string, options: { failClosed?: boolean } = { failClosed: true }): Promise<ClientEmailOverride> {
  if (tenant.startsWith("workspace:")) return getBusinessEmailExclusion(tenant.slice(10));
  try {
    return await readThroughFlag("tenant_settings", tenant, () => getRedisOverride(tenant, options), (rows) => {
      const value = rows.find((r) => r.recordId === "client_email")?.payload.value;
      return value === "on" || value === "off" || value === "inherit" || value === undefined ? value ?? DEFAULT_CLIENT_EMAIL_OVERRIDE : "off";
    });
  } catch { return options.failClosed === false ? DEFAULT_CLIENT_EMAIL_OVERRIDE : "off"; }
}

/** Native businesses have durable operator controls, not tenant-settings rows.
 * An explicit business off silences its mail; booking arming does not arm
 * unrelated owner mail or bypass either global audience policy. */
async function getBusinessEmailExclusion(workspaceId: string): Promise<ClientEmailOverride> {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) return "off";
    const db = getSupabase();
    if (!db) return "off";
    const { data, error } = await (db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> })
      .rpc("read_business_booking_email", { p_workspace_id: workspaceId });
    if (error || !["on", "off", "inherit"].includes(data as string)) return "off";
    return data === "off" ? "off" : "inherit";
  } catch { return "off"; }
}
async function getRedisOverride(tenant: string, options: { failClosed?: boolean }): Promise<ClientEmailOverride> {
  const redis = getRedis();
  if (!redis) return options.failClosed === false ? DEFAULT_CLIENT_EMAIL_OVERRIDE : "off";
  try {
    const stored = await redis.get<string>(key(tenant));
    return stored === "on" || stored === "off" || stored === "inherit" || stored == null ? stored ?? DEFAULT_CLIENT_EMAIL_OVERRIDE : "off";
  } catch {
    return options.failClosed === false ? DEFAULT_CLIENT_EMAIL_OVERRIDE : "off";
  }
}

/** Save to the selected authority before reporting success. A qualified
 * Postgres cutover cannot lose a new exclusion behind a failed mirror. */
export async function setClientEmailOverride(
  tenant: string,
  state: ClientEmailOverride,
): Promise<ClientEmailOverride> {
  const value: ClientEmailOverride =
    state === "on" || state === "off" ? state : DEFAULT_CLIENT_EMAIL_OVERRIDE;
  if (tenant.startsWith("workspace:")) throw new Error("Use the business email controls for a native workspace.");
  const record = { recordId: "client_email", payload: { value }, capturedAt: new Date().toISOString() };
  const redis = getRedis();
  if (await clientRecordReadSource("tenant_settings") === "postgres") {
    const saved = await mirrorClientRecord("tenant_settings", tenant, record);
    if (!["recorded", "updated", "unchanged"].includes(saved.status)) throw new Error("The email setting could not be saved to its authoritative store.");
    // Postgres has committed. A failed cache refresh cannot undo the exclusion.
    await redis?.set(key(tenant), value).catch(() => undefined);
  } else {
    if (!redis) throw new Error("Email settings are unavailable. Nothing was saved.");
    await redis.set(key(tenant), value);
    await mirrorClientRecord("tenant_settings", tenant, record);
  }
  return value;
}

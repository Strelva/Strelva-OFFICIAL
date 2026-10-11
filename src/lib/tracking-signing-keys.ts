import "server-only";

import { normalizeTrackPublicKey } from "@/lib/track-signature";
import { getSupabase } from "@/platform/infra/db/client";

export const TRACK_SIGNING_KEY_OVERLAP_MS = 24 * 60 * 60 * 1000;

export type TenantTrackPublicKeys = {
  currentPublicKey: string;
  previousPublicKey: string | null;
  previousValidUntil: string | null;
};

/** Read a site's current and bounded-overlap Ed25519 public keys. */
export async function getTenantTrackPublicKeys(tenantId: string): Promise<TenantTrackPublicKeys | null> {
  const db = getSupabase();
  if (!db) throw new Error("Tracking signing key store is unavailable");

  const { data, error } = await db
    .from("tenant_track_signing_keys")
    .select("public_key, previous_public_key, previous_valid_until")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    currentPublicKey: data.public_key,
    previousPublicKey: data.previous_public_key,
    previousValidUntil: data.previous_valid_until,
  };
}

/** Read only the current key for callers that do not verify overlap keys. */
export async function getTenantTrackPublicKey(tenantId: string): Promise<string | null> {
  return (await getTenantTrackPublicKeys(tenantId))?.currentPublicKey ?? null;
}

/** Set or clear a site's public key. The matching private key stays in the site repo. */
export async function setTenantTrackPublicKey(
  tenantId: string,
  publicKey: string | null,
): Promise<void> {
  const db = getSupabase();
  if (!db) throw new Error("Tracking signing key store is unavailable");

  const normalized = publicKey === null ? null : normalizeTrackPublicKey(publicKey);
  if (publicKey !== null && !normalized) {
    throw new Error("Tracking public key must be a valid Ed25519 public key");
  }

  const { error } = await db.rpc("rotate_tenant_track_signing_key", {
    p_tenant_id: tenantId,
    p_public_key: normalized,
  });
  if (error) throw error;
}

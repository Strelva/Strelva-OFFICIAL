import "server-only";

import { normalizeTrackPublicKey } from "@/lib/track-signature";
import { getSupabase } from "@/platform/infra/db/client";

/** Read a site's configured Ed25519 public key using the service-role client. */
export async function getTenantTrackPublicKey(tenantId: string): Promise<string | null> {
  const db = getSupabase();
  if (!db) throw new Error("Tracking signing key store is unavailable");

  const { data, error } = await db
    .from("tenant_track_signing_keys")
    .select("public_key")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  return data?.public_key ?? null;
}

/** Set or clear a site's public key. The matching private key stays in the site repo. */
export async function setTenantTrackPublicKey(
  tenantId: string,
  publicKey: string | null,
): Promise<void> {
  const db = getSupabase();
  if (!db) throw new Error("Tracking signing key store is unavailable");

  if (publicKey === null) {
    const { error } = await db
      .from("tenant_track_signing_keys")
      .delete()
      .eq("tenant_id", tenantId);
    if (error) throw error;
    return;
  }

  const normalized = normalizeTrackPublicKey(publicKey);
  if (!normalized) throw new Error("Tracking public key must be a valid Ed25519 public key");
  const { error } = await db
    .from("tenant_track_signing_keys")
    .upsert({ tenant_id: tenantId, public_key: normalized }, { onConflict: "tenant_id" });
  if (error) throw error;
}

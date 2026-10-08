import { getSupabase } from "@/platform/infra/db/client";
import type { RevocationOutcome } from "@/platform/infra/provider-revocation";

type TenantProvider = "google" | "instagram" | "yelp" | "calendly" | "vegaro";
type LocalCleanupStatus = "complete" | "partial";
type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

export async function recordTenantProviderDisconnect(input: {
  tenantId: string;
  provider: TenantProvider;
  actorUserId: string | null;
  revocationOutcome: RevocationOutcome;
  revocationErrorCode: string | null;
  localCleanupStatus: LocalCleanupStatus;
  clearedStores: string[];
}) {
  const client = getSupabase() as unknown as RpcClient | null;
  if (!client) throw new Error("Provider disconnect receipt storage is unavailable.");
  const { data, error } = await client.rpc("record_tenant_provider_disconnect", {
    p_tenant_id: input.tenantId,
    p_provider: input.provider,
    p_actor_user_id: input.actorUserId,
    p_revocation_outcome: input.revocationOutcome,
    p_revocation_error_code: input.revocationErrorCode,
    p_local_cleanup_status: input.localCleanupStatus,
    p_cleared_stores: input.clearedStores,
  });
  if (error) throw new Error(`Provider disconnect receipt could not be written (${error.code ?? "storage_error"}).`);
  const row = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) throw new Error("Provider disconnect receipt was not returned by storage.");
  const clearedStores = Array.isArray(row.clearedStores) ? row.clearedStores.filter((item): item is string => typeof item === "string") : input.clearedStores;
  const localCleanupStatus = row.localCleanupStatus === "partial" || input.localCleanupStatus === "partial" ? "partial" : "complete";
  return {
    id,
    provider: input.provider,
    revocationOutcome: input.revocationOutcome,
    revocationErrorCode: input.revocationErrorCode,
    localCleanupStatus,
    clearedStores,
  };
}

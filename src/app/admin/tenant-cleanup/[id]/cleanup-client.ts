import { cleanupSchema, type CleanupReceipt } from "@/lib/deprovision-cleanup-receipt";

export async function cleanupRequest(tenantId: string, receipt?: CleanupReceipt, signal?: AbortSignal): Promise<CleanupReceipt | null> {
  const response = await fetch(`/api/admin/tenants/${encodeURIComponent(tenantId)}/deprovision`, receipt ? {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal,
    body: JSON.stringify({ action: "retry-cleanup", confirmSlug: tenantId, cleanupReceiptId: receipt.id }),
  } : { cache: "no-store", signal });
  if (response.status !== 200 && response.status !== 202) throw new Error(response.status === 403
    ? "Super-admin access is required. Cleanup was not confirmed." : "Cleanup receipt unavailable. Reload its current state before retrying.");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("cleanup" in body)) throw new Error("Cleanup receipt unavailable. Reload its current state before retrying.");
  if (body.cleanup === null && !receipt) return null;
  const parsed = cleanupSchema.safeParse(body.cleanup);
  if (!parsed.success || parsed.data.tenantId !== tenantId || parsed.data.complete !== (parsed.data.redisComplete && parsed.data.providerComplete)
    || (receipt && (parsed.data.id !== receipt.id || parsed.data.revision < receipt.revision))) throw new Error("Cleanup receipt changed or is unavailable. Reload before retrying.");
  if (receipt && (!("ok" in body) || body.ok !== parsed.data.complete || !("databaseDeleted" in body) || body.databaseDeleted !== true
    || (response.status === 202 && parsed.data.complete))) throw new Error("Cleanup response is inconsistent. Reload before retrying.");
  return parsed.data;
}

/** Leased Postgres export work. A terminated process leaves a claim to retry. */
import { z } from "zod";
import { encryptSecret, decryptSecret } from "@/platform/infra/crypto/secrets";
import type { WorkspaceActor } from "@/platform/workspaces";
import type { WorkspaceExportSnapshot } from "./contracts";
import { collectWorkspaceExportV3, writeWorkspaceExportBuild, WorkspaceExportV3Error, type V3Rpc, type V3Assets, type V3Manifest } from "./v3";

export function exportRecoveryEnabled() {
  return process.env.STRELVA_WORKSPACE_RELEASE === "1" && process.env.STRELVA_EXPORT_SCHEMA_3 === "1" && process.env.STRELVA_EXPORT_RECOVERY === "1";
}
const jobSchema = z.object({
  buildId: z.string().uuid(), workspaceId: z.string().uuid(), userId: z.string().uuid(), verifiedEmail: z.string().email(),
  deliverTo: z.string().email(), leaseToken: z.string().uuid(), stage: z.enum(["build", "delivery"]),
  tokenCiphertext: z.string().nullable(), tenantIds: z.array(z.string()), manifest: z.unknown(),
});
export interface ExportRecoveryDeps {
  rpc: V3Rpc;
  snapshot: (actor: WorkspaceActor, workspaceId: string) => Promise<WorkspaceExportSnapshot>;
  assets?: V3Assets;
  deliver: (input: { buildId: string; token: string; deliverTo: string; workspaceId: string; tenantIds: string[]; manifest: V3Manifest }) => Promise<"accepted" | "suppressed">;
  onFailure?: (buildId: string, reason: string) => void;
}
export async function enqueueExportRecovery(actor: WorkspaceActor, workspaceId: string, rpc: V3Rpc) {
  const result = await rpc("enqueue_workspace_export_recovery", { p_workspace_id: z.string().uuid().parse(workspaceId), p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
  if (result.error) {
    const detail = result.error.message ?? "";
    throw new WorkspaceExportV3Error(detail.includes("denied") ? "denied" : detail.includes("in_progress") ? "in_progress" : detail.includes("no_owner_recipient") ? "no_owner_recipient" : "unavailable", "The business export could not be queued.");
  }
  return z.object({ buildId: z.string().uuid(), deliverTo: z.string().email() }).parse(result.data);
}

/** One job per invocation bounds the serverless run. SQL owns lease expiry/retry. */
export async function runExportRecovery(deps: ExportRecoveryDeps, buildId?: string): Promise<{ processed: number; failed: number; delivered: boolean }> {
  if (!exportRecoveryEnabled()) return { processed: 0, failed: 0, delivered: false };
  const claimed = await deps.rpc("claim_workspace_export_recovery", { p_build_id: buildId ?? null });
  if (claimed.error) throw new WorkspaceExportV3Error("unavailable", "Export recovery is unavailable.");
  if (!claimed.data) return { processed: 0, failed: 0, delivered: false };
  const job = jobSchema.parse(claimed.data);
  const write = async (operation: string, args: Record<string, unknown>) => deps.rpc("write_workspace_export_recovery", {
    p_build_id: job.buildId, p_lease_token: job.leaseToken, p_operation: operation, p_args: args,
  });
  let token: string;
  let manifest: V3Manifest;
  let tenantIds = job.tenantIds;
  if (job.stage === "build") {
    try {
      const document = await collectWorkspaceExportV3({ userId: job.userId, verifiedEmail: job.verifiedEmail }, job.workspaceId, deps.rpc, deps.snapshot, undefined, deps.assets, true);
      manifest = document.manifest;
      tenantIds = (document.data.linked_sites ?? []).flatMap(raw => {
        const tenant = raw && typeof raw === "object" ? (raw as { tenantId?: unknown }).tenantId : null;
        return typeof tenant === "string" ? [tenant] : [];
      });
      let ciphertext: string | undefined;
      const guarded: V3Rpc = (name, args) => write(name, { ...args, ...(name === "complete_workspace_export_build" ? { tokenCiphertext: ciphertext, tenantIds } : {}) });
      const outcome = await writeWorkspaceExportBuild(job.buildId, JSON.stringify(document), guarded, value => {
        ciphertext = encryptSecret(value);
        if (!ciphertext.startsWith("enc:v1:")) throw new Error("export_token_encryption_required");
      });
      if (outcome.status === "failed") { deps.onFailure?.(job.buildId, "export_build_failed"); return { processed: 1, failed: 1, delivered: false }; }
      token = outcome.token;
    } catch {
      const failed = await write("fail_workspace_export_build", { p_failure: "export_collection_failed" });
      deps.onFailure?.(job.buildId, failed.error ? "export_worker_lease_lost" : "export_collection_failed");
      return { processed: 1, failed: 1, delivered: false };
    }
  } else {
    try { token = job.tokenCiphertext ? decryptSecret(job.tokenCiphertext) : ""; }
    catch { token = ""; }
    manifest = job.manifest as V3Manifest;
    if (!token || !manifest) {
      await write("delivery_failed", {});
      deps.onFailure?.(job.buildId, "export_delivery_token_unavailable");
      return { processed: 1, failed: 1, delivered: false };
    }
  }
  // Persist the dispatch boundary before the provider call. A terminated
  // worker or lost settlement remains unretryable until an operator resolves
  // it; an archive lease alone cannot prove that no email was accepted.
  try {
    const reservation = await write("reserve_delivery", {});
    if (reservation.error) throw new Error("reservation_failed");
  } catch {
    deps.onFailure?.(job.buildId, "export_delivery_reservation_failed");
    return { processed: 1, failed: 1, delivered: false };
  }
  let result: "accepted" | "suppressed";
  try {
    result = await deps.deliver({ buildId: job.buildId, workspaceId: job.workspaceId, token, deliverTo: job.deliverTo, manifest, tenantIds });
  } catch {
    await write("delivery_unknown", {}).catch(() => undefined);
    deps.onFailure?.(job.buildId, "export_link_delivery_unknown");
    return { processed: 1, failed: 1, delivered: false };
  }
  if (result === "suppressed") {
    await write("delivery_failed", {}).catch(() => undefined);
    deps.onFailure?.(job.buildId, "export_link_delivery_failed");
    return { processed: 1, failed: 1, delivered: false };
  }
  try {
    const finished = await write("delivered", {});
    if (finished.error) throw new Error("receipt_failed");
  } catch {
    // Provider acceptance is final even if the local receipt cannot settle.
    // The pre-dispatch reservation prevents automatic replay of this email.
    deps.onFailure?.(job.buildId, "export_delivery_receipt_failed");
    return { processed: 1, failed: 1, delivered: true };
  }
  return { processed: 1, failed: 0, delivered: true };
}

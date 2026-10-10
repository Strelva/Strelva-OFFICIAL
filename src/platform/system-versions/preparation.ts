/** One business, one owner decision and one durable preparation receipt.
 * Opening a decision sends nothing. Approval and release stay in Needs you. */
import { z } from "zod";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { NeedsYouStore } from "@/platform/needs-you/repository";
import { PostgresNeedsYouStore } from "@/platform/needs-you/repository";
import { versionReleaseItem } from "@/platform/needs-you/sources/version-release";
import { determineVersionRelease } from "./service";
import type { VersionLineage } from "./types";
import { mapVersionsError, versionsDb, type VersionsDb } from "./supabase-store";
import { requireVersionRuntime } from "./native-runtime";

const receiptSchema = z.object({ receiptId: z.string().uuid(), decisionId: z.string().uuid(), workspaceId: z.string().uuid(), versionId: z.string().uuid(), rowRevision: z.number().int().positive() }).strict();
export type VersionPreparationReceipt = z.infer<typeof receiptSchema>;

export async function prepareVersionRelease(actor: WorkspaceActor, lineage: VersionLineage,
  deps: { decisions?: Pick<NeedsYouStore, "policies" | "open">; db?: VersionsDb } = {}): Promise<VersionPreparationReceipt | null> {
  const { needsRelease, nextRelease, changedPaths } = determineVersionRelease(lineage);
  if (!needsRelease) return null;
  await requireVersionRuntime(actor, lineage, deps.db ?? versionsDb());
  const decisions = deps.decisions ?? PostgresNeedsYouStore;
  // Unreadable policy is a failed preparation, never an invented permission.
  const policies = await decisions.policies(actor, lineage.version.businessId);
  const proposed = versionReleaseItem({ versionId: lineage.id, systemId: lineage.version.systemId, label: lineage.context.label,
    rowRevision: lineage.rowRevision, nextRelease, changedPaths,
  }, lineage.version.businessId, policies);
  if (!proposed) throw new WorkspaceStoreError("No release decision could be prepared. Nothing went live.");
  const item = await decisions.open(lineage.version.businessId, proposed);
  const { data, error } = await (deps.db ?? versionsDb()).rpc("record_version_preparation", {
    p_workspace_id: lineage.version.businessId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
    p_version_id: lineage.id, p_row_revision: lineage.rowRevision, p_owner_decision_id: item.id,
  });
  if (error) mapVersionsError(error, "The working definition is saved, but its preparation receipt could not be confirmed. Retry to finish preparing; nothing went live.");
  const receipt = receiptSchema.safeParse(data);
  if (!receipt.success || receipt.data.workspaceId !== lineage.version.businessId || receipt.data.versionId !== lineage.id
    || receipt.data.rowRevision !== lineage.rowRevision || receipt.data.decisionId !== item.id) throw new WorkspaceStoreError("The preparation receipt could not be confirmed. Nothing went live.");
  return receipt.data;
}

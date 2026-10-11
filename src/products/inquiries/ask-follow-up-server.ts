import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { canonicalJson, sha256 } from "@/platform/business-record/tenant-import";
import { approveAskInquiryFollowUp, askInquiryFollowUpSelectionSchema, inquiryDefinitionHash, type AskInquiryFollowUpSelection } from "./ask-follow-up";
import { getInquiryRepository } from "./repository";
import { assertInquiryWorkspaceOpen } from "./workspace-exit";
import { inquiryReleaseMayBeOn, inquiryReleaseEnabledForWorkspace } from "./release";

async function authorize(actor: WorkspaceActor, selection: AskInquiryFollowUpSelection) {
  const detail = await createSupabaseSystemStore().readSystem(actor, { businessId: selection.workspaceId, systemId: selection.systemId });
  if (detail.system.kind !== "inquiry" || detail.system.lifecycle !== "live" || detail.system.origin?.kind !== "inquiry_workspace" || detail.system.origin.ref !== selection.nativeOriginId || detail.system.currentRevision?.revisionId !== selection.baselineRevisionId) throw new Error("The Inquiry System baseline changed.");
  const revision = detail.revisions.find(item => item.id === selection.baselineRevisionId);
  if (revision?.implementation.kind !== "inquiry_config" || revision.implementation.ref !== `${selection.nativeOriginId}@${selection.snapshotRevision}`) throw new Error("The Inquiry System has no exact native baseline.");
  await assertInquiryWorkspaceOpen({ tenantId: selection.tenantId, tenantStableId: selection.tenantStableId });
}

/** A source re-read before NeedsYou readiness; no native write or recipient/session creation. */
export async function askInquiryFollowUpStillCurrent(actor: WorkspaceActor, raw: unknown): Promise<boolean> {
  if (!inquiryReleaseMayBeOn()) return false;
  const selection = askInquiryFollowUpSelectionSchema.safeParse(raw);
  if (!selection.success || !await inquiryReleaseEnabledForWorkspace(selection.data.workspaceId, { userId: actor.userId, operator: false, tester: false })) return false;
  await authorize(actor, selection.data);
  const snapshot = await getInquiryRepository().getSnapshot(selection.data.tenantId, selection.data.workspaceId);
  if (!snapshot || snapshot.tenantStableId !== selection.data.tenantStableId) return false;
  const live = snapshot.state.capabilities.find(item => item.id === selection.data.capabilityId)?.live;
  const work = snapshot.state.requests.find(item => item.id === selection.data.requestId);
  return Boolean(live && work && inquiryDefinitionHash(live) === selection.data.liveHash && sha256(canonicalJson(work)) === selection.data.sourceHash);
}

/** The MakeReal plan already owns explicit approval. Persist it on the existing native publication contract. */
export async function approveAskInquiryFollowUpPublication(actor: WorkspaceActor, raw: unknown) {
  if (!inquiryReleaseMayBeOn()) throw new Error("Inquiry follow-up alternatives are not enabled.");
  const repository = getInquiryRepository();
  return approveAskInquiryFollowUp(actor, raw, { repository, authorize: selection => authorize(actor, selection), save: async input => {
    await assertInquiryWorkspaceOpen({ tenantId: input.tenantId });
    return repository.compareAndSwap(input);
  } });
}

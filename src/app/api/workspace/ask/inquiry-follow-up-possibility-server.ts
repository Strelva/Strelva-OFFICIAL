import { AskPossibilityUnsupportedError, type AskPossibilityInput } from "@/platform/ask/ports";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { listBusinessSystems } from "@/platform/systems/from-existing";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import type { SystemStore } from "@/platform/systems/store";
import type { BusinessSystems } from "@/platform/systems/from-existing";
import { inquiryReleaseMayBeOn, inquiryReleaseEnabledForWorkspace, getInquiryRepository, composeAskInquiryFollowUp, type InquiryRepository } from "@/products/inquiries/server";

export async function prepareAskInquiryFollowUp(actor: WorkspaceActor, input: AskPossibilityInput, id: string, deps: {
  mayBeOn?: () => boolean; enabled?: (workspaceId: string) => Promise<boolean>;
  store?: SystemStore; list?: (actor: WorkspaceActor, workspaceId: string) => Promise<BusinessSystems>;
  repository?: InquiryRepository; now?: () => string;
} = {}) {
  // Inquiry alternatives don't depend on the website-rebuild gate. Both inquiry gates precede authority/storage.
  if (!(deps.mayBeOn ?? inquiryReleaseMayBeOn)()) throw new AskPossibilityUnsupportedError("Inquiry follow-up alternatives are not enabled.");
  if (!await (deps.enabled ?? (workspaceId => inquiryReleaseEnabledForWorkspace(workspaceId, { userId: actor.userId, operator: false, tester: false })))(input.workspaceId)) throw new AskPossibilityUnsupportedError("Inquiry follow-up alternatives are not enabled for this business.");
  if (input.candidate?.kind !== "inquiry-follow-up-rule" || !input.systemId) throw new AskPossibilityUnsupportedError("Choose the existing Inquiries System and one exact follow-up rule.");
  const store = deps.store ?? createSupabaseSystemStore();
  const listing = await (deps.list ?? ((currentActor, workspaceId) => listBusinessSystems(currentActor, workspaceId, { store })))(actor, input.workspaceId);
  const target = listing.systems.find(item => item.system.id === input.systemId);
  const baseline = target?.system.currentRevision;
  const tenant = listing.systems.find(item => item.system.kind === "website" && item.references.tenantStableId === target?.references.tenantStableId)?.references.tenantId;
  if (!target || target.provenance !== "stored" || target.system.kind !== "inquiry" || target.system.lifecycle !== "live" || !baseline || baseline.businessId !== input.workspaceId || target.system.origin?.kind !== "inquiry_workspace" || !tenant || !target.references.tenantStableId) throw new AskPossibilityUnsupportedError("This Inquiries System has no persisted native live baseline. Strelva needs to prepare it first.");
  const detail = await store.readSystem(actor, { businessId: input.workspaceId, systemId: target.system.id });
  const revision = detail.revisions.find(item => item.id === baseline.revisionId);
  const snapshot = await (deps.repository ?? getInquiryRepository()).getSnapshot(tenant, input.workspaceId);
  if (!snapshot || snapshot.tenantStableId !== target.references.tenantStableId || snapshot.businessId !== input.workspaceId || detail.system.currentRevision?.revisionId !== baseline.revisionId || revision?.implementation.kind !== "inquiry_config" || revision.implementation.ref !== `${target.system.origin.ref}@${snapshot.revision}`) throw new AskPossibilityUnsupportedError("The stored Inquiry baseline no longer matches its native configuration. Strelva must refresh it before opening a rule alternative.");
  const at = (deps.now ?? (() => new Date().toISOString()))();
  let prepared: ReturnType<typeof composeAskInquiryFollowUp>;
  try { prepared = composeAskInquiryFollowUp(snapshot, { capabilityId: input.candidate.capabilityId, rule: input.candidate, actorId: actor.userId, seed: id, at }); }
  catch (error) { throw new AskPossibilityUnsupportedError(error instanceof Error ? error.message : "The rule alternative could not pass its rehearsal."); }
  const selection = { kind: "ask-inquiry-follow-up" as const, workspaceId: input.workspaceId, systemId: target.system.id, tenantId: tenant, tenantStableId: snapshot.tenantStableId, nativeOriginId: target.system.origin.ref, baselineRevisionId: baseline.revisionId, snapshotRevision: snapshot.revision, requestId: prepared.work.id, capabilityId: prepared.work.capabilityId, changeId: prepared.work.activeChangeId!, version: prepared.work.draft!.version, liveHash: prepared.liveHash, sourceHash: prepared.sourceHash, draftHash: prepared.draftHash, seed: id, at, rule: input.candidate };
  const content = { kind: "ask-inquiry-follow-up", selection, draft: prepared.work.draft, rehearsal: prepared.rehearsal, originalWords: input.words?.slice(0,3000) ?? input.intent, askOrigin: input.origin ?? null, askedOnBehalf: input.askedOnBehalf ?? null };
  return { content, checks: [{ id: "inquiry-rule-live", description: "The public native inquiry configuration contains the exact reviewed follow-up rule." }], previewHref: `/dashboard/systems/${target.system.id}`, changes: [{ baseline, candidate: { summary: `Follow up after ${input.candidate.afterMinutes} minutes, at most ${input.candidate.maxAttempts} times: ${input.candidate.messageTemplate.slice(0,250)}. Review the complete wording in Try.`, content } }],
    effects: [{ id: "publish-inquiry-follow-up", kind: "publish" as const, channel: "inquiry_form" as const, system: { systemId: target.system.id }, description: "Apply the exact reviewed inquiry follow-up rule", request: { tenantId: tenant, businessId: input.workspaceId, requestId: prepared.work.id, capabilityId: prepared.work.capabilityId, changeId: prepared.work.activeChangeId!, version: prepared.work.draft!.version, followUpAlternative: selection }, after: [] }] };
}

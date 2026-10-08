import { decideAiContentGovernance } from "@/lib/ai-governance";
import { InquiryEngine } from "./inquiry-engine";
import { inquiryReleaseEnabledForTenant } from "./release";
import { getInquiryRepository, publicationClaimToken, type InquiryRepository, type InquiryWorkspaceSnapshot, type PublicationClaim } from "./repository";
import type { InquiryCapabilityDefinition, InquiryEngineState } from "./contracts";
import { stateForReceive } from "./receive";
import { commitPatternInstallationAfterVerification } from "./inquiry-pattern-updates";
import { inquiryRecordsEnabled, inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import { tenantEventRevision } from "@/platform/needs-you/tenant-classify";
import { readInquiryDecisionEvent } from "@/platform/needs-you/server";
type UnifiedEvent = Parameters<typeof tenantEventRevision>[0];

interface PublicationActorInput {
  tenantId: string; eventId: string; claimId: string; actorId?: string; event?: UnifiedEvent;
  action?: "approved" | "dismissed"; repository?: InquiryRepository;
  authorizationRpc?: typeof inquiryRecordsRpc;
}

/** Preparing a durable claim never grants its preparer permission to decide.
 * Both the generic event resolver and the final publisher enforce the current
 * owner's exact event authority, including a bound signed owner decision. */
export async function authorizeInquiryPublicationActor(input: PublicationActorInput): Promise<{ allowed: boolean; reason?: string }> {
  try {
    if (!input.actorId) return { allowed: false, reason: "permission_denied" };
    const repository = input.repository ?? getInquiryRepository();
    const claim = await repository.getPublicationClaim(input.tenantId, input.claimId);
    const event = input.event ?? await readInquiryDecisionEvent(input.tenantId, input.eventId);
    if (!claim || !event || event.id !== input.eventId || event.tenantId !== input.tenantId || event.status !== "pending"
      || claim.tenantId !== input.tenantId || claim.governanceEventId !== input.eventId
      || event.metadata?.publicationClaimId !== claim.id
      || event.metadata?.kind !== (claim.action === "undo" ? "inquiry_capability_undo" : "inquiry_capability_publish")
      || event.metadata?.version !== claim.version || event.metadata?.capabilityId !== claim.capabilityId
      || event.metadata?.requestId !== claim.requestId || event.metadata?.changeId !== claim.changeId
      || event.metadata?.businessId !== claim.businessId) return { allowed: false, reason: "permission_denied" };
    const rpc = input.authorizationRpc ?? inquiryRecordsRpc;
    let authorized = false;
    if (input.actorId.startsWith("owner-link:")) {
      if (process.env.STRELVA_INQUIRY_OWNER_NOTICES !== "1" || !inquiryRecordsEnabled()) return { allowed: false, reason: "permission_denied" };
      authorized = await rpc("authorize_inquiry_owner_link_publication", { p_tenant_id: input.tenantId, p_event_id: input.eventId,
        p_revision: tenantEventRevision(event), p_recipient: input.actorId.slice("owner-link:".length), p_claim_id: claim.id,
        p_action: input.action ?? "approved" }) === true;
    } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.actorId) && input.actorId === claim.actorId) {
      authorized = await rpc("authorize_inquiry_publication_actor", { p_tenant_id: input.tenantId, p_actor_id: input.actorId,
        p_claim_id: claim.id, p_event_id: input.eventId }) === true;
    }
    return authorized ? { allowed: true } : { allowed: false, reason: "permission_denied" };
  } catch { return { allowed: false, reason: "permission_denied" }; }
}

export interface InquiryPublicationResult {
  accepted: boolean;
  verified: boolean;
  reason?: string;
}

/**
 * The public inquiry endpoint reads this Postgres snapshot directly. Publishing
 * is therefore one atomic CAS of the canonical configuration and its receipt.
 * The engine calculates that transaction privately; nothing is called live
 * until the database commits it. No client repository or external provider is
 * mutated here. Installing the shared renderer is a separate client release.
 */
export async function executeInquiryPublication(input: PublicationActorInput & {
  authorizeActor?: (input: PublicationActorInput) => Promise<{ allowed: boolean; reason?: string }>;
}): Promise<InquiryPublicationResult> {
  // Per site: a converted tenant follows its business's row. Publishing feeds
  // the public form, which visitors see, so `operators` doesn't count here.
  if (!(await inquiryReleaseEnabledForTenant(input.tenantId))) return { accepted: false, verified: false, reason: "inquiries_not_enabled" };
  const repository = input.repository ?? getInquiryRepository();
  const claim = await repository.getPublicationClaim(input.tenantId, input.claimId);
  if (!claim || claim.tenantId !== input.tenantId || claim.governanceEventId !== input.eventId || !claim.actorId) {
    return { accepted: false, verified: false, reason: "invalid_publication_claim" };
  }
  if (claim.status === "failed") return { accepted: false, verified: false, reason: "publication_claim_failed" };
  const authorization = await (input.authorizeActor ?? authorizeInquiryPublicationActor)(input);
  if (!authorization.allowed) return { accepted: false, verified: false, reason: authorization.reason ?? "permission_denied" };
  const token = publicationClaimToken(claim);
  const acceptanceId = `inquiry-postgres:${claim.id}`;
  let snapshot = await repository.getSnapshot(claim.tenantId, claim.businessId);
  if (!snapshot) return { accepted: false, verified: false, reason: "workspace_unavailable" };
  const existing = snapshot.state.changes.find((change) => change.providerAcceptanceId === acceptanceId);
  if (!existing) {
    if (claim.status === "accepted" || claim.status === "verification_failed") {
      return { accepted: true, verified: false, reason: "accepted_configuration_requires_reconciliation" };
    }
    const calculated = await calculatePublication(snapshot, claim, acceptanceId);
    if ("reason" in calculated) return { accepted: false, verified: false, reason: calculated.reason };
    try {
      const committed = await repository.compareAndSwap({ tenantId: claim.tenantId, businessId: claim.businessId, expectedRevision: snapshot.revision, actorId: claim.actorId, state: calculated.state });
      if (!committed.changed) {
        // A concurrent executor can have committed this exact claim. Detect it
        // before treating the CAS conflict as a different person's edit.
        snapshot = committed.current;
        if (!snapshot?.state.changes.some((change) => change.providerAcceptanceId === acceptanceId)) {
          return { accepted: false, verified: false, reason: "workspace_changed_before_publication" };
        }
      } else snapshot = committed.snapshot;
    } catch {
      // A database response can disappear after commit. Read the durable
      // acceptance receipt before deciding whether the write happened.
      snapshot = await repository.getSnapshot(claim.tenantId, claim.businessId).catch(() => null);
      if (!snapshot?.state.changes.some((change) => change.providerAcceptanceId === acceptanceId)) {
        return { accepted: false, verified: false, reason: "publication_outcome_requires_reconciliation" };
      }
    }
  }
  // Once the atomic configuration/receipt commit exists, later failures never
  // make this command eligible for a second publication.
  try {
    await repository.markPublicationAccepted({ tenantId: claim.tenantId, claimId: claim.id, claimToken: token, acceptanceId, providerReceipt: { target: "Postgres public inquiry configuration", requestId: claim.requestId, version: claim.version } });
  } catch {
    return { accepted: true, verified: false, reason: "publication_acceptance_marker_requires_reconciliation" };
  }
  return verifyPublication(repository, claim, acceptanceId, snapshot);
}

async function calculatePublication(snapshot: InquiryWorkspaceSnapshot, claim: PublicationClaim, acceptanceId: string): Promise<{ state: InquiryEngineState } | { reason: string }> {
  const work = snapshot.state.requests.find((item) => item.id === claim.requestId);
  if (!work || work.businessId !== claim.businessId || work.capabilityId !== claim.capabilityId) return { reason: "publication_request_mismatch" };
  if (claim.action === "make_live" && (work.activeChangeId !== claim.changeId || work.draft?.version !== claim.version || work.publishApproval?.version !== claim.version || work.publishApproval.actorId !== claim.actorId || !work.publishApproval.explicit)) {
    return { reason: "publication_approval_is_stale" };
  }
  if (claim.action === "undo" && work.lastLiveChangeId !== claim.changeId) return { reason: "undo_approval_is_stale" };
  const target = claim.action === "undo"
    ? snapshot.state.capabilities.find((item) => item.id === claim.capabilityId)?.previousLive ?? null
    : work.draft;
  if (claim.action === "make_live") {
    const change = snapshot.state.changes.find(item => item.id === claim.changeId);
    const liveVersion = snapshot.state.capabilities.find(item => item.id === claim.capabilityId)?.live?.version ?? null;
    if (!change || change.baseVersion !== liveVersion) return { reason: "publication_live_baseline_changed" };
  }
  const governance = decideAiContentGovernance("contact", target, { tenantAutoPublish: false });
  if (governance.action === "block") return { reason: "publication_blocked_by_governance" };
  const acceptedAt = new Date().toISOString();
  let sequence = 0;
  const engine = new InquiryEngine({
    businessId: claim.businessId, state: stateForReceive(snapshot),
    idFactory: (prefix) => `${claim.id}:${prefix}:${++sequence}`,
    livePublisher: {
      async publish() {
        // This is a transaction calculation, not a provider success report.
        // The returned state is private until compareAndSwap commits it.
        return { status: "accepted", acceptanceId, acceptedAt, providerReceipt: { target: "Postgres public inquiry configuration", approvalEventId: claim.governanceEventId, governanceReason: governance.reasonCode } };
      },
    },
  });
  try {
    const result = claim.action === "undo"
      ? await engine.undo(work.id, { actorId: claim.actorId!, explicit: true, version: claim.version })
      : await engine.publish(work.id, { actorId: claim.actorId!, explicit: true, version: claim.version });
    return result.provider.status === "accepted" ? { state: engine.snapshot() } : { reason: "publication_calculation_failed" };
  } catch {
    return { reason: "publication_readiness_failed" };
  }
}

async function verifyPublication(repository: InquiryRepository, claim: PublicationClaim, acceptanceId: string, committed: InquiryWorkspaceSnapshot): Promise<InquiryPublicationResult> {
  const expected = committed.state.capabilities.find((item) => item.id === claim.capabilityId)?.live ?? null;
  try {
    const observed = await repository.getSnapshot(claim.tenantId, claim.businessId);
    if (!observed) throw new Error("readback_unavailable");
    const receipt = observed.state.changes.find((item) => item.providerAcceptanceId === acceptanceId);
    if (!receipt) throw new Error("receipt_readback_missing");
    if (receipt.verification?.verified) { await reconcileNativeBundle(claim); return { accepted: true, verified: true }; }
    const actual = observed.state.capabilities.find((item) => item.id === claim.capabilityId)?.live ?? null;
    const verified = sameDefinition(actual, expected);
    const engine = new InquiryEngine({ businessId: claim.businessId, state: stateForReceive(observed) });
    engine.recordPublishVerification(claim.requestId, { actorId: claim.actorId!, version: receipt.targetVersion, verified, evidence: [verified ? "Read back the exact committed definition from the Postgres authority used by the public inquiry endpoint." : "The current public inquiry definition differs from this accepted change."] });
    if (verified) commitPatternInstallationAfterVerification(engine, { capabilityId: claim.capabilityId, actorId: claim.actorId! });
    const saved = await repository.compareAndSwap({ tenantId: claim.tenantId, businessId: claim.businessId, expectedRevision: observed.revision, actorId: claim.actorId, state: engine.snapshot() });
    if (!saved.changed) throw new Error("verification_receipt_conflict");
    if (!verified) throw new Error("definition_readback_mismatch");
    await reconcileNativeBundle(claim);
    return { accepted: true, verified: true };
  } catch {
    await repository.markPublicationFailed({ tenantId: claim.tenantId, claimId: claim.id, claimToken: publicationClaimToken(claim), reason: "Published configuration requires read-back verification.", verificationFailed: true }).catch(() => {});
    return { accepted: true, verified: false, reason: "publication_verification_pending" };
  }
}

async function reconcileNativeBundle(claim:PublicationClaim){
  try{await inquiryRecordsRpc("reconcile_bundle_inquiry_releases",{p_workspace_id:claim.businessId,p_capability_id:claim.capabilityId});}catch{console.warn("[inquiries] Bundle native release receipt needs reconciliation");}
}

function sameDefinition(left: InquiryCapabilityDefinition | null, right: InquiryCapabilityDefinition | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

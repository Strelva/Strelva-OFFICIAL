import type { LeadRecord } from "@/lib/leads";

import type {
  InquiryCapabilityState,
  InquiryEngineState,
  InquiryRecordStatus,
  ResponsibilityAction,
  ResponsibilityActionReceipt,
} from "./contracts";
import type { InquiryDeliveryResult } from "./delivery";
import { type InquiryMessageReviewEventMetadata, recordFromLead } from "./delivery-approval-primitives";
import { InquiryEngine } from "./inquiry-engine";
import { stateForReceive } from "./receive";
import type { InquiryRepository, InquiryWorkspaceSnapshot } from "./repository";

/** What a message receipt records about the inquiry it belongs to. */
export interface MessageReceiptContext {
  snapshot: InquiryWorkspaceSnapshot;
  lead: LeadRecord;
  capability: InquiryCapabilityState;
  status: InquiryRecordStatus;
  responsibilityAction: ResponsibilityAction;
}

/**
 * "refused" is permanent (the sponsor or responsibility changed, or the
 * receipt would not be accepted); "unavailable" is a persistence failure that
 * a later attempt can repair.
 */
export type MessageReceiptWrite = "persisted" | "refused" | "unavailable";

export async function writeMessageReceipt(input: {
  context: MessageReceiptContext;
  metadata: InquiryMessageReviewEventMetadata;
  providerResult: InquiryDeliveryResult;
  sentMessageDigest: string | undefined;
  loadRepository: () => Promise<InquiryRepository>;
}): Promise<MessageReceiptWrite> {
  // A message receipt says this exact message was sent. Never write one for a
  // review unless the accepted attempt recorded the same digest.
  if (!input.sentMessageDigest || input.sentMessageDigest.toLowerCase() !== input.metadata.messageDigest.toLowerCase()) return "refused";
  let repository: InquiryRepository;
  try {
    repository = await input.loadRepository();
  } catch {
    return "unavailable";
  }
  // The key is the same whenever the receipt is written (at approval, by
  // reconciliation, or after a later delivered report), so it is written once.
  const idempotencyKey = `inquiry-delivery:${input.metadata.inquiryId}:${input.metadata.action}:${input.metadata.messageDigest}`;
  let snapshot = input.context.snapshot;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      try {
        const current = await repository.getSnapshot(snapshot.tenantId, snapshot.businessId);
        if (!current) return "unavailable";
        snapshot = current;
      } catch {
        return "unavailable";
      }
    }
    const existing = snapshot.state.responsibilityReceipts.find((receipt) => receipt.responsibilityId === input.metadata.responsibilityId && receipt.idempotencyKey === idempotencyKey);
    if (existing) return existing.status === "accepted" ? "persisted" : "refused";
    const currentResponsibility = snapshot.state.responsibilities.find((item) => item.id === input.metadata.responsibilityId);
    if (!currentResponsibility || currentResponsibility.sponsorId !== input.metadata.requestedBy) return "refused";
    const record = recordFromLead(snapshot.state, input.context.capability, input.context.lead, input.context.status);
    const state = stateForReceive(snapshot);
    state.inquiries = [...state.inquiries.filter((item) => item.id !== record.id), record];
    let receipt: ResponsibilityActionReceipt;
    let updatedState: InquiryEngineState | null = null;
    try {
      const engine = new InquiryEngine({ businessId: snapshot.businessId, state, now: () => input.providerResult.acceptedAt || new Date().toISOString() });
      updatedState = engine.snapshot();
      receipt = engine.recordResponsibilityAction({
        responsibilityId: currentResponsibility.id,
        action: input.context.responsibilityAction,
        actorId: "strelva",
        approvedBy: input.metadata.requestedBy,
        at: input.providerResult.acceptedAt || new Date().toISOString(),
        what: `Sent the reviewed inquiry ${input.metadata.action} to ${input.metadata.recipient}.`,
        why: "The responsibility sponsor approved the exact rendered message.",
        lookedAt: [
          `recipient ${input.metadata.recipient}`,
          `message digest ${input.metadata.messageDigest}`,
          `capability ${input.metadata.capabilityId} version ${input.metadata.capabilityVersion}`,
          `policy ${input.metadata.policyVersion}`,
        ],
        outcome: "accepted",
        outcomeEvidence: [
          `provider status ${input.providerResult.status}`,
          ...(input.providerResult.providerMessageId ? [`provider message ${input.providerResult.providerMessageId}`] : []),
          ...(input.providerResult.verificationEvidence ?? []),
        ],
        messageBody: input.metadata.messageBody,
        idempotencyKey,
      });
      updatedState = engine.snapshot();
    } catch {
      return "refused";
    }
    if (receipt.status !== "accepted" || !updatedState) return "refused";
    try {
      const saved = await repository.compareAndSwap({
        tenantId: snapshot.tenantId,
        businessId: snapshot.businessId,
        expectedRevision: snapshot.revision,
        state: updatedState,
        actorId: input.metadata.requestedBy,
      });
      if (saved.changed) return "persisted";
    } catch {
      return "unavailable";
    }
  }
  return "unavailable";
}

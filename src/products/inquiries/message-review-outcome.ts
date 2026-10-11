import type { InquiryDeliveryCheckpoint, InquiryDeliveryResult } from "./delivery";
import { classifyInquiryMessage } from "./message-outcome";
import { DIFFERENT_MESSAGE_SENT, sentMessageBinding } from "./message-review-event";
import type { InquiryMessageReviewAction, InquiryMessageReviewOutcome } from "./delivery-approval-contract";
import { InquiryMessageReviewEngineError } from "./delivery-approval-primitives";

/** A review's reported outcome comes only from its own delivery checkpoint. */
export function checkpointAccepted(checkpoint: InquiryDeliveryCheckpoint | null): boolean {
  return Boolean(checkpoint) && classifyInquiryMessage(checkpoint!).accepted;
}

export function outcomeFromCheckpoint(
  checkpoint: InquiryDeliveryCheckpoint | null,
  inquiryId: string,
  action: InquiryMessageReviewAction,
  fallback?: { status?: InquiryDeliveryResult["status"]; reason?: string },
  reviewDigest?: string,
): InquiryMessageReviewOutcome {
  if (reviewDigest && checkpointAccepted(checkpoint) && sentMessageBinding(checkpoint, reviewDigest) === "different") {
    // Another message already went out for this purpose. This review was
    // never sent and cannot be: report it as blocked, with no provider ids
    // that belong to the other message.
    return { inquiryId, action, status: "blocked", reason: DIFFERENT_MESSAGE_SENT, retryable: false };
  }
  const status = checkpoint?.status;
  const outputStatus: InquiryMessageReviewOutcome["status"] =
    fallback?.status === "reconciliation_required" ? "reconciliation_required" :
      status === "verified" ? "verified" :
      status === "delivered" ? "delivered" :
        status === "bounced" ? "bounced" :
          status === "deferred" ? "deferred" :
            status === "suppressed" ? "suppressed" :
              status === "failed" ? "failed" :
                status === "accepted" || status === "accepted_unverified" ? "accepted_unverified" :
                  status === "sending" || status === "unknown" ? "reconciliation_required" :
                    fallback?.status === "failed" ? "failed" : "unavailable";
  // An unsettled attempt stays "possibly accepted" even when the checkpoint
  // alone would read as a rejection.
  const classification = outputStatus === "reconciliation_required" && !checkpointAccepted(checkpoint)
    ? classifyInquiryMessage({ status: outputStatus })
    : classifyInquiryMessage(checkpoint ?? { status: outputStatus });
  return {
    inquiryId,
    action,
    status: outputStatus,
    ...(checkpoint?.failureReason || checkpoint?.verificationReason || fallback?.reason ? { reason: checkpoint?.failureReason || checkpoint?.verificationReason || fallback?.reason } : {}),
    ...(checkpoint?.acceptedAt ? { acceptedAt: checkpoint.acceptedAt } : {}),
    ...(checkpoint?.providerMessageId ? { providerMessageId: checkpoint.providerMessageId } : {}),
    ...(checkpoint?.verificationEvidence ? { verificationEvidence: checkpoint.verificationEvidence } : {}),
    retryable: outputStatus === "failed" && classification.retryAllowed ? Boolean(checkpoint?.retryable) : false,
    delivery: classification.delivery,
    retryAllowed: classification.retryAllowed,
  };
}

export function outcomeError(result: { changed: boolean; reason?: string }): InquiryMessageReviewEngineError {
  const reason = result.reason || "delivery_approval_failed";
  const known = new Set(["policy_changed", "inquiry_changed", "recipient_route_changed", "message_mismatch", "approval_required", "permission_denied", "review_expired", "review_revoked"]);
  return new InquiryMessageReviewEngineError(reason, known.has(reason) ? reason : "delivery_unavailable");
}

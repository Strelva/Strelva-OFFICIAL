import type { InquiryDeliveryResult } from "./delivery-types";
import type { InquiryDeliveryAction, InquiryDeliveryStatus } from "./delivery-types";
import type { InquiryMessageDelivery } from "./message-outcome";

/** The only outbound actions exposed by the per-message review boundary. */
export type InquiryMessageReviewAction = Extract<
  InquiryDeliveryAction,
  "reply" | "owner_notification" | "schedule_follow_up"
>;

export interface InquiryMessageReviewPrepareInput {
  tenantId: string;
  businessId: string;
  inquiryId: string;
  action: InquiryMessageReviewAction;
  actorId: string;
  /** Exact Ask draft copy. Absent: existing template behavior. */
  authoredReply?: string;
}

export interface InquiryMessageReviewApproveInput extends InquiryMessageReviewPrepareInput {
  reviewToken: string;
  messageDigest: string;
}

export interface InquiryMessageReviewPreview {
  /** Durable event receipt for an authored Ask reply. */
  eventId?: string;
  reviewToken: string;
  inquiryId: string;
  action: InquiryMessageReviewAction;
  recipient: string;
  subject: string;
  body: string;
  messageDigest: string;
  policyVersion: string;
  capabilityId: string | null;
  capabilityVersion: number | null;
  preparedAt: string;
  expiresAt: string | null;
}

export type InquiryMessageReviewOutcomeStatus = InquiryDeliveryStatus | "blocked";

export interface InquiryMessageReviewOutcome {
  inquiryId: string;
  action: InquiryMessageReviewAction;
  status: InquiryMessageReviewOutcomeStatus;
  reason?: string;
  acceptedAt?: string;
  providerMessageId?: string;
  verificationEvidence?: string[];
  /** False for an accepted or ambiguous provider write. */
  retryable: boolean;
  /** What happened to the message after the provider took it (see message-outcome.ts). */
  delivery?: InquiryMessageDelivery;
  /** The owner may prepare a new review. Only a rejected message allows one. */
  retryAllowed?: boolean;
}

/**
 * `different_message_sent`: the provider already accepted a different message
 * for this inquiry and purpose. The reviewed message was not sent, never will
 * be under this purpose, and earns no message receipt.
 */
export type InquiryMessageReviewExecutionStatus = InquiryDeliveryResult["status"] | "different_message_sent";

export interface InquiryMessageReviewExecution {
  accepted: boolean;
  safeToResolve: boolean;
  receiptPersisted: boolean;
  verified: boolean;
  status: InquiryMessageReviewExecutionStatus;
  reason?: string;
  acceptedAt?: string;
  providerMessageId?: string;
  /** The delivery send attempt the provider accepted, for reconciliation. */
  deliveryAttemptId?: string;
  verificationEvidence?: string[];
}

/**
 * A second copy of an accepted send, kept on the governed event. Reconciliation
 * uses it when the delivery checkpoint could not record the acceptance.
 */
export interface InquiryMessageAcceptanceEvidence {
  providerMessageId?: string;
  acceptedAt?: string;
  deliveryAttemptId?: string;
}

export interface InquiryMessageReviewReconciliation {
  accepted: boolean;
  safeToResolve: boolean;
  receiptPersisted: boolean;
  verified: boolean;
  status: InquiryMessageReviewExecutionStatus;
  reason?: string;
}

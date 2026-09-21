import type { InquiryDeliveryResult } from "./delivery-types";
import type { InquiryDeliveryAction, InquiryDeliveryStatus } from "./delivery-types";

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
}

export interface InquiryMessageReviewApproveInput extends InquiryMessageReviewPrepareInput {
  reviewToken: string;
  messageDigest: string;
}

export interface InquiryMessageReviewPreview {
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
}

/** Stable service port for the authenticated API route and the delivery owner. */
export interface InquiryMessageReviewService {
  prepare(input: InquiryMessageReviewPrepareInput): Promise<InquiryMessageReviewPreview>;
  approve(input: InquiryMessageReviewApproveInput): Promise<InquiryMessageReviewOutcome>;
}

export interface InquiryMessageReviewExecution {
  accepted: boolean;
  safeToResolve: boolean;
  receiptPersisted: boolean;
  verified: boolean;
  status: InquiryDeliveryResult["status"];
  reason?: string;
  acceptedAt?: string;
  providerMessageId?: string;
  verificationEvidence?: string[];
}

export interface InquiryMessageReviewReconciliation {
  accepted: boolean;
  safeToResolve: boolean;
  receiptPersisted: boolean;
  verified: boolean;
  status: InquiryDeliveryResult["status"];
  reason?: string;
}

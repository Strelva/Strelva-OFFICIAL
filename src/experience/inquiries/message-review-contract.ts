import type {
  InquiryMessageReviewAction,
  InquiryMessageReviewOutcome,
  InquiryMessageReviewPreview,
} from "@/products/inquiries";

export type {
  InquiryMessageReviewAction,
  InquiryMessageReviewOutcome,
  InquiryMessageReviewOutcomeStatus,
  InquiryMessageReviewPreview,
} from "@/products/inquiries";

/** Actions that the message review surface may ask the server to prepare. */

/**
 * The browser never supplies message contents. It identifies the authorized
 * inquiry and asks the server to prepare the current message for review.
 */
export interface PrepareInquiryMessageReviewRequest {
  operation: "prepare";
  tenantId: string;
  inquiryId: string;
  action: InquiryMessageReviewAction;
}

/**
 * Approval is bound to the exact server-rendered message. The token and digest
 * are opaque values, and are invalidated when the inquiry, policy, or route
 * changes.
 */
export interface ApproveInquiryMessageReviewRequest {
  operation: "approve";
  tenantId: string;
  inquiryId: string;
  action: InquiryMessageReviewAction;
  reviewToken: string;
  messageDigest: string;
}

export type InquiryMessageReviewRequest =
  | PrepareInquiryMessageReviewRequest
  | ApproveInquiryMessageReviewRequest;

/** Exact provider-bound text projected for a person to inspect. */
export interface InquiryMessageReviewPreparedResponse {
  review: InquiryMessageReviewPreview;
}

export interface InquiryMessageReviewApprovedResponse {
  outcome: InquiryMessageReviewOutcome;
}

export type InquiryMessageReviewResponse =
  | InquiryMessageReviewPreparedResponse
  | InquiryMessageReviewApprovedResponse;

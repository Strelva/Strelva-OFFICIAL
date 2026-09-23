/** Route-facing inquiry approval operations use the single durable event service. */
import type {
  InquiryMessageReviewApproveInput,
  InquiryMessageReviewOutcome,
  InquiryMessageReviewPrepareInput,
  InquiryMessageReviewPreview,
} from "./delivery-approval-contract";
import {
  approveInquiryMessageReviewWithDependencies,
  prepareInquiryMessageReviewWithDependencies,
} from "./delivery-approval-service";

export type { InquiryMessageReviewDependencies, InquiryMessageReviewEventMetadata } from "./delivery-approval-service";
export {
  INQUIRY_MESSAGE_REVIEW_KIND,
  INQUIRY_MESSAGE_REVIEW_SCHEMA_VERSION,
  InquiryMessageReviewEngineError,
  isInquiryMessageReviewEvent,
  getInquiryMessageReviewMetadata,
  executeInquiryMessageReview,
  authorizeInquiryMessageReviewActor,
  reconcileInquiryMessageReview,
} from "./delivery-approval-service";

export async function prepareInquiryMessageReview(
  input: InquiryMessageReviewPrepareInput,
): Promise<InquiryMessageReviewPreview> {
  return prepareInquiryMessageReviewWithDependencies(input);
}

export async function approveInquiryMessageReview(
  input: InquiryMessageReviewApproveInput,
): Promise<InquiryMessageReviewOutcome> {
  return approveInquiryMessageReviewWithDependencies(input);
}

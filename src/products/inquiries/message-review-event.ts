import type { UnifiedEvent } from "@/lib/types";

import type { InquiryDeliveryCheckpoint } from "./delivery";
import type { InquiryMessageReviewPreview } from "./delivery-approval-contract";
import {
  INQUIRY_MESSAGE_REVIEW_KIND,
  INQUIRY_MESSAGE_REVIEW_SCHEMA_VERSION,
  type InquiryMessageReviewEventMetadata,
  hash,
  positiveVersion,
  reviewAction,
  text,
  throwCode,
  tokenFor,
} from "./delivery-approval-primitives";

export const DIFFERENT_MESSAGE_SENT = "different_message_already_sent";
export const MESSAGE_DIGEST_UNKNOWN = "message_digest_unknown";

/** Read a message review's metadata from its approval event, or null if it is not one. */
export function metadataFromEvent(event: UnifiedEvent): InquiryMessageReviewEventMetadata | null {
  if (event.type !== "change_request") return null;
  const value = event.metadata;
  if (!value || value.kind !== INQUIRY_MESSAGE_REVIEW_KIND || value.schemaVersion !== INQUIRY_MESSAGE_REVIEW_SCHEMA_VERSION) return null;
  const row = value as Record<string, unknown>;
  try {
    if (row.reviewAudience !== "owner") return null;
    const action = reviewAction(row.action);
    const metadata: InquiryMessageReviewEventMetadata = {
      kind: INQUIRY_MESSAGE_REVIEW_KIND,
      schemaVersion: INQUIRY_MESSAGE_REVIEW_SCHEMA_VERSION,
      tenantId: text(row.tenantId, "Tenant id", 80),
      businessId: text(row.businessId, "Business id", 160),
      inquiryId: text(row.inquiryId, "Inquiry id", 256),
      action,
      requestedBy: text(row.requestedBy, "Request actor", 256),
      responsibilityId: text(row.responsibilityId, "Responsibility id", 256),
      responsibilityRevision: text(row.responsibilityRevision, "Responsibility revision", 256),
      capabilityId: text(row.capabilityId, "Capability id", 256),
      capabilityVersion: positiveVersion(row.capabilityVersion, "Capability version"),
      inquiryVersion: text(row.inquiryVersion, "Inquiry version", 256),
      policyVersion: text(row.policyVersion, "Policy version", 256),
      recipient: text(row.recipient, "Recipient", 320),
      replyTo: row.replyTo === null ? null : text(row.replyTo, "Reply address", 320),
      subject: text(row.subject, "Subject", 500),
      messageBody: text(row.messageBody, "Message body", 10_000, true),
      messageDigest: text(row.messageDigest, "Message digest", 128),
      preparedAt: text(row.preparedAt, "Prepared time", 80),
      expiresAt: row.expiresAt === null ? null : text(row.expiresAt, "Expiry", 80),
      reviewTokenHash: text(row.reviewTokenHash, "Review token", 128),
      reviewAudience: "owner",
    };
    if (!/^[a-f0-9]{64}$/.test(metadata.messageDigest) || !/^[a-f0-9]{64}$/.test(metadata.reviewTokenHash)) return null;
    return metadata;
  } catch {
    return null;
  }
}

export function isInquiryMessageReviewEvent(event: UnifiedEvent): boolean {
  return metadataFromEvent(event) !== null;
}

export function getInquiryMessageReviewMetadata(event: UnifiedEvent): InquiryMessageReviewEventMetadata | null {
  return metadataFromEvent(event);
}

/** The owner-facing preview of a stored message review; refuses a revoked token. */
export function previewFromEvent(event: UnifiedEvent, metadata: InquiryMessageReviewEventMetadata, actorId: string): InquiryMessageReviewPreview {
  const token = tokenFor(metadata, actorId);
  if (hash(token) !== metadata.reviewTokenHash) throwCode("review_revoked", "This message review is no longer valid.");
  return {
    reviewToken: token,
    inquiryId: metadata.inquiryId,
    action: metadata.action,
    recipient: metadata.recipient,
    subject: metadata.subject,
    body: metadata.messageBody,
    messageDigest: metadata.messageDigest,
    policyVersion: metadata.policyVersion,
    capabilityId: metadata.capabilityId,
    capabilityVersion: metadata.capabilityVersion,
    preparedAt: metadata.preparedAt,
    expiresAt: metadata.expiresAt,
  };
}

/**
 * Whether the message the provider accepted for this inquiry and purpose is
 * the reviewed message. A checkpoint written before digests were recorded is
 * "unknown": it may hold this message or another one, so it never earns a
 * message receipt for the review.
 */
export type SentMessageBinding = "same" | "different" | "unknown";

export function sentMessageBinding(checkpoint: InquiryDeliveryCheckpoint | null, reviewDigest: string): SentMessageBinding {
  if (!checkpoint?.messageDigest) return "unknown";
  return checkpoint.messageDigest.toLowerCase() === reviewDigest.toLowerCase() ? "same" : "different";
}

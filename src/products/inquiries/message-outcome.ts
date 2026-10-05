/**
 * One answer to "was this inquiry message accepted, and may the owner prepare
 * another review?" The approval service, the message review route and the
 * review screen all read this instead of keeping their own status lists.
 *
 * Accepted is final: deferred, bounced, suppressed and provider-failed reports
 * all leave the message accepted, and the checkpoint and provider idempotency
 * keys (inquiry + purpose) would refuse a second send anyway. Only a rejected
 * message, one the provider never took, may have another send attempt.
 *
 * Type-only imports keep this module safe for client components.
 */

import type { InquiryDeliveryProviderOutcome } from "./delivery-types";

export type InquiryMessageDelivery =
  /** Never accepted: rejected, blocked, or not attempted. */
  | "none"
  /** Unknown outcome: an attempt may have reached the provider. */
  | "unknown"
  /** Accepted, but no provider report or read-back has confirmed anything. */
  | "unconfirmed"
  /** Accepted, and read-back confirmed the provider holds this exact message. */
  | "confirmed"
  /** Accepted; the provider is still trying to deliver it. */
  | "deferred"
  /** Accepted; the recipient's server took it. */
  | "delivered"
  /** Accepted, then bounced, suppressed, or failed at the provider. */
  | "undeliverable";

export const INQUIRY_MESSAGE_DELIVERIES: readonly InquiryMessageDelivery[] = [
  "none",
  "unknown",
  "unconfirmed",
  "confirmed",
  "deferred",
  "delivered",
  "undeliverable",
];

export interface InquiryMessageClassification {
  accepted: boolean;
  delivery: InquiryMessageDelivery;
  /** The owner may prepare a new review and make another send attempt. */
  retryAllowed: boolean;
}

export interface InquiryMessageClassificationInput {
  /** A checkpoint, delivery result or message review outcome status. */
  status: string;
  acceptedAt?: string | null;
  providerMessageId?: string | null;
  providerOutcome?: InquiryDeliveryProviderOutcome | null;
  /** Why the send stopped, when the server said. */
  reason?: string | null;
}

/**
 * Reasons that end the purpose for this inquiry even though nothing was sent:
 * a different message already went out, so the checkpoint and the provider
 * idempotency key refuse any new review for the same inquiry and purpose.
 */
export const FINAL_UNSENT_REASONS: ReadonlySet<string> = new Set(["different_message_already_sent"]);

const ACCEPTED_STATUSES = new Set([
  "accepted",
  "accepted_unverified",
  "verified",
  "delivered",
  "deferred",
  "bounced",
  "suppressed",
]);
const UNKNOWN_STATUSES = new Set(["sending", "unknown", "reconciliation_required"]);

function acceptedDelivery(input: InquiryMessageClassificationInput): InquiryMessageDelivery {
  const report = input.status === "failed" || UNKNOWN_STATUSES.has(input.status)
    ? input.providerOutcome ?? (input.status === "failed" ? "failed" : null)
    : input.status;
  if (report === "delivered") return "delivered";
  if (report === "deferred") return "deferred";
  if (report === "bounced" || report === "suppressed" || report === "failed") return "undeliverable";
  if (report === "verified") return "confirmed";
  return "unconfirmed";
}

export function classifyInquiryMessage(input: InquiryMessageClassificationInput): InquiryMessageClassification {
  const accepted = Boolean(
    input.acceptedAt ||
    input.providerMessageId ||
    ACCEPTED_STATUSES.has(input.status) ||
    (input.status === "failed" && input.providerOutcome),
  );
  if (accepted) return { accepted: true, delivery: acceptedDelivery(input), retryAllowed: false };
  if (UNKNOWN_STATUSES.has(input.status)) return { accepted: false, delivery: "unknown", retryAllowed: false };
  return { accepted: false, delivery: "none", retryAllowed: !FINAL_UNSENT_REASONS.has(input.reason ?? "") };
}

export function isInquiryMessageDelivery(value: unknown): value is InquiryMessageDelivery {
  return typeof value === "string" && (INQUIRY_MESSAGE_DELIVERIES as readonly string[]).includes(value);
}

/**
 * Read a message review outcome. The server's own classification wins when the
 * outcome carries one; an outcome without it is classified from its status.
 */
export function classifyInquiryMessageOutcome(outcome: {
  status: string;
  acceptedAt?: string | null;
  providerMessageId?: string | null;
  delivery?: unknown;
  retryAllowed?: unknown;
  reason?: string | null;
}): InquiryMessageClassification {
  if (isInquiryMessageDelivery(outcome.delivery) && typeof outcome.retryAllowed === "boolean") {
    const accepted = outcome.delivery !== "none" && outcome.delivery !== "unknown";
    const final = FINAL_UNSENT_REASONS.has(outcome.reason ?? "");
    return { accepted, delivery: outcome.delivery, retryAllowed: !accepted && !final && outcome.retryAllowed };
  }
  return classifyInquiryMessage(outcome);
}

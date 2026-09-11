/** Public contracts for the bounded inquiry delivery adapter. */

import type {
  InquiryTimelineEventType,
  ResponsibilityEvaluation,
  ReceiptActor,
} from "./contracts";
import type { EmailOptions } from "@/lib/email/layout";
import type { EmailAudience } from "@/lib/email/send";

export type InquiryDeliveryAction = "reply" | "send_message" | "owner_notification" | "schedule_follow_up";
export type InquiryDeliveryMode = "off" | "approval" | "supervised" | "auto";

export type InquiryDeliveryStatus =
  | "ready"
  | "awaiting_approval"
  | "not_due"
  | "paused"
  | "budget_exhausted"
  | "disabled"
  | "sending"
  | "accepted"
  | "verified"
  | "delivered"
  | "bounced"
  | "deferred"
  | "suppressed"
  | "accepted_unverified"
  | "failed"
  | "reconciliation_required"
  | "retry_exhausted"
  | "unavailable";

export interface InquiryDeliverySubmission {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  message?: string | null;
  /** Optional engine-authored follow-up template; disclosure is appended by the adapter. */
  followUpMessageTemplate?: string | null;
  source?: string | null;
  fields?: Record<string, string>;
  businessName?: string | null;
  /** Trusted capability routing destination, never copied from browser fields. */
  staffDestination?: string | null;
  capabilityId?: string | null;
  capabilityVersion?: number | null;
  /** Optional host revision used to bind approvals and follow-up rechecks. */
  inquiryVersion?: string | number | null;
  receivedAt: string;
}

export interface InquiryDeliveryApproval {
  inquiryId: string;
  action: InquiryDeliveryAction;
  actorId: string;
  /** The policy version the actor saw when approving this exact message. */
  policyVersion: string;
  /** SHA-256 of the exact recipient, body, capability version and policy. */
  messageDigest: string;
  capabilityId?: string | null;
  capabilityVersion?: number | null;
  approvedAt: string;
  expiresAt?: string | null;
  explicit: true;
}

export interface InquiryActionPolicy {
  mode: InquiryDeliveryMode;
  /** A disabled action is equivalent to `mode: "off"`. */
  enabled: boolean;
  /** Engine-authored message copy used only for the follow-up body. */
  messageTemplate?: string;
  /** Delay from receipt before this action can be claimed. */
  delayHours: number;
  /** Maximum age from receipt at which this action may be claimed. */
  budgetHours: number;
  /** Maximum provider attempts. Ambiguous attempts are never automatically retried. */
  maxAttempts: number;
}

export interface InquiryRoutingPolicy {
  version: string;
  paused: boolean;
  pauseReason?: string | null;
  autoReply: InquiryActionPolicy;
  followUp: InquiryActionPolicy;
  /** `legacy` means the existing recordLead owner notice already owns this send. */
  ownerNotification: "legacy" | "send" | "off";
}

export interface InquiryRoute {
  tenantId: string;
  businessName: string;
  customerEmail: string | null;
  ownerEmail: string | null;
  ownerNotification: InquiryRoutingPolicy["ownerNotification"];
  /** The customer can reply to this address when the tenant has one configured. */
  customerReplyTo: string | null;
}

export interface InquiryDeliveryMessage {
  tenantId: string;
  inquiryId: string;
  action: InquiryDeliveryAction;
  capabilityId?: string | null;
  capabilityVersion?: number | null;
  audience: EmailAudience;
  to: string;
  replyTo?: string;
  subject: string;
  options: EmailOptions;
  /** Non-sensitive provider metadata used to correlate signed delivery events. */
  tags?: Record<string, string>;
  /** Stable in Strelva, even when the provider does not expose an idempotency API. */
  idempotencyKey: string;
}

export type InquirySendResult =
  | { status: "accepted"; providerMessageId?: string; acceptedAt?: string }
  | { status: "rejected"; reason: string; retryable: boolean; outcome?: "suppressed" | "bounced" | "failed" }
  | { status: "unknown"; reason: string };

export type InquiryVerificationResult =
  | { status: "verified"; evidence?: string[] }
  | { status: "bounced"; reason: string; evidence?: string[] }
  | { status: "deferred"; reason: string; retryable: boolean; evidence?: string[] }
  | { status: "failed"; reason: string; retryable: boolean; evidence?: string[] }
  | { status: "unverified"; reason: string; retryable: boolean }
  | { status: "unavailable"; reason: string };

export interface InquiryOutboundTransport {
  send(message: InquiryDeliveryMessage): Promise<InquirySendResult>;
  /** Must only read provider state. It must never send a second message. */
  verify(
    message: InquiryDeliveryMessage,
    acceptance: Extract<InquirySendResult, { status: "accepted" }>,
  ): Promise<InquiryVerificationResult>;
}

export interface InquiryDeliveryCheckpoint {
  inquiryId: string;
  tenantId: string;
  action: InquiryDeliveryAction;
  status:
    | "sending"
    | "accepted"
    | "verified"
    | "delivered"
    | "bounced"
    | "deferred"
    | "suppressed"
    | "accepted_unverified"
    | "failed"
    | "unknown";
  attemptId: string;
  attempts: number;
  startedAt: string;
  acceptedAt?: string;
  providerMessageId?: string;
  /** The exact reply-to address used by the accepted provider message. */
  replyTo?: string;
  verificationEvidence?: string[];
  verificationReason?: string;
  failureReason?: string;
  retryable?: boolean;
  providerOutcome?: "delivered" | "bounced" | "deferred" | "failed" | "suppressed";
  providerEventId?: string;
  /** Provider event time used to ignore stale webhook retries. */
  providerEventAt?: string;
}

export type InquiryDeliveryProviderOutcome = NonNullable<InquiryDeliveryCheckpoint["providerOutcome"]>;

export interface InquiryDeliveryProviderEventInput {
  tenantId: string;
  inquiryId: string;
  action: InquiryDeliveryAction;
  providerMessageId: string;
  providerEventId: string;
  outcome: InquiryDeliveryProviderOutcome;
  at: string;
  reason?: string;
  evidence?: string[];
}

export type InquiryDeliveryProviderEventClaim =
  | { status: "claimed"; token: string }
  | { status: "processing" }
  | { status: "completed" };

export interface InquiryDeliveryReplyState {
  tenantId: string;
  inquiryId: string;
  providerMessageId: string;
  providerEventId: string;
  receivedAt: string;
}

export interface InquiryDeliveryTimelineInput {
  inquiryId: string;
  tenantId: string;
  capabilityId?: string | null;
  type: InquiryTimelineEventType;
  summary: string;
  outcome: "recorded" | "accepted" | "failed" | "blocked";
  at?: string;
  receiptId?: string | null;
  causedByEventId?: string | null;
  actor?: ReceiptActor;
  evidence?: string[];
}

export interface InquiryDeliveryClaim {
  acquired: boolean;
  attemptId?: string;
  checkpoint?: InquiryDeliveryCheckpoint;
  reason?: string;
}

/**
 * This is intentionally narrower than the engine's repository. The engine can
 * adapt its `recordInquiryEvent` method to `appendTimeline`, while this adapter
 * owns only delivery deduplication and accepted-write protection.
 */
export interface InquiryDeliveryStore {
  readonly durable: boolean;
  /** True only when this store can reserve a tenant budget atomically. */
  readonly atomicBudget: boolean;
  getCheckpoint(input: {
    tenantId: string;
    inquiryId: string;
    action: InquiryDeliveryAction;
  }): Promise<InquiryDeliveryCheckpoint | null>;
  beginAttempt(input: {
    inquiryId: string;
    tenantId: string;
    action: InquiryDeliveryAction;
    maxAttempts: number;
    now: string;
    budget: InquiryDeliveryBudgetReservation;
  }): Promise<InquiryDeliveryClaim>;
  markAccepted(input: {
    tenantId: string;
    inquiryId: string;
    action: InquiryDeliveryAction;
    attemptId: string;
    acceptedAt: string;
    providerMessageId?: string;
    replyTo?: string;
  }): Promise<InquiryDeliveryCheckpoint>;
  markVerified(input: {
    tenantId: string;
    inquiryId: string;
    action: InquiryDeliveryAction;
    attemptId: string;
    evidence?: string[];
  }): Promise<InquiryDeliveryCheckpoint>;
  markAcceptedUnverified(input: {
    tenantId: string;
    inquiryId: string;
    action: InquiryDeliveryAction;
    attemptId: string;
    reason: string;
  }): Promise<InquiryDeliveryCheckpoint>;
  markProviderOutcome(input: InquiryDeliveryProviderEventInput): Promise<InquiryDeliveryCheckpoint>;
  /**
   * Distinguish an event being processed from one that was fully committed.
   * A retry seeing an in-flight lease must remain retryable rather than being
   * acknowledged as a duplicate.
   */
  claimProviderEvent(input: { tenantId: string; providerEventId: string }): Promise<InquiryDeliveryProviderEventClaim>;
  /** Mark a successfully applied provider event for the long dedupe window. */
  completeProviderEvent?(input: { tenantId: string; providerEventId: string; claimToken: string }): Promise<void>;
  releaseProviderEvent?(input: { tenantId: string; providerEventId: string; claimToken: string }): Promise<void>;
  findByProviderMessageId(input: { tenantId: string; providerMessageId: string }): Promise<{ inquiryId: string; action: InquiryDeliveryAction } | null>;
  findByReplyAddress(input: { tenantId: string; replyTo: string }): Promise<{ inquiryId: string } | null>;
  findByReplyAddressAny?(input: { replyTo: string }): Promise<{ tenantId: string; inquiryId: string } | null>;
  getReplyState(input: { tenantId: string; inquiryId: string }): Promise<InquiryDeliveryReplyState | null>;
  markReplyReceived(input: InquiryDeliveryReplyState): Promise<InquiryDeliveryReplyState>;
  markFailed(input: {
    tenantId: string;
    inquiryId: string;
    action: InquiryDeliveryAction;
    attemptId: string;
    reason: string;
    retryable: boolean;
    ambiguous?: boolean;
  }): Promise<InquiryDeliveryCheckpoint>;
  releaseAttempt(input: { tenantId: string; inquiryId: string; action: InquiryDeliveryAction; attemptId: string }): Promise<void>;
  appendTimeline(input: InquiryDeliveryTimelineInput): Promise<void>;
  listTimeline?(input: { tenantId: string; inquiryId: string; limit?: number }): Promise<InquiryDeliveryTimelineInput[]>;
}

export interface InquiryDeliveryBudgetReservation {
  /** A tenant-scoped daily reservation, not an in-memory observation. */
  limit: number;
  timezone: string;
  policyVersion: string;
  now: string;
}

export interface InquiryFollowUpRecheck {
  /** The host read this immediately before the delivery claim. */
  checkedAt: string;
  noReply: boolean;
  recipientActive: boolean;
  /** Exact immutable source revision from the current lead/inquiry record. */
  inquiryVersion: string | number;
  capabilityId: string;
  capabilityVersion: number;
  reason?: string;
}

export interface InquiryDeliveryDependencies {
  store?: InquiryDeliveryStore;
  transport?: InquiryOutboundTransport;
  now?: () => Date;
  getPolicy?: (
    tenantId: string,
    inquiry: InquiryDeliverySubmission,
  ) => Promise<PartialInquiryRoutingPolicy | null | undefined>;
  resolveRoute?: (
    inquiry: InquiryDeliverySubmission,
    policy: InquiryRoutingPolicy,
  ) => Promise<InquiryRoute>;
  /**
   * Re-read responsibility, approval and budget state from the host immediately
   * before claiming. The callback is the source of truth when present.
   */
  getResponsibilityGate?: (
    tenantId: string,
    inquiry: InquiryDeliverySubmission,
    action: InquiryDeliveryAction,
    message: InquiryDeliveryMessage,
  ) => Promise<ResponsibilityDeliveryGate | null | undefined>;
  /**
   * Required for scheduled follow-up. The host must check reply state,
   * recipient state and the current inquiry version in one fresh read.
   */
  getFollowUpRecheck?: (
    inquiry: InquiryDeliverySubmission,
    now: string,
  ) => Promise<InquiryFollowUpRecheck | null | undefined>;
  /** Override in tests or a host that deliberately permits a mocked send. */
  allowExternalSends?: boolean;
}

export type PartialInquiryRoutingPolicy =
  & Partial<Omit<InquiryRoutingPolicy, "autoReply" | "followUp">>
  & {
    autoReply?: Partial<InquiryActionPolicy> | null;
    followUp?: Partial<InquiryActionPolicy> | null;
  };

export interface InquiryDeliveryPlanAction {
  action: InquiryDeliveryAction;
  recipient: string | null;
  audience: EmailAudience;
  mode: InquiryDeliveryMode;
  dueAt: string;
  expiresAt: string;
  status: "ready" | "awaiting_approval" | "not_due" | "disabled" | "unavailable";
  reason?: string;
}

export interface InquiryDeliveryPlan {
  inquiryId: string;
  tenantId: string;
  businessName: string;
  route: InquiryRoute;
  policy: InquiryRoutingPolicy;
  actions: InquiryDeliveryPlanAction[];
}

export interface InquiryDeliveryResult {
  inquiryId: string;
  tenantId: string;
  action: InquiryDeliveryAction;
  status: InquiryDeliveryStatus;
  reason?: string;
  attemptId?: string;
  acceptedAt?: string;
  providerMessageId?: string;
  verificationEvidence?: string[];
  dueAt?: string;
  expiresAt?: string;
  /** True only when the provider accepted but no duplicate-safe marker exists. */
  retryable: boolean;
  timelinePersisted?: boolean;
}

export interface ResponsibilityDeliveryGate {
  allowed: boolean;
  action: InquiryDeliveryAction;
  evaluation: ResponsibilityEvaluation | null;
  budget?: InquiryDeliveryBudgetReservation;
  /** Optional exact approval produced by the same final responsibility read. */
  approval?: InquiryDeliveryApproval;
  reason?: string;
}

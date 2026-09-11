/**
 * Authenticated inquiry message review facade.
 *
 * A review is represented by one normal governed event. The implementation in
 * `delivery-approval-engine.ts` binds that event to the exact rendered message
 * and delegates the provider write to the existing inquiry delivery adapter.
 * This file keeps the route-facing contract small and gives older inquiry
 * callers a compatibility alias while the workspace surface moves over.
 */

import type { UnifiedEvent } from "@/lib/types";
import type {
  InquiryMessageReviewApproveInput,
  InquiryMessageReviewOutcome,
  InquiryMessageReviewPrepareInput,
  InquiryMessageReviewPreview,
  InquiryMessageReviewService,
} from "./delivery-approval-contract";
import {
  approveInquiryMessageReviewWithDependencies,
  executeInquiryMessageReview,
  getInquiryMessageReviewMetadata,
  INQUIRY_MESSAGE_REVIEW_KIND,
  INQUIRY_MESSAGE_REVIEW_SCHEMA_VERSION,
  InquiryMessageReviewEngineError,
  prepareInquiryMessageReviewWithDependencies,
  reconcileInquiryMessageReview,
  type InquiryMessageReviewDependencies,
  type InquiryMessageReviewEventMetadata,
} from "./delivery-approval-engine";
import type { LeadRecord } from "@/lib/leads";
import type {
  InquiryDeliveryApproval,
  InquiryDeliveryMessage,
  InquiryDeliveryResult,
  InquiryDeliveryStore,
  InquiryDeliverySubmission,
  InquiryOutboundTransport,
  InquiryRoute,
  PartialInquiryRoutingPolicy,
} from "./delivery";
import type { InquiryRepository, InquiryWorkspaceSnapshot } from "./repository";
import { addEvent, getEventsRaw } from "@/lib/events";

export type { InquiryMessageReviewDependencies, InquiryMessageReviewEventMetadata } from "./delivery-approval-engine";
export {
  INQUIRY_MESSAGE_REVIEW_KIND,
  INQUIRY_MESSAGE_REVIEW_SCHEMA_VERSION,
  InquiryMessageReviewEngineError,
  isInquiryMessageReviewEvent,
  getInquiryMessageReviewMetadata,
  executeInquiryMessageReview,
  authorizeInquiryMessageReviewActor,
  reconcileInquiryMessageReview,
} from "./delivery-approval-engine";

/** Legacy name retained for existing inquiry event readers. */
export const INQUIRY_DELIVERY_APPROVAL_KIND = INQUIRY_MESSAGE_REVIEW_KIND;
export const INQUIRY_DELIVERY_APPROVAL_SCHEMA = INQUIRY_MESSAGE_REVIEW_SCHEMA_VERSION;
export type InquiryDeliveryApprovalMetadata = InquiryMessageReviewEventMetadata;
export interface InquiryDeliveryApprovalExecution {
  accepted: boolean;
  verified: boolean;
  receiptPersisted: boolean;
  safeToResolve?: boolean;
  status?: InquiryDeliveryResult["status"];
  delivery?: InquiryDeliveryResult;
  reason?: string;
}
export const InquiryDeliveryApprovalError = InquiryMessageReviewEngineError;

export interface QueueInquiryDeliveryApprovalInput {
  tenantId: string;
  businessId: string;
  actorId: string;
  inquiry: InquiryDeliverySubmission;
  snapshot: InquiryWorkspaceSnapshot;
  recordStatus?: import("./contracts").InquiryRecordStatus;
  routingPolicy?: PartialInquiryRoutingPolicy | null;
  repository?: InquiryRepository;
  resolveRoute?: (inquiry: InquiryDeliverySubmission, policy: ReturnType<typeof import("./delivery").normalizeInquiryRoutingPolicy>) => Promise<InquiryRoute>;
  now?: Date;
  emailReady?: () => Promise<boolean>;
  addApprovalEvent?: typeof addEvent;
  listEvents?: typeof getEventsRaw;
}

export interface QueuedInquiryDeliveryApproval {
  event: UnifiedEvent;
  message: InquiryDeliveryMessage;
  approval: InquiryDeliveryApproval;
  reused: boolean;
}

export interface ExecuteInquiryDeliveryApprovalInput {
  tenantId: string;
  eventId: string;
  event: UnifiedEvent;
  actorId: string;
  repository?: InquiryRepository;
  getLead?: (tenantId: string, inquiryId: string) => Promise<LeadRecord | null>;
  store?: InquiryDeliveryStore;
  transport?: InquiryOutboundTransport;
  resolveRoute?: QueueInquiryDeliveryApprovalInput["resolveRoute"];
  now?: Date;
  allowExternalSends?: boolean;
  emailReady?: () => Promise<boolean>;
}

function dependenciesFor(input: ExecuteInquiryDeliveryApprovalInput): InquiryMessageReviewDependencies {
  return {
    repository: input.repository,
    getLead: input.getLead,
    store: input.store,
    transport: input.transport,
    resolveRoute: input.resolveRoute,
    now: input.now ? () => input.now! : undefined,
    emailReady: input.emailReady ? async () => input.emailReady!() : undefined,
    allowExternalSends: input.allowExternalSends,
  };
}

/** Route-facing prepare operation. */
export async function prepareInquiryMessageReview(
  input: InquiryMessageReviewPrepareInput,
): Promise<InquiryMessageReviewPreview> {
  return registeredService?.prepare(input) ?? prepareInquiryMessageReviewWithDependencies(input);
}

/** Route-facing approval operation. */
export async function approveInquiryMessageReview(
  input: InquiryMessageReviewApproveInput,
): Promise<InquiryMessageReviewOutcome> {
  return registeredService?.approve(input) ?? approveInquiryMessageReviewWithDependencies(input);
}

/** Register an alternate service only for a focused host or test. */
let registeredService: InquiryMessageReviewService | null = null;

export function registerInquiryMessageReviewService(next: InquiryMessageReviewService | null): void {
  registeredService = next;
}

export class InquiryMessageReviewError extends Error {
  constructor(
    message = "The inquiry message review service is unavailable.",
    public readonly code = "delivery_approval_unavailable",
  ) {
    super(message);
    this.name = "InquiryMessageReviewError";
  }
}

/**
 * Keep test/host registration useful without making an in-memory approval
 * record part of production behavior. The default path is the durable engine.
 */
export function currentInquiryMessageReviewService(): InquiryMessageReviewService {
  return registeredService ?? {
    prepare: prepareInquiryMessageReview,
    approve: approveInquiryMessageReview,
  };
}

function legacyApproval(metadata: InquiryMessageReviewEventMetadata, actorId: string): InquiryDeliveryApproval {
  return {
    inquiryId: metadata.inquiryId,
    action: metadata.action,
    actorId,
    policyVersion: metadata.policyVersion,
    messageDigest: metadata.messageDigest,
    capabilityId: metadata.capabilityId,
    capabilityVersion: metadata.capabilityVersion,
    approvedAt: new Date().toISOString(),
    expiresAt: metadata.expiresAt,
    explicit: true,
  };
}

/**
 * Compatibility queue helper for callers that already projected the lead and
 * snapshot. New routes should use `prepareInquiryMessageReview`, which reads
 * both authorities itself before writing the event.
 */
export async function queueInquiryDeliveryApproval(
  input: QueueInquiryDeliveryApprovalInput,
): Promise<QueuedInquiryDeliveryApproval> {
  const inquiryId = input.inquiry.id;
  const getLead = async (): Promise<LeadRecord | null> => ({
    id: input.inquiry.id,
    name: input.inquiry.name,
    email: input.inquiry.email,
    message: input.inquiry.message ?? undefined,
    source: input.inquiry.source ?? undefined,
    fields: input.inquiry.fields,
    capabilityId: input.inquiry.capabilityId ?? undefined,
    capabilityVersion: input.inquiry.capabilityVersion ?? undefined,
    createdAt: input.inquiry.receivedAt,
  });
  const review = await prepareInquiryMessageReviewWithDependencies({
    tenantId: input.tenantId,
    businessId: input.businessId,
    inquiryId,
    action: "reply",
    actorId: input.actorId,
  }, {
    repository: input.repository,
    getLead,
    resolveRoute: input.resolveRoute,
    now: input.now ? () => input.now! : undefined,
    emailReady: input.emailReady ? async () => input.emailReady!() : undefined,
    addApprovalEvent: input.addApprovalEvent,
    listEvents: input.listEvents,
  });
  const events = await (input.listEvents ?? getEventsRaw)(input.tenantId, { limit: 1_000 });
  const event = events.find((item) => getInquiryMessageReviewMetadata(item)?.messageDigest === review.messageDigest) ?? null;
  if (!event) {
    throw new InquiryMessageReviewError("The approval event could not be read after preparation.", "persistence_unavailable");
  }
  const metadata = getInquiryMessageReviewMetadata(event);
  const message: InquiryDeliveryMessage = {
    tenantId: input.tenantId,
    inquiryId,
    action: "reply",
    capabilityId: review.capabilityId,
    capabilityVersion: review.capabilityVersion,
    audience: "customer",
    to: review.recipient,
    ...(metadata?.replyTo ? { replyTo: metadata.replyTo } : {}),
    subject: review.subject,
    options: { preheader: review.subject, heading: review.subject, paragraphs: [review.body] },
    idempotencyKey: `inquiry:${inquiryId}:reply`,
  };
  return {
    event,
    message,
    approval: metadata ? legacyApproval(metadata, input.actorId) : {
      inquiryId,
      action: "reply",
      actorId: input.actorId,
      policyVersion: review.policyVersion,
      messageDigest: review.messageDigest,
      capabilityId: review.capabilityId,
      capabilityVersion: review.capabilityVersion,
      approvedAt: new Date().toISOString(),
      expiresAt: review.expiresAt,
      explicit: true,
    },
    reused: false,
  };
}

export async function executeInquiryDeliveryApproval(
  input: ExecuteInquiryDeliveryApprovalInput,
): Promise<InquiryDeliveryApprovalExecution> {
  const result = await executeInquiryMessageReview({
    tenantId: input.tenantId,
    eventId: input.eventId,
    event: input.event,
    actorId: input.actorId,
    deps: dependenciesFor(input),
  });
  const metadata = getInquiryMessageReviewMetadata(input.event);
  return {
    accepted: result.accepted,
    verified: result.verified,
    receiptPersisted: result.receiptPersisted,
    safeToResolve: result.safeToResolve,
    status: result.status,
    delivery: metadata ? {
      inquiryId: metadata.inquiryId,
      tenantId: input.tenantId,
      action: metadata.action,
      status: result.status,
      reason: result.reason,
      acceptedAt: result.acceptedAt,
      providerMessageId: result.providerMessageId,
      verificationEvidence: result.verificationEvidence,
      retryable: false,
    } : undefined,
    reason: result.reason,
  };
}

export async function reconcileInquiryDeliveryApproval(
  input: ExecuteInquiryDeliveryApprovalInput,
): Promise<InquiryDeliveryApprovalExecution> {
  const result = await reconcileInquiryMessageReview({
    tenantId: input.tenantId,
    event: input.event,
    actorId: input.actorId,
    deps: dependenciesFor(input),
  });
  const metadata = getInquiryMessageReviewMetadata(input.event);
  return {
    accepted: result.accepted,
    verified: result.verified,
    receiptPersisted: result.receiptPersisted,
    safeToResolve: result.safeToResolve,
    status: result.status,
    delivery: metadata ? {
      inquiryId: metadata.inquiryId,
      tenantId: input.tenantId,
      action: metadata.action,
      status: result.status,
      reason: result.reason,
      retryable: false,
    } : undefined,
    reason: result.reason,
  };
}

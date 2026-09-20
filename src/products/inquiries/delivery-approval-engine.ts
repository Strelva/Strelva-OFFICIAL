import { addEvent, getEventsRaw, resolveEvent } from "@/lib/events";
import { getLeadById, type LeadRecord } from "@/lib/leads";
import type { UnifiedEvent } from "@/lib/types";

import type {
  InquiryCapabilityDefinition,
  InquiryCapabilityState,
  InquiryEngineState,
  InquiryRecordStatus,
  ResponsibilityAction,
  ResponsibilityEvaluation,
  ResponsibilityPolicy,
} from "./contracts";
import { InquiryEngine } from "./inquiry-engine";
import {
  createEmailInquiryTransport,
  createInquiryDeliveryMessage,
  createRedisInquiryDeliveryStore,
  deliverInquiryAction,
  evaluateInquiryDelivery,
  getInquiryDeliveryMessageDigest,
  normalizeInquiryRoutingPolicy,
  renderInquiryMessage,
  resolveInquiryRoute,
} from "./delivery";
import type {
  InquiryDeliveryAction,
  InquiryDeliveryCheckpoint,
  InquiryDeliveryDependencies,
  InquiryDeliveryMessage,
  InquiryDeliveryResult,
  InquiryDeliveryStore,
  InquiryOutboundTransport,
  InquiryRoutingPolicy,
  InquiryRoute,
  InquiryDeliverySubmission,
  ResponsibilityDeliveryGate,
} from "./delivery";
import { inquiryEmailReadiness } from "./email-consent";
import { stateForReceive } from "./receive";
import type {
  InquiryMessageReviewAction,
  InquiryMessageReviewExecution,
  InquiryMessageReviewReconciliation,
  InquiryMessageReviewOutcome,
  InquiryMessageReviewPreview,
  InquiryMessageReviewPrepareInput,
  InquiryMessageReviewApproveInput,
} from "./delivery-approval-contract";
import {
  INQUIRY_MESSAGE_REVIEW_KIND,
  INQUIRY_MESSAGE_REVIEW_SCHEMA_VERSION,
  InquiryMessageReviewEngineError,
  type InquiryMessageReviewEventMetadata,
  assertOpenInquiry,
  assertResponsibilitySponsor,
  dependency,
  errorCode,
  errorMessage,
  hash,
  inquiryFromLead,
  policyVersionFor,
  positiveVersion,
  recordFromLead,
  responsibilityActionFor,
  reviewAction,
  statusFromState,
  text,
  throwCode,
  tokenFor,
} from "./delivery-approval-primitives";

type AddApprovalEvent = typeof addEvent;
type ListApprovalEvents = typeof getEventsRaw;
type GetLead = (tenantId: string, inquiryId: string) => Promise<LeadRecord | null>;
type ResolveApprovalAction = (
  tenantId: string,
  eventId: string,
  action: "approved" | "dismissed",
  actorId: string,
) => Promise<{ changed: boolean; reason?: string }>;
type ResolveRoute = (
  inquiry: InquiryDeliverySubmission,
  policy: InquiryRoutingPolicy,
) => Promise<InquiryRoute>;

export interface InquiryMessageReviewDependencies {
  repository?: import("./repository").InquiryRepository;
  store?: InquiryDeliveryStore;
  transport?: InquiryOutboundTransport;
  now?: () => Date;
  addApprovalEvent?: AddApprovalEvent;
  listEvents?: ListApprovalEvents;
  getLead?: GetLead;
  resolveRoute?: ResolveRoute;
  resolveAction?: ResolveApprovalAction;
  emailReady?: (tenantId: string) => Promise<boolean>;
  allowExternalSends?: boolean;
  /** Test/host seam for the durable workspace exit authority. */
  isWorkspaceExited?: (tenantId: string) => Promise<boolean>;
}

interface ReviewContext {
  snapshot: import("./repository").InquiryWorkspaceSnapshot;
  lead: LeadRecord;
  inquiry: InquiryDeliverySubmission;
  capability: InquiryCapabilityState;
  definition: InquiryCapabilityDefinition;
  responsibility: ResponsibilityPolicy;
  responsibilityAction: ResponsibilityAction;
  policy: InquiryRoutingPolicy;
  route: InquiryRoute;
  message: InquiryDeliveryMessage;
  messageBody: string;
  messageDigest: string;
  evaluation: ResponsibilityEvaluation;
  deliveryEvaluation: InquiryDeliveryResult;
  status: InquiryRecordStatus;
}

async function repositoryFor(deps: InquiryMessageReviewDependencies): Promise<import("./repository").InquiryRepository> {
  if (deps.repository) return deps.repository;
  const repository = await import("./repository");
  return repository.getInquiryRepository();
}

function policyFor(
  definition: InquiryCapabilityDefinition,
  responsibility: ResponsibilityPolicy,
  action?: InquiryMessageReviewAction,
): InquiryRoutingPolicy {
  const followUp = definition.followUp;
  return normalizeInquiryRoutingPolicy({
    version: policyVersionFor(responsibility),
    paused: false,
    autoReply: {
      mode: "approval",
      enabled: true,
      delayHours: 0,
      budgetHours: 24,
      maxAttempts: 1,
    },
    followUp: followUp
      ? {
          mode: "approval",
          enabled: true,
          delayHours: followUp.afterMinutes / 60,
          budgetHours: Math.max(24, followUp.afterMinutes / 60 + 24),
          maxAttempts: followUp.maxAttempts,
          messageTemplate: followUp.messageTemplate,
        }
      : {
          mode: "off",
          enabled: false,
          delayHours: 0,
          budgetHours: 24,
          maxAttempts: 1,
        },
    // The capture path may send a legacy notice, but an explicit review action
    // is its own governed message. It is enabled only while building the owner
    // notification preview, so reply/follow-up previews cannot duplicate it.
    ownerNotification: action === "owner_notification" ? "send" : "legacy",
  });
}

async function readyForEmail(
  tenantId: string,
  definition: InquiryCapabilityDefinition,
  deps: InquiryMessageReviewDependencies,
): Promise<void> {
  const connection = definition.connections.find((item) => item.provider === "email");
  if (!connection || connection.status !== "connected" || connection.consent !== "explicit") {
    throwCode("delivery_unavailable", "Email permission is not connected for this inquiry capability.");
  }
  const ready = await dependency(deps.emailReady, async (id: string) => inquiryEmailReadiness(id))(tenantId);
  if (!ready) throwCode("delivery_unavailable", "Strelva email delivery is unavailable for this business.");
}

async function snapshotFor(
  tenantId: string,
  businessId: string,
  deps: InquiryMessageReviewDependencies,
): Promise<import("./repository").InquiryWorkspaceSnapshot> {
  const repository = await repositoryFor(deps);
  let snapshot: import("./repository").InquiryWorkspaceSnapshot | null;
  try {
    snapshot = await repository.getSnapshot(tenantId, businessId);
  } catch (error) {
    throw new InquiryMessageReviewEngineError(errorMessage(error, "The inquiry workspace could not be read."), "persistence_unavailable");
  }
  if (!snapshot) throwCode("persistence_unavailable", "The inquiry workspace is unavailable.");
  if (snapshot.tenantId !== tenantId || snapshot.businessId !== businessId) {
    throwCode("permission_denied", "This inquiry does not belong to the selected business.");
  }
  return snapshot;
}

async function overlayStatus(
  tenantId: string,
  businessId: string,
  inquiryId: string,
  state: InquiryEngineState,
  deps: InquiryMessageReviewDependencies,
): Promise<InquiryRecordStatus> {
  const repository = await repositoryFor(deps);
  try {
    const overlays = await repository.getRecordOverlays(tenantId, businessId, [inquiryId]);
    return statusFromState(state, inquiryId, overlays[0]?.status ?? "new");
  } catch (error) {
    throw new InquiryMessageReviewEngineError(errorMessage(error, "Inquiry status could not be read."), "persistence_unavailable");
  }
}

function responsibilityFor(
  state: InquiryEngineState,
  capabilityId: string,
  expectedId?: string,
): ResponsibilityPolicy {
  const candidates = state.responsibilities
    .filter((item) => item.capabilityId === capabilityId && (!expectedId || item.id === expectedId))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const responsibility = candidates[0];
  if (!responsibility) throwCode("current_policy_unavailable", "The current inquiry responsibility is unavailable.");
  return responsibility;
}

function assertCapability(
  snapshot: import("./repository").InquiryWorkspaceSnapshot,
  lead: LeadRecord,
): { capability: InquiryCapabilityState; definition: InquiryCapabilityDefinition } {
  const capabilityId = typeof lead.capabilityId === "string" ? lead.capabilityId.trim() : "";
  const version = lead.capabilityVersion;
  const capability = snapshot.state.capabilities.find((item) => item.id === capabilityId);
  if (!capability?.live || capability.status !== "live" || !Number.isSafeInteger(version) || capability.live.version !== version) {
    throwCode("inquiry_changed", "This inquiry was created from an older capability version. Refresh before preparing a message.");
  }
  return { capability, definition: capability.live };
}

function assertEventBinding(
  context: ReviewContext,
  metadata: InquiryMessageReviewEventMetadata,
): void {
  if (
    context.responsibility.id !== metadata.responsibilityId ||
    context.responsibility.updatedAt !== metadata.responsibilityRevision ||
    context.policy.version !== metadata.policyVersion
  ) throwCode("policy_changed", "The current responsibility policy changed. Prepare a fresh review.");
  if (
    context.capability.id !== metadata.capabilityId ||
    context.definition.version !== metadata.capabilityVersion ||
    context.inquiry.inquiryVersion !== metadata.inquiryVersion
  ) throwCode("inquiry_changed", "This inquiry changed. Prepare a fresh review before sending.");
  if (
    context.messageDigest !== metadata.messageDigest ||
    context.message.to !== metadata.recipient ||
    (context.message.replyTo ?? null) !== metadata.replyTo ||
    context.message.subject !== metadata.subject ||
    context.messageBody !== metadata.messageBody
  ) throwCode("message_mismatch", "The reviewed message changed. Prepare a fresh review before sending.");
}

async function buildContext(input: {
  tenantId: string;
  businessId: string;
  inquiryId: string;
  action: InquiryMessageReviewAction;
  actorId: string;
  responsibilityId?: string;
  expectedResponsibilityRevision?: string;
  expectedPolicyVersion?: string;
  deps: InquiryMessageReviewDependencies;
  now: Date;
}): Promise<ReviewContext> {
  const snapshot = await snapshotFor(input.tenantId, input.businessId, input.deps);
  const lead = await dependency(input.deps.getLead, getLeadById)(input.tenantId, input.inquiryId);
  if (!lead) throwCode("inquiry_not_found", "Inquiry record unavailable.");
  const { capability, definition } = assertCapability(snapshot, lead);
  await readyForEmail(input.tenantId, definition, input.deps);
  const status = await overlayStatus(input.tenantId, input.businessId, input.inquiryId, snapshot.state, input.deps);
  assertOpenInquiry(status);
  const responsibility = responsibilityFor(snapshot.state, capability.id, input.responsibilityId);
  if (responsibility.businessId !== input.businessId) throwCode("permission_denied", "This responsibility belongs to another business.");
  assertResponsibilitySponsor(responsibility, input.actorId);
  if (input.expectedResponsibilityRevision && responsibility.updatedAt !== input.expectedResponsibilityRevision) {
    throwCode("policy_changed", "The current responsibility policy changed. Prepare a fresh review.");
  }
  const inquiry = inquiryFromLead(input.tenantId, lead, definition);
  const policy = policyFor(definition, responsibility, input.action);
  if (input.expectedPolicyVersion && policy.version !== input.expectedPolicyVersion) {
    throwCode("policy_changed", "The current responsibility policy changed. Prepare a fresh review.");
  }
  const routeResolver = dependency(input.deps.resolveRoute, resolveInquiryRoute);
  let route: InquiryRoute;
  try {
    route = await routeResolver(inquiry, policy);
  } catch (error) {
    throw new InquiryMessageReviewEngineError(errorMessage(error, "The inquiry recipient could not be resolved."), "recipient_route_changed");
  }
  const message = createInquiryDeliveryMessage(inquiry, route, input.action);
  if (!message) throwCode("recipient_unavailable", "A permitted inquiry recipient is not configured.");
  const messageBody = renderInquiryMessage(message).text;
  const messageDigest = getInquiryDeliveryMessageDigest(message);
  const record = recordFromLead(snapshot.state, capability, lead, status);
  const state = stateForReceive(snapshot);
  state.inquiries = [...state.inquiries.filter((item) => item.id !== record.id), record];
  let evaluation: ResponsibilityEvaluation;
  try {
    const engine = new InquiryEngine({ businessId: input.businessId, state, now: () => input.now.toISOString() });
    evaluation = engine.evaluateResponsibilityAction(responsibility.id, responsibilityActionFor(input.action), {
      at: input.now.toISOString(),
      messageBody,
    });
  } catch (error) {
    throw new InquiryMessageReviewEngineError(errorMessage(error, "The current inquiry responsibility could not be evaluated."), "current_policy_unavailable");
  }
  if (evaluation.decision === "block") {
    throwCode("delivery_unavailable", evaluation.reason || "The current responsibility blocks this message.");
  }
  const deliveryEvaluation = evaluateInquiryDelivery(inquiry, input.action, policy, null, input.now, messageDigest);
  if (deliveryEvaluation.status !== "awaiting_approval" && deliveryEvaluation.status !== "ready") {
    throwCode("delivery_unavailable", deliveryEvaluation.reason || "The message is not ready for approval.");
  }
  return {
    snapshot,
    lead,
    inquiry,
    capability,
    definition,
    responsibility,
    responsibilityAction: responsibilityActionFor(input.action),
    policy,
    route,
    message,
    messageBody,
    messageDigest,
    evaluation,
    deliveryEvaluation,
    status,
  };
}

function metadataFor(
  context: ReviewContext,
  actorId: string,
  now: Date,
): Omit<InquiryMessageReviewEventMetadata, "reviewTokenHash"> {
  return {
    kind: INQUIRY_MESSAGE_REVIEW_KIND,
    schemaVersion: INQUIRY_MESSAGE_REVIEW_SCHEMA_VERSION,
    tenantId: context.snapshot.tenantId,
    businessId: context.snapshot.businessId,
    inquiryId: context.inquiry.id,
    action: reviewAction(context.message.action),
    requestedBy: actorId,
    responsibilityId: context.responsibility.id,
    responsibilityRevision: context.responsibility.updatedAt,
    capabilityId: context.capability.id,
    capabilityVersion: context.definition.version,
    inquiryVersion: String(context.inquiry.inquiryVersion ?? context.lead.id),
    policyVersion: context.policy.version,
    recipient: context.message.to,
    replyTo: context.message.replyTo ?? null,
    subject: context.message.subject,
    messageBody: context.messageBody,
    messageDigest: context.messageDigest,
    preparedAt: now.toISOString(),
    expiresAt: context.deliveryEvaluation.expiresAt ?? null,
    reviewAudience: "owner",
  };
}

function metadataFromEvent(event: UnifiedEvent): InquiryMessageReviewEventMetadata | null {
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

function previewFromEvent(event: UnifiedEvent, metadata: InquiryMessageReviewEventMetadata, actorId: string): InquiryMessageReviewPreview {
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

async function eventsFor(
  tenantId: string,
  deps: InquiryMessageReviewDependencies,
): Promise<UnifiedEvent[]> {
  try {
    return await dependency(deps.listEvents, getEventsRaw)(tenantId, { limit: 1_000 });
  } catch (error) {
    throw new InquiryMessageReviewEngineError(errorMessage(error, "The approval queue could not be read."), "persistence_unavailable");
  }
}

export async function prepareInquiryMessageReviewWithDependencies(
  input: InquiryMessageReviewPrepareInput,
  deps: InquiryMessageReviewDependencies = {},
): Promise<InquiryMessageReviewPreview> {
  const actorId = text(input.actorId, "Actor id", 256);
  const businessId = text(input.businessId, "Business id", 160);
  const inquiryId = text(input.inquiryId, "Inquiry id", 256);
  const action = reviewAction(input.action);
  const now = dependency(deps.now, () => new Date())();
  const tenantId = text(input.tenantId, "Tenant id", 80);
  const context = await buildContext({ tenantId, businessId, inquiryId, action, actorId, deps, now });
  const baseMetadata = metadataFor(context, actorId, now);
  const reviewToken = tokenFor(baseMetadata, actorId);
  const metadata: InquiryMessageReviewEventMetadata = { ...baseMetadata, reviewTokenHash: hash(reviewToken) };
  const events = await eventsFor(tenantId, deps);
  const matching = events.find((event) => {
    const candidate = metadataFromEvent(event);
    return event.status === "pending" && candidate && event.tenantId === tenantId &&
      candidate.businessId === businessId && candidate.inquiryId === inquiryId && candidate.action === action &&
      candidate.requestedBy === actorId && candidate.messageDigest === metadata.messageDigest &&
      candidate.policyVersion === metadata.policyVersion;
  });
  if (matching) {
    const existing = metadataFromEvent(matching);
    if (existing) return previewFromEvent(matching, existing, actorId);
  }

  // A fresh review supersedes an older rendered message for this inquiry and
  // action. Dismissing the stale event keeps an old body from being approved
  // after a capability, policy, or route change.
  await Promise.all(events.filter((event) => {
    const candidate = metadataFromEvent(event);
    return event.status === "pending" && candidate && event.tenantId === tenantId &&
      candidate.businessId === businessId && candidate.inquiryId === inquiryId && candidate.action === action &&
      candidate.requestedBy === actorId && candidate.messageDigest !== metadata.messageDigest;
  }).map((event) => resolveEvent(event.id, "dismissed", { actor: "system-review-refresh" }).catch(() => null)));

  const created = await dependency(deps.addApprovalEvent, addEvent)({
    tenantId,
    source: "ai",
    type: "change_request",
    title: action === "schedule_follow_up"
      ? "Approve inquiry follow-up"
      : action === "owner_notification"
        ? "Approve inquiry staff notice"
        : "Approve inquiry reply",
    body: context.messageBody,
    status: "pending",
    metadata: metadata as unknown as Record<string, unknown>,
  }, { requirePersistence: true });
  return previewFromEvent(created, metadata, actorId);
}

function checkpointAccepted(checkpoint: InquiryDeliveryCheckpoint | null): boolean {
  if (!checkpoint) return false;
  return Boolean(
    checkpoint.acceptedAt || checkpoint.providerMessageId ||
    checkpoint.status === "accepted" || checkpoint.status === "accepted_unverified" ||
    checkpoint.status === "verified" || checkpoint.status === "delivered" ||
    checkpoint.status === "bounced" || checkpoint.status === "deferred" ||
    checkpoint.status === "suppressed" ||
    (checkpoint.status === "failed" && checkpoint.providerOutcome),
  );
}

function outcomeFromCheckpoint(
  checkpoint: InquiryDeliveryCheckpoint | null,
  inquiryId: string,
  action: InquiryMessageReviewAction,
  fallback?: { status?: InquiryDeliveryResult["status"]; reason?: string },
): InquiryMessageReviewOutcome {
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
  return {
    inquiryId,
    action,
    status: outputStatus,
    ...(checkpoint?.failureReason || checkpoint?.verificationReason || fallback?.reason ? { reason: checkpoint?.failureReason || checkpoint?.verificationReason || fallback?.reason } : {}),
    ...(checkpoint?.acceptedAt ? { acceptedAt: checkpoint.acceptedAt } : {}),
    ...(checkpoint?.providerMessageId ? { providerMessageId: checkpoint.providerMessageId } : {}),
    ...(checkpoint?.verificationEvidence ? { verificationEvidence: checkpoint.verificationEvidence } : {}),
    retryable: outputStatus === "failed" ? Boolean(checkpoint?.retryable) : false,
  };
}

function approvalEventMatches(
  event: UnifiedEvent,
  tenantId: string,
  input: InquiryMessageReviewApproveInput,
  actorId: string,
): InquiryMessageReviewEventMetadata | null {
  const metadata = metadataFromEvent(event);
  if (!metadata || event.tenantId !== tenantId || metadata.businessId !== input.businessId || metadata.inquiryId !== input.inquiryId || metadata.action !== input.action) return null;
  if (metadata.requestedBy !== actorId) return metadata;
  if (metadata.messageDigest !== input.messageDigest) return metadata;
  if (hash(input.reviewToken) !== metadata.reviewTokenHash) return metadata;
  return metadata;
}

function outcomeError(result: { changed: boolean; reason?: string }): InquiryMessageReviewEngineError {
  const reason = result.reason || "delivery_approval_failed";
  const known = new Set(["policy_changed", "inquiry_changed", "recipient_route_changed", "message_mismatch", "approval_required", "permission_denied", "review_expired", "review_revoked"]);
  return new InquiryMessageReviewEngineError(reason, known.has(reason) ? reason : "delivery_unavailable");
}

export async function approveInquiryMessageReviewWithDependencies(
  input: InquiryMessageReviewApproveInput,
  deps: InquiryMessageReviewDependencies = {},
): Promise<InquiryMessageReviewOutcome> {
  const actorId = text(input.actorId, "Actor id", 256);
  const tenantId = text(input.tenantId, "Tenant id", 80);
  const businessId = text(input.businessId, "Business id", 160);
  const inquiryId = text(input.inquiryId, "Inquiry id", 256);
  const action = reviewAction(input.action);
  const suppliedToken = text(input.reviewToken, "Review token", 512);
  const suppliedDigest = text(input.messageDigest, "Message digest", 128).toLowerCase();
  if (!/^[a-f0-9]{32,128}$/.test(suppliedDigest)) throwCode("message_mismatch", "The reviewed message digest is invalid.");
  const events = await eventsFor(tenantId, deps);
  const candidate = events.find((event) => {
    const metadata = approvalEventMatches(event, tenantId, { ...input, tenantId, businessId, inquiryId, action, reviewToken: suppliedToken, messageDigest: suppliedDigest }, actorId);
    return Boolean(metadata && metadata.requestedBy === actorId && metadata.messageDigest === suppliedDigest && hash(suppliedToken) === metadata.reviewTokenHash);
  });
  const sameScope = events.find((event) => {
    const metadata = metadataFromEvent(event);
    return metadata && event.tenantId === tenantId && metadata.businessId === businessId && metadata.inquiryId === inquiryId && metadata.action === action;
  });
  if (!candidate) {
    if (sameScope) {
      const metadata = metadataFromEvent(sameScope);
      if (metadata && metadata.requestedBy !== actorId) throwCode("permission_denied", "Only the person who sponsors this responsibility can approve the message.");
      if (metadata && metadata.messageDigest !== suppliedDigest) throwCode("message_mismatch", "The reviewed message changed. Prepare a fresh review before sending.");
    }
    throwCode("review_revoked", "This message review is no longer valid. Prepare a fresh review.");
  }
  const metadata = metadataFromEvent(candidate);
  if (!metadata) throwCode("review_revoked", "This message review is no longer valid.");
  if (candidate.status === "approved") {
    const store = dependency(deps.store, createRedisInquiryDeliveryStore());
    const checkpoint = await store.getCheckpoint({ tenantId, inquiryId, action });
    return outcomeFromCheckpoint(checkpoint, inquiryId, action, { status: "unavailable", reason: "approval_already_resolved" });
  }
  if (candidate.status !== "pending") throwCode("review_revoked", "This message review was revoked. Prepare a fresh review.");
  const resolveAction = deps.resolveAction ?? (async (id, eventId, eventAction, actor) => {
    const eventActions = await import("@/lib/event-actions");
    return eventActions.resolveEventAction(id, eventId, eventAction, actor);
  });
  const result = await resolveAction(tenantId, candidate.id, "approved", actorId);
  const store = dependency(deps.store, createRedisInquiryDeliveryStore());
  const checkpoint = await store.getCheckpoint({ tenantId, inquiryId, action }).catch(() => null);
  if (checkpointAccepted(checkpoint)) {
    return outcomeFromCheckpoint(
      checkpoint,
      inquiryId,
      action,
      result.changed
        ? { status: "unavailable", reason: result.reason }
        : { status: "reconciliation_required", reason: result.reason },
    );
  }
  if (!result.changed) throw outcomeError(result);
  return outcomeFromCheckpoint(checkpoint, inquiryId, action, { status: "unavailable", reason: "delivery_outcome_unavailable" });
}

function approvedGate(
  action: InquiryDeliveryAction,
  evaluation: ResponsibilityEvaluation,
  policy: ResponsibilityPolicy,
  now: Date,
): ResponsibilityDeliveryGate {
  if (evaluation.decision === "block") {
    return { allowed: false, action, evaluation, reason: evaluation.reason };
  }
  return {
    allowed: true,
    action,
    evaluation,
    budget: {
      limit: Math.floor(policy.budget.dailyMessages),
      timezone: policy.budget.timezone,
      policyVersion: policy.id,
      now: now.toISOString(),
    },
  };
}

async function checkpointFor(
  store: InquiryDeliveryStore,
  tenantId: string,
  inquiryId: string,
  action: InquiryDeliveryAction,
): Promise<InquiryDeliveryCheckpoint | null> {
  try {
    return await store.getCheckpoint({ tenantId, inquiryId, action });
  } catch {
    return null;
  }
}

async function persistVerifiedReceipt(input: {
  context: ReviewContext;
  metadata: InquiryMessageReviewEventMetadata;
  providerResult: InquiryDeliveryResult;
  deps: InquiryMessageReviewDependencies;
}): Promise<boolean> {
  const repository = await repositoryFor(input.deps);
  const idempotencyKey = `inquiry-delivery:${input.metadata.inquiryId}:${input.metadata.action}:${input.metadata.messageDigest}`;
  let snapshot = input.context.snapshot;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      try {
        const current = await repository.getSnapshot(snapshot.tenantId, snapshot.businessId);
        if (!current) return false;
        snapshot = current;
      } catch {
        return false;
      }
    }
    const existing = snapshot.state.responsibilityReceipts.find((receipt) => receipt.responsibilityId === input.metadata.responsibilityId && receipt.idempotencyKey === idempotencyKey);
    if (existing) return existing.status === "accepted";
    const currentResponsibility = snapshot.state.responsibilities.find((item) => item.id === input.metadata.responsibilityId);
    if (!currentResponsibility || currentResponsibility.sponsorId !== input.metadata.requestedBy) return false;
    const record = recordFromLead(snapshot.state, input.context.capability, input.context.lead, input.context.status);
    const state = stateForReceive(snapshot);
    state.inquiries = [...state.inquiries.filter((item) => item.id !== record.id), record];
    let receipt: import("./contracts").ResponsibilityActionReceipt;
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
      return false;
    }
    if (receipt.status !== "accepted" || !updatedState) return false;
    try {
      const saved = await repository.compareAndSwap({
        tenantId: snapshot.tenantId,
        businessId: snapshot.businessId,
        expectedRevision: snapshot.revision,
        state: updatedState,
        actorId: input.metadata.requestedBy,
      });
      if (saved.changed) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function executeInquiryMessageReview(
  input: {
    tenantId: string;
    eventId: string;
    event: UnifiedEvent;
    actorId: string;
    deps?: InquiryMessageReviewDependencies;
  },
): Promise<InquiryMessageReviewExecution> {
  const deps = input.deps ?? {};
  const metadata = metadataFromEvent(input.event);
  if (!metadata) return { accepted: false, safeToResolve: false, receiptPersisted: false, verified: false, status: "unavailable", reason: "review_revoked" };
  if (input.event.tenantId !== input.tenantId) return { accepted: false, safeToResolve: false, receiptPersisted: false, verified: false, status: "unavailable", reason: "wrong_tenant" };
  const now = dependency(deps.now, () => new Date())();
  let context: ReviewContext;
  try {
    context = await buildContext({
      tenantId: input.tenantId,
      businessId: metadata.businessId,
      inquiryId: metadata.inquiryId,
      action: metadata.action,
      actorId: input.actorId,
      responsibilityId: metadata.responsibilityId,
      expectedResponsibilityRevision: metadata.responsibilityRevision,
      expectedPolicyVersion: metadata.policyVersion,
      deps,
      now,
    });
    assertEventBinding(context, metadata);
  } catch (error) {
    return {
      accepted: false,
      safeToResolve: false,
      receiptPersisted: false,
      verified: false,
      status: "unavailable",
      reason: errorCode(error),
    };
  }
  const store = dependency(deps.store, createRedisInquiryDeliveryStore());
  const transport = dependency(deps.transport, createEmailInquiryTransport({ allowExternalSends: deps.allowExternalSends }));
  const approval = {
    inquiryId: metadata.inquiryId,
    action: metadata.action,
    actorId: input.actorId,
    policyVersion: metadata.policyVersion,
    messageDigest: metadata.messageDigest,
    capabilityId: metadata.capabilityId,
    capabilityVersion: metadata.capabilityVersion,
    approvedAt: now.toISOString(),
    expiresAt: metadata.expiresAt,
    explicit: true as const,
  };
  let latestContext: ReviewContext | null = context;
  let recheckReason: string | null = null;
  const deliveryDeps: InquiryDeliveryDependencies = {
    store,
    transport,
    now: () => now,
    resolveRoute: deps.resolveRoute,
    allowExternalSends: deps.allowExternalSends,
    isWorkspaceExited: deps.isWorkspaceExited,
    getPolicy: async () => {
      try {
        latestContext = await buildContext({
          tenantId: input.tenantId,
          businessId: metadata.businessId,
          inquiryId: metadata.inquiryId,
          action: metadata.action,
          actorId: input.actorId,
          responsibilityId: metadata.responsibilityId,
          expectedResponsibilityRevision: metadata.responsibilityRevision,
          expectedPolicyVersion: metadata.policyVersion,
          deps,
          now,
        });
      } catch (error) {
        recheckReason = errorCode(error);
      }
      return latestContext?.policy ?? context.policy;
    },
    getResponsibilityGate: async (_tenantId, _inquiry, action) => {
      if (recheckReason) {
        return { allowed: false, action, evaluation: latestContext?.evaluation ?? context.evaluation, reason: recheckReason };
      }
      try {
        const current = latestContext ?? await buildContext({
          tenantId: input.tenantId,
          businessId: metadata.businessId,
          inquiryId: metadata.inquiryId,
          action: metadata.action,
          actorId: input.actorId,
          responsibilityId: metadata.responsibilityId,
          expectedResponsibilityRevision: metadata.responsibilityRevision,
          expectedPolicyVersion: metadata.policyVersion,
          deps,
          now,
        });
        assertEventBinding(current, metadata);
        latestContext = current;
        return approvedGate(action, current.evaluation, current.responsibility, now);
      } catch (error) {
        return { allowed: false, action, evaluation: latestContext?.evaluation ?? context.evaluation, reason: errorCode(error) };
      }
    },
  };
  if (metadata.action === "schedule_follow_up") {
    deliveryDeps.getFollowUpRecheck = async (inquiry, checkedAt) => {
      const reply = await store.getReplyState({ tenantId: inquiry.tenantId, inquiryId: inquiry.id }).catch(() => null);
      const recipientActive = Boolean(inquiry.email && inquiry.email.includes("@"));
      return {
        checkedAt,
        noReply: !reply,
        recipientActive,
        inquiryVersion: inquiry.inquiryVersion ?? inquiry.id,
        capabilityId: inquiry.capabilityId ?? "",
        capabilityVersion: inquiry.capabilityVersion ?? 0,
        ...(reply ? { reason: "customer already replied" } : {}),
      };
    };
  }
  let result: InquiryDeliveryResult;
  try {
    result = await deliverInquiryAction(context.inquiry, metadata.action, {
      policy: context.policy,
      approval,
      deps: deliveryDeps,
    });
  } catch (error) {
    return { accepted: false, safeToResolve: false, receiptPersisted: false, verified: false, status: "unavailable", reason: errorCode(error) };
  }
  const checkpoint = await checkpointFor(store, input.tenantId, metadata.inquiryId, metadata.action);
  const providerAccepted = checkpointAccepted(checkpoint) || Boolean(result.acceptedAt || result.providerMessageId);
  if (!providerAccepted) {
    return {
      accepted: false,
      safeToResolve: false,
      receiptPersisted: false,
      verified: false,
      status: result.status,
      reason: result.reason,
      acceptedAt: result.acceptedAt,
      providerMessageId: result.providerMessageId,
      verificationEvidence: result.verificationEvidence,
    };
  }
  const markerDurable = Boolean(checkpoint) && checkpointAccepted(checkpoint);
  const verified = result.status === "verified" || result.status === "delivered" || checkpoint?.status === "verified" || checkpoint?.status === "delivered";
  let receiptPersisted = true;
  if (verified) {
    receiptPersisted = await persistVerifiedReceipt({ context: latestContext ?? context, metadata, providerResult: result, deps });
  }
  const safeToResolve = markerDurable && (!verified || receiptPersisted);
  return {
    accepted: true,
    safeToResolve,
    receiptPersisted,
    verified,
    status: result.status,
    reason: result.reason,
    acceptedAt: result.acceptedAt || checkpoint?.acceptedAt,
    providerMessageId: result.providerMessageId || checkpoint?.providerMessageId,
    verificationEvidence: result.verificationEvidence || checkpoint?.verificationEvidence,
  };
}

export async function authorizeInquiryMessageReviewActor(input: {
  tenantId: string;
  event: UnifiedEvent;
  actorId: string;
  deps?: InquiryMessageReviewDependencies;
}): Promise<{ allowed: boolean; reason?: string }> {
  const metadata = metadataFromEvent(input.event);
  if (!metadata || input.event.tenantId !== input.tenantId) return { allowed: false, reason: "wrong_tenant" };
  try {
    const context = await buildContext({
      tenantId: input.tenantId,
      businessId: metadata.businessId,
      inquiryId: metadata.inquiryId,
      action: metadata.action,
      actorId: input.actorId,
      responsibilityId: metadata.responsibilityId,
      expectedResponsibilityRevision: metadata.responsibilityRevision,
      expectedPolicyVersion: metadata.policyVersion,
      deps: input.deps ?? {},
      now: dependency(input.deps?.now, () => new Date())(),
    });
    assertEventBinding(context, metadata);
    return { allowed: true };
  } catch (error) {
    return { allowed: false, reason: errorCode(error) };
  }
}

export async function reconcileInquiryMessageReview(input: {
  tenantId: string;
  event: UnifiedEvent;
  actorId: string;
  deps?: InquiryMessageReviewDependencies;
}): Promise<InquiryMessageReviewReconciliation> {
  const deps = input.deps ?? {};
  const metadata = metadataFromEvent(input.event);
  if (!metadata || input.event.tenantId !== input.tenantId) return { accepted: false, safeToResolve: false, receiptPersisted: false, verified: false, status: "unavailable", reason: "wrong_tenant" };
  const store = dependency(deps.store, createRedisInquiryDeliveryStore());
  const checkpoint = await checkpointFor(store, input.tenantId, metadata.inquiryId, metadata.action);
  if (!checkpointAccepted(checkpoint)) {
    return { accepted: false, safeToResolve: false, receiptPersisted: false, verified: false, status: checkpoint?.status === "unknown" || checkpoint?.status === "sending" ? "reconciliation_required" : "unavailable", reason: "delivery_acceptance_unavailable" };
  }
  const verified = checkpoint?.status === "verified" || checkpoint?.status === "delivered";
  if (!verified) {
    const status: InquiryDeliveryResult["status"] =
      checkpoint?.status === "bounced" ? "bounced" :
        checkpoint?.status === "deferred" ? "deferred" :
          checkpoint?.status === "suppressed" ? "suppressed" :
            checkpoint?.status === "failed" ? "failed" :
              "accepted_unverified";
    return { accepted: true, safeToResolve: true, receiptPersisted: true, verified: false, status, reason: checkpoint?.verificationReason || checkpoint?.failureReason };
  }
  let context: ReviewContext;
  try {
    const now = dependency(deps.now, () => new Date())();
    context = await buildContext({
      tenantId: input.tenantId,
      businessId: metadata.businessId,
      inquiryId: metadata.inquiryId,
      action: metadata.action,
      actorId: input.actorId,
      responsibilityId: metadata.responsibilityId,
      deps: { ...deps, emailReady: async () => true },
      now,
    });
  } catch (error) {
    return { accepted: true, safeToResolve: false, receiptPersisted: false, verified: true, status: "reconciliation_required", reason: errorCode(error) };
  }
  const receiptPersisted = await persistVerifiedReceipt({
    context,
    metadata,
    providerResult: {
      inquiryId: metadata.inquiryId,
      tenantId: input.tenantId,
      action: metadata.action,
      status: "verified",
      acceptedAt: checkpoint?.acceptedAt,
      providerMessageId: checkpoint?.providerMessageId,
      verificationEvidence: checkpoint?.verificationEvidence,
      retryable: false,
    },
    deps,
  });
  return {
    accepted: true,
    safeToResolve: receiptPersisted,
    receiptPersisted,
    verified: true,
    status: "verified",
    ...(receiptPersisted ? {} : { reason: "responsibility_receipt_reconciliation_required" }),
  };
}

export { INQUIRY_MESSAGE_REVIEW_KIND, INQUIRY_MESSAGE_REVIEW_SCHEMA_VERSION, InquiryMessageReviewEngineError } from "./delivery-approval-primitives";
export type { InquiryMessageReviewEventMetadata } from "./delivery-approval-primitives";

export type { InquiryMessageReviewExecution, InquiryMessageReviewReconciliation } from "./delivery-approval-contract";

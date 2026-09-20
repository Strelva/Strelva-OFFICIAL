/**
 * Bounded delivery adapter for the first inquiry capability.
 *
 * The inquiry engine owns records, responsibility evaluation, and the factual
 * timeline. This module owns the last mile: turning an already-authorized
 * inquiry action into a message, claiming one durable attempt, recording
 * provider acceptance, and checking verification. It deliberately does not
 * create a second inquiry store or a second approval system.
 *
 * The default transport is email through `src/lib/email/send.ts`. The default
 * store is Redis because inquiry delivery markers are operational, ephemeral
 * state. A missing durable store, a paused responsibility, an invalid approval,
 * or an ambiguous provider result fails closed. No result in this module means
 * "delivered" unless a transport supplies verification evidence.
 */

import { createHash } from "node:crypto";

import type {
  InquiryRecord,
  InquiryTimelineEventType,
  ResponsibilityAction,
  ResponsibilityEvaluation,
  ResponsibilityPolicy,
} from "@/products/inquiries/contracts";
import type { LeadRecord } from "@/lib/leads";
import { getTenantConfig } from "@/lib/tenants";
import { addTenantActivity } from "@/lib/tenant-crm";
import { renderEmailHtml, renderEmailText } from "@/lib/email/layout";
import { createEmailInquiryTransport } from "./delivery-email";
import { createRedisInquiryDeliveryStore } from "./delivery-store";
import { INQUIRY_WORKSPACE_EXIT_CODE, isInquiryWorkspaceExited } from "./workspace-exit";
import type { EmailAudience } from "@/lib/email/send";
import {
  actorForAction,
  createInquiryDeliveryMessage,
  deliveryActionLabel,
  getInquiryReplyTrackingAddress,
  inquiryBusinessName,
  validEmail,
} from "./delivery-message";
import type {
  InquiryActionPolicy,
  InquiryDeliveryAction,
  InquiryDeliveryApproval,
  InquiryDeliveryCheckpoint,
  InquiryDeliveryClaim,
  InquiryDeliveryDependencies,
  InquiryDeliveryMessage,
  InquiryDeliveryMode,
  InquiryDeliveryPlan,
  InquiryDeliveryResult,
  InquiryDeliveryStatus,
  InquiryDeliveryStore,
  InquiryDeliverySubmission,
  InquiryDeliveryTimelineInput,
  InquiryFollowUpRecheck,
  InquiryRoute,
  InquiryRoutingPolicy,
  InquiryVerificationResult,
  PartialInquiryRoutingPolicy,
  ResponsibilityDeliveryGate,
} from "./delivery-types";
export type * from "./delivery-types";

export { createEmailInquiryTransport } from "./delivery-email";
export { createMemoryInquiryDeliveryStore, createRedisInquiryDeliveryStore } from "./delivery-store";

const MAX_ATTEMPTS = 5;
const MAX_HOURS = 24 * 30;

export const DEFAULT_INQUIRY_ROUTING_POLICY: InquiryRoutingPolicy = Object.freeze({
  version: "inquiry-delivery-v1",
  paused: false,
  pauseReason: null,
  // Supervised is the default. The person authorizes each customer message;
  // switching to auto is a separate responsibility decision.
  autoReply: Object.freeze({
    mode: "approval" as const,
    enabled: true,
    delayHours: 0,
    budgetHours: 24,
    maxAttempts: 1,
  }),
  followUp: Object.freeze({
    mode: "off" as const,
    enabled: false,
    delayHours: 48,
    budgetHours: 168,
    maxAttempts: 1,
  }),
  // `recordLead` already sends the legacy owner notice. Sending again here
  // without an explicit policy would create duplicate owner mail.
  ownerNotification: "legacy" as const,
});

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function cleanVersion(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_INQUIRY_ROUTING_POLICY.version;
  const valueTrimmed = value.trim().slice(0, 80);
  return valueTrimmed || DEFAULT_INQUIRY_ROUTING_POLICY.version;
}

function normalizeMode(value: unknown): InquiryDeliveryMode {
  if (value === "auto" || value === "approval" || value === "supervised" || value === "off") {
    return value;
  }
  return "off";
}

function normalizeActionPolicy(
  value: Partial<InquiryActionPolicy> | null | undefined,
  fallback: InquiryActionPolicy,
): InquiryActionPolicy {
  const mode = normalizeMode(value?.mode ?? fallback.mode);
  const enabled = value?.enabled === undefined ? fallback.enabled : value.enabled === true;
  const messageTemplate = typeof value?.messageTemplate === "string" ? value.messageTemplate.trim().slice(0, 2000) : fallback.messageTemplate;
  return {
    mode: enabled ? mode : "off",
    enabled: enabled && mode !== "off",
    ...(messageTemplate ? { messageTemplate } : {}),
    delayHours: clampNumber(value?.delayHours, fallback.delayHours, 0, MAX_HOURS),
    budgetHours: clampNumber(value?.budgetHours, fallback.budgetHours, 1, MAX_HOURS),
    maxAttempts: Math.round(clampNumber(value?.maxAttempts, fallback.maxAttempts, 1, MAX_ATTEMPTS)),
  };
}

export function normalizeInquiryRoutingPolicy(
  value?: PartialInquiryRoutingPolicy | null,
): InquiryRoutingPolicy {
  const input = value ?? {};
  const ownerNotification =
    input.ownerNotification === "send" || input.ownerNotification === "off"
      ? input.ownerNotification
      : "legacy";
  const pauseReason = typeof input.pauseReason === "string" ? input.pauseReason.trim().slice(0, 240) : null;
  return {
    version: cleanVersion(input.version),
    paused: input.paused === true,
    pauseReason: pauseReason || null,
    autoReply: normalizeActionPolicy(input.autoReply, DEFAULT_INQUIRY_ROUTING_POLICY.autoReply),
    followUp: normalizeActionPolicy(input.followUp, DEFAULT_INQUIRY_ROUTING_POLICY.followUp),
    ownerNotification,
  };
}

function actionForPolicy(action: InquiryDeliveryAction, policy: InquiryRoutingPolicy): InquiryActionPolicy {
  if (action === "schedule_follow_up") return policy.followUp;
  if (action === "owner_notification") {
    return {
      mode: policy.ownerNotification === "send" ? "approval" : "off",
      enabled: policy.ownerNotification === "send",
      delayHours: 0,
      budgetHours: 24,
      // Routing gets a small retry budget for transient provider failures;
      // permanent outcomes remain terminal in the delivery store.
      maxAttempts: 3,
    };
  }
  return policy.autoReply;
}

function canonicalAction(action: string): InquiryDeliveryAction | null {
  if (action === "reply" || action === "customer_auto_reply") return "reply";
  if (action === "send_message" || action === "owner_notification") return "owner_notification";
  if (action === "schedule_follow_up" || action === "follow_up") return "schedule_follow_up";
  return null;
}

function toDate(value: Date | number | string): Date | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function actionTimes(
  inquiry: InquiryDeliverySubmission,
  action: InquiryDeliveryAction,
  policy: InquiryRoutingPolicy,
): { dueAt: string; expiresAt: string } | null {
  const received = toDate(inquiry.receivedAt);
  if (!received) return null;
  const actionPolicy = actionForPolicy(action, policy);
  const dueAt = new Date(received.getTime() + actionPolicy.delayHours * 60 * 60 * 1000);
  const expiresAt = new Date(received.getTime() + actionPolicy.budgetHours * 60 * 60 * 1000);
  return { dueAt: dueAt.toISOString(), expiresAt: expiresAt.toISOString() };
}

/**
 * Bind an approval to the exact message and capability revision. The provider
 * idempotency key alone is not sufficient because an edited body could reuse
 * the same inquiry/action key under the same policy version.
 */
export function getInquiryDeliveryMessageDigest(message: InquiryDeliveryMessage): string {
  const canonical = JSON.stringify({
    tenantId: message.tenantId,
    inquiryId: message.inquiryId,
    action: message.action,
    capabilityId: message.capabilityId ?? null,
    capabilityVersion: message.capabilityVersion ?? null,
    audience: message.audience,
    to: message.to,
    replyTo: message.replyTo ?? null,
    tags: message.tags ?? null,
    subject: message.subject,
    options: message.options,
    idempotencyKey: message.idempotencyKey,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Build the exact message that an approval UI must display and hash. */
export { createInquiryDeliveryMessage, getInquiryReplyTrackingAddress };

export function inquirySubmissionFromLead(tenantId: string, lead: LeadRecord): InquiryDeliverySubmission {
  return {
    id: lead.id,
    tenantId,
    name: lead.name,
    email: lead.email || "",
    message: lead.message || lead.fields?.message || lead.fields?.request || null,
    source: lead.source || null,
    ...(lead.fields ? { fields: lead.fields } : {}),
    capabilityId: lead.capabilityId || null,
    capabilityVersion: lead.capabilityVersion || null,
    inquiryVersion: lead.id,
    receivedAt: lead.createdAt,
  };
}

export function inquirySubmissionFromRecord(
  tenantId: string,
  record: InquiryRecord,
): InquiryDeliverySubmission {
  const fields = record.fields;
  return {
    id: record.id,
    tenantId,
    name: fields.name || fields.full_name || "there",
    email: fields.email || "",
    message: fields.message || fields.notes || null,
    source: fields.source || null,
    fields,
    capabilityId: record.capabilityId,
    capabilityVersion: record.capabilityVersion,
    inquiryVersion: record.createdReceiptId,
    receivedAt: record.receivedAt,
  };
}

/** Default tenant-scoped route resolver. Browser fields never choose recipients. */
export async function resolveInquiryRoute(
  inquiry: InquiryDeliverySubmission,
  policy: InquiryRoutingPolicy = DEFAULT_INQUIRY_ROUTING_POLICY,
): Promise<InquiryRoute> {
  let tenant: Awaited<ReturnType<typeof getTenantConfig>> | null = null;
  try {
    tenant = await getTenantConfig(inquiry.tenantId);
  } catch {
    tenant = null;
  }
  // The capability's destination is server-authored configuration. Browser
  // fields never populate `staffDestination`; when it is absent or not an
  // email address, retain the tenant owner fallback for the legacy notice.
  const ownerEmail = validEmail(inquiry.staffDestination) || validEmail(tenant?.ownerEmail);
  return {
    tenantId: inquiry.tenantId,
    businessName: inquiryBusinessName(inquiry, tenant?.siteName),
    customerEmail: validEmail(inquiry.email),
    ownerEmail,
    ownerNotification: policy.ownerNotification,
    customerReplyTo: getInquiryReplyTrackingAddress(inquiry) || ownerEmail,
  };
}

/** Policy gate used by hosts that already evaluate a Responsibility in the engine. */
export function gateResponsibilityAction(
  action: InquiryDeliveryAction,
  policy: ResponsibilityPolicy | null | undefined,
  evaluation?: ResponsibilityEvaluation | null,
  now: Date = new Date(),
): ResponsibilityDeliveryGate {
  const responsibilityAction: ResponsibilityAction =
    action === "schedule_follow_up" ? "schedule_follow_up" : action === "owner_notification" ? "send_message" : "reply";
  if (!policy) {
    return { allowed: false, action, evaluation: evaluation ?? null, reason: "responsibility_unavailable" };
  }
  if (policy.status !== "active") {
    return { allowed: false, action, evaluation: evaluation ?? null, reason: "responsibility_paused" };
  }
  if (!isWithinResponsibilityHours(policy, now)) {
    return { allowed: false, action, evaluation: evaluation ?? null, reason: "outside_responsibility_hours" };
  }
  if (!policy.allowedActions.includes(responsibilityAction)) {
    return { allowed: false, action, evaluation: evaluation ?? null, reason: "action_not_allowed" };
  }
  const forbidden = policy.never.some((clause) => clause.action === responsibilityAction);
  if (forbidden) {
    return { allowed: false, action, evaluation: evaluation ?? null, reason: "action_forbidden" };
  }
  // A policy's trust level is never authority by itself. Every outbound
  // action needs an explicit, current engine evaluation that says allow.
  if (evaluation?.decision !== "allow") {
    return { allowed: false, action, evaluation: evaluation ?? null, reason: "approval_required" };
  }
  const limit = Math.floor(policy.budget.dailyMessages);
  const timezone = policy.budget.timezone.trim();
  if (!Number.isFinite(limit) || limit < 1 || !timezone) {
    return { allowed: false, action, evaluation, reason: "daily_budget_unavailable" };
  }
  return {
    allowed: true,
    action,
    evaluation,
    budget: {
      limit,
      timezone,
      policyVersion: policy.id,
      now: now.toISOString(),
    },
  };
}

/** Check the policy's stated support hours without relying on the server's zone. */
export function isWithinResponsibilityHours(policy: ResponsibilityPolicy, now: Date = new Date()): boolean {
  const { timezone, days, start, end } = policy.hours;
  if (!timezone || !Array.isArray(days) || days.length === 0) return false;
  const parseMinutes = (value: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
  };
  const startMinutes = parseMinutes(start);
  const endMinutes = parseMinutes(end);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const weekday = parts.find((part) => part.type === "weekday")?.value;
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday || "");
    if (day < 0 || !days.includes(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) return false;
    const currentMinutes = hour * 60 + minute;
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    // An invalid or unavailable timezone must never authorize a send.
    return false;
  }
}

export function isInquiryApprovalValid(
  approval: InquiryDeliveryApproval | null | undefined,
  inquiryId: string,
  action: InquiryDeliveryAction,
  policy: InquiryRoutingPolicy,
  now: Date,
  expectedMessageDigest?: string,
  expectedCapability?: { id?: string | null; version?: number | null },
): boolean {
  if (!approval || approval.explicit !== true) return false;
  if (approval.inquiryId !== inquiryId || approval.action !== action) return false;
  if (!approval.actorId.trim() || approval.policyVersion !== policy.version) return false;
  if (!approval.messageDigest || (expectedMessageDigest && approval.messageDigest !== expectedMessageDigest)) return false;
  if (expectedCapability?.id !== undefined && (approval.capabilityId ?? null) !== (expectedCapability.id ?? null)) return false;
  if (expectedCapability?.version !== undefined && (approval.capabilityVersion ?? null) !== (expectedCapability.version ?? null)) return false;
  const approvedAt = toDate(approval.approvedAt);
  if (!approvedAt || approvedAt.getTime() > now.getTime()) return false;
  if (approval.expiresAt) {
    const expiresAt = toDate(approval.expiresAt);
    if (!expiresAt || expiresAt.getTime() < now.getTime()) return false;
  }
  return true;
}

/** Determine the current due/approval/pause state before touching the store. */
export function evaluateInquiryDelivery(
  inquiry: InquiryDeliverySubmission,
  actionInput: InquiryDeliveryAction | string,
  policyInput?: PartialInquiryRoutingPolicy | null,
  approval?: InquiryDeliveryApproval | null,
  nowInput: Date | number | string = new Date(),
  expectedMessageDigest?: string,
): InquiryDeliveryResult {
  const action = canonicalAction(actionInput);
  const now = toDate(nowInput) ?? new Date();
  if (!action) {
    return {
      inquiryId: inquiry.id,
      tenantId: inquiry.tenantId,
      action: "reply",
      status: "disabled",
      reason: "unsupported_action",
      retryable: false,
    };
  }
  const policy = normalizeInquiryRoutingPolicy(policyInput);
  const times = actionTimes(inquiry, action, policy);
  if (!times) {
    return {
      inquiryId: inquiry.id,
      tenantId: inquiry.tenantId,
      action,
      status: "unavailable",
      reason: "invalid_received_at",
      retryable: false,
    };
  }
  const actionPolicy = actionForPolicy(action, policy);
  const base = {
    inquiryId: inquiry.id,
    tenantId: inquiry.tenantId,
    action,
    dueAt: times.dueAt,
    expiresAt: times.expiresAt,
    retryable: false,
  } as const;
  if (policy.paused) return { ...base, status: "paused", reason: policy.pauseReason || "responsibility_paused" };
  if (!actionPolicy.enabled || actionPolicy.mode === "off") return { ...base, status: "disabled", reason: "action_disabled" };
  if (now.getTime() < new Date(times.dueAt).getTime()) return { ...base, status: "not_due", reason: "follow_up_not_due" };
  if (now.getTime() > new Date(times.expiresAt).getTime()) return { ...base, status: "budget_exhausted", reason: "delivery_budget_exhausted" };
  const supervised = actionPolicy.mode === "approval" || actionPolicy.mode === "supervised";
  if (
    supervised &&
    !isInquiryApprovalValid(approval, inquiry.id, action, policy, now, expectedMessageDigest, {
      id: inquiry.capabilityId,
      version: inquiry.capabilityVersion,
    })
  ) {
    return { ...base, status: "awaiting_approval", reason: "explicit_approval_required" };
  }
  return { ...base, status: "ready" };
}

export async function prepareInquiryDelivery(
  inquiry: InquiryDeliverySubmission,
  policyInput?: PartialInquiryRoutingPolicy | null,
  deps: Pick<InquiryDeliveryDependencies, "resolveRoute"> = {},
  nowInput: Date | number | string = new Date(),
): Promise<InquiryDeliveryPlan> {
  const policy = normalizeInquiryRoutingPolicy(policyInput);
  const route = await (deps.resolveRoute || resolveInquiryRoute)(inquiry, policy);
  const now = toDate(nowInput) ?? new Date();
  const actionInputs: Array<{ action: InquiryDeliveryAction; recipient: string | null; audience: EmailAudience }> = [
    { action: "reply", recipient: route.customerEmail, audience: "customer" },
    { action: "schedule_follow_up", recipient: route.customerEmail, audience: "customer" },
  ];
  if (policy.ownerNotification !== "legacy") {
    actionInputs.push({ action: "owner_notification", recipient: route.ownerEmail, audience: "client" });
  }
  const actions = actionInputs.map(({ action, recipient, audience }) => {
    const times = actionTimes(inquiry, action, policy);
    const actionPolicy = actionForPolicy(action, policy);
    if (!times) {
      return {
        action,
        recipient,
        audience,
        mode: actionPolicy.mode,
        dueAt: now.toISOString(),
        expiresAt: now.toISOString(),
        status: "unavailable" as const,
        reason: "invalid_received_at",
      };
    }
    if (policy.paused) {
      return { action, recipient, audience, mode: actionPolicy.mode, ...times, status: "unavailable" as const, reason: policy.pauseReason || "responsibility_paused" };
    }
    if (!actionPolicy.enabled || actionPolicy.mode === "off") {
      return { action, recipient, audience, mode: actionPolicy.mode, ...times, status: "disabled" as const, reason: "action_disabled" };
    }
    if (!recipient) {
      return { action, recipient, audience, mode: actionPolicy.mode, ...times, status: "unavailable" as const, reason: "recipient_unavailable" };
    }
    if (now.getTime() > new Date(times.expiresAt).getTime()) {
      return { action, recipient, audience, mode: actionPolicy.mode, ...times, status: "unavailable" as const, reason: "delivery_budget_exhausted" };
    }
    const supervised = actionPolicy.mode === "approval" || actionPolicy.mode === "supervised";
    const notDue = now.getTime() < new Date(times.dueAt).getTime();
    return {
      action,
      recipient,
      audience,
      mode: actionPolicy.mode,
      ...times,
      status: notDue ? "not_due" as const : supervised ? "awaiting_approval" as const : "ready" as const,
      ...(notDue ? { reason: "not_due" } : {}),
    };
  });
  return { inquiryId: inquiry.id, tenantId: inquiry.tenantId, businessName: route.businessName, route, policy, actions };
}

function timelineFor(
  inquiry: InquiryDeliverySubmission,
  action: InquiryDeliveryAction,
  type: InquiryTimelineEventType,
  summary: string,
  outcome: InquiryDeliveryTimelineInput["outcome"],
  at: string,
  evidence?: string[],
): InquiryDeliveryTimelineInput {
  return {
    inquiryId: inquiry.id,
    tenantId: inquiry.tenantId,
    capabilityId: inquiry.capabilityId,
    type,
    summary: `${deliveryActionLabel(action)}: ${summary}`.slice(0, 500),
    at,
    outcome,
    actor: actorForAction(action),
    evidence: evidence?.slice(0, 20) || [],
  };
}

function blockedTimelineType(action: InquiryDeliveryAction): InquiryTimelineEventType {
  return action === "schedule_follow_up" ? "follow_up_blocked" : "status_changed";
}

function blockedResultStatus(reason?: string): InquiryDeliveryStatus {
  if (reason === "approval_required" || reason === "explicit_approval_required") return "awaiting_approval";
  if (reason === "budget_exhausted" || reason === "daily_budget_exhausted") return "budget_exhausted";
  return "paused";
}

function isFreshRecheck(recheck: InquiryFollowUpRecheck, now: Date): boolean {
  const checkedAt = toDate(recheck.checkedAt);
  if (!checkedAt) return false;
  const age = now.getTime() - checkedAt.getTime();
  // A provider read starts after the worker's clock is captured, so a fresh
  // read can be a few milliseconds ahead of that clock. Keep the bounded
  // window while allowing that normal request ordering.
  return age >= -60 * 1000 && age <= 5 * 60 * 1000;
}

async function appendTimelineSafe(
  store: InquiryDeliveryStore,
  input: InquiryDeliveryTimelineInput,
): Promise<boolean> {
  try {
    await store.appendTimeline(input);
    return true;
  } catch (error) {
    console.error("[inquiry-delivery] timeline write failed:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function logCustomerEmailToCrm(inquiry: InquiryDeliverySubmission, action: InquiryDeliveryAction): Promise<void> {
  try {
    await addTenantActivity(inquiry.tenantId, {
      kind: "email",
      summary: `Sent inquiry ${deliveryActionLabel(action)} · Strelva`,
      author: "Strelva",
    });
  } catch (error) {
    console.error("[inquiry-delivery] CRM timeline write failed:", error instanceof Error ? error.message : String(error));
  }
}

/**
 * Deliver one action. `getPolicy` is called immediately before claiming the
 * attempt, so a pause, changed responsibility, reply, or disconnected route
 * takes effect even when an older plan or approval is in memory.
 */
export async function deliverInquiryAction(
  inquiry: InquiryDeliverySubmission,
  actionInput: InquiryDeliveryAction | string,
  options: {
    policy?: PartialInquiryRoutingPolicy | null;
    approval?: InquiryDeliveryApproval | null;
    responsibilityGate?: ResponsibilityDeliveryGate;
    deps?: InquiryDeliveryDependencies;
  } = {},
): Promise<InquiryDeliveryResult> {
  const action = canonicalAction(actionInput);
  if (!action) {
    return { inquiryId: inquiry.id, tenantId: inquiry.tenantId, action: "reply", status: "disabled", reason: "unsupported_action", retryable: false };
  }
  const deps = options.deps || {};
  const store = deps.store || createRedisInquiryDeliveryStore();
  const transport = deps.transport || createEmailInquiryTransport({ allowExternalSends: deps.allowExternalSends });
  if (!store.durable) {
    return { inquiryId: inquiry.id, tenantId: inquiry.tenantId, action, status: "unavailable", reason: "durable_delivery_state_required", retryable: false };
  }
  const now = deps.now?.() || new Date();
  let policyInput = options.policy;
  if (deps.getPolicy) {
    try {
      policyInput = await deps.getPolicy(inquiry.tenantId, inquiry);
    } catch {
      return { inquiryId: inquiry.id, tenantId: inquiry.tenantId, action, status: "unavailable", reason: "responsibility_unavailable", retryable: false };
    }
    if (!policyInput) {
      return { inquiryId: inquiry.id, tenantId: inquiry.tenantId, action, status: "unavailable", reason: "current_routing_policy_required", retryable: false };
    }
  } else if (!policyInput) {
    return { inquiryId: inquiry.id, tenantId: inquiry.tenantId, action, status: "unavailable", reason: "current_routing_policy_required", retryable: false };
  }
  const policy = normalizeInquiryRoutingPolicy(policyInput);
  let route: InquiryRoute;
  try {
    route = await (deps.resolveRoute || resolveInquiryRoute)(inquiry, policy);
  } catch {
    return { inquiryId: inquiry.id, tenantId: inquiry.tenantId, action, status: "unavailable", reason: "recipient_route_unavailable", retryable: false };
  }
  if (route.tenantId !== inquiry.tenantId) {
    return { inquiryId: inquiry.id, tenantId: inquiry.tenantId, action, status: "unavailable", reason: "recipient_route_tenant_mismatch", retryable: false };
  }
  const message = createInquiryDeliveryMessage(inquiry, route, action);
  if (!message) {
    await appendTimelineSafe(store, timelineFor(inquiry, action, blockedTimelineType(action), "recipient unavailable", "blocked", now.toISOString()));
    return { inquiryId: inquiry.id, tenantId: inquiry.tenantId, action, status: "unavailable", reason: "recipient_unavailable", retryable: false };
  }

  let responsibilityGate: ResponsibilityDeliveryGate | null | undefined = options.responsibilityGate;
  if (deps.getResponsibilityGate) {
    try {
      responsibilityGate = await deps.getResponsibilityGate(inquiry.tenantId, inquiry, action, message);
    } catch {
      return { inquiryId: inquiry.id, tenantId: inquiry.tenantId, action, status: "unavailable", reason: "responsibility_unavailable", retryable: false };
    }
  }
  if (!responsibilityGate) {
    return { inquiryId: inquiry.id, tenantId: inquiry.tenantId, action, status: "unavailable", reason: "responsibility_evaluation_required", retryable: false };
  }
  if (!responsibilityGate.allowed) {
    const reason = responsibilityGate.reason || "responsibility_blocked";
    await appendTimelineSafe(store, timelineFor(inquiry, action, blockedTimelineType(action), reason, "blocked", now.toISOString()));
    return { inquiryId: inquiry.id, tenantId: inquiry.tenantId, action, status: blockedResultStatus(reason), reason, retryable: false };
  }

  const messageDigest = getInquiryDeliveryMessageDigest(message);
  // A host gate may produce an approval from the same final responsibility
  // read. Prefer a caller-supplied approval when one exists, while allowing
  // that exact gate-bound approval to travel with the gate atomically.
  const approval = options.approval === undefined ? responsibilityGate.approval : options.approval;
  const evaluated = evaluateInquiryDelivery(inquiry, action, policy, approval, now, messageDigest);
  if (evaluated.status !== "ready") {
    if (["awaiting_approval", "paused", "budget_exhausted", "disabled"].includes(evaluated.status)) {
      await appendTimelineSafe(store, timelineFor(inquiry, action, blockedTimelineType(action), evaluated.reason || evaluated.status, "blocked", now.toISOString()));
    }
    return evaluated;
  }

  let checkpoint: InquiryDeliveryCheckpoint | null = null;
  try {
    checkpoint = await store.getCheckpoint({ tenantId: inquiry.tenantId, inquiryId: inquiry.id, action });
  } catch {
    return { ...evaluated, status: "unavailable", reason: "durable_delivery_state_unavailable", retryable: false };
  }
  if (checkpoint?.status === "verified") {
    return { ...evaluated, status: "verified", reason: "already_verified", acceptedAt: checkpoint.acceptedAt, providerMessageId: checkpoint.providerMessageId, verificationEvidence: checkpoint.verificationEvidence, retryable: false };
  }
  if (checkpoint?.status === "delivered") {
    return { ...evaluated, status: "delivered", reason: "already_delivered", acceptedAt: checkpoint.acceptedAt, providerMessageId: checkpoint.providerMessageId, verificationEvidence: checkpoint.verificationEvidence, retryable: false };
  }
  if (checkpoint?.status === "bounced") {
    return { ...evaluated, status: "bounced", reason: checkpoint.failureReason || checkpoint.verificationReason || "provider_bounced", acceptedAt: checkpoint.acceptedAt, providerMessageId: checkpoint.providerMessageId, verificationEvidence: checkpoint.verificationEvidence, retryable: false };
  }
  if (checkpoint?.status === "deferred") {
    return { ...evaluated, status: "deferred", reason: checkpoint.verificationReason || "provider_delivery_deferred", acceptedAt: checkpoint.acceptedAt, providerMessageId: checkpoint.providerMessageId, verificationEvidence: checkpoint.verificationEvidence, retryable: false };
  }
  if (checkpoint?.status === "suppressed") {
    return { ...evaluated, status: "suppressed", reason: checkpoint.failureReason || checkpoint.verificationReason || "provider_suppressed", acceptedAt: checkpoint.acceptedAt, providerMessageId: checkpoint.providerMessageId, verificationEvidence: checkpoint.verificationEvidence, retryable: false };
  }
  if (checkpoint?.status === "failed" && checkpoint.retryable !== true) {
    return { ...evaluated, status: "failed", reason: checkpoint.failureReason || "provider_failed", acceptedAt: checkpoint.acceptedAt, providerMessageId: checkpoint.providerMessageId, verificationEvidence: checkpoint.verificationEvidence, retryable: Boolean(checkpoint.retryable) };
  }
  if (checkpoint?.status === "accepted" || checkpoint?.status === "accepted_unverified") {
    const acceptance = { status: "accepted" as const, ...(checkpoint.providerMessageId ? { providerMessageId: checkpoint.providerMessageId } : {}), ...(checkpoint.acceptedAt ? { acceptedAt: checkpoint.acceptedAt } : {}) };
    let verification: InquiryVerificationResult;
    try {
      verification = await transport.verify(message, acceptance);
    } catch (error) {
      verification = { status: "unavailable", reason: error instanceof Error ? error.message.slice(0, 240) : "verification_unavailable" };
    }
    if (verification.status === "verified") {
      try {
        const next = await store.markVerified({ tenantId: inquiry.tenantId, inquiryId: inquiry.id, action, attemptId: checkpoint.attemptId, evidence: verification.evidence });
        const timelinePersisted = await appendTimelineSafe(store, timelineFor(inquiry, action, "notification_accepted", "provider acceptance verified", "accepted", now.toISOString(), verification.evidence));
        return { ...evaluated, status: "verified", reason: "already_accepted_then_verified", acceptedAt: next.acceptedAt, providerMessageId: next.providerMessageId, verificationEvidence: next.verificationEvidence, retryable: false, timelinePersisted };
      } catch {
        return { ...evaluated, status: "reconciliation_required", reason: "verification_marker_unavailable", retryable: false };
      }
    }
    if (verification.status === "bounced" || verification.status === "deferred" || verification.status === "failed") {
      if (checkpoint.providerMessageId) {
        try {
          const next = await store.markProviderOutcome({
            tenantId: inquiry.tenantId,
            inquiryId: inquiry.id,
            action,
            providerMessageId: checkpoint.providerMessageId,
            providerEventId: `readback:${checkpoint.providerMessageId}:${verification.status}`,
            outcome: verification.status === "bounced" ? "bounced" : verification.status === "deferred" ? "deferred" : "failed",
            at: now.toISOString(),
            reason: verification.reason,
            evidence: verification.evidence,
          });
          const timelineType = verification.status === "bounced" ? "notification_bounced" : verification.status === "deferred" ? "notification_accepted" : blockedTimelineType(action);
          const timelineOutcome = verification.status === "deferred" ? "accepted" : "failed";
          const timelinePersisted = await appendTimelineSafe(store, timelineFor(inquiry, action, timelineType, verification.reason, timelineOutcome, now.toISOString(), verification.evidence));
          return { ...evaluated, status: verification.status, reason: verification.reason, acceptedAt: next.acceptedAt, providerMessageId: next.providerMessageId, verificationEvidence: next.verificationEvidence, retryable: false, timelinePersisted };
        } catch {
          return { ...evaluated, status: "reconciliation_required", reason: "provider_outcome_marker_unavailable", retryable: false };
        }
      }
      // A custom transport without a provider id cannot safely attach an
      // outcome to a later webhook. Keep the accepted marker and surface the
      // verification result without making a duplicate-safe claim.
    }
    const reason = verification.reason;
    try {
      const next = await store.markAcceptedUnverified({ tenantId: inquiry.tenantId, inquiryId: inquiry.id, action, attemptId: checkpoint.attemptId, reason });
      const timelinePersisted = await appendTimelineSafe(store, timelineFor(inquiry, action, "notification_accepted", "provider accepted; verification needs attention", "accepted", now.toISOString(), [reason]));
      return { ...evaluated, status: "accepted_unverified", reason, acceptedAt: next.acceptedAt, providerMessageId: next.providerMessageId, retryable: false, timelinePersisted };
    } catch {
      return { ...evaluated, status: "reconciliation_required", reason: "verification_marker_unavailable", retryable: false };
    }
  }
  if (checkpoint?.status === "sending" || checkpoint?.status === "unknown") {
    return { ...evaluated, status: "reconciliation_required", reason: "prior_attempt_may_have_reached_provider", attemptId: checkpoint.attemptId, retryable: false };
  }

  // Exit blocks a new claim, while the checkpoint branches above remain
  // available to verify or reconcile an already accepted or ambiguous write.
  try {
    const exited = await (deps.isWorkspaceExited ?? ((tenantId: string) => isInquiryWorkspaceExited({ tenantId })))(inquiry.tenantId);
    if (exited) {
      const reason = INQUIRY_WORKSPACE_EXIT_CODE;
      await appendTimelineSafe(store, timelineFor(inquiry, action, blockedTimelineType(action), reason, "blocked", now.toISOString()));
      return { ...evaluated, status: "paused", reason, retryable: false };
    }
  } catch {
    return { ...evaluated, status: "unavailable", reason: "inquiry_workspace_exit_unavailable", retryable: false };
  }

  if (action === "schedule_follow_up") {
    if (!deps.getFollowUpRecheck) {
      const reason = "fresh_no_reply_check_required";
      await appendTimelineSafe(store, timelineFor(inquiry, action, "follow_up_blocked", reason, "blocked", now.toISOString()));
      return { ...evaluated, status: "paused", reason, retryable: false };
    }
    let recheck: InquiryFollowUpRecheck | null | undefined;
    try {
      recheck = await deps.getFollowUpRecheck(inquiry, now.toISOString());
    } catch {
      recheck = null;
    }
    // A scheduled follow-up is bound to the immutable record revision and the
    // exact capability definition that produced the original form. Older
    // records may not have either value, so they fail closed instead of
    // treating a missing recheck as unchanged.
    const inquiryVersionMissing =
      inquiry.inquiryVersion === undefined || inquiry.inquiryVersion === null || inquiry.inquiryVersion === "" ||
      recheck?.inquiryVersion === undefined || recheck?.inquiryVersion === null || recheck?.inquiryVersion === "";
    const capabilityVersionMissing =
      !inquiry.capabilityId || !Number.isSafeInteger(inquiry.capabilityVersion) || (inquiry.capabilityVersion ?? 0) < 1 ||
      !recheck?.capabilityId || !Number.isSafeInteger(recheck.capabilityVersion) || recheck.capabilityVersion < 1;
    const inquiryVersionChanged = !inquiryVersionMissing && recheck?.inquiryVersion !== inquiry.inquiryVersion;
    const capabilityChanged = !capabilityVersionMissing && (
      recheck?.capabilityId !== inquiry.capabilityId || recheck?.capabilityVersion !== inquiry.capabilityVersion
    );
    const recheckReason = recheck?.reason;
    const reason = !recheck
      ? "fresh_no_reply_check_unavailable"
      : !isFreshRecheck(recheck, now)
        ? "fresh_no_reply_check_stale"
        : inquiryVersionMissing
          ? "inquiry_version_required"
          : inquiryVersionChanged
            ? recheckReason || "inquiry_changed"
            : capabilityVersionMissing
              ? "inquiry_capability_version_required"
              : capabilityChanged
                ? recheckReason || "inquiry_capability_changed"
                : !recheck.noReply
                  ? recheckReason || "reply_received"
                  : !recheck.recipientActive
                    ? recheckReason || "recipient_unavailable"
                    : null;
    if (reason) {
      await appendTimelineSafe(store, timelineFor(inquiry, action, "follow_up_blocked", reason, "blocked", now.toISOString()));
      return { ...evaluated, status: "paused", reason, retryable: false };
    }
  }

  const actionPolicy = actionForPolicy(action, policy);
  const budget = responsibilityGate.budget;
  if (!budget || !Number.isInteger(budget.limit) || budget.limit < 1 || !budget.timezone.trim()) {
    return { ...evaluated, status: "unavailable", reason: "daily_budget_state_required", retryable: false };
  }
  if (!store.atomicBudget) {
    return { ...evaluated, status: "unavailable", reason: "atomic_daily_budget_required", retryable: false };
  }

  let claim: InquiryDeliveryClaim;
  try {
    claim = await store.beginAttempt({
      inquiryId: inquiry.id,
      tenantId: inquiry.tenantId,
      action,
      maxAttempts: actionPolicy.maxAttempts,
      now: now.toISOString(),
      budget: { ...budget, now: now.toISOString() },
    });
  } catch {
    return { ...evaluated, status: "unavailable", reason: "durable_delivery_state_unavailable", retryable: false };
  }
  if (!claim.acquired || !claim.attemptId) {
    const reason = claim.reason || "action_in_progress";
    const status: InquiryDeliveryStatus = reason === "retry_exhausted"
      ? "retry_exhausted"
      : reason === "budget_exhausted"
        ? "budget_exhausted"
        : reason === "already_accepted"
          ? "accepted_unverified"
          : reason === "reconciliation_required"
            ? "reconciliation_required"
            : "paused";
    return { ...evaluated, status, reason, attemptId: claim.checkpoint?.attemptId, acceptedAt: claim.checkpoint?.acceptedAt, providerMessageId: claim.checkpoint?.providerMessageId, retryable: false };
  }
  const attemptId = claim.attemptId;
  await appendTimelineSafe(store, timelineFor(inquiry, action, action === "schedule_follow_up" ? "follow_up_scheduled" : "routed", action === "schedule_follow_up" ? "follow-up claimed for delivery" : `message routed to ${message.audience}`, "recorded", now.toISOString()));
  try {
    // The exit can complete after the pre-claim read but before the provider
    // boundary. Retire this fresh claim before any external write so a late
    // stop cannot turn into a new provider message.
    try {
      const exited = await (deps.isWorkspaceExited ?? ((tenantId: string) => isInquiryWorkspaceExited({ tenantId })))(inquiry.tenantId);
      if (exited) {
        let stopped: InquiryDeliveryCheckpoint;
        try {
          stopped = await store.markFailed({
            tenantId: inquiry.tenantId,
            inquiryId: inquiry.id,
            action,
            attemptId,
            reason: INQUIRY_WORKSPACE_EXIT_CODE,
            retryable: false,
          });
        } catch {
          return { ...evaluated, status: "reconciliation_required", reason: "workspace_exit_marker_unavailable", attemptId, retryable: false };
        }
        const timelinePersisted = await appendTimelineSafe(store, timelineFor(inquiry, action, blockedTimelineType(action), INQUIRY_WORKSPACE_EXIT_CODE, "blocked", now.toISOString()));
        return { ...evaluated, status: "paused", reason: INQUIRY_WORKSPACE_EXIT_CODE, attemptId, retryable: false, timelinePersisted, acceptedAt: stopped.acceptedAt, providerMessageId: stopped.providerMessageId };
      }
    } catch {
      return { ...evaluated, status: "unavailable", reason: "inquiry_workspace_exit_unavailable", attemptId, retryable: false };
    }
    const sent = await transport.send(message);
    if (sent.status === "rejected") {
      let failed: InquiryDeliveryCheckpoint;
      try {
        failed = await store.markFailed({ tenantId: inquiry.tenantId, inquiryId: inquiry.id, action, attemptId, reason: sent.reason, retryable: sent.retryable });
      } catch {
        return { ...evaluated, status: "reconciliation_required", reason: "failure_marker_unavailable", attemptId, retryable: false };
      }
      const eventType = sent.outcome === "bounced" ? "notification_bounced" : blockedTimelineType(action);
      await appendTimelineSafe(store, timelineFor(inquiry, action, eventType, sent.reason, "failed", now.toISOString()));
      return { ...evaluated, status: "failed", reason: failed.failureReason || sent.reason, attemptId, retryable: Boolean(failed.retryable) };
    }
    if (sent.status === "unknown") {
      try {
        await store.markFailed({ tenantId: inquiry.tenantId, inquiryId: inquiry.id, action, attemptId, reason: sent.reason, retryable: false, ambiguous: true });
      } catch {
        return { ...evaluated, status: "reconciliation_required", reason: "ambiguous_result_marker_unavailable", attemptId, retryable: false };
      }
      await appendTimelineSafe(store, timelineFor(inquiry, action, blockedTimelineType(action), `provider result unknown: ${sent.reason}`, "failed", now.toISOString()));
      return { ...evaluated, status: "reconciliation_required", reason: sent.reason, attemptId, retryable: false };
    }
    const acceptedAt = sent.acceptedAt || now.toISOString();
    try {
      // This marker is the duplicate barrier. It is written before read-back.
      await store.markAccepted({ tenantId: inquiry.tenantId, inquiryId: inquiry.id, action, attemptId, acceptedAt, providerMessageId: sent.providerMessageId, replyTo: message.replyTo });
    } catch {
      // The provider may already have accepted the message. Keep the sending
      // checkpoint wedged behind reconciliation and never claim retryability.
      return { ...evaluated, status: "reconciliation_required", reason: "provider_accepted_marker_unavailable", attemptId, acceptedAt, retryable: false };
    }
    await appendTimelineSafe(store, timelineFor(inquiry, action, "notification_accepted", "provider accepted", "accepted", acceptedAt));
    let verification: InquiryVerificationResult;
    try {
      verification = await transport.verify(message, sent);
    } catch (error) {
      verification = { status: "unavailable", reason: error instanceof Error ? error.message.slice(0, 240) : "verification_unavailable" };
    }
    if (verification.status === "verified") {
      try {
        const verified = await store.markVerified({ tenantId: inquiry.tenantId, inquiryId: inquiry.id, action, attemptId, evidence: verification.evidence });
        await appendTimelineSafe(store, timelineFor(inquiry, action, action === "schedule_follow_up" ? "follow_up_sent" : "notification_accepted", "provider acceptance verified", "accepted", now.toISOString(), verification.evidence));
        if (action !== "owner_notification") await logCustomerEmailToCrm(inquiry, action);
        return { ...evaluated, status: "verified", reason: "provider_accepted_and_verified", attemptId, acceptedAt: verified.acceptedAt, providerMessageId: verified.providerMessageId, verificationEvidence: verified.verificationEvidence, retryable: false };
      } catch {
        return { ...evaluated, status: "reconciliation_required", reason: "verification_marker_unavailable", attemptId, acceptedAt, retryable: false };
      }
    }
    if (verification.status === "bounced" || verification.status === "deferred" || verification.status === "failed") {
      if (sent.providerMessageId) {
        try {
          const next = await store.markProviderOutcome({
            tenantId: inquiry.tenantId,
            inquiryId: inquiry.id,
            action,
            providerMessageId: sent.providerMessageId,
            providerEventId: `readback:${sent.providerMessageId}:${verification.status}`,
            outcome: verification.status === "bounced" ? "bounced" : verification.status === "deferred" ? "deferred" : "failed",
            at: now.toISOString(),
            reason: verification.reason,
            evidence: verification.evidence,
          });
          const timelineType = verification.status === "bounced" ? "notification_bounced" : verification.status === "deferred" ? "notification_accepted" : blockedTimelineType(action);
          const timelineOutcome = verification.status === "deferred" ? "accepted" : "failed";
          const timelinePersisted = await appendTimelineSafe(store, timelineFor(inquiry, action, timelineType, verification.reason, timelineOutcome, now.toISOString(), verification.evidence));
          return { ...evaluated, status: verification.status, reason: verification.reason, attemptId, acceptedAt: next.acceptedAt, providerMessageId: next.providerMessageId, verificationEvidence: next.verificationEvidence, retryable: false, timelinePersisted };
        } catch {
          return { ...evaluated, status: "reconciliation_required", reason: "provider_outcome_marker_unavailable", attemptId, acceptedAt, retryable: false };
        }
      }
      // Without a provider id this result cannot be reconciled against a
      // signed provider event, so the accepted marker remains unverified.
    }
    try {
      const unverified = await store.markAcceptedUnverified({ tenantId: inquiry.tenantId, inquiryId: inquiry.id, action, attemptId, reason: verification.reason });
      await appendTimelineSafe(store, timelineFor(inquiry, action, "notification_accepted", `provider accepted; ${verification.reason}`, "accepted", now.toISOString(), [verification.reason]));
      if (action !== "owner_notification") await logCustomerEmailToCrm(inquiry, action);
      return { ...evaluated, status: "accepted_unverified", reason: verification.reason, attemptId, acceptedAt: unverified.acceptedAt, providerMessageId: unverified.providerMessageId, retryable: false };
    } catch {
      return { ...evaluated, status: "reconciliation_required", reason: "verification_marker_unavailable", attemptId, acceptedAt, retryable: false };
    }
  } finally {
    await store.releaseAttempt({ tenantId: inquiry.tenantId, inquiryId: inquiry.id, action, attemptId }).catch(() => {});
  }
}

/** Convenience entry point for the scheduled no-reply follow-up executor. */
export async function runInquiryFollowUp(
  inquiry: InquiryDeliverySubmission,
  options: {
    policy?: PartialInquiryRoutingPolicy | null;
    approval?: InquiryDeliveryApproval | null;
    responsibilityGate?: ResponsibilityDeliveryGate;
    deps?: InquiryDeliveryDependencies;
  } = {},
): Promise<InquiryDeliveryResult> {
  return deliverInquiryAction(inquiry, "schedule_follow_up", options);
}

/** Convenience alias used by hosts that call all customer messages "replies". */
export async function sendInquiryReply(
  inquiry: InquiryDeliverySubmission,
  options: Parameters<typeof deliverInquiryAction>[2] = {},
): Promise<InquiryDeliveryResult> {
  return deliverInquiryAction(inquiry, "reply", options);
}

/** Render helper exported for rehearsal checks without touching a transport. */
export function renderInquiryMessage(message: InquiryDeliveryMessage): { html: string; text: string } {
  return { html: renderEmailHtml(message.options), text: renderEmailText(message.options) };
}

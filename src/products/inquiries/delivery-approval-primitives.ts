import { createHash, createHmac } from "node:crypto";

import type { LeadRecord } from "@/lib/leads";

import type {
  InquiryCapabilityDefinition,
  InquiryCapabilityState,
  InquiryEngineState,
  InquiryRecord,
  InquiryRecordStatus,
  ResponsibilityAction,
  ResponsibilityPolicy,
} from "./contracts";
import type { InquiryDeliverySubmission } from "./delivery";

// Keep the event kind used by the first delivery draft. The message-review
// route is the newer name at the API boundary, while the governed queue keeps
// one stable persisted kind for existing readers.
export const INQUIRY_MESSAGE_REVIEW_KIND = "inquiry_delivery_approval" as const;
export const INQUIRY_MESSAGE_REVIEW_SCHEMA_VERSION = 1 as const;

export class InquiryMessageReviewEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string = "delivery_approval_failed",
  ) {
    super(message);
    this.name = "InquiryMessageReviewEngineError";
  }
}

export interface InquiryMessageReviewEventMetadata {
  kind: typeof INQUIRY_MESSAGE_REVIEW_KIND;
  schemaVersion: typeof INQUIRY_MESSAGE_REVIEW_SCHEMA_VERSION;
  tenantId: string;
  businessId: string;
  inquiryId: string;
  action: "reply" | "schedule_follow_up" | "owner_notification";
  requestedBy: string;
  responsibilityId: string;
  responsibilityRevision: string;
  capabilityId: string;
  capabilityVersion: number;
  inquiryVersion: string;
  policyVersion: string;
  recipient: string;
  replyTo: string | null;
  subject: string;
  messageBody: string;
  messageDigest: string;
  preparedAt: string;
  expiresAt: string | null;
  reviewTokenHash: string;
  reviewAudience: "owner";
}

export function dependency<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback;
}

export function text(value: unknown, label: string, max = 2_000, allowLineBreaks = false): string {
  if (typeof value !== "string") throw new InquiryMessageReviewEngineError(`${label} is required.`, "delivery_approval_failed");
  const result = value.trim();
  const controlCharacters = allowLineBreaks ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if (!result || result.length > max || controlCharacters.test(result)) {
    throw new InquiryMessageReviewEngineError(`${label} is invalid.`, "delivery_approval_failed");
  }
  return result;
}

export function positiveVersion(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new InquiryMessageReviewEngineError(`${label} is invalid.`, "delivery_approval_failed");
  }
  return Number(value);
}

export function reviewAction(value: unknown): InquiryMessageReviewEventMetadata["action"] {
  if (value === "reply" || value === "schedule_follow_up" || value === "owner_notification") return value;
  throw new InquiryMessageReviewEngineError("This inquiry message action is not supported.", "delivery_approval_failed");
}

export function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(",")}}`;
}

function reviewTokenSecret(): string {
  const configured = process.env.INQUIRY_MESSAGE_REVIEW_SECRET?.trim() || process.env.INQUIRY_PUBLICATION_CLAIM_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "local-inquiry-message-review-secret";
  throw new InquiryMessageReviewEngineError("Message review signing is unavailable.", "delivery_approval_unavailable");
}

export function tokenFor(metadata: Omit<InquiryMessageReviewEventMetadata, "reviewTokenHash">, actorId: string): string {
  return createHmac("sha256", reviewTokenSecret()).update(stable({
    tenantId: metadata.tenantId,
    businessId: metadata.businessId,
    inquiryId: metadata.inquiryId,
    action: metadata.action,
    requestedBy: actorId,
    responsibilityId: metadata.responsibilityId,
    responsibilityRevision: metadata.responsibilityRevision,
    capabilityId: metadata.capabilityId,
    capabilityVersion: metadata.capabilityVersion,
    inquiryVersion: metadata.inquiryVersion,
    policyVersion: metadata.policyVersion,
    recipient: metadata.recipient,
    replyTo: metadata.replyTo,
    subject: metadata.subject,
    messageBody: metadata.messageBody,
    messageDigest: metadata.messageDigest,
    preparedAt: metadata.preparedAt,
    expiresAt: metadata.expiresAt,
  })).digest("hex");
}

export function errorCode(error: unknown): string {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return "delivery_approval_failed";
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message.slice(0, 240) : fallback;
}

export function throwCode(code: string, message: string): never {
  throw new InquiryMessageReviewEngineError(message, code);
}

export function assertOpenInquiry(status: InquiryRecordStatus): void {
  if (status === "handled" || status === "blocked") {
    throwCode("inquiry_changed", "This inquiry is no longer open for message delivery.");
  }
}

export function assertResponsibilitySponsor(responsibility: ResponsibilityPolicy, actorId: string): void {
  if (responsibility.sponsorId !== actorId) {
    throwCode("permission_denied", "Only the current responsibility sponsor can approve this message.");
  }
}

export function statusFromState(state: InquiryEngineState, inquiryId: string, fallback: InquiryRecordStatus): InquiryRecordStatus {
  for (const change of state.changes) {
    if (change.status !== "published") continue;
    const item = change.items.find((entry) => entry.path === `inquiries.${inquiryId}.status`);
    if (item && ["new", "assigned", "follow_up_pending", "handled", "blocked"].includes(String(item.after))) {
      return item.after as InquiryRecordStatus;
    }
  }
  return fallback;
}

export function recordFromLead(
  state: InquiryEngineState,
  capability: InquiryCapabilityState,
  lead: LeadRecord,
  status: InquiryRecordStatus,
): InquiryRecord {
  const fields = lead.fields && typeof lead.fields === "object"
    ? { ...lead.fields }
    : {
        name: lead.name,
        ...(lead.email ? { email: lead.email } : {}),
        ...(lead.message ? { message: lead.message } : {}),
      };
  return {
    id: lead.id,
    businessId: capability.businessId,
    capabilityId: capability.id,
    capabilityVersion: lead.capabilityVersion ?? capability.live?.version ?? 1,
    fields,
    status,
    receivedAt: lead.createdAt,
    timelineEventIds: state.timeline.filter((event) => event.inquiryId === lead.id).map((event) => event.id),
    createdReceiptId: state.actionReceipts.find((receipt) => receipt.inquiryId === lead.id)?.id ?? "",
  };
}

export function responsibilityActionFor(action: InquiryMessageReviewEventMetadata["action"]): ResponsibilityAction {
  if (action === "schedule_follow_up") return "schedule_follow_up";
  if (action === "owner_notification") return "send_message";
  return "reply";
}

export function policyVersionFor(responsibility: ResponsibilityPolicy): string {
  return `responsibility:${responsibility.id}:${responsibility.updatedAt}`;
}

export function inquiryFromLead(
  tenantId: string,
  lead: LeadRecord,
  definition: InquiryCapabilityDefinition,
): InquiryDeliverySubmission {
  return {
    id: lead.id,
    tenantId,
    name: lead.name,
    email: lead.email || "",
    message: lead.message || lead.fields?.message || lead.fields?.request || null,
    source: lead.source || null,
    ...(lead.fields ? { fields: lead.fields } : {}),
    staffDestination: definition.routing?.destination ?? null,
    followUpMessageTemplate: definition.followUp?.messageTemplate ?? null,
    capabilityId: lead.capabilityId || null,
    capabilityVersion: lead.capabilityVersion || null,
    inquiryVersion: lead.id,
    receivedAt: lead.createdAt,
  };
}

export type { LeadRecord } from "@/lib/leads";
export { getLeadById } from "@/lib/leads";

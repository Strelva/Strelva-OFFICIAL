import { addEvent, resolveEvent } from "@/lib/events";
import { getLeads, type LeadRecord } from "@/lib/leads";
import { getRedis } from "@/lib/redis";
import { getConnections } from "@/lib/connections";
import { getTenantRole, roleHasPermission, type ClientRole, type TenantPermission } from "@/lib/auth";
import type { TenantConfig } from "@/lib/types";
import {
  INQUIRY_PUBLISH_EVENT_KIND,
  INQUIRY_UNDO_EVENT_KIND,
  type ClaimPublicationInput,
  type ClaimPublicationResult,
  type CompareAndSwapInput,
  type CompareAndSwapResult,
  type InquiryRepository,
  type InquiryWorkspaceSnapshot,
  type MarkPublicationAcceptedInput,
  type MarkPublicationFailedInput,
  type LinkPublicationEventInput,
  type InquiryRecordOverlay,
  type UpsertInquiryRecordOverlayInput,
  getInquiryRepository,
  InquiryValidationError,
} from "./repository";
import { InquiryEngine } from "./inquiry-engine";
import type {
  InquiryEngineState,
  InquiryRecord,
  InquiryWork,
  InquiryRuleUpdateInput,
  ResponsibilityAction,
  ResponsibilityApprovalClause,
  ResponsibilityNeverClause,
  ResponsibilityUpdateInput,
} from "./contracts";
import type { InquirySurfaceAction, InquirySurfaceResult, InquirySurfaceSnapshot } from "./surface-contracts";
import type { JsonValue } from "./contracts";
import { projectInquiryConnections } from "./connections";
import { applyInquiryEmailConsent, projectInquiryEmailConnection } from "./email-consent";
import { recordedOnboarding, readOnboardingWebsite, projectOnboardingCorrections, SETUP_FIELD_LABELS } from "./onboarding";
import { ensurePatternResponsibility, executePatternCopyAction, executePatternUpdateAction } from "./inquiry-pattern-server";
import { listPatternInstallations } from "./inquiry-pattern-updates";
import { explainWhyWithDelivery, projectInquiryDeliveryTimeline, withoutInquiryDeliveryProjection } from "./delivery-surface";
import { placeholderInquiryRecords, projectedInquiryRecords } from "./record-projection";
import { assertInquiryWorkspaceOpen } from "./workspace-exit";

export { recordedInquiryAssignee, recordedInquiryStatus } from "./record-projection";

export { inquiryReleaseEnabled } from "./release";
export {
  INQUIRY_WORKSPACE_EXIT_CODE,
  InquiryWorkspaceExitBlockedError,
  InquiryWorkspaceExitUnavailableError,
  resolveInquiryWorkspace,
} from "./workspace-exit";
export { executeInquiryPublication } from "./publication";
export { getInquiryRepository } from "./repository";
export { publicationClaimToken } from "./repository";
export { InquiryPersistenceError, InquiryValidationError } from "./repository";
export { projectPublishedInquiry } from "./storefront";
export { validateInquiryFields } from "./inquiry-engine-operations";
export { recordInquiryEvidence } from "./receive";
export { evaluateInquiryResponsibility, evaluateInquiryFollowUpResponsibility } from "./receive";
export type { RecordInquiryEvidenceInput, RecordInquiryEvidenceResult } from "./receive";

/** Customer records are a live Redis projection, never a Postgres fallback. */
export interface InquiryWorkspaceRead {
  tenantId: string;
  businessId: string;
  snapshot: InquiryWorkspaceSnapshot | null;
  records: LeadRecord[] | null;
  recordsAvailable: boolean;
  recordOverlays: InquiryRecordOverlay[];
}

export interface ReadInquiryWorkspaceInput {
  tenantId: string;
  businessId?: string;
  repository?: InquiryRepository;
  leadLimit?: number;
}

/**
 * Read the durable capability state and Redis-authoritative inquiry records.
 * Missing Redis is explicit, so an outage can never render as an empty CRM.
 */
export async function readInquiryWorkspace(input: ReadInquiryWorkspaceInput): Promise<InquiryWorkspaceRead> {
  const businessId = input.businessId ?? input.tenantId;
  const repository = input.repository ?? getInquiryRepository();
  const snapshot = await repository.getSnapshot(input.tenantId, businessId);
  const recordOverlays = await repository.getRecordOverlays(input.tenantId, businessId);
  const redis = getRedis();
  if (!redis) {
    return { tenantId: input.tenantId, businessId, snapshot, records: null, recordsAvailable: false, recordOverlays };
  }
  const records = await getLeads(input.tenantId, Math.max(1, Math.min(input.leadLimit ?? 50, 500)));
  return { tenantId: input.tenantId, businessId, snapshot, records, recordsAvailable: true, recordOverlays };
}

/** Save the engine snapshot with an explicit optimistic-concurrency revision. */
export async function saveInquiryWorkspace(
  input: CompareAndSwapInput & { repository?: InquiryRepository },
): Promise<CompareAndSwapResult> {
  await assertInquiryWorkspaceOpen({ tenantId: input.tenantId });
  return (input.repository ?? getInquiryRepository()).compareAndSwap(input);
}

/** Record the provider acceptance before any engine/event resolution attempt. */
export async function markInquiryPublicationAccepted(
  input: MarkPublicationAcceptedInput & { repository?: InquiryRepository },
) {
  return (input.repository ?? getInquiryRepository()).markPublicationAccepted(input);
}

export async function markInquiryPublicationFailed(
  input: MarkPublicationFailedInput & { repository?: InquiryRepository },
) {
  return (input.repository ?? getInquiryRepository()).markPublicationFailed(input);
}

export async function linkInquiryPublicationEvent(
  input: LinkPublicationEventInput & { repository?: InquiryRepository },
) {
  return (input.repository ?? getInquiryRepository()).linkPublicationEvent(input);
}

export async function upsertInquiryRecordOverlay(
  input: UpsertInquiryRecordOverlayInput & { repository?: InquiryRepository },
): Promise<InquiryRecordOverlay> {
  return (input.repository ?? getInquiryRepository()).upsertRecordOverlay(input);
}

export interface QueueInquiryPublicationInput extends ClaimPublicationInput {
  repository?: InquiryRepository;
  /** Optional prose shown in the approval queue. It never changes the command digest. */
  summary?: string;
}

export interface QueueInquiryPublicationResult {
  claim: ClaimPublicationResult["claim"];
  acquired: boolean;
  reason?: "already_claimed" | "already_accepted" | "already_failed";
  eventId: string | null;
}

/**
 * Place a make-live or undo request in the existing governed event queue. The
 * route intentionally stops here. No capability state is made live by this
 * function, and the claim token is never returned to the browser.
 */
export async function queueInquiryPublication(input: QueueInquiryPublicationInput): Promise<QueueInquiryPublicationResult> {
  await assertInquiryWorkspaceOpen({ tenantId: input.tenantId });
  const repository = input.repository ?? getInquiryRepository();
  const claim = await repository.claimPublication(input);
  if (!claim.acquired) {
    return { acquired: false, claim: claim.claim, reason: claim.reason, eventId: claim.claim.governanceEventId };
  }

  const kind = input.action === "undo" ? INQUIRY_UNDO_EVENT_KIND : INQUIRY_PUBLISH_EVENT_KIND;
  let createdEventId: string | null = null;
  try {
    const event = await addEvent({
      tenantId: input.tenantId,
      source: "website",
      type: "change_request",
      title: input.action === "undo" ? "Undo inquiry capability change" : "Make inquiry capability live",
      body: input.summary?.trim().slice(0, 500) || (input.action === "undo"
        ? "Review the requested inquiry capability undo before it changes the live form."
        : "Review the requested inquiry capability before it changes the live form."),
      status: "pending",
      metadata: {
        kind,
        businessId: input.businessId,
        requestId: input.requestId,
        capabilityId: input.capabilityId,
        changeId: input.changeId,
        version: input.version,
        action: input.action,
        publicationClaimId: claim.claim.id,
        idempotencyKey: input.idempotencyKey,
      },
    }, { requirePersistence: true });

    createdEventId = event.id;
    const linked = await repository.linkPublicationEvent({
      tenantId: input.tenantId,
      claimId: claim.claim.id,
      claimToken: claim.claimToken,
      governanceEventId: event.id,
    });
    return { acquired: true, claim: linked, eventId: event.id };
  } catch (error) {
    if (createdEventId) await resolveEvent(createdEventId, "dismissed", { actor: "system-cleanup" }).catch(() => {});
    // A claim without an approval event must not remain executable forever.
    await repository.markPublicationFailed({
      tenantId: input.tenantId,
      claimId: claim.claim.id,
      claimToken: claim.claimToken,
      reason: "governance_event_unavailable",
    }).catch(() => {});
    throw error;
  }
}

/**
 * Server-only helper used by the authenticated record view. It reads customer
 * fields from Redis, then appends durable receipts from the saved engine state.
 */
export async function readInquiryRecord(input: {
  tenantId: string;
  businessId?: string;
  inquiryId: string;
  repository?: InquiryRepository;
  leadLimit?: number;
}) {
  const workspace = await readInquiryWorkspace(input);
  if (!workspace.recordsAvailable || !workspace.records) {
    return { available: false as const, record: null, receipts: [], overlay: null, timeline: [] };
  }
  const found = workspace.records.find((lead) => lead.id === input.inquiryId);
  const overlay = workspace.recordOverlays.find((item) => item.inquiryId === input.inquiryId) ?? null;
  if (!found) return { available: true as const, record: null, receipts: [], overlay, timeline: [] };
  const receipts = workspace.snapshot?.state.actionReceipts.filter((receipt) => receipt.inquiryId === found.id) ?? [];
  const timeline = workspace.snapshot?.state.timeline.filter((event) => event.inquiryId === found.id) ?? [];
  return { available: true as const, record: found, receipts, overlay, timeline };
}

/** A narrow state adapter for hosts that already ran the canonical engine. */
export function stateFromSnapshot(snapshot: InquiryWorkspaceSnapshot | null): InquiryEngineState | null {
  return snapshot?.state ? { ...snapshot.state, inquiries: [] } : null;
}

export class InquiryConcurrencyError extends Error {
  constructor(public readonly current: InquiryWorkspaceSnapshot | null) {
    super("This inquiry workspace changed. Refresh before trying that action again.");
    this.name = "InquiryConcurrencyError";
  }
}

type SurfaceContext = {
  tenantId: string;
  businessId: string;
  config: TenantConfig;
  audience?: "business" | "agency";
  repository?: InquiryRepository;
  leadLimit?: number;
};

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InquiryValidationError("The inquiry action is malformed.");
  }
  return value as Record<string, unknown>;
}

function cleanActionString(value: unknown, label: string, max = 256): string {
  if (typeof value !== "string") throw new InquiryValidationError(`${label} is required.`);
  const result = value.trim();
  if (!result || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) {
    throw new InquiryValidationError(`${label} is invalid.`);
  }
  return result;
}

function optionalActionString(value: unknown, label: string, max = 256): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return cleanActionString(value, label, max);
}

function actionJson(value: unknown, label: string, depth = 0): JsonValue {
  if (depth > 6) throw new InquiryValidationError(`${label} is too deeply nested.`);
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (value.length > 100) throw new InquiryValidationError(`${label} has too many entries.`);
    return value.map((item) => actionJson(item, label, depth + 1));
  }
  if (typeof value === "object") {
    const result: { [key: string]: JsonValue } = {};
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 100) throw new InquiryValidationError(`${label} has too many entries.`);
    for (const [key, child] of entries) {
      if (!/^[A-Za-z][A-Za-z0-9_.-]{0,100}$/.test(key)) throw new InquiryValidationError(`${label} contains an invalid field.`);
      result[key] = actionJson(child, label, depth + 1);
    }
    return result;
  }
  throw new InquiryValidationError(`${label} must be JSON data.`);
}

function actionNumber(value: unknown, label: string, min = 1, max = 100_000): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new InquiryValidationError(`${label} is invalid.`);
  }
  return value;
}

function actionStringList(value: unknown, label: string, max = 100): string[] {
  if (!Array.isArray(value) || value.length > max) throw new InquiryValidationError(`${label} is invalid.`);
  const values = value.map((item) => cleanActionString(item, label, 256));
  return [...new Set(values)];
}

function actionFields(value: unknown): Record<string, string> {
  const object = objectValue(value);
  const fields: Record<string, string> = {};
  for (const [key, item] of Object.entries(object).slice(0, 30)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key) || typeof item !== "string" || item.length > 5_000) {
      throw new InquiryValidationError("Inquiry fields are invalid.");
    }
    fields[key] = item;
  }
  return fields;
}

const SHAPE_LINES = new Set(["form", "record", "routing", "follow_up"]);
const RESPONSIBILITY_ACTIONS = new Set<ResponsibilityAction>([
  "reply",
  "ask_question",
  "assign",
  "send_message",
  "schedule_follow_up",
  "change_rule",
  "publish",
  "delete",
  "change_permissions",
  "charge",
  "quote_price",
  "promise_date",
]);

function responsibilityActions(value: unknown, label: string): ResponsibilityAction[] {
  if (!Array.isArray(value) || value.length > 30) throw new InquiryValidationError(`${label} is invalid.`);
  const actions = actionStringList(value, label, 30);
  if (actions.some((action) => !RESPONSIBILITY_ACTIONS.has(action as ResponsibilityAction))) throw new InquiryValidationError(`${label} contains an unsupported action.`);
  return [...new Set(actions)] as ResponsibilityAction[];
}

function responsibilityClauses(value: unknown, label: string): ResponsibilityNeverClause[] {
  if (!Array.isArray(value) || value.length > 30) throw new InquiryValidationError(`${label} is invalid.`);
  return value.map((item) => {
    const clause = objectValue(item);
    const action = cleanActionString(clause.action, `${label} action`, 80) as ResponsibilityAction;
    if (!RESPONSIBILITY_ACTIONS.has(action)) throw new InquiryValidationError(`${label} contains an unsupported action.`);
    return { action, sentence: cleanActionString(clause.sentence, `${label} sentence`, 1_000) };
  });
}

function responsibilityApprovalClauses(value: unknown, label: string): ResponsibilityApprovalClause[] {
  return responsibilityClauses(value, label) as ResponsibilityApprovalClause[];
}

function parseResponsibilityUpdate(value: unknown, actorId: string): ResponsibilityUpdateInput {
  const input = objectValue(value);
  const result: ResponsibilityUpdateInput = { actorId };
  if (Object.prototype.hasOwnProperty.call(input, "title")) result.title = cleanActionString(input.title, "Responsibility title", 200);
  if (Object.prototype.hasOwnProperty.call(input, "scope")) result.scope = cleanActionString(input.scope, "Responsibility scope", 1_000);
  if (Object.prototype.hasOwnProperty.call(input, "allowedActions")) result.allowedActions = responsibilityActions(input.allowedActions, "Allowed actions");
  if (Object.prototype.hasOwnProperty.call(input, "preAuthorizedActions")) result.preAuthorizedActions = responsibilityActions(input.preAuthorizedActions, "Pre-authorized actions");
  if (Object.prototype.hasOwnProperty.call(input, "never")) result.never = responsibilityClauses(input.never, "Never clauses");
  if (Object.prototype.hasOwnProperty.call(input, "approval")) result.approval = responsibilityApprovalClauses(input.approval, "Ask-first clauses");
  if (Object.prototype.hasOwnProperty.call(input, "budget")) {
    const budget = objectValue(input.budget);
    const parsed: NonNullable<ResponsibilityUpdateInput["budget"]> = {};
    if (Object.prototype.hasOwnProperty.call(budget, "dailyMessages")) {
      const dailyMessages = actionNumber(budget.dailyMessages, "Daily message limit", 1, 10_000);
      if (dailyMessages === undefined) throw new InquiryValidationError("Daily message limit is invalid.");
      parsed.dailyMessages = dailyMessages;
    }
    if (Object.prototype.hasOwnProperty.call(budget, "timezone")) parsed.timezone = cleanActionString(budget.timezone, "Budget timezone", 100);
    result.budget = parsed;
  }
  if (Object.prototype.hasOwnProperty.call(input, "escalation")) {
    const escalation = objectValue(input.escalation);
    result.escalation = {
      primary: cleanActionString(escalation.primary, "Primary escalation contact", 200),
      secondary: escalation.secondary === null ? null : optionalActionString(escalation.secondary, "Secondary escalation contact", 200) ?? null,
    };
  }
  if (Object.prototype.hasOwnProperty.call(input, "voice")) result.voice = cleanActionString(input.voice, "Responsibility voice", 1_000);
  if (Object.prototype.hasOwnProperty.call(input, "hours")) {
    const hours = objectValue(input.hours);
    const parsed: NonNullable<ResponsibilityUpdateInput["hours"]> = {};
    if (Object.prototype.hasOwnProperty.call(hours, "timezone")) parsed.timezone = cleanActionString(hours.timezone, "Hours timezone", 100);
    if (Object.prototype.hasOwnProperty.call(hours, "days")) {
      if (!Array.isArray(hours.days) || hours.days.length > 7) throw new InquiryValidationError("Hours days are invalid.");
      const days = hours.days.map((day) => {
        if (typeof day !== "number" || !Number.isSafeInteger(day) || day < 0 || day > 6) throw new InquiryValidationError("Hours days are invalid.");
        return day;
      });
      parsed.days = [...new Set(days)];
    }
    if (Object.prototype.hasOwnProperty.call(hours, "start")) parsed.start = cleanActionString(hours.start, "Hours start", 20);
    if (Object.prototype.hasOwnProperty.call(hours, "end")) parsed.end = cleanActionString(hours.end, "Hours end", 20);
    result.hours = parsed;
  }
  if (Object.prototype.hasOwnProperty.call(input, "requiredCleanReceipts")) {
    const required = actionNumber(input.requiredCleanReceipts, "Clean receipt requirement", 1, 100);
    if (required === undefined) throw new InquiryValidationError("Clean receipt requirement is invalid.");
    result.requiredCleanReceipts = required;
  }
  return result;
}

function parseRulePatch(value: unknown, label: string): InquiryRuleUpdateInput["routing"] {
  if (value === null) return null;
  const rule = objectValue(value);
  const result: NonNullable<InquiryRuleUpdateInput["routing"]> = {};
  if (Object.prototype.hasOwnProperty.call(rule, "destination")) result.destination = cleanActionString(rule.destination, `${label} destination`, 200);
  if (Object.prototype.hasOwnProperty.call(rule, "withinMinutes")) {
    const withinMinutes = actionNumber(rule.withinMinutes, `${label} delay`, 1, 365 * 24 * 60);
    if (withinMinutes === undefined) throw new InquiryValidationError(`${label} delay is invalid.`);
    result.withinMinutes = withinMinutes;
  }
  return result;
}

function parseFollowUpPatch(value: unknown): InquiryRuleUpdateInput["followUp"] {
  if (value === null) return null;
  const rule = objectValue(value);
  const result: NonNullable<InquiryRuleUpdateInput["followUp"]> = {};
  if (Object.prototype.hasOwnProperty.call(rule, "afterMinutes")) {
    const afterMinutes = actionNumber(rule.afterMinutes, "Follow-up delay", 1, 365 * 24 * 60);
    if (afterMinutes === undefined) throw new InquiryValidationError("Follow-up delay is invalid.");
    result.afterMinutes = afterMinutes;
  }
  if (Object.prototype.hasOwnProperty.call(rule, "maxAttempts")) {
    const maxAttempts = actionNumber(rule.maxAttempts, "Follow-up attempts", 1, 100);
    if (maxAttempts === undefined) throw new InquiryValidationError("Follow-up attempts are invalid.");
    result.maxAttempts = maxAttempts;
  }
  if (Object.prototype.hasOwnProperty.call(rule, "messageTemplate")) result.messageTemplate = cleanActionString(rule.messageTemplate, "Follow-up message", 5_000);
  return result;
}

/** Parse the browser action into a server-owned actor-bound command. */
export function parseInquirySurfaceAction(value: unknown, actorId: string, businessId: string): InquirySurfaceAction {
  const action = objectValue(value);
  const kind = cleanActionString(action.kind, "Action", 40);
  switch (kind) {
    case "start": {
      const input = objectValue(action.input);
      const followUpAfterMinutes = actionNumber(input.followUpAfterMinutes, "Follow-up delay", 1, 365 * 24 * 60);
      return {
        kind,
        input: {
          actorId,
          intent: cleanActionString(input.intent, "Request", 2_000),
          ...(optionalActionString(input.requestId, "Request id") ? { requestId: optionalActionString(input.requestId, "Request id") } : {}),
          ...(optionalActionString(input.capabilityId, "Capability id") ? { capabilityId: optionalActionString(input.capabilityId, "Capability id") } : {}),
          ...(optionalActionString(input.title, "Title", 160) ? { title: optionalActionString(input.title, "Title", 160) } : {}),
          ...(optionalActionString(input.destination, "Destination", 200) ? { destination: optionalActionString(input.destination, "Destination", 200) } : {}),
          ...(followUpAfterMinutes === undefined ? {} : { followUpAfterMinutes }),
          // Connection status is derived server-side. A browser cannot grant
          // itself an email connection by posting a forged binding.
        },
      };
    }
    case "contextual-request":
      return {
        kind,
        inquiryId: cleanActionString(action.inquiryId, "Inquiry id"),
        intent: cleanActionString(action.intent, "Request", 2_000),
        actorId,
      };
    case "accept-shape": {
      const requestId = cleanActionString(action.requestId, "Request id");
      const input = action.input === undefined ? {} : objectValue(action.input);
      const selectedLineIds = input.selectedLineIds === undefined
        ? undefined
        : actionStringList(input.selectedLineIds, "Shape lines", 4).filter((id) => SHAPE_LINES.has(id)) as Array<"form" | "record" | "routing" | "follow_up">;
      if (selectedLineIds && selectedLineIds.length === 0) throw new InquiryValidationError("Keep at least the required shape lines.");
      return { kind, requestId, input: { actorId, ...(selectedLineIds ? { selectedLineIds } : {}) } };
    }
    case "edit": {
      const requestId = cleanActionString(action.requestId, "Request id");
      const input = objectValue(action.input);
      if (!Object.prototype.hasOwnProperty.call(input, "after")) throw new InquiryValidationError("An edit value is required.");
      const source = input.source === "words" || input.source === "manual" ? input.source : "manual";
      const expectedBefore = Object.prototype.hasOwnProperty.call(input, "expectedBefore") ? actionJson(input.expectedBefore, "Expected preview value") : undefined;
      return {
        kind,
        requestId,
        input: {
          actorId,
          source,
          path: cleanActionString(input.path, "Preview path", 256),
          after: actionJson(input.after, "Preview value"),
          ...(expectedBefore === undefined ? {} : { expectedBefore }),
        },
      };
    }
    case "edit-rules": {
      const requestId = cleanActionString(action.requestId, "Request id");
      const input = objectValue(action.input);
      const parsed: InquiryRuleUpdateInput = { actorId };
      if (Object.prototype.hasOwnProperty.call(input, "routing")) parsed.routing = parseRulePatch(input.routing, "Routing");
      if (Object.prototype.hasOwnProperty.call(input, "followUp")) parsed.followUp = parseFollowUpPatch(input.followUp);
      if (input.source === "words" || input.source === "manual") parsed.source = input.source;
      if (Object.keys(parsed).length === 1) throw new InquiryValidationError("Choose a routing or follow-up rule to edit.");
      return { kind, requestId, input: parsed };
    }
    case "rehearse":
    case "publish":
    case "undo":
    case "pause":
    case "resume":
      return { kind, requestId: cleanActionString(action.requestId, "Request id"), actorId };
    case "set-email-consent":
      if (typeof action.granted !== "boolean") throw new InquiryValidationError("Choose whether to grant email permission.");
      return { kind, requestId: cleanActionString(action.requestId, "Request id"), granted: action.granted, actorId };
    case "simulate-inquiry":
      return {
        kind,
        capabilityId: cleanActionString(action.capabilityId, "Capability id"),
        fields: actionFields(action.fields),
        actorId: "rehearsal-test",
      };
    case "bulk-record": {
      const recordIds = actionStringList(action.recordIds, "Inquiry records");
      const bulkAction = action.action === "assign" || action.action === "mark_handled" ? action.action : null;
      if (!bulkAction) throw new InquiryValidationError("A valid bulk action is required.");
      return { kind, recordIds, action: bulkAction, actorId };
    }
    case "bulk-undo":
      return { kind, recordIds: actionStringList(action.recordIds, "Inquiry records"), actorId };
    case "correct-onboarding":
      return { kind, statementId: cleanActionString(action.statementId, "Statement id", 80), value: cleanActionString(action.value, "Correction", 1_000), actorId };
    case "scan-onboarding":
      return { kind, website: cleanActionString(action.website, "Website", 2_000), actorId };
    case "promote-responsibility":
      return { kind, responsibilityId: cleanActionString(action.responsibilityId, "Responsibility id"), actorId };
    case "update-responsibility":
      return {
        kind,
        responsibilityId: cleanActionString(action.responsibilityId, "Responsibility id"),
        input: parseResponsibilityUpdate(action.input, actorId),
      };
    case "fix-why":
      return { kind, requestId: cleanActionString(action.requestId, "Inquiry id"), path: cleanActionString(action.path, "Fix path", 256), actorId };
    case "use-pattern": {
      const targetBusinessId = cleanActionString(action.businessId, "Business id", 160);
      if (targetBusinessId !== businessId) throw new InquiryValidationError("A pattern can only be installed in the selected business.");
      return { kind, patternId: cleanActionString(action.patternId, "Pattern id"), businessId: targetBusinessId, ...(action.destination ? { destination: cleanActionString(action.destination, "Staff destination", 254) } : {}), actorId };
    }
    case "propose-pattern-update":
      return {
        kind,
        installationId: cleanActionString(action.installationId, "Pattern installation id"),
        capabilityId: cleanActionString(action.capabilityId, "Capability id"),
        actorId,
      };
    case "stage-pattern-update": {
      const sourceVersion = actionNumber(action.sourceVersion, "Source pattern version", 1, 100_000);
      if (sourceVersion === undefined) throw new InquiryValidationError("A source pattern version is required.");
      if (!Array.isArray(action.resolutions) || action.resolutions.length > 100) throw new InquiryValidationError("Pattern conflict choices are invalid.");
      const resolutions = action.resolutions.map((item) => {
        const choice = objectValue(item);
        const selected = choice.choice === "local" || choice.choice === "source" ? choice.choice : null;
        if (!selected) throw new InquiryValidationError("Choose the local or source value for every pattern conflict.");
        return { path: cleanActionString(choice.path, "Pattern conflict path", 256), choice: selected } as const;
      });
      return {
        kind,
        installationId: cleanActionString(action.installationId, "Pattern installation id"),
        capabilityId: cleanActionString(action.capabilityId, "Capability id"),
        sourceVersion,
        resolutions,
        actorId,
      };
    }
    default:
      throw new InquiryValidationError("Unsupported inquiry action.");
  }
}

export function inquiryPermissionForAction(action: InquirySurfaceAction): TenantPermission {
  if (action.kind === "publish" || action.kind === "undo") return "publishing:manage";
  if (action.kind === "correct-onboarding" || action.kind === "scan-onboarding" || action.kind === "set-email-consent") return "settings:write";
  if (action.kind === "pause" || action.kind === "resume" || action.kind === "promote-responsibility" || action.kind === "update-responsibility") return "settings:write";
  return "content:write";
}

function stateForEngine(workspace: InquiryWorkspaceRead, businessId: string): InquiryEngineState {
  const base = stateFromSnapshot(workspace.snapshot) ?? new InquiryEngine({ businessId }).snapshot();
  const records = workspace.recordsAvailable && workspace.records
    ? projectedInquiryRecords(base, workspace.records, workspace.recordOverlays)
    : placeholderInquiryRecords(base, workspace.recordOverlays);
  const ids = new Set(records.map((record) => record.id));
  return { ...base, inquiries: [...records, ...placeholderInquiryRecords(base, workspace.recordOverlays).filter((record) => !ids.has(record.id))] };
}

async function surfacePermissions(tenantId: string): Promise<InquirySurfaceSnapshot["permissions"]> {
  const role = await getTenantRole(tenantId).catch(() => null);
  const can = (permission: TenantPermission): boolean => role === "super_admin" || (role !== null && roleHasPermission(role as ClientRole, permission));
  return {
    canStart: can("content:write"),
    canEdit: can("content:write"),
    canPublish: can("publishing:manage"),
    canManageRecords: can("content:write"),
    canCorrectOnboarding: can("settings:write"),
    canManageResponsibility: can("settings:write"),
    canManageConnections: can("settings:write"),
  };
}

async function surfaceSnapshot(input: SurfaceContext, workspace: InquiryWorkspaceRead, config = input.config, stateOverride?: InquiryEngineState): Promise<InquirySurfaceSnapshot> {
  const records = stateOverride?.inquiries ?? (workspace.recordsAvailable && workspace.records
    ? projectedInquiryRecords(workspace.snapshot?.state ? { ...workspace.snapshot.state, inquiries: [] } : new InquiryEngine({ businessId: input.businessId }).snapshot(), workspace.records, workspace.recordOverlays)
    : []);
  const baseState = stateOverride ?? (workspace.snapshot?.state ? { ...workspace.snapshot.state, inquiries: records } : new InquiryEngine({ businessId: input.businessId, state: { ...new InquiryEngine({ businessId: input.businessId }).snapshot(), inquiries: records } }).snapshot());
  const delivery = await projectInquiryDeliveryTimeline({ tenantId: input.tenantId, businessId: input.businessId, state: baseState });
  const visibleState = delivery.state;
  const whyByInquiry: Record<string, import("./contracts").WhyResult> = {};
  if (visibleState.inquiries.length > 0) {
    try {
      const engine = new InquiryEngine({ businessId: input.businessId, state: visibleState });
      for (const record of visibleState.inquiries) whyByInquiry[record.id] = explainWhyWithDelivery(engine, record.id, delivery.evidence);
    } catch {
      // A historical record with incomplete evidence remains visible. Why is
      // omitted rather than inferred from customer fields.
    }
  }
  let connections: Awaited<ReturnType<typeof getConnections>> | null = null;
  try {
    if (getRedis()) connections = await getConnections(input.tenantId);
  } catch {
    connections = null;
  }
  const permissions = await surfacePermissions(input.tenantId);
  const readOnly = permissions?.canEdit !== true;
  const businessRole: "owner" | "agency_member" | "read_only" = readOnly ? "read_only" : input.audience === "agency" ? "agency_member" : "owner";
  const website = config.siteUrl ?? config.productionDomain ?? null;
  const projectedConnections = projectInquiryConnections(input.tenantId, connections, "/account?connections=1");
  const patternInstallations = listPatternInstallations(new InquiryEngine({ businessId: input.businessId, state: baseState })).map(({ id, capabilityId, sourceBusinessId, sourceCapabilityId, sourceVersion, targetVersion, status, lastProposalId, updatedAt }) => ({ id, capabilityId, sourceBusinessId, sourceCapabilityId, sourceVersion, targetVersion, status, lastProposalId, updatedAt }));
  try {
    const email = await projectInquiryEmailConnection(new InquiryEngine({ businessId: input.businessId, state: stateForEngine(workspace, input.businessId) }), input.tenantId);
    projectedConnections.splice(projectedConnections.findIndex((item) => item.id === "email"), 1, email);
  } catch { /* Leave connection availability explicit when its authority cannot be read. */ }
  return {
    revision: workspace.snapshot?.revision ?? null,
    business: {
      id: input.businessId,
      tenantId: input.tenantId,
      name: config.siteName,
      domain: website,
      role: businessRole,
      description: config.industry ? `${config.industry} inquiry workspace.` : "Inquiry workspace for this business.",
    },
    state: visibleState,
    capabilities: visibleState.capabilities,
    connections: projectedConnections,
    onboarding: projectOnboardingCorrections(recordedOnboarding(baseState.actionReceipts) ?? {
      website,
      statements: [
        { id: "website", label: "Website", value: website, provenance: website ? "Tenant settings" : null, editable: true, confirmed: Boolean(website) },
        { id: "business", label: "Business name", value: config.siteName || null, provenance: "Tenant settings", editable: true, confirmed: Boolean(config.siteName) },
        { id: "type", label: "Business type", value: config.industry || null, provenance: config.industry ? "Tenant settings" : null, editable: true, confirmed: Boolean(config.industry) },
      ],
      checks: [{ id: "website", label: "Website evidence", status: "unknown", detail: website ? "An address is recorded. Read the website to propose sourced facts." : "Add a website address before running a check." }],
    }, baseState.actionReceipts),
    audience: input.audience ?? "business",
    available: true,
    recordsAvailable: workspace.recordsAvailable,
    readOnly,
    rehearsal: false,
    deliveryEvidence: delivery.evidence,
    pausedRequestIds: visibleState.responsibilities.filter((policy) => policy.status === "paused").flatMap((policy) => visibleState.capabilities.find((capability) => capability.id === policy.capabilityId)?.activeRequestId ? [visibleState.capabilities.find((capability) => capability.id === policy.capabilityId)!.activeRequestId!] : []),
    permissions,
    whyByInquiry,
    patterns: visibleState.capabilities.filter((capability) => capability.live && capability.status === "live").map((capability) => ({
      id: capability.id,
      name: capability.live!.name,
      summary: "Reuse this rehearsed inquiry configuration with a fresh review.",
      sourceBusinessId: capability.businessId,
      capabilityId: capability.id,
      provenVersion: capability.live!.version,
      cleanReceiptCount: visibleState.changes.filter((change) => change.capabilityId === capability.id && change.verification?.verified).length,
    })),
    patternInstallations,
  };
}

export async function readInquirySurface(input: SurfaceContext): Promise<{ snapshot: InquirySurfaceSnapshot; workspace: InquiryWorkspaceRead }> {
  const workspace = await readInquiryWorkspace(input);
  return { snapshot: await surfaceSnapshot(input, workspace), workspace };
}

function stageUndo(engine: InquiryEngine, requestId: string, actorId: string): { work: InquiryWork; change: NonNullable<InquirySurfaceResult["change"]> } {
  const work = engine._request(requestId);
  const active = work.activeChangeId ? engine._change(work.activeChangeId) : null;
  const existingUndo = active?.undoOfChangeId ? active : null;
  const plan = existingUndo ? null : engine.prepareUndo(requestId);
  const receipt = existingUndo ?? plan!.receipt;
  const now = engine._now();
  if (!existingUndo) {
    engine._state().changes.unshift(receipt);
    work.activeChangeId = receipt.id;
  }
  work.publishApproval = { actorId, version: receipt.targetVersion, action: "undo", approvedAt: now, explicit: true };
  work.state = "ready_to_publish";
  work.updatedAt = now;
  receipt.status = "ready";
  receipt.actorIds = [...new Set([...receipt.actorIds, actorId])];
  receipt.updatedAt = now;
  if (!existingUndo) engine._addActionReceipt({
    businessId: engine.businessId,
    requestId: work.id,
    capabilityId: work.capabilityId,
    inquiryId: null,
    responsibilityId: null,
    actor: { kind: "person", id: actorId },
    action: "approve_undo",
    what: `Approved undo of change ${receipt.undoOfChangeId}.`,
    why: "Undo restores configuration while preserving inquiry records received meanwhile.",
    lookedAt: ["change receipt", `preserved ${receipt.preservedInquiryIds.length} inquiry records`],
    outcome: "recorded",
    evidence: ["explicit undo approval"],
    createdAt: now,
  });
  return { work: engine.getWork(requestId), change: engine._change(receipt.id) };
}

export async function executeInquirySurface(input: {
  context: SurfaceContext;
  action: InquirySurfaceAction;
  expectedRevision: number | null;
  actorId: string;
}): Promise<InquirySurfaceResult> {
  const { context, action, actorId } = input;
  const workspace = await readInquiryWorkspace(context);
  const delivery = await projectInquiryDeliveryTimeline({
    tenantId: context.tenantId,
    businessId: context.businessId,
    state: stateForEngine(workspace, context.businessId),
  });
  const engine = new InquiryEngine({ businessId: context.businessId, state: delivery.state });
  let work: InquiryWork | undefined;
  const record: InquiryRecord | undefined = undefined;
  let change: InquirySurfaceResult["change"];
  let rehearsal: InquirySurfaceResult["rehearsal"];
  let why: import("./contracts").WhyResult | undefined;
  let affectedRecordIds: string[] | undefined;
  let message: string | undefined;
  let patternUpdate: InquirySurfaceResult["patternUpdate"];
  const persist = true;
  const nextConfig = context.config;

  switch (action.kind) {
    case "start":
      work = engine.start({ ...action.input, actorId, emailConnection: { status: "missing", consent: "missing", lastCheckedAt: null } });
      break;
    case "contextual-request":
      work = engine.startContextualRequest({ actorId, inquiryId: action.inquiryId, intent: action.intent });
      message = `Started a new request from inquiry ${action.inquiryId}. Review its shape before continuing.`;
      break;
    case "accept-shape":
      work = engine.acceptShape(action.requestId, { ...action.input, actorId });
      ensurePatternResponsibility(engine, work, actorId);
      break;
    case "edit": {
      const result = engine.applyDraftEdit(action.requestId, { ...action.input, actorId });
      work = result.work;
      change = result.receipt;
      break;
    }
    case "edit-rules": {
      const result = engine.updateInquiryRules(action.requestId, { ...action.input, actorId });
      work = result.work;
      change = result.receipt;
      break;
    }
    case "set-email-consent": {
      const result = await applyInquiryEmailConsent(engine, { tenantId: context.tenantId, requestId: action.requestId, actorId, granted: action.granted });
      work = result.work;
      change = result.receipt;
      message = result.message;
      break;
    }
    case "rehearse":
      rehearsal = engine.runRehearsal(action.requestId);
      work = engine.getWork(action.requestId);
      break;
    case "publish": {
      const current = engine.getWork(action.requestId);
      if (!current.draft) throw new InquiryValidationError("Accept the shape before making it live.");
      work = engine.approvePublish(action.requestId, { actorId, version: current.draft.version });
      change = work.activeChangeId ? engine._change(work.activeChangeId) : undefined;
      message = "Make live is queued for governed execution.";
      break;
    }
    case "undo": {
      const staged = stageUndo(engine, action.requestId, actorId);
      work = staged.work;
      change = staged.change;
      message = "Undo is queued for governed execution. Inquiry records stay preserved.";
      break;
    }
    case "simulate-inquiry":
      throw new InquiryValidationError("Test customers are available only in the isolated rehearsal preview.");
    case "pause":
    case "resume": {
      const target = engine.getWork(action.requestId);
      const policy = engine._state().responsibilities.find((item) => item.capabilityId === target.capabilityId);
      if (!policy) throw new InquiryValidationError("This capability has no standing responsibility.");
      if (action.kind === "pause") engine.pauseResponsibility(policy.id, actorId);
      else engine.resumeResponsibility(policy.id, actorId);
      work = engine.getWork(action.requestId);
      break;
    }
    case "bulk-record":
      change = engine.bulkUpdateInquiries({ inquiryIds: action.recordIds, actorId, status: action.action === "assign" ? "assigned" : "handled", ...(action.action === "assign" ? { assigneeId: actorId } : {}), why: "The authorized user selected these inquiries for one grouped change." });
      affectedRecordIds = action.recordIds;
      break;
    case "bulk-undo": {
      const selected = new Set(action.recordIds);
      const source = engine._state().changes.find((item) => item.undoAvailable && item.items.length > 0 && item.items.every((item) => item.kind === "record" && selected.has(item.path.split(".")[1] ?? "")));
      if (!source) throw new InquiryValidationError("There is no matching bulk change available to undo.");
      change = engine.undoBulkChange(source.id, { actorId });
      affectedRecordIds = action.recordIds;
      break;
    }
    case "scan-onboarding": {
      const facts = await readOnboardingWebsite(action.website);
      engine._addActionReceipt({ businessId: context.businessId, requestId: null, capabilityId: null, inquiryId: null, responsibilityId: null,
        actor: { kind: "person", id: actorId }, action: "onboarding_scan", what: "Read public website metadata to propose business facts.",
        why: "The user requested website-based setup.", lookedAt: [facts.website ?? action.website],
        outcome: facts.checks.some((check) => check.status === "failed") ? "failed" : "proposed", evidence: ["Public page metadata; statements require confirmation."], setupFacts: facts, createdAt: engine._now() });
      message = "Review the website statements. Existing corrections stay preserved.";
      break;
    }
    case "correct-onboarding": {
      const value = action.value.trim();
      if (action.statementId === "website") {
        let website: URL;
        try { website = new URL(value); } catch { throw new InquiryValidationError("Enter a complete website address."); }
        if (!(["http:", "https:"] as string[]).includes(website.protocol)) throw new InquiryValidationError("Use an HTTP or HTTPS website address.");
        if (website.username || website.password) throw new InquiryValidationError("Use a website address without credentials.");
      } else if (!Object.hasOwn(SETUP_FIELD_LABELS, action.statementId)) {
        throw new InquiryValidationError("That onboarding statement cannot be edited.");
      }
      engine._addActionReceipt({ businessId: context.businessId, requestId: null, capabilityId: null, inquiryId: null, responsibilityId: null,
        actor: { kind: "person", id: actorId }, action: "onboarding_correction", what: `Confirmed the ${action.statementId} setup statement.`,
        why: "The user corrected or confirmed a business fact.", lookedAt: [action.statementId], outcome: "recorded",
        evidence: ["Explicit setup correction"], setupFacts: { website: null, statements: [{ id: action.statementId, label: action.statementId, value, provenance: "User correction", confirmed: true, editable: true }], checks: [] }, createdAt: engine._now() });
      message = "The setup correction and its receipt were saved. Website publishing settings are unchanged.";
      break;
    }
    case "promote-responsibility":
      engine.promoteResponsibility(action.responsibilityId, actorId);
      break;
    case "update-responsibility":
      engine.updateResponsibility(action.responsibilityId, { ...action.input, actorId });
      message = "The responsibility was updated and returned to supervised trust. Its receipt is recorded.";
      break;
    case "fix-why": {
      if (!delivery.evidence.available) throw new InquiryValidationError("Delivery evidence is unavailable. Refresh when the provider timeline can be read before applying a Why fix.");
      why = explainWhyWithDelivery(engine, action.requestId, delivery.evidence);
      if (!why.fix || why.fix.targetPath !== action.path) throw new InquiryValidationError("That proposed fix is no longer available. Review the current timeline.");
      const source = engine._state().inquiries.find((item) => item.id === action.requestId);
      const capability = source ? engine.getCapability(source.capabilityId) : undefined;
      work = engine.start({ actorId, intent: `${why.fix.title}. ${why.fix.reason}`, title: why.fix.title, destination: capability?.live?.routing?.destination ?? "your team", emailConnection: { status: "missing", consent: "missing", lastCheckedAt: null } });
      message = "Review the proposed shape before making a change.";
      break;
    }
    case "propose-pattern-update":
    case "stage-pattern-update": {
      const result = await executePatternUpdateAction({ engine, action, actorId, repository: context.repository });
      patternUpdate = result.proposal;
      work = result.work;
      change = result.change;
      message = result.message;
      break;
    }
    case "use-pattern": {
      const result = await executePatternCopyAction({ engine, action, actorId, businessId: context.businessId, businessName: context.config.siteName, repository: context.repository });
      work = result.work;
      message = result.message;
      break;
    }
  }

  if (persist) {
    const saved = await saveInquiryWorkspace({
      tenantId: context.tenantId,
      businessId: context.businessId,
      expectedRevision: input.expectedRevision,
      state: withoutInquiryDeliveryProjection(engine.snapshot(), delivery.originalStatuses),
      actorId,
      repository: context.repository,
    });
    if (!saved.changed) throw new InquiryConcurrencyError(saved.current);
    // Record status changes and their inverses live in the same atomic snapshot
    // as the grouped receipt. Read projection derives status from that history,
    // avoiding partially applied batches across separate annotation writes.

    if (action.kind === "publish" || action.kind === "undo") {
      const selectedWork = work ?? engine.getWork(action.requestId);
      const selectedChange = change ?? (selectedWork.activeChangeId ? engine._change(selectedWork.activeChangeId) : null);
      if (!selectedChange) throw new InquiryValidationError("The publication change receipt is missing.");
      const queued = await queueInquiryPublication({
        tenantId: context.tenantId,
        businessId: context.businessId,
        requestId: selectedWork.id,
        capabilityId: selectedWork.capabilityId,
        changeId: action.kind === "undo" ? selectedChange.undoOfChangeId! : selectedChange.id,
        action: action.kind === "undo" ? "undo" : "make_live",
        version: selectedChange.targetVersion,
        idempotencyKey: `inquiry:${selectedChange.id}:${action.kind}:${selectedChange.targetVersion}`,
        actorId,
        summary: selectedChange.summary,
        repository: context.repository,
      });
      if (queued.eventId) {
        const { resolveEventAction } = await import("@/lib/event-actions");
        const resolved = await resolveEventAction(context.tenantId, queued.eventId, "approved");
        message = resolved.changed ? "The approved configuration was made live. Check its receipt for verification." : "The change remains in Needs you. " + (resolved.reason || "Review its current receipt before trying again.");
      } else message = "The change could not be linked to its approval event.";
    }
  }

  const resultWorkspace: InquiryWorkspaceRead = persist
    ? { ...workspace, snapshot: await (context.repository ?? getInquiryRepository()).getSnapshot(context.tenantId, context.businessId), recordOverlays: await (context.repository ?? getInquiryRepository()).getRecordOverlays(context.tenantId, context.businessId) }
    : workspace;
  const projected = await surfaceSnapshot(context, resultWorkspace, nextConfig, persist ? undefined : engine.snapshot());
  return { snapshot: projected, ...(work ? { work: projected.state.requests.find((item) => item.id === work.id) ?? work } : {}), ...(record ? { record } : {}), ...(change ? { change } : {}), ...(rehearsal ? { rehearsal } : {}), ...(patternUpdate ? { patternUpdate } : {}), ...(why ? { why } : {}), ...(affectedRecordIds ? { affectedRecordIds } : {}), ...(message ? { message } : {}) };
}

export { inquiryEconomicsAuthority } from "./economics";

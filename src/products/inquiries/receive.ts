/**
 * Canonical public inquiry receive seam.
 *
 * Leads remain the customer record authority in Redis. This adapter only
 * records the engine's receipt and factual received/record-created timeline in
 * the revisioned workspace, using the same receiveInquiry operation that
 * rehearsals and engine callers use. It never sends a provider message.
 */

import { InquiryEngine } from "./inquiry-engine";
import { validateInquiryFields } from "./inquiry-engine-operations";
import type {
  InquiryCapabilityDefinition,
  InquiryEngineState,
  InquiryFieldValue,
  InquiryRecord,
  ResponsibilityAction,
  ResponsibilityEvaluation,
} from "./contracts";
import type {
  CompareAndSwapResult,
  InquiryRepository,
  InquiryWorkspaceSnapshot,
} from "./repository";
import { getInquiryRepository } from "./repository";
import { enqueueInquiryCaptureRepair, type InquiryCaptureRepairStore } from "./reconciliation";

export interface RecordInquiryEvidenceInput {
  tenantId: string;
  businessId: string;
  inquiryId: string;
  capabilityId: string;
  expectedCapabilityVersion: number;
  fields: Record<string, InquiryFieldValue>;
  receivedAt: string;
  repository?: InquiryRepository;
  repairQueue?: InquiryCaptureRepairStore;
}

export type RecordInquiryEvidenceResult =
  | { status: "recorded"; receiptId: string; timelineEventIds: string[] }
  | { status: "already_recorded"; receiptId: string; timelineEventIds: string[] }
  | { status: "stale"; reason: string }
  | { status: "rejected"; reason: string }
  | { status: "unavailable"; reason: string };

/** Evaluate the current canonical responsibility before a guarded send. */
export function evaluateInquiryResponsibility(
  snapshot: InquiryWorkspaceSnapshot,
  capabilityId: string,
  action: ResponsibilityAction,
  messageBody: string,
  at: string,
): ResponsibilityEvaluation | null {
  try {
    const state = stateForReceive(snapshot);
    const policy = state.responsibilities.find((item) => item.capabilityId === capabilityId);
    if (!policy) return null;
    const engine = new InquiryEngine({ businessId: snapshot.businessId, state, now: () => at });
    return engine.evaluateResponsibilityAction(policy.id, action, { at, messageBody });
  } catch {
    return null;
  }
}

/** Evaluate the scheduled follow-up action through the same generic seam. */
export function evaluateInquiryFollowUpResponsibility(
  snapshot: InquiryWorkspaceSnapshot,
  capabilityId: string,
  messageBody: string,
  at: string,
): ResponsibilityEvaluation | null {
  return evaluateInquiryResponsibility(snapshot, capabilityId, "schedule_follow_up", messageBody, at);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function existingEvidence(snapshot: InquiryWorkspaceSnapshot, inquiryId: string):
  | Extract<RecordInquiryEvidenceResult, { status: "already_recorded" }>
  | null {
  const receipt = snapshot.state.actionReceipts.find(
    (item) => item.inquiryId === inquiryId && item.action === "record_inquiry",
  );
  const timelineEventIds = snapshot.state.timeline
    .filter((item) => item.inquiryId === inquiryId)
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
    .map((item) => item.id);
  if (!receipt || !timelineEventIds.some((id) => snapshot.state.timeline.some((item) => item.id === id && item.type === "record_created"))) return null;
  return { status: "already_recorded", receiptId: receipt.id, timelineEventIds };
}

/**
 * The durable workspace intentionally strips inquiry records because Redis is
 * authoritative for customer data. Rebuild non-PII timeline stubs only so the
 * engine can validate causal references while appending a new record receipt.
 */
export function stateForReceive(snapshot: InquiryWorkspaceSnapshot): InquiryEngineState {
  const state = clone(snapshot.state) as InquiryEngineState;
  const known = new Set(state.inquiries.map((item) => item.id));
  const byInquiry = new Map<string, typeof state.timeline>();
  for (const event of state.timeline) {
    const list = byInquiry.get(event.inquiryId) ?? [];
    list.push(event);
    byInquiry.set(event.inquiryId, list);
  }
  for (const [inquiryId, events] of byInquiry) {
    if (known.has(inquiryId)) continue;
    const first = [...events].sort((left, right) => Date.parse(left.at) - Date.parse(right.at))[0];
    const capability = state.capabilities.find((item) => item.id === first?.capabilityId);
    if (!first || !capability) throw new Error("inquiry_timeline_reference_invalid");
    // A removed capability can retain historical receipts and timeline
    // evidence after both live slots have been cleared. The draft on the
    // corresponding request is the last durable definition version available
    // to this reconstruction path, and is safe to use only as a version
    // witness because the stub contains no customer fields.
    const historicalWork = state.requests.find(
      (item) => item.capabilityId === capability.id && item.businessId === snapshot.businessId,
    );
    const definitionVersion = capability.live?.version
      ?? capability.previousLive?.version
      ?? historicalWork?.draft?.version;
    if (!definitionVersion) throw new Error("inquiry_capability_reference_invalid");
    const createdReceiptId = state.actionReceipts.find(
      (item) => item.inquiryId === inquiryId && item.action === "record_inquiry",
    )?.id ?? first.receiptId ?? `legacy:${inquiryId}`;
    state.inquiries.push({
      id: inquiryId,
      businessId: snapshot.businessId,
      capabilityId: first.capabilityId,
      capabilityVersion: definitionVersion,
      fields: {},
      status: "new",
      receivedAt: first.at,
      timelineEventIds: events.map((item) => item.id),
      createdReceiptId,
    });
  }
  return state;
}

function resultFromRecord(
  record: InquiryRecord,
  status: "recorded" | "already_recorded",
): RecordInquiryEvidenceResult {
  return { status, receiptId: record.createdReceiptId, timelineEventIds: [...record.timelineEventIds] };
}

const PUBLISHED_CHANGE_STATUSES = ["published", "published_unverified", "undone", "undone_unverified"] as const;

function hasPublishedVersionWitness(
  snapshot: InquiryWorkspaceSnapshot,
  capabilityId: string,
  version: number,
): boolean {
  return snapshot.state.changes.some((change) =>
    change.businessId === snapshot.businessId
    && change.capabilityId === capabilityId
    && change.targetVersion === version
    && PUBLISHED_CHANGE_STATUSES.includes(change.status as (typeof PUBLISHED_CHANGE_STATUSES)[number])
    && Boolean(change.providerAcceptanceId?.trim()),
  );
}

/**
 * Resolve the definition that was actually published when a retained lead was
 * captured. Repair may use a prior request draft only when durable change
 * receipts prove that exact version crossed the live boundary. A newer draft
 * with no accepted publication is never enough to authorize repair.
 */
function historicalDefinitionForCapture(
  snapshot: InquiryWorkspaceSnapshot,
  capabilityId: string,
  version: number,
): InquiryCapabilityDefinition | null {
  if (!hasPublishedVersionWitness(snapshot, capabilityId, version)) return null;
  const capability = snapshot.state.capabilities.find((item) => item.id === capabilityId && item.businessId === snapshot.businessId);
  if (!capability) return null;
  const candidates = [
    capability.live,
    capability.previousLive,
    ...snapshot.state.requests
      .filter((work) => work.capabilityId === capabilityId && work.businessId === snapshot.businessId)
      .map((work) => work.draft),
  ];
  const definition = candidates.find((item): item is InquiryCapabilityDefinition =>
    item !== null
    && item.id === capabilityId
    && item.businessId === snapshot.businessId
    && item.version === version,
  );
  return definition ? clone(definition) : null;
}

async function queueCaptureRepair(input: RecordInquiryEvidenceInput, reason: string): Promise<void> {
  try {
    await enqueueInquiryCaptureRepair({
      tenantId: input.tenantId,
      businessId: input.businessId,
      inquiryId: input.inquiryId,
      capabilityId: input.capabilityId,
      capabilityVersion: input.expectedCapabilityVersion,
      enqueuedAt: input.receivedAt,
      lastError: reason,
    }, input.repairQueue);
  } catch (error) {
    console.error("[inquiry-receive] capture repair enqueue failed:", error instanceof Error ? error.message : String(error));
  }
}

/**
 * Record one public submission through the canonical engine and optimistic
 * workspace save. A conflict is retried against the latest snapshot, while a
 * duplicate already carrying both canonical evidence types is read-only.
 */
export async function recordInquiryEvidence(
  input: RecordInquiryEvidenceInput,
): Promise<RecordInquiryEvidenceResult> {
  return recordInquiryEvidenceInternal(input, false);
}

/**
 * Repair-only receive seam. The public route stays exact-version strict; this
 * path is used only after Redis has already accepted and validated a lead. It
 * can use a durable published definition witness while preserving the current
 * capability configuration in the workspace write.
 */
export async function recordInquiryEvidenceForRepair(
  input: RecordInquiryEvidenceInput,
): Promise<RecordInquiryEvidenceResult> {
  return recordInquiryEvidenceInternal(input, true);
}

async function recordInquiryEvidenceInternal(
  input: RecordInquiryEvidenceInput,
  historicalRepair: boolean,
): Promise<RecordInquiryEvidenceResult> {
  const repository = input.repository ?? getInquiryRepository();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let snapshot: InquiryWorkspaceSnapshot | null;
    try {
      snapshot = await repository.getSnapshot(input.tenantId, input.businessId);
    } catch {
      if (!historicalRepair) await queueCaptureRepair(input, "inquiry_workspace_unavailable");
      return { status: "unavailable", reason: "inquiry_workspace_unavailable" };
    }
    if (!snapshot) {
      if (!historicalRepair) await queueCaptureRepair(input, "published_inquiry_state_unavailable");
      return { status: "unavailable", reason: "published_inquiry_state_unavailable" };
    }

    const already = existingEvidence(snapshot, input.inquiryId);
    if (already) return already;

    const capability = snapshot.state.capabilities.find((item) => item.id === input.capabilityId);
    const definition = capability?.live;
    let receiveDefinition = definition;
    let usesHistoricalDefinition = false;
    if (!capability || !definition || !["live", "live_unverified"].includes(capability.status)) {
      if (!historicalRepair) return { status: "stale", reason: "inquiry_capability_unavailable" };
      receiveDefinition = historicalDefinitionForCapture(snapshot, input.capabilityId, input.expectedCapabilityVersion);
      usesHistoricalDefinition = true;
    } else if (definition.version !== input.expectedCapabilityVersion) {
      if (!historicalRepair) return { status: "stale", reason: "inquiry_capability_changed" };
      receiveDefinition = historicalDefinitionForCapture(snapshot, input.capabilityId, input.expectedCapabilityVersion);
      usesHistoricalDefinition = true;
    }
    if (!receiveDefinition) return { status: "unavailable", reason: "inquiry_historical_capability_unavailable" };
    const errors = validateInquiryFields(receiveDefinition, input.fields);
    if (errors.length > 0) return { status: "rejected", reason: errors[0] || "invalid_inquiry_fields" };

    let state: InquiryEngineState;
    try {
      state = stateForReceive(snapshot);
    } catch {
      if (!historicalRepair) await queueCaptureRepair(input, "inquiry_workspace_invalid");
      return { status: "unavailable", reason: "inquiry_workspace_invalid" };
    }

    // InquiryEngine.receiveInquiry intentionally rejects stale versions. For a
    // repair, run that same canonical operation against a private cloned state
    // whose capability is the proven historical definition, then restore the
    // current capability configuration before the CAS. No live configuration
    // is republished or rewritten by this path.
    const currentCapabilities = clone(state.capabilities);
    if (usesHistoricalDefinition) {
      const historicalCapability = state.capabilities.find((item) => item.id === input.capabilityId);
      if (!historicalCapability) return { status: "unavailable", reason: "inquiry_historical_capability_unavailable" };
      historicalCapability.live = clone(receiveDefinition);
      historicalCapability.previousLive = null;
      historicalCapability.status = "live";
    }

    let record: InquiryRecord;
    let engine: InquiryEngine;
    try {
      engine = new InquiryEngine({
        businessId: snapshot.businessId,
        state,
        now: () => input.receivedAt,
      });
      record = engine.receiveInquiry({
        inquiryId: input.inquiryId,
        capabilityId: input.capabilityId,
        expectedCapabilityVersion: input.expectedCapabilityVersion,
        fields: input.fields,
        receivedAt: input.receivedAt,
      });
    } catch (error) {
      return {
        status: "rejected",
        reason: error instanceof Error ? error.message.slice(0, 240) : "inquiry_rejected",
      };
    }

    let saved: CompareAndSwapResult;
    try {
      const nextState = engine.snapshot();
      if (usesHistoricalDefinition) nextState.capabilities = currentCapabilities;
      saved = await repository.compareAndSwap({
        tenantId: input.tenantId,
        businessId: input.businessId,
        expectedRevision: snapshot.revision,
        state: nextState,
        actorId: "inquiry-record",
      });
    } catch {
      if (!historicalRepair) await queueCaptureRepair(input, "inquiry_workspace_write_unavailable");
      return { status: "unavailable", reason: "inquiry_workspace_write_unavailable" };
    }
    if (saved.changed) return resultFromRecord(record, "recorded");
  }
  if (!historicalRepair) await queueCaptureRepair(input, "inquiry_workspace_conflict");
  return { status: "unavailable", reason: "inquiry_workspace_conflict" };
}

import { createHash } from "node:crypto";
import type {
  InquiryEngineState,
  InquiryRecord,
  InquiryTimelineEvent,
  ReceiptActor,
  WhyResult,
} from "./contracts";
import { InquiryEngine } from "./inquiry-engine";
import { createRedisInquiryDeliveryStore } from "./delivery-store";
import type { InquiryDeliveryStore, InquiryDeliveryTimelineInput } from "./delivery-types";

const DELIVERY_EVENT_PREFIX = "delivery_";
const DELIVERY_TIMELINE_LIMIT = 100;
const DELIVERY_UNAVAILABLE_REASON = "delivery_timeline_unavailable" as const;

const TIMELINE_TYPES = new Set<InquiryTimelineEvent["type"]>([
  "received",
  "record_created",
  "routed",
  "notification_accepted",
  "notification_bounced",
  "follow_up_scheduled",
  "follow_up_sent",
  "follow_up_blocked",
  "status_changed",
  "question",
  "note",
]);

export type InquiryDeliveryEvidence = {
  available: boolean;
  reason: string | null;
};

export type InquiryDeliveryProjection = {
  state: InquiryEngineState;
  evidence: InquiryDeliveryEvidence;
  projectedEventIds: string[];
  /** The canonical input used to derive this read-only view. */
  canonicalState: InquiryEngineState;
  /** Statuses changed only because provider evidence was projected. */
  originalStatuses: Record<string, InquiryRecord["status"]>;
};

function copyState(state: InquiryEngineState): InquiryEngineState {
  return structuredClone(state);
}

function clean(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(",")}}`;
}

function stableDeliveryEventId(event: InquiryDeliveryTimelineInput): string {
  const source = stable({
    tenantId: event.tenantId,
    inquiryId: event.inquiryId,
    capabilityId: event.capabilityId ?? null,
    type: event.type,
    summary: event.summary,
    outcome: event.outcome,
    at: event.at ?? null,
    receiptId: event.receiptId ?? null,
    causedByEventId: event.causedByEventId ?? null,
    actor: event.actor ?? null,
    evidence: event.evidence ?? [],
  });
  return `${DELIVERY_EVENT_PREFIX}${createHash("sha256").update(source).digest("hex").slice(0, 32)}`;
}

function actor(value: unknown): ReceiptActor {
  if (!value || typeof value !== "object") return { kind: "system", id: "inquiry-delivery", label: "Delivery system" };
  const row = value as { kind?: unknown; id?: unknown; label?: unknown };
  if (typeof row.id !== "string" || !row.id.trim()) return { kind: "system", id: "inquiry-delivery", label: "Delivery system" };
  const id = clean(row.id, 160);
  if (row.kind === "customer") return { kind: "customer", id, ...(typeof row.label === "string" ? { label: clean(row.label, 120) } : {}) };
  if (row.kind === "person") return { kind: "person", id, ...(typeof row.label === "string" ? { label: clean(row.label, 120) } : {}) };
  if (row.kind === "strelva") return { kind: "strelva", id, label: "Strelva" };
  return { kind: "system", id, ...(typeof row.label === "string" ? { label: clean(row.label, 120) } : {}) };
}

function validAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function projectEvent(
  source: InquiryDeliveryTimelineInput,
  record: InquiryRecord,
  businessId: string,
  canonicalEventIds: ReadonlySet<string>,
): InquiryTimelineEvent | null {
  const at = validAt(source.at);
  if (!at || !TIMELINE_TYPES.has(source.type as InquiryTimelineEvent["type"])) return null;
  if (!["recorded", "accepted", "failed", "blocked"].includes(source.outcome)) return null;
  const summary = clean(source.summary, 2_000);
  if (!summary) return null;
  const id = stableDeliveryEventId(source);
  const sourceCause = typeof source.causedByEventId === "string" ? source.causedByEventId : null;
  // Provider event ids are external evidence, not engine event ids. Preserve a
  // cause only when it already names a canonical event in this workspace. A
  // provider id must never become a self-reference or an invented causal link.
  const causedByEventId = sourceCause && sourceCause !== id && canonicalEventIds.has(sourceCause) ? sourceCause : null;
  return {
    id,
    inquiryId: record.id,
    businessId,
    capabilityId: record.capabilityId,
    type: source.type as InquiryTimelineEvent["type"],
    actor: actor(source.actor),
    summary,
    at,
    receiptId: typeof source.receiptId === "string" && source.receiptId.trim() ? clean(source.receiptId, 160) : null,
    causedByEventId,
    outcome: source.outcome,
    evidence: Array.isArray(source.evidence)
      ? source.evidence.filter((item): item is string => typeof item === "string").map((item) => clean(item, 1_000)).filter(Boolean).slice(0, 20)
      : [],
  };
}

function latestDeliveryEvent(
  events: readonly InquiryTimelineEvent[],
  types: ReadonlySet<InquiryTimelineEvent["type"]>,
): InquiryTimelineEvent | undefined {
  return events
    .filter((event) => types.has(event.type))
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
    .at(-1);
}

function statusWithDeliveryEvidence(record: InquiryRecord, events: readonly InquiryTimelineEvent[]): InquiryRecord["status"] {
  // A person-marked handled record stays handled even when a later provider
  // event is projected. Accepted or delivered mail never implies handled.
  if (record.status === "handled") return record.status;
  // A permanent provider bounce remains a broken notification outcome. A
  // later accepted event may describe a different attempt and is not proof
  // that the bounced address recovered.
  if (events.some((event) => event.type === "notification_bounced")) return "blocked";
  const latestFollowUp = latestDeliveryEvent(events, new Set(["follow_up_blocked", "follow_up_sent", "follow_up_scheduled"]));
  if (latestFollowUp?.type === "follow_up_blocked") return "blocked";
  return record.status;
}

/** Remove the read-only Redis projection before an engine snapshot is saved. */
export function withoutInquiryDeliveryProjection(
  state: InquiryEngineState,
  originalStatuses: Record<string, InquiryRecord["status"]> = {},
): InquiryEngineState {
  const projectedIds = new Set(state.timeline.filter((event) => event.id.startsWith(DELIVERY_EVENT_PREFIX)).map((event) => event.id));
  if (projectedIds.size === 0) return copyState(state);
  return {
    ...copyState(state),
    timeline: state.timeline.filter((event) => !projectedIds.has(event.id)),
    inquiries: state.inquiries.map((record) => ({
      ...record,
      ...(record.status === "blocked" && originalStatuses[record.id] ? { status: originalStatuses[record.id] } : {}),
      timelineEventIds: record.timelineEventIds.filter((id) => !projectedIds.has(id)),
    })),
  };
}

/**
 * Read delivery timelines for current records and merge them into a temporary
 * engine state. The projection never writes Redis or the canonical workspace.
 */
export async function projectInquiryDeliveryTimeline(input: {
  tenantId: string;
  businessId: string;
  state: InquiryEngineState;
  store?: InquiryDeliveryStore;
}): Promise<InquiryDeliveryProjection> {
  const state = withoutInquiryDeliveryProjection(input.state);
  const records = state.inquiries.filter((record) => record.businessId === input.businessId);
  const store = input.store ?? createRedisInquiryDeliveryStore();
  if (records.length === 0) return { state, evidence: { available: true, reason: null }, projectedEventIds: [], canonicalState: state, originalStatuses: {} };
  if (!store.listTimeline) return { state, evidence: { available: false, reason: DELIVERY_UNAVAILABLE_REASON }, projectedEventIds: [], canonicalState: state, originalStatuses: {} };

  const results = await Promise.all(records.map(async (record) => {
    try {
      return { record, events: await store.listTimeline!({ tenantId: input.tenantId, inquiryId: record.id, limit: DELIVERY_TIMELINE_LIMIT }) };
    } catch {
      return { record, events: null };
    }
  }));
  const unavailable = results.some((result) => result.events === null);
  const canonicalEventIds = new Set(state.timeline.map((event) => event.id));
  const projectedEvents: InquiryTimelineEvent[] = [];
  const projectedEventIds: string[] = [];
  const originalStatuses: Record<string, InquiryRecord["status"]> = {};
  for (const result of results) {
    for (const source of result.events ?? []) {
      if (
        source.tenantId !== input.tenantId ||
        source.inquiryId !== result.record.id ||
        (source.capabilityId !== null && source.capabilityId !== undefined && source.capabilityId !== result.record.capabilityId)
      ) continue;
      const event = projectEvent(source, result.record, input.businessId, canonicalEventIds);
      if (!event || projectedEvents.some((item) => item.id === event.id)) continue;
      projectedEvents.push(event);
      projectedEventIds.push(event.id);
    }
  }
  const byInquiry = new Map<string, InquiryTimelineEvent[]>();
  for (const event of projectedEvents) byInquiry.set(event.inquiryId, [...(byInquiry.get(event.inquiryId) ?? []), event]);
  const projectedRecords = state.inquiries.map((record) => {
    const events = byInquiry.get(record.id) ?? [];
    return events.length === 0
      ? record
      : (() => {
        const nextStatus = statusWithDeliveryEvidence(record, events);
        if (nextStatus !== record.status) originalStatuses[record.id] = record.status;
        return { ...record, status: nextStatus, timelineEventIds: [...record.timelineEventIds, ...events.map((event) => event.id)] };
      })();
  });
  return {
    state: { ...state, inquiries: projectedRecords, timeline: [...state.timeline, ...projectedEvents] },
    evidence: { available: !unavailable, reason: unavailable ? DELIVERY_UNAVAILABLE_REASON : null },
    projectedEventIds,
    canonicalState: state,
    originalStatuses,
  };
}

/** Keep Why honest when the provider timeline could not be read. */
export function explainWhyWithDelivery(
  engine: InquiryEngine,
  inquiryId: string,
  evidence: InquiryDeliveryEvidence,
): WhyResult {
  const why = engine.explainWhy(inquiryId);
  return evidence.available ? why : { ...why, fix: null };
}

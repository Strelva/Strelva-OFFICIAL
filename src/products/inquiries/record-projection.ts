import type { LeadRecord } from "@/lib/leads";
import type { InquiryEngineState, InquiryRecord, InquiryRecordStatus } from "./contracts";
import type { InquiryRecordOverlay } from "./repository";

export function recordedInquiryStatus(state: InquiryEngineState, inquiryId: string, fallback: InquiryRecordStatus): InquiryRecordStatus {
  for (const change of state.changes) {
    if (change.status !== "published") continue;
    const item = change.items.find((entry) => entry.path === `inquiries.${inquiryId}.status`);
    if (item && ["new", "assigned", "follow_up_pending", "handled", "blocked"].includes(String(item.after))) return item.after as InquiryRecordStatus;
  }
  return fallback;
}

export function recordedInquiryAssignee(state: InquiryEngineState, inquiryId: string, fallback: string | null): string | null {
  for (const change of state.changes) {
    if (change.status !== "published") continue;
    const item = change.items.find((entry) => entry.path === `inquiries.${inquiryId}.assigneeId`);
    if (item && (item.after === null || typeof item.after === "string")) return item.after;
  }
  return fallback;
}

export function projectedInquiryRecords(
  state: InquiryEngineState,
  leads: LeadRecord[],
  overlays: InquiryRecordOverlay[],
): InquiryRecord[] {
  const capabilities = new Map(state.capabilities.map((item) => [item.id, item]));
  const overlayById = new Map(overlays.map((item) => [item.inquiryId, item]));
  const seen = new Set<string>();
  const projected: InquiryRecord[] = [];
  for (const lead of leads) {
    if (seen.has(lead.id)) continue;
    const capabilityId = lead.capabilityId && capabilities.has(lead.capabilityId)
      ? lead.capabilityId
      : state.capabilities.length === 1 ? state.capabilities[0]!.id : null;
    if (!capabilityId) continue;
    const capability = capabilities.get(capabilityId)!;
    const overlay = overlayById.get(lead.id);
    const fields = lead.fields && typeof lead.fields === "object" ? { ...lead.fields } : {
      name: lead.name,
      ...(lead.email ? { email: lead.email } : {}),
      ...(lead.message ? { message: lead.message } : {}),
    };
    projected.push({
      id: lead.id,
      businessId: state.capabilities[0]?.businessId ?? capability.businessId,
      capabilityId,
      capabilityVersion: lead.capabilityVersion && lead.capabilityVersion >= 1 ? lead.capabilityVersion : capability.live?.version ?? 1,
      fields,
      status: recordedInquiryStatus(state, lead.id, overlay?.status ?? "new"),
      assigneeId: recordedInquiryAssignee(state, lead.id, overlay?.assigneeId ?? null),
      receivedAt: lead.createdAt,
      timelineEventIds: state.timeline.filter((event) => event.inquiryId === lead.id).map((event) => event.id),
      createdReceiptId: state.actionReceipts.find((receipt) => receipt.inquiryId === lead.id)?.id ?? "",
    });
    seen.add(lead.id);
  }
  return projected;
}

/** Supply non-PII anchors for engine validation when Redis is unavailable. */
export function placeholderInquiryRecords(state: InquiryEngineState, overlays: InquiryRecordOverlay[]): InquiryRecord[] {
  const references = new Map<string, { capabilityId: string; at: string }>();
  for (const event of state.timeline) references.set(event.inquiryId, { capabilityId: event.capabilityId, at: event.at });
  for (const receipt of state.actionReceipts) {
    if (receipt.inquiryId && receipt.capabilityId) references.set(receipt.inquiryId, { capabilityId: receipt.capabilityId, at: receipt.createdAt });
  }
  for (const change of state.changes) {
    for (const id of change.preservedInquiryIds) references.set(id, { capabilityId: change.capabilityId, at: change.updatedAt });
  }
  const overlayById = new Map(overlays.map((item) => [item.inquiryId, item]));
  return [...references.entries()]
    .filter(([, ref]) => state.capabilities.some((capability) => capability.id === ref.capabilityId))
    .map(([id, ref]) => ({
      id,
      businessId: state.capabilities.find((item) => item.id === ref.capabilityId)!.businessId,
      capabilityId: ref.capabilityId,
      capabilityVersion: state.capabilities.find((item) => item.id === ref.capabilityId)!.live?.version ?? 1,
      fields: {},
      status: recordedInquiryStatus(state, id, overlayById.get(id)?.status ?? "new"),
      assigneeId: recordedInquiryAssignee(state, id, overlayById.get(id)?.assigneeId ?? null),
      receivedAt: ref.at,
      timelineEventIds: state.timeline.filter((event) => event.inquiryId === id).map((event) => event.id),
      createdReceiptId: state.actionReceipts.find((receipt) => receipt.inquiryId === id)?.id ?? "",
    }));
}

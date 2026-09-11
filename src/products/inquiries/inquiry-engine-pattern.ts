import type {
  BulkInquiryUpdate,
  ChangeItem,
  ChangeReceipt,
  InquiryCapabilityDefinition,
  InquiryCapabilityState,
  InquiryRecordStatus,
  PatternCopyInput,
} from "./contracts";
import { planFor } from "./inquiry-engine-support";
import { InquiryEngineHost, actor, allInquiryIds, changeSummary, clean, clone, definitionItems, ensureDefinition, equal, json, time, appendTimeline } from "./inquiry-engine-operations";

function capabilityForPattern(source: InquiryCapabilityDefinition, host: InquiryEngineHost, input: PatternCopyInput): InquiryCapabilityDefinition {
  const now = time(host, input.now);
  const id = host._id("capability");
  const target: InquiryCapabilityDefinition = clone(source);
  target.id = id;
  target.businessId = host.businessId;
  target.version = 1;
  target.createdAt = now;
  target.updatedAt = now;
  target.form.id = `${id}:form`;
  target.connections = [{ id: "email", provider: "email", status: input.emailConnection?.status ?? "missing", consent: input.emailConnection?.consent ?? "missing", lastCheckedAt: input.emailConnection?.lastCheckedAt ?? null }];
  target.routing = target.routing ? { ...target.routing, id: `${id}:routing`, destination: input.destination?.trim() || "your team", sentence: `Send each new inquiry to ${input.destination?.trim() || "your team"} within ${target.routing.withinMinutes} minutes.` } : null;
  target.followUp = target.followUp ? { ...target.followUp, id: `${id}:follow-up` } : null;
  ensureDefinition(target, host.businessId);
  return target;
}

export function copyPattern(host: InquiryEngineHost, sourceCapabilityId: string, input: PatternCopyInput): import("./contracts").InquiryWork {
  if (input.targetBusinessId !== host.businessId) throw new Error("Install a pattern through an engine scoped to the target business.");
  const sourceDefinition = input.sourceDefinition ? clone(input.sourceDefinition) : host._capability(sourceCapabilityId).live;
  if (!sourceDefinition) throw new Error("A pattern needs a live source capability.");
  if (input.sourceDefinition) {
    if (!input.sourceBusinessId || input.sourceBusinessId === host.businessId) throw new Error("A cross-business pattern needs the authorized source business identity.");
    if (sourceDefinition.businessId !== input.sourceBusinessId) throw new Error("The supplied pattern does not belong to its declared source business.");
    ensureDefinition(sourceDefinition);
  }
  const target = capabilityForPattern(sourceDefinition, host, input);
  const now = time(host, input.now);
  const requestId = input.requestId?.trim() || host._id("request");
  if (host._state().requests.some((request) => request.id === requestId)) throw new Error("That request already exists.");
  const lines = ["form", "record", ...(target.routing ? ["routing"] : []), ...(target.followUp ? ["follow_up"] : [])] as import("./contracts").InquiryShapeLineKind[];
  const shape: import("./contracts").InquiryShapeProposal = {
    id: host._id("shape"),
    requestId,
    businessId: host.businessId,
    version: 1,
    intent: sourceDefinition.name,
    title: sourceDefinition.name,
    summary: "A copied pattern is prepared for this business and needs a fresh rehearsal.",
    lines: lines.map((id) => ({ id, kind: id, sentence: id === "form" ? "A copied inquiry form on your website." : id === "record" ? "A copied inquiry request record." : id === "routing" ? `A routing rule for ${target.routing!.destination}.` : "Strelva follows up when nobody replies.", touches: id === "form" ? "website form" : id === "record" ? "inquiry records" : id === "routing" ? "email routing rule" : "follow-up responsibility", required: id === "form" || id === "record", selected: true })),
    defaults: { destination: target.routing?.destination || "your team", followUpAfterMinutes: target.followUp?.afterMinutes ?? 24 * 60, emailConnection: target.connections[0]! },
    selectedLineIds: lines,
    status: "accepted",
    createdAt: now,
    acceptedAt: now,
    acceptedBy: actor(input.targetActorId),
  };
  const work: import("./contracts").InquiryWork = {
    id: requestId,
    businessId: host.businessId,
    capabilityId: target.id,
    actorId: actor(input.targetActorId),
    intent: sourceDefinition.name,
    shape,
    plan: planFor(shape, target.version, now),
    draft: target,
    state: "planned",
    activeChangeId: null,
    publishApproval: null,
    rehearsalScenarioIds: [],
    rehearsalRunIds: [],
    lastLiveChangeId: null,
    createdAt: now,
    updatedAt: now,
    failureReason: null,
  };
  const capability: InquiryCapabilityState = { id: target.id, businessId: host.businessId, status: "draft", live: null, previousLive: null, activeRequestId: requestId, updatedAt: now };
  const receipt: ChangeReceipt = {
    id: host._id("change"),
    businessId: host.businessId,
    requestId,
    capabilityId: target.id,
    baseVersion: null,
    targetVersion: target.version,
    status: "draft",
    summary: changeSummary(definitionItems(host, null, target)),
    items: definitionItems(host, null, target),
    preservedInquiryIds: [],
    undoOfChangeId: null,
    undoAvailable: false,
    actorIds: [work.actorId],
    createdAt: now,
    updatedAt: now,
    providerAcceptanceId: null,
    providerReceipt: null,
    verification: null,
    failureReason: null,
  };
  host._state().capabilities.unshift(capability);
  host._state().requests.unshift(work);
  host._state().changes.unshift(receipt);
  work.activeChangeId = receipt.id;
  host._addActionReceipt({
    businessId: host.businessId,
    requestId,
    capabilityId: target.id,
    inquiryId: null,
    responsibilityId: null,
    actor: { kind: "person", id: actor(input.targetActorId) },
    action: "copy_pattern",
    what: `Prepared a fresh inquiry capability from ${sourceDefinition.businessId}.`,
    why: "Patterns copy configuration into a new draft while leaving source permissions, secrets, and history behind.",
    lookedAt: ["source definition", "fresh capability ids", "new email consent binding"],
    outcome: "recorded",
    evidence: ["requires a new rehearsal before live"],
    createdAt: now,
  });
  host._emit();
  return clone(work);
}

export function bulkUpdateInquiries(host: InquiryEngineHost, input: BulkInquiryUpdate): ChangeReceipt {
  const ids = [...new Set(input.inquiryIds)];
  if (ids.length === 0) throw new Error("Select at least one inquiry.");
  const reason = clean(input.why, "bulk action reason", 2000);
  const actorId = actor(input.actorId);
  const records = ids.map((id) => host._inquiry(id));
  const capabilityId = records[0]!.capabilityId;
  if (records.some((record) => record.capabilityId !== capabilityId)) throw new Error("Bulk actions must stay inside one inquiry capability.");
  const capability = host._capability(capabilityId);
  const work = host._state().requests.find((request) => request.capabilityId === capabilityId);
  const now = time(host, input.now);
  const items: ChangeItem[] = [];
  for (const record of records) {
    const before = json(record.status, "record status");
    const after = json(input.status, "record status");
    if (!equal(before, after)) items.push({ id: host._id("change_item"), kind: "record", path: `inquiries.${record.id}.status`, before, after, sources: ["manual"], editIds: [] });
    if (before !== after) {
      record.status = input.status;
      appendTimeline(host, record, { type: "status_changed", actor: { kind: "person", id: actorId }, summary: `Changed this inquiry to ${input.status}.`, at: now, outcome: "recorded", evidence: [reason] }, now);
    }
  }
  if (items.length === 0) throw new Error("The selected inquiries already have that status.");
  const receipt: ChangeReceipt = {
    id: host._id("change"),
    businessId: host.businessId,
    requestId: work?.id ?? `bulk:${capabilityId}`,
    capabilityId,
    baseVersion: capability.live?.version ?? null,
    targetVersion: capability.live?.version ?? 1,
    status: "published",
    summary: `${items.length} inquiry record${items.length === 1 ? "" : "s"}`,
    items,
    preservedInquiryIds: allInquiryIds(host._state(), capabilityId),
    undoOfChangeId: null,
    undoAvailable: true,
    actorIds: [actorId],
    createdAt: now,
    updatedAt: now,
    providerAcceptanceId: null,
    providerReceipt: null,
    verification: { actorId, version: capability.live?.version ?? 1, verified: true, checkedAt: now, evidence: ["record statuses updated in the inquiry authority"] },
    failureReason: null,
  };
  host._state().changes.unshift(receipt);
  host._addActionReceipt({
    businessId: host.businessId,
    requestId: work?.id ?? null,
    capabilityId,
    inquiryId: null,
    responsibilityId: null,
    actor: { kind: "person", id: actorId },
    action: "bulk_update_inquiries",
    what: `Updated ${records.length} inquiry records as one change.`,
    why: reason,
    lookedAt: records.map((record) => record.id),
    outcome: "accepted",
    evidence: ["one grouped receipt", "undo preserves inquiry records"],
    createdAt: now,
  });
  host._emit();
  return clone(receipt);
}

export function undoBulkChange(host: InquiryEngineHost, changeId: string, input: { actorId: string; now?: string }): ChangeReceipt {
  const source = host._change(changeId);
  if (!source.undoAvailable || source.items.some((item) => item.kind !== "record" || !item.path.startsWith("inquiries."))) throw new Error("That receipt does not contain an undoable inquiry bulk change.");
  const actorId = actor(input.actorId);
  const now = time(host, input.now);
  const changes = source.items.map((item) => {
    const inquiryId = item.path.split(".")[1];
    if (!inquiryId) return null;
    const record = host._inquiry(inquiryId);
    if (item.before === null || typeof item.before !== "string") throw new Error("The inquiry status history is invalid.");
    return { item, record, before: item.before as InquiryRecordStatus };
  }).filter((value): value is { item: ChangeItem; record: import("./contracts").InquiryRecord; before: InquiryRecordStatus } => Boolean(value));
  for (const { record, before } of changes) {
    record.status = before;
    appendTimeline(host, record, { type: "status_changed", actor: { kind: "person", id: actorId }, summary: "Undid the grouped inquiry status change.", at: now, outcome: "recorded", evidence: [source.id] }, now);
  }
  source.undoAvailable = false;
  const receipt: ChangeReceipt = {
    ...clone(source),
    id: host._id("change"),
    status: "published",
    summary: `Undo of ${source.summary}`,
    items: source.items.map((item) => ({ ...clone(item), before: item.after, after: item.before, sources: ["manual"] as Array<"manual"> })),
    undoOfChangeId: source.id,
    actorIds: [actorId],
    createdAt: now,
    updatedAt: now,
    undoAvailable: false,
    providerAcceptanceId: null,
    providerReceipt: null,
    verification: { actorId, version: source.targetVersion, verified: true, checkedAt: now, evidence: ["record statuses restored", "inquiry records preserved"] },
  };
  host._state().changes.unshift(receipt);
  host._emit();
  return clone(receipt);
}

import type {
  ActionReceipt,
  AddRehearsalScenarioInput,
  ApprovePublishInput,
  ChangeItem,
  ChangeReceipt,
  InquiryCapabilityDefinition,
  InquiryCapabilityState,
  InquiryEngineState,
  InquiryFieldDefinition,
  InquiryFieldValue,
  InquiryRecord,
  InquiryTimelineEvent,
  InquiryTimelineEventType,
  JsonObject,
  LivePublishInput,
  LivePublishResult,
  PublishInput,
  PublishReadiness,
  PublishReadinessCheck,
  PublishResult,
  PublishVerification,
  ReceiveInquiryInput,
  RecordInquiryEventInput,
  RecordPublishVerificationInput,
  RehearsalCheck,
  RehearsalRun,
  RehearsalScenario,
  ResponsibilityPolicy,
  UndoPlan,
  WhyResult,
  WhyStoryStep,
} from "./contracts";
import { INQUIRY_CAPABILITY_KIND, REHEARSAL_CHECK_IDS } from "./contracts";

/** Private seam used by the public engine class. It keeps operation files pure
 * with respect to providers while allowing one state machine to own mutations. */
export interface InquiryEngineHost {
  readonly businessId: string;
  _state(): InquiryEngineState;
  _now(value?: string): string;
  _id(prefix: string): string;
  _emit(): void;
  _request(requestId: string): import("./contracts").InquiryWork;
  _capability(capabilityId: string): InquiryCapabilityState;
  _change(changeId: string): ChangeReceipt;
  _inquiry(inquiryId: string): InquiryRecord;
  _responsibility(responsibilityId: string): ResponsibilityPolicy;
  _addActionReceipt(input: Omit<ActionReceipt, "id">): ActionReceipt;
  _latestRunsPass(work: import("./contracts").InquiryWork): boolean;
  _publisher(): { publish(input: LivePublishInput): Promise<LivePublishResult> } | undefined;
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(",")}}`;
}

export function equal(left: unknown, right: unknown): boolean {
  return stable(left) === stable(right);
}

export function clean(value: string | undefined, field: string, max = 4000): string {
  const result = value?.trim() ?? "";
  if (!result) throw new Error(`Add a ${field}.`);
  if (result.length > max) throw new Error(`Keep ${field} within ${max} characters.`);
  return result;
}

export function time(host: InquiryEngineHost, value?: string): string {
  const result = host._now(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error("Use a valid timestamp.");
  return result;
}

export function actor(actorId: string): string {
  return clean(actorId, "actor", 200);
}

export function json(value: unknown, field = "value"): import("./contracts").JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => json(item, field));
  if (typeof value === "object") {
    const result: JsonObject = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error(`The ${field} value is not editable.`);
      result[key] = json(child, field);
    }
    return result;
  }
  throw new Error(`The ${field} value must be JSON data.`);
}

function readPath(root: unknown, path: string): import("./contracts").JsonValue | null {
  const parts = path.split(".");
  let current: unknown = root;
  for (const part of parts) {
    if (!part || ["__proto__", "prototype", "constructor"].includes(part)) throw new Error("That preview field cannot be edited.");
    if (current === null || typeof current !== "object") return null;
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return null;
      current = current[index];
    } else {
      const object = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(object, part)) return null;
      current = object[part];
    }
  }
  return current === undefined ? null : json(current, path);
}

function currentDraft(host: InquiryEngineHost, requestId: string): { work: import("./contracts").InquiryWork; draft: InquiryCapabilityDefinition; receipt: ChangeReceipt } {
  const work = host._request(requestId);
  if (!work.draft || !work.activeChangeId) throw new Error("Accept the shape before editing the preview.");
  return { work, draft: work.draft, receipt: host._change(work.activeChangeId) };
}

function changeKind(path: string): ChangeItem["kind"] {
  if (path === "form" || path.startsWith("form.")) return "form";
  if (path === "record" || path.startsWith("record.")) return "record";
  if (path === "routing" || path.startsWith("routing.")) return "routing_rule";
  if (path === "followUp" || path.startsWith("followUp.")) return "follow_up_rule";
  if (path === "connections" || path.startsWith("connections.")) return "connection";
  throw new Error("That part of the inquiry capability is not editable.");
}

export function changeSummary(items: readonly ChangeItem[]): string {
  const labels: Record<ChangeItem["kind"], string> = {
    form: "form",
    record: "record type",
    routing_rule: "routing rule",
    follow_up_rule: "follow-up rule",
    connection: "connection",
  };
  const counts = new Map<ChangeItem["kind"], number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  return [...counts.entries()].map(([kind, count]) => `${count} ${labels[kind]}`).join(", ");
}

export function allInquiryIds(state: InquiryEngineState, capabilityId: string): string[] {
  return state.inquiries.filter((record) => record.capabilityId === capabilityId).map((record) => record.id);
}

function itemForPath(host: InquiryEngineHost, path: string, before: import("./contracts").JsonValue | null, after: import("./contracts").JsonValue | null): ChangeItem {
  return {
    id: host._id("change_item"),
    kind: changeKind(path),
    path,
    before,
    after,
    sources: [],
    editIds: [],
  };
}

export function definitionItems(host: InquiryEngineHost, before: InquiryCapabilityDefinition | null, after: InquiryCapabilityDefinition | null): ChangeItem[] {
  const paths = ["form", "record", "routing", "followUp", "connections"] as const;
  const items: ChangeItem[] = [];
  for (const path of paths) {
    const oldValue = before ? readPath(before, path) : null;
    const newValue = after ? readPath(after, path) : null;
    if (!equal(oldValue, newValue)) items.push(itemForPath(host, path, oldValue, newValue));
  }
  return items;
}

function latestChangeForRequest(state: InquiryEngineState, requestId: string, action?: "make_live" | "undo"): ChangeReceipt | undefined {
  return state.changes
    .filter((change) => change.requestId === requestId && (!action || (action === "make_live" ? change.undoOfChangeId === null : change.undoOfChangeId !== null)))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
}

export function ensureDefinition(definition: InquiryCapabilityDefinition, expectedBusinessId?: string): void {
  if (definition.kind !== INQUIRY_CAPABILITY_KIND) throw new Error("This is not an inquiry capability.");
  if (!definition.id || !definition.businessId || (expectedBusinessId && definition.businessId !== expectedBusinessId) || !Number.isInteger(definition.version) || definition.version < 1) throw new Error("The capability definition is incomplete or belongs to another business.");
  if (!definition.name.trim() || !Number.isFinite(Date.parse(definition.createdAt)) || !Number.isFinite(Date.parse(definition.updatedAt))) throw new Error("The capability definition has invalid identity or timestamps.");
  if (definition.form.component !== "form" || definition.form.disclosure !== "Strelva" || definition.form.id !== `${definition.id}:form`) throw new Error("The inquiry form is not a supported Strelva form.");
  if (definition.record.type !== "inquiry" || definition.record.component !== "record_detail") throw new Error("The inquiry record type cannot be changed.");
  const componentForKind = { text: "text_field", email: "email_field", phone: "phone_field", date: "date_field", textarea: "textarea_field", select: "select_field" } as const;
  const formIds = new Set<string>();
  for (const field of definition.form.fields) {
    if (!field.id || formIds.has(field.id) || !field.label || !componentForKind[field.kind] || field.component !== componentForKind[field.kind]) throw new Error("The inquiry form contains an unsupported field.");
    if (field.kind === "select" && (!field.options || field.options.length === 0 || field.options.some((option) => !option.trim()))) throw new Error("A select field needs options.");
    formIds.add(field.id);
  }
  const recordById = new Map(definition.record.fields.map((field) => [field.id, field]));
  if (recordById.size !== definition.form.fields.length || definition.form.fields.some((field) => {
    const recordField = recordById.get(field.id);
    return !recordField || recordField.kind !== field.kind || recordField.component !== field.component || recordField.required !== field.required;
  })) throw new Error("The inquiry record fields must match the form fields.");
  if (definition.routing) {
    if (definition.routing.component !== "routing_rule" || definition.routing.id !== `${definition.id}:routing` || definition.routing.channel !== "email" || !definition.routing.destination.trim() || !Number.isInteger(definition.routing.withinMinutes) || definition.routing.withinMinutes < 1) throw new Error("The routing rule is incomplete.");
  }
  if (definition.followUp) {
    if (definition.followUp.component !== "follow_up_rule" || definition.followUp.id !== `${definition.id}:follow-up` || definition.followUp.disclosure !== "Strelva" || definition.followUp.afterMinutes < 1 || definition.followUp.maxAttempts < 1 || !definition.followUp.messageTemplate.trim()) throw new Error("The follow-up rule is incomplete.");
  }
  if (definition.connections.length !== 1) throw new Error("The inquiry capability must have exactly one email connection binding.");
  const connection = definition.connections[0];
  if (!connection || connection.id !== "email" || connection.provider !== "email" || !["connected", "missing"].includes(connection.status) || !["explicit", "missing"].includes(connection.consent)) throw new Error("The email connection binding is invalid.");
  // A business may record explicit consent before the provider is connected.
  // That state is useful evidence, but it does not satisfy the live routing
  // gate until the connection itself reports connected.
  if (connection.status === "connected" && connection.consent !== "explicit") throw new Error("A connected email binding needs explicit consent.");
  if (connection.lastCheckedAt !== null && !Number.isFinite(Date.parse(connection.lastCheckedAt))) throw new Error("The email connection check time is invalid.");
}

function defaultScenarioFields(fields: readonly InquiryFieldDefinition[]): Record<string, InquiryFieldValue> {
  const values: Record<string, InquiryFieldValue> = {};
  for (const field of fields) {
    if (field.kind === "email") values[field.id] = "rehearsal.customer@example.test";
    else if (field.kind === "phone") values[field.id] = "(716) 555-0100";
    else if (field.kind === "date") values[field.id] = "2026-09-25";
    else if (field.kind === "select") values[field.id] = field.options?.[0] ?? "Option 1";
    else if (field.id === "name") values[field.id] = "Rehearsal customer";
    else values[field.id] = "A rehearsal inquiry";
  }
  return values;
}

/** Validate a public submission against the exact published definition. */
export function validateInquiryFields(
  definition: InquiryCapabilityDefinition,
  fields: Record<string, InquiryFieldValue>,
): string[] {
  const errors: string[] = [];
  const known = new Set(definition.form.fields.map((field) => field.id));
  for (const field of definition.form.fields) {
    const value = fields[field.id]?.trim() ?? "";
    if (field.required && !value) errors.push(`${field.label} is required`);
    if (field.kind === "email" && value && !/^\S+@\S+\.\S+$/.test(value)) errors.push(`${field.label} must be an email address`);
    if (field.kind === "select" && value && !field.options?.includes(value)) errors.push(`${field.label} is not an available option`);
  }
  for (const key of Object.keys(fields)) if (!known.has(key)) errors.push(`${key} is not part of this inquiry form`);
  return errors;
}

function strelvaMessage(template: string, fields: Record<string, InquiryFieldValue>): string {
  const name = fields.name?.trim() || "there";
  return template.replaceAll("{name}", name);
}

export function addRehearsalScenario(host: InquiryEngineHost, requestId: string, input: AddRehearsalScenarioInput): RehearsalScenario {
  const { work, draft } = currentDraft(host, requestId);
  ensureDefinition(draft, host.businessId);
  const actorId = actor(input.actorId);
  const now = time(host, input.now);
  const id = host._id("scenario");
  const scenario: RehearsalScenario = {
    id,
    businessId: host.businessId,
    capabilityId: work.capabilityId,
    name: input.name?.trim() || "A customer sends an inquiry",
    customerFields: clone(input.customerFields ?? defaultScenarioFields(draft.form.fields)),
    createdAt: now,
  };
  const errors = validateInquiryFields(draft, scenario.customerFields);
  if (errors.length > 0) throw new Error(`Rehearsal scenario is incomplete: ${errors.join(", ")}.`);
  host._state().rehearsalScenarios.unshift(scenario);
  work.rehearsalScenarioIds.push(id);
  work.updatedAt = now;
  host._addActionReceipt({
    businessId: host.businessId,
    requestId: work.id,
    capabilityId: work.capabilityId,
    inquiryId: null,
    responsibilityId: null,
    actor: { kind: "person", id: actorId },
    action: "save_rehearsal_scenario",
    what: `Saved the rehearsal scenario “${scenario.name}”.`,
    why: "Saved scenarios are rerun when the capability changes.",
    lookedAt: ["inquiry form", "customer fields"],
    outcome: "recorded",
    evidence: ["synthetic scenario", `definition version ${draft.version}`],
    createdAt: now,
  });
  host._emit();
  return clone(scenario);
}

function runChecks(draft: InquiryCapabilityDefinition, fields: Record<string, InquiryFieldValue>): {
  checks: RehearsalCheck[];
  syntheticRecord: RehearsalRun["syntheticRecord"];
  testInbox: RehearsalRun["testInbox"];
  outboundMessages: RehearsalRun["outboundMessages"];
  fastForwardMinutes: number;
  externalWritesBlocked: boolean;
  externalWriteEvidence: string[];
} {
  const errors = validateInquiryFields(draft, fields);
  const valid = errors.length === 0;
  const routed = Boolean(draft.routing);
  const followUp = Boolean(draft.followUp);
  const body = draft.followUp ? strelvaMessage(draft.followUp.messageTemplate, fields) : "";
  const syntheticRecord = valid ? { id: `rehearsal_record_${draft.version}`, persisted: false as const, fields: clone(fields) } : null;
  const testInbox = routed && valid
    ? [{ to: "test-inbox@strelva.invalid", subject: "New inquiry (rehearsal)", body: `A rehearsal inquiry was routed to ${draft.routing!.destination}.`, disclosedAs: "Strelva" as const }]
    : [];
  const outboundMessages = followUp && valid ? [{ to: fields.email ?? "rehearsal.customer@example.test", body, disclosedAs: "Strelva" as const }] : [];
  // These artifacts never cross a provider or persistence boundary. Keep the
  // guard as a named check so a passing count includes that fact.
  const externalWritesBlocked = (syntheticRecord === null || syntheticRecord.persisted === false)
    && testInbox.every((message) => message.to.endsWith(".invalid"))
    && outboundMessages.every((message) => message.disclosedAs === "Strelva");
  const externalWriteEvidence = [
    "synthetic record persisted=false",
    "test inbox uses the .invalid rehearsal address",
    "outbound messages were retained as rehearsal artifacts only",
  ];
  const recipientEligible = routed && valid && Boolean(draft.routing?.destination.trim());
  const senderDisclosed = followUp && valid && draft.followUp?.disclosure === "Strelva" && /strelva/i.test(body);
  const templateRendered = followUp && valid && body.trim().length > 0 && !body.includes("{");
  const checks: RehearsalCheck[] = [
    { id: "fields_validate", label: "The customer can submit required fields", status: valid ? "passed" : "failed", detail: valid ? "The saved synthetic fields passed validation." : errors.join("; ") },
    { id: "record_created", label: "The inquiry record appears", status: syntheticRecord ? "passed" : "failed", detail: syntheticRecord ? "A synthetic record was projected inside this rehearsal." : "No record is projected when validation fails." },
    { id: "routing_resolved", label: "Routing resolves", status: valid && (routed || testInbox.length === 0) ? "passed" : "failed", detail: routed ? (valid ? `The rule addresses ${draft.routing!.destination}.` : "Routing waits for a valid submission.") : "Routing was removed from the shape; no notification was created." },
    { id: "recipient_eligible", label: "The notification recipient is eligible", status: recipientEligible || (!routed && testInbox.length === 0) ? "passed" : "failed", detail: !routed ? "No recipient is selected and the test inbox remains empty." : recipientEligible ? "The rehearsal resolved a non-empty internal destination." : "A valid internal destination is required before routing." },
    { id: "sender_disclosed", label: "Messages identify Strelva", status: senderDisclosed || (!followUp && outboundMessages.length === 0) ? "passed" : "failed", detail: !followUp ? "Follow-up was removed; no customer message was created." : senderDisclosed ? "The fixed message identifies Strelva." : "A disclosed follow-up message is required for the inquiry slice." },
    { id: "template_rendered", label: "The follow-up template renders", status: templateRendered || (!followUp && body === "") ? "passed" : "failed", detail: !followUp ? "No follow-up template was run because the rule was removed." : templateRendered ? "The saved template rendered without unresolved placeholders." : "The follow-up template did not render a complete message." },
    { id: "follow_up_scheduled", label: "Follow-up schedules on the fast clock", status: valid && (followUp || outboundMessages.length === 0) ? "passed" : "failed", detail: followUp ? (valid ? `The rule schedules after ${draft.followUp!.afterMinutes} minutes in rehearsal time.` : "Follow-up waits for a valid submission.") : "No follow-up was scheduled after its removal from the shape." },
    { id: "external_writes_blocked", label: "External writes stay blocked", status: externalWritesBlocked ? "passed" : "failed", detail: externalWritesBlocked ? "The record and messages stayed inside rehearsal artifacts." : "The rehearsal could not prove its external-write boundary." },
  ];
  if (checks.length !== REHEARSAL_CHECK_IDS.length || checks.some((check, index) => check.id !== REHEARSAL_CHECK_IDS[index])) throw new Error("The rehearsal check suite is incomplete.");
  return {
    checks,
    syntheticRecord,
    testInbox,
    outboundMessages,
    fastForwardMinutes: draft.followUp?.afterMinutes ?? 0,
    externalWritesBlocked,
    externalWriteEvidence,
  };
}

export function runRehearsal(host: InquiryEngineHost, requestId: string, input: { scenarioId?: string; now?: string; emit?: boolean } = {}): RehearsalRun {
  const { work, draft } = currentDraft(host, requestId);
  ensureDefinition(draft, host.businessId);
  const now = time(host, input.now);
  let scenario = input.scenarioId
    ? host._state().rehearsalScenarios.find((item) => item.id === input.scenarioId && item.capabilityId === work.capabilityId)
    : host._state().rehearsalScenarios.find((item) => item.capabilityId === work.capabilityId && item.name === "A customer sends an inquiry");
  if (!scenario) {
    scenario = {
      id: host._id("scenario"),
      businessId: host.businessId,
      capabilityId: work.capabilityId,
      name: "A customer sends an inquiry",
      customerFields: defaultScenarioFields(draft.form.fields),
      createdAt: now,
    };
    host._state().rehearsalScenarios.unshift(scenario);
    work.rehearsalScenarioIds.push(scenario.id);
  }
  if (!work.rehearsalScenarioIds.includes(scenario.id)) work.rehearsalScenarioIds.push(scenario.id);
  const result = runChecks(draft, scenario.customerFields);
  const passed = result.checks.length === REHEARSAL_CHECK_IDS.length && result.checks.every((check) => check.status === "passed") && result.externalWritesBlocked;
  const run: RehearsalRun = {
    id: host._id("rehearsal"),
    scenarioId: scenario.id,
    requestId: work.id,
    businessId: host.businessId,
    capabilityId: work.capabilityId,
    definitionVersion: draft.version,
    mode: "rehearsal",
    checks: result.checks,
    passed,
    passedCount: result.checks.filter((check) => check.status === "passed").length,
    totalCount: REHEARSAL_CHECK_IDS.length,
    fastForwardMinutes: result.fastForwardMinutes,
    syntheticRecord: result.syntheticRecord,
    testInbox: result.testInbox,
    outboundMessages: result.outboundMessages,
    externalWritesBlocked: result.externalWritesBlocked,
    externalWriteEvidence: result.externalWriteEvidence,
    nothingLive: true,
    ranAt: now,
  };
  host._state().rehearsalRuns.unshift(run);
  work.rehearsalRunIds.push(run.id);
  work.state = host._latestRunsPass(work) ? "ready_to_publish" : "rehearsing";
  work.updatedAt = now;
  host._addActionReceipt({
    businessId: host.businessId,
    requestId: work.id,
    capabilityId: work.capabilityId,
    inquiryId: null,
    responsibilityId: null,
    actor: { kind: "strelva", id: "rehearsal", label: "Strelva" },
    action: "rehearse",
    what: `Ran “${scenario.name}” against definition version ${draft.version}.`,
    why: "A capability must pass a saved rehearsal before it can be made live.",
    lookedAt: ["form", "record", "routing", "follow-up"],
    outcome: passed ? "accepted" : "failed",
    evidence: [`passed ${run.passedCount} of ${run.totalCount}`, ...run.externalWriteEvidence],
    createdAt: now,
  });
  if (input.emit !== false) host._emit();
  return clone(run);
}

export function runSavedRehearsals(host: InquiryEngineHost, requestId: string, now?: string): RehearsalRun[] {
  const work = host._request(requestId);
  const ids = [...work.rehearsalScenarioIds];
  if (ids.length === 0) return [runRehearsal(host, requestId, { now })];
  const runs = ids.map((scenarioId) => runRehearsal(host, requestId, { scenarioId, now, emit: false }));
  host._emit();
  return runs;
}

function readiness(host: InquiryEngineHost, requestId: string, requestedVersion?: number): PublishReadiness {
  const work = host._request(requestId);
  const draft = work.draft;
  const exactVersion = draft?.version ?? null;
  const version = requestedVersion ?? exactVersion;
  const checks: PublishReadinessCheck[] = [];
  const reasons: string[] = [];
  const add = (id: string, label: string, passed: boolean, detail: string) => {
    checks.push({ id, label, passed, detail });
    if (!passed) reasons.push(detail);
  };
  add("draft", "A selected shape has a draft", Boolean(draft), draft ? "The typed inquiry definition is ready." : "Accept the shape before making it live.");
  add("exact_version", "The requested version is the current draft", Boolean(exactVersion && version === exactVersion), exactVersion ? `Publish version ${exactVersion}; no other version is accepted.` : "There is no version to publish.");
  const change = work.activeChangeId ? host._change(work.activeChangeId) : undefined;
  add("receipt", "The change receipt matches the draft", Boolean(change && draft && change.targetVersion === draft.version), change && draft && change.targetVersion === draft.version ? `Receipt ${change.id} covers version ${draft.version}.` : "The change receipt is stale or missing.");
  const rehearsed = Boolean(draft && work.rehearsalScenarioIds.length > 0 && host._latestRunsPass(work) && host._state().rehearsalRuns.some((run) => run.requestId === work.id && run.definitionVersion === draft.version));
  add("rehearsal", "Every saved rehearsal passes this exact version", rehearsed, rehearsed ? "The saved rehearsal suite passed for this version." : "Run a passing rehearsal for this exact version before making it live.");
  const connection = draft?.connections[0];
  const connected = !draft?.routing && !draft?.followUp || Boolean(connection && connection.status === "connected" && connection.consent === "explicit");
  add("email_connection", "Required email consent is explicit", connected, connected ? "The capability has an explicitly consented email connection." : "Connect email and record explicit consent before using routing or follow-up.");
  const approval = work.publishApproval;
  const approved = Boolean(approval && approval.explicit && approval.action === "make_live" && approval.version === exactVersion);
  add("approval", "The exact version has an explicit approval", approved, approved ? `Actor ${approval!.actorId} approved version ${approval!.version}.` : "Click Make live for this exact version to record explicit approval.");
  return { requestId: work.id, capabilityId: work.capabilityId, exactVersion, requestedVersion: version, ready: reasons.length === 0, checks, reasons };
}

export function getPublishReadiness(host: InquiryEngineHost, requestId: string, version?: number): PublishReadiness {
  return readiness(host, requestId, version);
}

export function approvePublish(host: InquiryEngineHost, requestId: string, input: ApprovePublishInput): import("./contracts").InquiryWork {
  const work = host._request(requestId);
  if (!work.draft) throw new Error("Accept the shape before making it live.");
  const actorId = actor(input.actorId);
  const version = input.version ?? work.draft.version;
  if (version !== work.draft.version) throw new Error("Approve the current draft version. This approval is stale.");
  const now = time(host, input.now);
  const change = work.activeChangeId ? host._change(work.activeChangeId) : null;
  if (change && (change.status === "publishing" || change.failureReason?.includes("ambiguous"))) throw new Error("Reconcile the previous provider outcome before approving another live write.");
  work.publishApproval = { actorId, version, action: "make_live", approvedAt: now, explicit: true };
  work.state = "ready_to_publish";
  work.updatedAt = now;
  if (change) {
    change.status = "ready";
    change.updatedAt = now;
    change.actorIds = [...new Set([...change.actorIds, actorId])];
  }
  host._addActionReceipt({
    businessId: host.businessId,
    requestId: work.id,
    capabilityId: work.capabilityId,
    inquiryId: null,
    responsibilityId: null,
    actor: { kind: "person", id: actorId },
    action: "approve_make_live",
    what: `Approved inquiry definition version ${version} for Make live.`,
    why: "Live changes require an explicit action bound to one exact version.",
    lookedAt: ["change receipt", `version ${version}`],
    outcome: "recorded",
    evidence: ["explicit publish approval"],
    createdAt: now,
  });
  host._emit();
  return clone(work);
}

function providerAcceptedReceipt(change: ChangeReceipt, providerReceipt: JsonObject | null, acceptedAt: string): LivePublishResult {
  return { status: "accepted", acceptanceId: change.providerAcceptanceId!, acceptedAt, ...(providerReceipt ? { providerReceipt } : {}) };
}

export async function publish(host: InquiryEngineHost, requestId: string, input: PublishInput): Promise<PublishResult> {
  if (input.explicit !== true) throw new Error("Make live requires an explicit approval.");
  const work = host._request(requestId);
  if (!work.draft || !work.activeChangeId) throw new Error("Accept the shape before making it live.");
  const version = input.version ?? work.draft.version;
  if (!work.publishApproval || work.publishApproval.action !== "make_live" || work.publishApproval.version !== version || !work.publishApproval.explicit) {
    throw new Error("Approve Make live for this exact version before publishing.");
  }
  const ready = readiness(host, requestId, version);
  if (!ready.ready) throw new Error(ready.reasons.join(" "));
  const change = host._change(work.activeChangeId);
  if (work.state === "publishing" || change.status === "publishing") {
    throw new Error("A live write is already in an ambiguous state. Reconcile the provider receipt before trying again.");
  }
  if (change.status === "failed" && change.failureReason?.includes("ambiguous")) {
    throw new Error("The previous live provider outcome is ambiguous. Reconcile it before trying again.");
  }
  if (change.providerAcceptanceId && ["published_unverified", "published", "undone", "undone_unverified"].includes(change.status)) {
    const accepted = providerAcceptedReceipt(change, change.providerReceipt, change.updatedAt);
    return { work: clone(work), receipt: clone(change), provider: accepted, retryable: false };
  }
  const publisher = host._publisher();
  if (!publisher) throw new Error("A real live publisher is required. Rehearsal cannot make a provider claim.");
  const now = time(host, input.now);
  work.state = "publishing";
  change.status = "publishing";
  change.updatedAt = now;
  try {
    host._emit();
  } catch {
    // The marker remains in the state so a reloaded engine refuses to issue a
    // second provider write with the same intent. The adapter must reconcile.
    throw new Error("The live write could not acquire a durable publishing marker. Reconcile before retrying.");
  }
  const publishInput: LivePublishInput = {
    businessId: host.businessId,
    capabilityId: work.capabilityId,
    requestId: work.id,
    version,
    definition: clone(work.draft),
    receiptId: change.id,
    idempotencyKey: `${change.id}:${version}`,
  };
  let provider: LivePublishResult;
  try {
    provider = await publisher.publish(publishInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The live provider call ended without a result.";
    const failed: LivePublishResult = { status: "failed", failedAt: now, error: `Provider outcome is ambiguous: ${message}`, retryable: false };
    change.status = "failed";
    change.failureReason = failed.error;
    change.updatedAt = now;
    work.state = "failed";
    work.failureReason = failed.error;
    work.updatedAt = now;
    host._addActionReceipt({
      businessId: host.businessId,
      requestId: work.id,
      capabilityId: work.capabilityId,
      inquiryId: null,
      responsibilityId: null,
      actor: { kind: "person", id: actor(input.actorId) },
      action: "make_live",
      what: `The live provider did not return a definitive result for version ${version}.`,
      why: "An unknown provider outcome cannot be retried safely because the write may have happened.",
      lookedAt: ["change receipt", `idempotency key ${publishInput.idempotencyKey}`],
      outcome: "failed",
      evidence: [failed.error, "manual reconciliation required"],
      createdAt: now,
    });
    try { host._emit(); } catch { /* retain the failed state for reconciliation */ }
    return { work: clone(work), receipt: clone(change), provider: failed, retryable: false };
  }
  if (provider.status === "failed") {
    change.status = "failed";
    change.failureReason = provider.error;
    change.updatedAt = provider.failedAt;
    work.state = "failed";
    work.failureReason = provider.error;
    work.updatedAt = provider.failedAt;
    host._addActionReceipt({
      businessId: host.businessId,
      requestId: work.id,
      capabilityId: work.capabilityId,
      inquiryId: null,
      responsibilityId: null,
      actor: { kind: "person", id: actor(input.actorId) },
      action: "make_live",
      what: `The live publisher rejected version ${version}.`,
      why: "The provider result is recorded without claiming a live change.",
      lookedAt: ["change receipt", `version ${version}`],
      outcome: "failed",
      evidence: [provider.error],
      createdAt: provider.failedAt,
    });
    try { host._emit(); } catch { /* retain the failed state for reconciliation */ }
    return { work: clone(work), receipt: clone(change), provider, retryable: provider.retryable };
  }
  if (!provider.acceptanceId.trim()) {
    const failed: LivePublishResult = { status: "failed", failedAt: provider.acceptedAt, error: "Provider accepted the call without an acceptance id; the outcome is ambiguous.", retryable: false };
    change.status = "failed";
    change.failureReason = failed.error;
    change.updatedAt = failed.failedAt;
    work.state = "failed";
    work.failureReason = failed.error;
    work.updatedAt = failed.failedAt;
    try { host._emit(); } catch { /* retain the failed state for reconciliation */ }
    return { work: clone(work), receipt: clone(change), provider: failed, retryable: false };
  }
  const acceptedAt = time(host, provider.acceptedAt);
  const capability = host._capability(work.capabilityId);
  capability.previousLive = capability.live ? clone(capability.live) : null;
  capability.live = clone(work.draft);
  capability.status = "live_unverified";
  capability.updatedAt = acceptedAt;
  change.status = "published_unverified";
  change.providerAcceptanceId = provider.acceptanceId;
  change.providerReceipt = provider.providerReceipt ? clone(provider.providerReceipt) : null;
  change.undoAvailable = true;
  change.updatedAt = acceptedAt;
  change.failureReason = null;
  work.state = "live_unverified";
  work.lastLiveChangeId = change.id;
  work.updatedAt = acceptedAt;
  work.failureReason = null;
  host._addActionReceipt({
    businessId: host.businessId,
    requestId: work.id,
    capabilityId: work.capabilityId,
    inquiryId: null,
    responsibilityId: null,
    actor: { kind: "person", id: actor(input.actorId) },
    action: "make_live",
    what: `The provider accepted inquiry definition version ${version}.`,
    why: "The accepted write is recorded and awaits a separate read-back verification.",
    lookedAt: ["change receipt", `version ${version}`],
    outcome: "accepted",
    evidence: [`provider acceptance ${provider.acceptanceId}`, "verification pending"],
    createdAt: acceptedAt,
  });
  // Once the provider has accepted the idempotent write, a persistence
  // callback failure must not cause a caller to issue it again.
  try { host._emit(); } catch { /* return the accepted provider fact */ }
  return { work: clone(work), receipt: clone(change), provider, retryable: false };
}

export function recordPublishVerification(host: InquiryEngineHost, requestId: string, input: RecordPublishVerificationInput): import("./contracts").InquiryWork {
  const work = host._request(requestId);
  const change = work.lastLiveChangeId ? host._change(work.lastLiveChangeId) : latestChangeForRequest(host._state(), requestId);
  if (!change || !change.providerAcceptanceId || !["published_unverified", "undone_unverified"].includes(change.status)) throw new Error("There is no accepted live write awaiting verification.");
  if (input.version !== change.targetVersion) throw new Error("Verification must name the accepted version exactly.");
  if (input.evidence.length === 0) throw new Error("A read-back verification needs concrete evidence.");
  const actorId = actor(input.actorId);
  const now = time(host, input.now);
  const verification: PublishVerification = { actorId, version: input.version, verified: input.verified, checkedAt: now, evidence: input.evidence.map((value) => clean(value, "verification evidence", 1000)) };
  change.verification = verification;
  change.updatedAt = now;
  const capability = host._capability(work.capabilityId);
  if (input.verified) {
    change.status = change.undoOfChangeId ? "undone" : "published";
    // An undo is itself an accepted write and should receive its own read-back.
    // Until that read-back passes, keep the capability visibly unverified.
    if (!change.undoOfChangeId) {
      capability.status = capability.live ? "live" : "draft";
      work.state = "handled";
    } else {
      capability.status = capability.live ? "live" : "draft";
      work.state = "handled";
      if (capability.live) work.draft = clone(capability.live);
    }
    capability.activeRequestId = null;
  } else {
    change.status = change.undoOfChangeId ? "undone_unverified" : "published_unverified";
    capability.status = "live_unverified";
    work.state = "live_unverified";
  }
  work.updatedAt = now;
  host._addActionReceipt({
    businessId: host.businessId,
    requestId: work.id,
    capabilityId: work.capabilityId,
    inquiryId: null,
    responsibilityId: null,
    actor: { kind: "person", id: actorId },
    action: "verify_live",
    what: `${input.verified ? "Verified" : "Could not verify"} live version ${input.version}.`,
    why: "Provider acceptance and target read-back are separate facts.",
    lookedAt: input.evidence,
    outcome: input.verified ? "accepted" : "failed",
    evidence: input.evidence,
    createdAt: now,
  });
  host._emit();
  return clone(work);
}

export function prepareUndo(host: InquiryEngineHost, requestId: string): UndoPlan {
  const work = host._request(requestId);
  const capability = host._capability(work.capabilityId);
  const sourceId = work.lastLiveChangeId;
  const source = sourceId ? host._change(sourceId) : latestChangeForRequest(host._state(), requestId, "make_live");
  if (!source || !source.providerAcceptanceId || !["published", "published_unverified"].includes(source.status)) throw new Error("There is no verified or accepted change to undo yet.");
  if (!source.undoAvailable) throw new Error("This change has already been undone.");
  const now = host._now();
  const target = capability.previousLive ? clone(capability.previousLive) : null;
  const receipt: ChangeReceipt = {
    id: host._id("change"),
    businessId: host.businessId,
    requestId: work.id,
    capabilityId: work.capabilityId,
    baseVersion: capability.live?.version ?? null,
    targetVersion: (capability.live?.version ?? 0) + 1,
    status: "draft",
    summary: target ? changeSummary(definitionItems(host, capability.live, target)) : "remove inquiry capability configuration",
    items: definitionItems(host, capability.live, target),
    preservedInquiryIds: allInquiryIds(host._state(), work.capabilityId),
    undoOfChangeId: source.id,
    undoAvailable: false,
    actorIds: [],
    createdAt: now,
    updatedAt: now,
    providerAcceptanceId: null,
    providerReceipt: null,
    verification: null,
    failureReason: null,
  };
  // Preparation is a read-only preview. The source remains undoable until the
  // explicit Undo operation reserves and publishes this inverse.
  return { requestId: work.id, capabilityId: work.capabilityId, undoOfChangeId: source.id, fromVersion: capability.live?.version ?? 0, toVersion: target?.version ?? null, receipt: clone(receipt), preservesInquiryIds: [...receipt.preservedInquiryIds] };
}

export async function undo(host: InquiryEngineHost, requestId: string, input: PublishInput): Promise<PublishResult> {
  if (input.explicit !== true) throw new Error("Undo requires an explicit approval.");
  const work = host._request(requestId);
  const activeUndo = work.activeChangeId ? host._change(work.activeChangeId) : null;
  const plan = activeUndo?.undoOfChangeId ? { receipt: activeUndo } : prepareUndo(host, requestId);
  const receipt = plan.receipt;
  const source = host._change(receipt.undoOfChangeId!);
  const capability = host._capability(work.capabilityId);
  const target = capability.previousLive ? clone(capability.previousLive) : null;
  const version = input.version ?? receipt.targetVersion;
  if (version !== receipt.targetVersion) throw new Error("Undo must name the exact prepared version.");
  if (receipt.status === "undo_publishing" || receipt.status === "undone" || receipt.status === "undone_unverified" || work.state === "publishing" || receipt.status === "failed" && receipt.failureReason?.includes("ambiguous")) throw new Error("This undo has already been accepted or is in an ambiguous state. Reconcile the provider receipt before trying again.");
  const now = time(host, input.now);
  if (target) {
    target.version = version;
    target.updatedAt = now;
  }
  if (!activeUndo?.undoOfChangeId) {
    host._state().changes.unshift(receipt);
    work.activeChangeId = receipt.id;
    source.undoAvailable = false;
    work.publishApproval = null;
  }
  work.publishApproval = { actorId: actor(input.actorId), version, action: "undo", approvedAt: now, explicit: true };
  // Restoring prior behavior still creates a new immutable capability version.
  // Keeping the old version number would make `previousLive` newer than
  // `live` after the inverse is accepted, which cannot safely reload.
  if (target) {
    target.version = version;
    target.updatedAt = now;
  }
  const publisher = host._publisher();
  if (!publisher) throw new Error("A real live publisher is required. Rehearsal cannot make an undo claim.");
  source.undoAvailable = false;
  work.state = "publishing";
  receipt.status = "undo_publishing";
  receipt.updatedAt = now;
  try {
    host._emit();
  } catch {
    throw new Error("The undo could not acquire a durable publishing marker. Reconcile before retrying.");
  }
  const undoInput: LivePublishInput = { businessId: host.businessId, capabilityId: work.capabilityId, requestId: work.id, version, definition: target, receiptId: receipt.id, idempotencyKey: `${receipt.id}:${version}` };
  let provider: LivePublishResult;
  try {
    provider = await publisher.publish(undoInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The live provider call ended without a result.";
    const failed: LivePublishResult = { status: "failed", failedAt: now, error: `Provider outcome is ambiguous: ${message}`, retryable: false };
    receipt.status = "failed";
    receipt.failureReason = failed.error;
    receipt.updatedAt = now;
    work.state = "failed";
    work.failureReason = failed.error;
    work.updatedAt = now;
    try { host._emit(); } catch { /* retain reconciliation state */ }
    return { work: clone(work), receipt: clone(receipt), provider: failed, retryable: false };
  }
  if (provider.status === "failed") {
    receipt.status = "failed";
    receipt.failureReason = provider.error;
    receipt.updatedAt = provider.failedAt;
    work.state = "failed";
    work.failureReason = provider.error;
    try { host._emit(); } catch { /* retain reconciliation state */ }
    return { work: clone(work), receipt: clone(receipt), provider, retryable: provider.retryable };
  }
  if (!provider.acceptanceId.trim()) {
    const failed: LivePublishResult = { status: "failed", failedAt: provider.acceptedAt, error: "Provider accepted the undo call without an acceptance id; the outcome is ambiguous.", retryable: false };
    receipt.status = "failed";
    receipt.failureReason = failed.error;
    receipt.updatedAt = failed.failedAt;
    work.state = "failed";
    work.failureReason = failed.error;
    work.updatedAt = failed.failedAt;
    try { host._emit(); } catch { /* retain reconciliation state */ }
    return { work: clone(work), receipt: clone(receipt), provider: failed, retryable: false };
  }
  const acceptedAt = time(host, provider.acceptedAt);
  capability.previousLive = capability.live ? clone(capability.live) : null;
  capability.live = target;
  capability.status = "live_unverified";
  capability.updatedAt = acceptedAt;
  receipt.status = "undone_unverified";
  receipt.providerAcceptanceId = provider.acceptanceId;
  receipt.providerReceipt = provider.providerReceipt ? clone(provider.providerReceipt) : null;
  receipt.preservedInquiryIds = allInquiryIds(host._state(), work.capabilityId);
  receipt.updatedAt = acceptedAt;
  work.lastLiveChangeId = receipt.id;
  work.state = "live_unverified";
  work.updatedAt = acceptedAt;
  host._addActionReceipt({
    businessId: host.businessId,
    requestId: work.id,
    capabilityId: work.capabilityId,
    inquiryId: null,
    responsibilityId: null,
    actor: { kind: "person", id: actor(input.actorId) },
    action: "undo",
    what: `The provider accepted the undo of change ${source.id}.`,
    why: "Undo restores configuration while preserving inquiries received in the meantime.",
    lookedAt: ["change receipt", `preserved ${receipt.preservedInquiryIds.length} inquiry records`],
    outcome: "accepted",
    evidence: [`provider acceptance ${provider.acceptanceId}`, "verification pending"],
    createdAt: acceptedAt,
  });
  try { host._emit(); } catch { /* accepted provider write is already recorded in memory */ }
  return { work: clone(work), receipt: clone(receipt), provider, retryable: false };
}

function timelineActor(actorValue: InquiryTimelineEvent["actor"]): InquiryTimelineEvent["actor"] {
  return clone(actorValue);
}

export function appendTimeline(host: InquiryEngineHost, inquiry: InquiryRecord, input: RecordInquiryEventInput, now: string): InquiryTimelineEvent {
  const event: InquiryTimelineEvent = {
    id: host._id("inquiry_event"),
    inquiryId: inquiry.id,
    businessId: host.businessId,
    capabilityId: inquiry.capabilityId,
    type: input.type,
    actor: timelineActor(input.actor),
    summary: clean(input.summary, "event summary", 2000),
    at: now,
    receiptId: input.receiptId ?? null,
    causedByEventId: input.causedByEventId ?? null,
    outcome: input.outcome ?? (input.type === "notification_bounced" || input.type === "follow_up_blocked" ? "blocked" : "recorded"),
    evidence: (input.evidence ?? []).map((value) => clean(value, "event evidence", 1000)),
  };
  host._state().timeline.push(event);
  inquiry.timelineEventIds.push(event.id);
  return event;
}

export function receiveInquiry(host: InquiryEngineHost, input: ReceiveInquiryInput): InquiryRecord {
  const capability = input.capabilityId ? host._capability(input.capabilityId) : host._state().capabilities.find((item) => item.status === "live" || item.status === "live_unverified");
  if (!capability || !capability.live) throw new Error("This inquiry capability is not live.");
  ensureDefinition(capability.live, host.businessId);
  if (!Number.isInteger(input.expectedCapabilityVersion) || input.expectedCapabilityVersion !== capability.live.version) throw new Error("This inquiry form is out of date. Reload the form before submitting.");
  const errors = validateInquiryFields(capability.live, input.fields);
  if (errors.length > 0) throw new Error(`This inquiry could not be recorded: ${errors.join(", ")}.`);
  const receivedAt = time(host, input.receivedAt);
  const id = input.inquiryId?.trim() || host._id("inquiry");
  if (host._state().inquiries.some((record) => record.id === id)) throw new Error("That inquiry already exists.");
  const recordReceipt = host._addActionReceipt({
    businessId: host.businessId,
    requestId: null,
    capabilityId: capability.id,
    inquiryId: id,
    responsibilityId: null,
    actor: { kind: "strelva", id: "inquiry-record", label: "Strelva" },
    action: "record_inquiry",
    what: "Recorded a new inquiry from the website form.",
    why: "The customer submitted the live inquiry form.",
    lookedAt: ["website inquiry form", `capability version ${capability.live.version}`],
    outcome: "recorded",
    evidence: ["validated form fields"],
    createdAt: receivedAt,
  });
  const record: InquiryRecord = {
    id,
    businessId: host.businessId,
    capabilityId: capability.id,
    capabilityVersion: capability.live.version,
    fields: clone(input.fields),
    status: "new",
    receivedAt,
    timelineEventIds: [],
    createdReceiptId: recordReceipt.id,
  };
  host._state().inquiries.unshift(record);
  appendTimeline(host, record, { type: "received", actor: { kind: "customer", id: id, label: "Customer" }, summary: "The customer submitted the inquiry form.", at: receivedAt, outcome: "recorded", evidence: ["live form submission"] }, receivedAt);
  appendTimeline(host, record, { type: "record_created", actor: { kind: "strelva", id: "inquiry-record", label: "Strelva" }, summary: "Strelva created the inquiry record.", at: receivedAt, receiptId: recordReceipt.id, outcome: "recorded", evidence: ["validated fields"] }, receivedAt);
  host._emit();
  return clone(record);
}

export function recordInquiryEvent(host: InquiryEngineHost, inquiryId: string, input: RecordInquiryEventInput): InquiryTimelineEvent {
  const inquiry = host._inquiry(inquiryId);
  const now = time(host, input.at);
  if (["follow_up_sent"].includes(input.type)) {
    if (input.actor.kind !== "strelva" || input.actor.label !== "Strelva") throw new Error("Customer follow-up messages must identify Strelva.");
    if (!input.messageBody || !/strelva/i.test(input.messageBody)) throw new Error("Customer messages must say they are from Strelva.");
  }
  if (input.causedByEventId && !inquiry.timelineEventIds.includes(input.causedByEventId)) throw new Error("The causal timeline event belongs to another inquiry.");
  const event = appendTimeline(host, inquiry, input, now);
  if (input.type === "follow_up_scheduled") inquiry.status = "follow_up_pending";
  if (input.type === "follow_up_sent") inquiry.status = "handled";
  if (input.type === "notification_bounced" || input.type === "follow_up_blocked") inquiry.status = "blocked";
  if (input.type === "routed" || input.type === "notification_accepted") inquiry.status = "assigned";
  host._emit();
  return clone(event);
}

function stepFor(event: InquiryTimelineEvent | undefined, label: string, missingSentence: string): WhyStoryStep {
  if (!event) return { eventId: null, label, sentence: missingSentence, status: "missing" };
  return {
    eventId: event.id,
    label,
    sentence: event.summary,
    status: event.outcome === "blocked" || event.type === "notification_bounced" || event.type === "follow_up_blocked" ? (event.type === "notification_bounced" ? "broken" : "blocked") : "ok",
  };
}

function causallyLinked(events: readonly InquiryTimelineEvent[], cause: InquiryTimelineEvent, effect: InquiryTimelineEvent): boolean {
  if (cause.id === effect.id) return true;
  if (cause.receiptId && cause.receiptId === effect.receiptId) return true;
  const byId = new Map(events.map((event) => [event.id, event]));
  const visited = new Set<string>();
  let current: InquiryTimelineEvent | undefined = effect;
  while (current?.causedByEventId && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.causedByEventId === cause.id) return true;
    current = byId.get(current.causedByEventId);
  }
  return false;
}

export function explainWhy(host: InquiryEngineHost, inquiryId: string): WhyResult {
  const inquiry = host._inquiry(inquiryId);
  const events = host._state().timeline.filter((event) => inquiry.timelineEventIds.includes(event.id)).sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const find = (...types: InquiryTimelineEventType[]) => events.find((event) => types.includes(event.type));
  const received = stepFor(find("received"), "Request received", "No received event is recorded yet.");
  const record = stepFor(find("record_created"), "Record created", "No record-created event is recorded yet.");
  const route = stepFor(find("routed", "notification_accepted", "notification_bounced"), "Notification", "No notification result is recorded yet.");
  const follow = stepFor(find("follow_up_sent", "follow_up_blocked"), "Follow-up", "No follow-up result is recorded yet.");
  const steps = [received, record, route, follow];
  const broken = steps.find((step) => step.status === "broken" || step.status === "blocked" || step.status === "missing") ?? null;
  let summary = "The inquiry path has no recorded failure.";
  let fix: WhyResult["fix"] = null;
  const bounced = find("notification_bounced");
  const blocked = find("follow_up_blocked");
  if (bounced) {
    const linked = blocked ? causallyLinked(events, bounced, blocked) : false;
    summary = `${received.sentence} ${record.sentence} ${bounced.summary}${blocked ? linked ? ` Because of that, ${blocked.summary}` : ` ${blocked.summary} Its cause is not linked in the timeline.` : ""}`;
    fix = { kind: "change", title: "Fix the notification address", reason: linked ? "The notification bounced and the linked follow-up was blocked." : "The notification bounced. Review its address before changing the follow-up rule.", targetPath: "routing.destination", suggestedValue: null };
  } else if (blocked) {
    summary = `${received.sentence} ${record.sentence} ${blocked.summary}`;
    fix = { kind: "change", title: "Review the follow-up rule", reason: "The follow-up is blocked and needs a safe rule change.", targetPath: "followUp.afterMinutes", suggestedValue: null };
  } else if (follow.status === "missing") {
    summary = `${received.sentence} ${record.sentence} The expected follow-up has no recorded result.`;
    fix = { kind: "change", title: "Check the follow-up responsibility", reason: "The expected follow-up event is missing from the timeline.", targetPath: "followUp", suggestedValue: null };
  } else if (route.status === "missing") {
    summary = `${received.sentence} ${record.sentence} The expected notification has no recorded result.`;
    fix = { kind: "change", title: "Check inquiry routing", reason: "The expected notification event is missing from the timeline.", targetPath: "routing.destination", suggestedValue: null };
  }
  return { inquiryId, summary, steps, brokenStep: broken, fix };
}

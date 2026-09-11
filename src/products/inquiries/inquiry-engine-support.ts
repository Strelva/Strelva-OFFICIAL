import type {
  ActionReceipt,
  ChangeItem,
  ChangeItemKind,
  InquiryCapabilityDefinition,
  InquiryConnectionBinding,
  InquiryEngineState,
  InquiryFieldDefinition,
  InquiryFieldKind,
  InquiryPlan,
  InquiryPlanStep,
  InquiryRoutingRule,
  InquiryShapeLineKind,
  InquiryShapeProposal,
  JsonObject,
  JsonValue,
} from "./contracts";
import { INQUIRY_CAPABILITY_KIND, INQUIRY_DEFINITION_VERSION, INQUIRY_ENGINE_VERSION } from "./contracts";

export class InquiryEngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "InquiryEngineError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new InquiryEngineError(code, message);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`);
  return `{${entries.join(",")}}`;
}

function equal(left: unknown, right: unknown): boolean {
  return stable(left) === stable(right);
}

function text(value: string | undefined, field: string, max: number): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) fail("invalid_input", `Add a ${field}.`);
  if (trimmed.length > max) fail("invalid_input", `Keep ${field} within ${max} characters.`);
  return trimmed;
}

function timestamp(value: string | undefined, fallback: () => string): string {
  const candidate = value ?? fallback();
  if (!Number.isFinite(Date.parse(candidate))) fail("invalid_time", "Use a valid timestamp.");
  return candidate;
}

function jsonValue(value: unknown, field: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => jsonValue(item, field));
  if (typeof value === "object") {
    const result: JsonObject = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        fail("invalid_path", `The ${field} path is not editable.`);
      }
      result[key] = jsonValue(child, field);
    }
    return result;
  }
  fail("invalid_input", `The ${field} value must be JSON data.`);
}

function defaultIdFactory() {
  let sequence = 0;
  return (prefix: string) => {
    sequence += 1;
    return `${prefix}_${Date.now().toString(36)}_${sequence.toString(36)}`;
  };
}

function emptyState(): InquiryEngineState {
  return {
    stateVersion: INQUIRY_ENGINE_VERSION,
    requests: [],
    capabilities: [],
    changes: [],
    actionReceipts: [],
    rehearsalScenarios: [],
    rehearsalRuns: [],
    inquiries: [],
    timeline: [],
    responsibilities: [],
    responsibilityReceipts: [],
  };
}

function ensureActor(actorId: string): string {
  return text(actorId, "actor", 200);
}

function ensurePositiveMinutes(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 30 * 24 * 60) {
    fail("invalid_input", `${field} must be a whole number of minutes from 1 to 43,200.`);
  }
  return value;
}

function fieldFor(kind: InquiryFieldKind): Extract<InquiryFieldDefinition["component"], string> {
  return {
    text: "text_field",
    email: "email_field",
    phone: "phone_field",
    date: "date_field",
    textarea: "textarea_field",
    select: "select_field",
  }[kind] as Extract<InquiryFieldDefinition["component"], string>;
}

function defaultFields(intent: string): InquiryFieldDefinition[] {
  const normalized = intent.toLowerCase();
  const fields: InquiryFieldDefinition[] = [
    { id: "name", label: "Name", kind: "text", component: fieldFor("text"), required: true, placeholder: "Your name" },
    { id: "email", label: "Email", kind: "email", component: fieldFor("email"), required: true, placeholder: "you@example.com" },
    { id: "phone", label: "Phone", kind: "phone", component: fieldFor("phone"), required: false, placeholder: "(555) 555-0100" },
    { id: "message", label: "Message", kind: "textarea", component: fieldFor("textarea"), required: true, placeholder: "How can we help?" },
  ];

  // These are still fixed components. Intent only chooses from the catalog;
  // it cannot create an arbitrary widget or executable field.
  if (/book|appointment|schedule|date/.test(normalized)) {
    fields.splice(2, 0, {
      id: "preferredDate",
      label: "Preferred date",
      kind: "date",
      component: fieldFor("date"),
      required: false,
    });
  }
  if (/seller|listing|property|real estate/.test(normalized)) {
    fields.splice(2, 0, {
      id: "propertyAddress",
      label: "Property address",
      kind: "text",
      component: fieldFor("text"),
      required: false,
      placeholder: "Address or neighborhood",
    });
  }
  return fields;
}

function intentNoun(intent: string): string {
  const normalized = intent.toLowerCase();
  if (/cater|food|event/.test(normalized)) return "Catering";
  if (/seller|listing|property/.test(normalized)) return "Seller";
  if (/buyer|home/.test(normalized)) return "Buyer";
  if (/book|appointment|schedule/.test(normalized)) return "Booking";
  if (/quote|estimate/.test(normalized)) return "Quote";
  return "Customer";
}

function displayDestination(destination: string): string {
  return destination === "your team" ? destination : destination;
}

export interface ShapeProposalInput {
  businessId: string;
  requestId: string;
  intent: string;
  idFactory?: (prefix: string) => string;
  destination?: string;
  followUpAfterMinutes?: number;
  emailConnection?: Pick<InquiryConnectionBinding, "status" | "consent" | "lastCheckedAt">;
  title?: string;
  now?: string;
}

/** Build the first response to New. This does not create a capability draft. */
export function proposeInquiryShape(input: ShapeProposalInput): InquiryShapeProposal {
  const now = input.now ?? new Date().toISOString();
  timestamp(now, () => new Date().toISOString());
  const businessId = text(input.businessId, "business", 200);
  const requestId = text(input.requestId, "request", 200);
  const intent = text(input.intent, "request", 2_000);
  const destination = input.destination?.trim() || "your team";
  if (destination.length > 200) fail("invalid_input", "Keep routing destination within 200 characters.");
  const followUpAfterMinutes = input.followUpAfterMinutes ?? 24 * 60;
  ensurePositiveMinutes(followUpAfterMinutes, "Follow-up delay");
  const noun = intentNoun(intent);
  const title = input.title?.trim() || `${noun} inquiries`;
  if (title.length > 160) fail("invalid_input", "Keep shape title within 160 characters.");
  const idFactory = input.idFactory ?? defaultIdFactory();
  const destinationText = displayDestination(destination);
  const lines = [
    {
      id: "form" as const,
      kind: "form" as const,
      sentence: `A ${noun.toLowerCase()} request form on your website.`,
      touches: "website form",
      required: true,
      selected: true,
    },
    {
      id: "record" as const,
      kind: "record" as const,
      sentence: `A ${noun} request record for each submission.`,
      touches: `${noun} request records`,
      required: true,
      selected: true,
    },
    {
      id: "routing" as const,
      kind: "routing" as const,
      sentence: `A rule that sends it to ${destinationText}.`,
      touches: "email routing rule",
      required: false,
      selected: true,
    },
    {
      id: "follow_up" as const,
      kind: "follow_up" as const,
      sentence: `Strelva follows up if nobody replies in ${formatDuration(followUpAfterMinutes)}.`,
      touches: "follow-up responsibility",
      required: false,
      selected: true,
    },
  ];
  return {
    id: idFactory("shape"),
    requestId,
    businessId,
    version: INQUIRY_DEFINITION_VERSION,
    intent,
    title,
    summary: `This looks like ${lines.map((line) => line.sentence.toLowerCase()).join(" ")} Build all four?`,
    lines,
    defaults: {
      destination,
      followUpAfterMinutes,
      emailConnection: input.emailConnection ?? { status: "missing", consent: "missing", lastCheckedAt: null },
    },
    selectedLineIds: ["form", "record", "routing", "follow_up"],
    status: "proposed",
    createdAt: now,
    acceptedAt: null,
    acceptedBy: null,
  };
}

export function formatDuration(minutes: number): string {
  if (minutes % (24 * 60) === 0) {
    const days = minutes / (24 * 60);
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${minutes} minutes`;
}

function componentForPath(path: string): ChangeItemKind {
  if (path === "form" || path.startsWith("form.")) return "form";
  if (path === "record" || path.startsWith("record.")) return "record";
  if (path === "routing" || path.startsWith("routing.")) return "routing_rule";
  if (path === "followUp" || path.startsWith("followUp.")) return "follow_up_rule";
  if (path === "connections" || path.startsWith("connections.")) return "connection";
  fail("invalid_path", "That part of the inquiry capability is not editable.");
}

function assertEditableDraftPath(path: string, allowConnection = false): void {
  const immutable = new Set([
    "kind",
    "id",
    "businessId",
    "version",
    "createdAt",
    "updatedAt",
    "form.component",
    "form.id",
    "form.disclosure",
    "record.component",
    "record.type",
    "routing.component",
    "routing.id",
    "routing.channel",
    "routing.sentence",
    "followUp.component",
    "followUp.id",
    "followUp.disclosure",
    "followUp.sentence",
  ]);
  if (!allowConnection && (path === "connections" || path.startsWith("connections."))) {
    fail("connection_edit", "Use the explicit email connection action to change consent or connection state.");
  }
  if (immutable.has(path)) fail("immutable_definition", "That part of the inquiry definition is fixed by Strelva.");
}

function pathSegments(path: string): string[] {
  const trimmed = path.trim();
  if (!trimmed || trimmed.startsWith(".") || trimmed.endsWith(".")) {
    fail("invalid_path", "Choose a field in the inquiry preview to edit.");
  }
  const segments = trimmed.split(".");
  for (const segment of segments) {
    if (!/^(?:[A-Za-z][A-Za-z0-9_]*|[0-9]+)$/.test(segment) || ["__proto__", "prototype", "constructor"].includes(segment)) {
      fail("invalid_path", "That preview field cannot be edited.");
    }
  }
  return segments;
}

function readPath(root: unknown, path: string): JsonValue | null {
  const segments = pathSegments(path);
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") return null;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return null;
      current = current[index];
    } else {
      const object = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(object, segment)) return null;
      current = object[segment];
    }
  }
  return current === undefined ? null : jsonValue(current, path);
}

function writePath(root: JsonObject, path: string, value: JsonValue | null): void {
  const segments = pathSegments(path);
  let current: JsonObject | JsonValue[] = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    const nextSegment = segments[index + 1]!;
    if (Array.isArray(current)) {
      const arrayIndex = Number(segment);
      if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex >= current.length) {
        fail("invalid_path", "That preview field does not exist.");
      }
      const next = current[arrayIndex];
      if (next === null || typeof next !== "object") fail("invalid_path", "That preview field does not exist.");
      current = next as JsonObject | JsonValue[];
    } else {
      const next = current[segment];
      if (next === null || typeof next !== "object") fail("invalid_path", `That preview field does not exist at ${nextSegment}.`);
      current = next as JsonObject | JsonValue[];
    }
  }
  const last = segments[segments.length - 1]!;
  if (Array.isArray(current)) {
    const arrayIndex = Number(last);
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex >= current.length) fail("invalid_path", "That preview field does not exist.");
    current[arrayIndex] = value;
  } else {
    if (!Object.prototype.hasOwnProperty.call(current, last)) fail("invalid_path", "That preview field does not exist.");
    current[last] = value;
  }
}

function planFor(shape: InquiryShapeProposal, version: number, now: string): InquiryPlan {
  const steps: InquiryPlanStep[] = [];
  if (shape.selectedLineIds.includes("form")) {
    steps.push({ id: "form", label: "Build the website form", explanation: "Use the fixed inquiry components and the approved fields.", reversible: true, requiresApproval: true });
  }
  if (shape.selectedLineIds.includes("record")) {
    steps.push({ id: "record", label: "Create the request record", explanation: "Keep each submission as an inquiry record with a timeline.", reversible: true, requiresApproval: true });
  }
  if (shape.selectedLineIds.includes("routing")) {
    steps.push({ id: "routing", label: "Route new requests", explanation: "Send an internal notification through the explicitly consented email connection.", reversible: true, requiresApproval: true });
  }
  if (shape.selectedLineIds.includes("follow_up")) {
    steps.push({ id: "follow_up", label: "Follow up when needed", explanation: "Ask Strelva to follow up within the written boundary and identify itself.", reversible: true, requiresApproval: true });
  }
  steps.push({ id: "rehearsal", label: "Run the saved rehearsal", explanation: "Play a synthetic customer through the capability before it can go live.", reversible: true, requiresApproval: false });
  return {
    version,
    steps,
    acceptance: [
      "A customer can submit the form and a request record appears.",
      "Routing and follow-up stay inside the written responsibility boundary.",
      "Every live change has an exact version, receipt, and undo path.",
    ],
    createdAt: now,
  };
}

export interface BuildDefinitionInput {
  capabilityId: string;
  businessId: string;
  version: number;
  intent: string;
  title: string;
  selectedLineIds: readonly InquiryShapeLineKind[];
  destination: string;
  followUpAfterMinutes: number;
  emailConnection: Pick<InquiryConnectionBinding, "status" | "consent" | "lastCheckedAt">;
  now: string;
}

/** Compile a selected shape into data for the fixed inquiry renderer. */
export function buildInquiryDefinition(input: BuildDefinitionInput): InquiryCapabilityDefinition {
  const fields = defaultFields(input.intent);
  const noun = intentNoun(input.intent);
  const formTitle = input.title.trim() || `${noun} request`;
  const form: InquiryCapabilityDefinition["form"] = {
    component: "form",
    id: `${input.capabilityId}:form`,
    title: formTitle,
    intro: "Tell us a little about what you need. Strelva will make clear who receives it.",
    fields,
    disclosure: "Strelva",
  };
  const record: InquiryCapabilityDefinition["record"] = {
    component: "record_detail",
    type: "inquiry",
    singularLabel: `${noun} request`,
    pluralLabel: `${noun} requests`,
    fields: clone(fields),
  };
  const routing: InquiryRoutingRule | null = input.selectedLineIds.includes("routing")
    ? {
        component: "routing_rule",
        id: `${input.capabilityId}:routing`,
        sentence: `Send each new ${noun.toLowerCase()} request to ${input.destination} within 10 minutes.`,
        destination: input.destination,
        channel: "email",
        withinMinutes: 10,
      }
    : null;
  const followUp: InquiryCapabilityDefinition["followUp"] = input.selectedLineIds.includes("follow_up")
    ? {
        component: "follow_up_rule",
        id: `${input.capabilityId}:follow-up`,
        sentence: `If nobody replies within ${formatDuration(input.followUpAfterMinutes)}, Strelva follows up once.`,
        afterMinutes: input.followUpAfterMinutes,
        maxAttempts: 1,
        messageTemplate: "Hello {name}, this is Strelva following up on your request. Is there anything else we can help with?",
        disclosure: "Strelva",
      }
    : null;
  return {
    kind: INQUIRY_CAPABILITY_KIND,
    id: input.capabilityId,
    businessId: input.businessId,
    version: input.version,
    name: `${noun} inquiries`,
    form,
    record,
    routing,
    followUp,
    connections: [
      {
        id: "email",
        provider: "email",
        status: input.emailConnection.status,
        consent: input.emailConnection.consent,
        lastCheckedAt: input.emailConnection.lastCheckedAt,
      },
    ],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function selectedLineSet(lines: InquiryShapeLineKind[] | undefined, proposed: InquiryShapeProposal): InquiryShapeLineKind[] {
  const selected = lines ? [...new Set(lines)] : proposed.lines.filter((line) => line.selected).map((line) => line.id);
  const known = new Set(proposed.lines.map((line) => line.id));
  for (const line of selected) {
    if (!known.has(line)) fail("invalid_shape", "That part of the shape is not available.");
  }
  for (const line of proposed.lines) {
    if (line.required && !selected.includes(line.id)) fail("invalid_shape", `Keep the ${line.kind} in this first capability.`);
  }
  return selected;
}

function changeItemsForDefinition(
  definition: InquiryCapabilityDefinition,
  before: InquiryCapabilityDefinition | null,
  idFactory: (prefix: string) => string,
): ChangeItem[] {
  const entries: Array<[ChangeItemKind, string, JsonValue | null, JsonValue | null]> = [
    ["form", "form", before ? jsonValue(before.form, "form") : null, jsonValue(definition.form, "form")],
    ["record", "record", before ? jsonValue(before.record, "record") : null, jsonValue(definition.record, "record")],
    ["routing_rule", "routing", before ? jsonValue(before.routing, "routing") : null, jsonValue(definition.routing, "routing")],
    ["follow_up_rule", "followUp", before ? jsonValue(before.followUp, "followUp") : null, jsonValue(definition.followUp, "followUp")],
  ];
  if (before && !equal(before.connections, definition.connections)) {
    entries.push(["connection", "connections", jsonValue(before.connections, "connections"), jsonValue(definition.connections, "connections")]);
  }
  return entries
    .filter(([, , oldValue, newValue]) => !equal(oldValue, newValue))
    .map(([kind, path, oldValue, newValue]) => ({
      id: idFactory("change_item"),
      kind,
      path,
      before: oldValue,
      after: newValue,
      sources: [],
      editIds: [],
    }));
}

function changeSummary(items: readonly ChangeItem[]): string {
  const counts = new Map<ChangeItemKind, number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  const labels: Record<ChangeItemKind, string> = {
    form: "form",
    record: "record type",
    routing_rule: "routing rule",
    follow_up_rule: "follow-up rule",
    connection: "connection",
  };
  return [...counts.entries()].map(([kind, count]) => `${count} ${labels[kind]}`).join(", ");
}

function actorFor(actorId: string): ActionReceipt["actor"] {
  return { kind: "person", id: actorId };
}

function strelvaActor(id: string): ActionReceipt["actor"] {
  return { kind: "strelva", id, label: "Strelva" };
}

export {
  actorFor,
  assertEditableDraftPath,
  changeItemsForDefinition,
  changeSummary,
  clone,
  componentForPath,
  defaultIdFactory,
  emptyState,
  ensureActor,
  equal,
  fail,
  jsonValue,
  pathSegments,
  planFor,
  readPath,
  selectedLineSet,
  strelvaActor,
  text,
  timestamp,
  writePath,
};

import type {
  ChangeReceipt,
  InquiryConnectionBinding,
  InquiryCapabilityDefinition,
  InquiryShapeLineKind,
  InquiryShapeProposal,
  InquiryEngineState,
  InquiryWork,
  JsonValue,
  RehearsalRun,
} from "./contracts";
import type { InquiryEngineHost } from "./inquiry-engine-operations";
import {
  allInquiryIds,
  actor,
  changeSummary,
  clone,
  ensureDefinition,
  definitionItems,
  equal,
  time,
} from "./inquiry-engine-operations";
import { formatDuration, planFor } from "./inquiry-engine-support";

/**
 * The pattern projection is deliberately smaller than a capability
 * definition. It contains reusable shape and rule configuration only. It
 * never stores inquiry records, connection state, routing destinations, or
 * provider credentials.
 */
export const INQUIRY_PATTERN_PROJECTION_VERSION = 1 as const;

export type PatternInstallationStatus = "installed" | "update_available" | "conflicted";
export type PatternUpdateStatus = "up_to_date" | "ready" | "conflicted";
export type PatternConflictChoice = "local" | "source";

export interface PatternFieldShape {
  id: string;
  label: string;
  kind: "text" | "email" | "phone" | "date" | "textarea" | "select";
  component: "text_field" | "email_field" | "phone_field" | "date_field" | "textarea_field" | "select_field";
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface InquiryPatternShape {
  projectionVersion: typeof INQUIRY_PATTERN_PROJECTION_VERSION;
  version: number;
  name: string;
  form: {
    title: string;
    intro: string;
    fields: PatternFieldShape[];
  };
  record: {
    singularLabel: string;
    pluralLabel: string;
    fields: PatternFieldShape[];
  };
  routing: {
    channel: "email";
    withinMinutes: number;
  } | null;
  followUp: {
    afterMinutes: number;
    maxAttempts: number;
    messageTemplate: string;
    disclosure: "Strelva";
  } | null;
}

export interface PatternInstallation {
  /** Projection identity, distinct from the installed capability identity. */
  id: string;
  businessId: string;
  capabilityId: string;
  sourceBusinessId: string;
  sourceCapabilityId: string;
  /** The source version explicitly accepted by this installation. */
  sourceVersion: number;
  /** The target capability version at the last accepted update. */
  targetVersion: number;
  status: PatternInstallationStatus;
  lastSourceShape: InquiryPatternShape;
  lastTargetShape: InquiryPatternShape;
  lastProposalId: string | null;
  /** Safe, durable handoff metadata used to finish the pin after read-back. */
  pendingUpdate?: PatternPendingUpdate;
  createdAt: string;
  updatedAt: string;
}

export interface PatternPendingUpdate {
  proposalId: string;
  baseSourceVersion: number;
  sourceVersion: number;
  targetVersion: number;
  sourceShape: InquiryPatternShape;
}

export interface PatternUpdateChange {
  path: string;
  sourceBefore: JsonValue | null;
  sourceAfter: JsonValue | null;
  localValue: JsonValue | null;
  action: "apply" | "preserve_local" | "conflict";
}

export interface PatternUpdateConflict {
  path: string;
  sourceBefore: JsonValue | null;
  sourceAfter: JsonValue | null;
  localValue: JsonValue | null;
  reason: "local_edit_and_source_update";
}

export interface PatternUpdateProposal {
  id: string;
  installationId: string;
  businessId: string;
  capabilityId: string;
  requestId: string | null;
  baseSourceVersion: number;
  sourceVersion: number;
  baseTargetVersion: number;
  targetVersion: number;
  status: PatternUpdateStatus;
  changes: PatternUpdateChange[];
  preservedLocalPaths: string[];
  conflicts: PatternUpdateConflict[];
  /** The definition after non-conflicting changes, still safe to rehearse. */
  nextDefinition: InquiryCapabilityDefinition;
  currentDefinition: InquiryCapabilityDefinition;
  sourceShape: InquiryPatternShape;
  createdAt: string;
  /** Every update is required to run through the existing exact-version rehearsal gate. */
  rehearsalRequired: true;
}

export interface PatternConflictResolution {
  path: string;
  choice: PatternConflictChoice;
}
export interface ResolvedPatternUpdate {
  proposalId: string;
  definition: InquiryCapabilityDefinition;
  resolvedConflicts: Array<PatternConflictResolution & { sourceValue: JsonValue | null; localValue: JsonValue | null }>;
  rehearsalVersion: number;
}

export interface PatternUpdatePublishReadiness {
  ready: boolean;
  requestId: string | null;
  capabilityId: string;
  exactVersion: number;
  checks: Array<{ id: string; passed: boolean; detail: string }>;
  reasons: string[];
}
export interface PatternUpdateInput {
  capabilityId: string;
  sourceDefinition: InquiryCapabilityDefinition;
  /** Callers must name the source version they intend to install. */
  sourceVersion?: number;
  now?: string;
}

export interface CommitPatternUpdateInput {
  proposal: PatternUpdateProposal;
  /** The explicit local/source conflict choices used to produce definition. */
  resolution: ResolvedPatternUpdate;
  definition: InquiryCapabilityDefinition;
  sourceDefinition: InquiryCapabilityDefinition;
  actorId: string;
  now?: string;
}
export interface StagePatternUpdateInput {
  proposal: PatternUpdateProposal;
  resolution: ResolvedPatternUpdate;
  actorId: string;
  now?: string;
}

export interface StagePatternUpdateResult {
  work: InquiryWork;
  change: ChangeReceipt;
}
type PatternState = InquiryEngineState & {
  /** Optional for backwards compatibility with snapshots created before patterns had installations. */
  patternInstallations?: PatternInstallation[];
};
const EMAIL_LIKE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_LIKE = /(?:\+?\d[\d .()\-]{7,}\d)/;
const SECRET_LIKE = /(?:-----BEGIN [^-]+ KEY-----|\b(?:sk|pk|ghp|xox[baprs])-[-_A-Za-z0-9]+|\b(?:api[_-]?key|secret|password|token|authorization)\s*[:=])/i;
const SENSITIVE_KEYS = new Set(["credentials", "grant", "grants", "inquiries", "customerFields", "providerReceipt", "accessToken", "refreshToken"]);
function patternState(host: InquiryEngineHost): PatternState {
  return host._state() as PatternState;
}
function installations(host: InquiryEngineHost): PatternInstallation[] {
  const state = patternState(host);
  if (state.patternInstallations === undefined) state.patternInstallations = [];
  if (!Array.isArray(state.patternInstallations)) throw new Error("The inquiry pattern installation projection is invalid.");
  for (const installation of state.patternInstallations) assertInstallation(installation);
  return state.patternInstallations;
}
function safeText(value: string, path: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`The reusable pattern ${path} is invalid.`);
  }
  if (EMAIL_LIKE.test(value) || PHONE_LIKE.test(value) || SECRET_LIKE.test(value)) {
    throw new Error(`The reusable pattern ${path} contains private or secret data.`);
  }
  return value.trim();
}
function safePlaceholder(value: string, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 500 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`The reusable pattern ${path} is invalid.`);
  }
  if (SECRET_LIKE.test(value)) throw new Error(`The reusable pattern ${path} contains private or secret data.`);
  // Built-in inquiry fields use fake contact examples. Preserve the field
  // affordance while replacing those examples with generic copy in the
  // reusable projection.
  if (EMAIL_LIKE.test(value)) return "Email address";
  if (PHONE_LIKE.test(value)) return "Phone number";
  return value.trim();
}
function safeIdentifier(value: string, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`The reusable pattern ${path} is invalid.`);
  }
  const result = value.trim();
  if (SECRET_LIKE.test(result)) throw new Error(`The reusable pattern ${path} contains private or secret data.`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) throw new Error(`The reusable pattern ${path} is invalid.`);
  return result;
}
function safePatternJson(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (typeof value === "string") return safeText(value, path, 5_000);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => safePatternJson(item, `${path}.${index}`));
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key)) throw new Error(`The reusable pattern cannot include ${key}.`);
      result[key] = safePatternJson(child, `${path}.${key}`);
    }
    return result;
  }
  throw new Error(`The reusable pattern ${path} is invalid.`);
}
function exactKeys(value: object, expected: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`The reusable pattern ${path} contains unsupported data.`);
  }
}

function assertFieldShape(value: unknown, path: string): asserts value is PatternFieldShape {
  if (!objectLike(value)) throw new Error(`The reusable pattern ${path} is invalid.`);
  const expected = ["id", "label", "kind", "component", "required", ...(Object.hasOwn(value, "placeholder") ? ["placeholder"] : []), ...(Object.hasOwn(value, "options") ? ["options"] : [])];
  exactKeys(value, expected, path);
  safeIdentifier(value.id as string, `${path}.id`);
  safeText(value.label as string, `${path}.label`, 200);
  const kinds = new Set(["text", "email", "phone", "date", "textarea", "select"]);
  const components = new Set(["text_field", "email_field", "phone_field", "date_field", "textarea_field", "select_field"]);
  if (!kinds.has(value.kind as string) || !components.has(value.component as string) || typeof value.required !== "boolean") {
    throw new Error(`The reusable pattern ${path} is invalid.`);
  }
  if (value.placeholder !== undefined) safeText(value.placeholder as string, `${path}.placeholder`, 500);
  if (value.options !== undefined) {
    if (!Array.isArray(value.options) || value.options.length === 0) throw new Error(`The reusable pattern ${path}.options is invalid.`);
    value.options.forEach((option, index) => safeText(option as string, `${path}.options.${index}`, 200));
  }
}
function assertPatternShape(value: unknown, path = "shape"): asserts value is InquiryPatternShape {
  if (!objectLike(value)) throw new Error(`The reusable pattern ${path} is invalid.`);
  exactKeys(value, ["projectionVersion", "version", "name", "form", "record", "routing", "followUp"], path);
  if (value.projectionVersion !== INQUIRY_PATTERN_PROJECTION_VERSION || typeof value.version !== "number" || !Number.isSafeInteger(value.version) || value.version < 1) throw new Error(`The reusable pattern ${path} version is invalid.`);
  safeText(value.name as string, `${path}.name`, 200);
  if (!objectLike(value.form)) throw new Error(`The reusable pattern ${path}.form is invalid.`);
  exactKeys(value.form, ["title", "intro", "fields"], `${path}.form`);
  safeText(value.form.title as string, `${path}.form.title`, 300);
  safeText(value.form.intro as string, `${path}.form.intro`, 5_000);
  if (!Array.isArray(value.form.fields) || value.form.fields.length > 100) throw new Error(`The reusable pattern ${path}.form.fields is invalid.`);
  value.form.fields.forEach((field, index) => assertFieldShape(field, `${path}.form.fields.${index}`));
  if (!objectLike(value.record)) throw new Error(`The reusable pattern ${path}.record is invalid.`);
  exactKeys(value.record, ["singularLabel", "pluralLabel", "fields"], `${path}.record`);
  safeText(value.record.singularLabel as string, `${path}.record.singularLabel`, 200);
  safeText(value.record.pluralLabel as string, `${path}.record.pluralLabel`, 200);
  if (!Array.isArray(value.record.fields) || value.record.fields.length > 100) throw new Error(`The reusable pattern ${path}.record.fields is invalid.`);
  value.record.fields.forEach((field, index) => assertFieldShape(field, `${path}.record.fields.${index}`));
  if (value.routing !== null) {
    if (!objectLike(value.routing)) throw new Error(`The reusable pattern ${path}.routing is invalid.`);
    exactKeys(value.routing, ["channel", "withinMinutes"], `${path}.routing`);
    if (value.routing.channel !== "email" || typeof value.routing.withinMinutes !== "number" || !Number.isSafeInteger(value.routing.withinMinutes) || value.routing.withinMinutes < 1) throw new Error(`The reusable pattern ${path}.routing is invalid.`);
  }
  if (value.followUp !== null) {
    if (!objectLike(value.followUp)) throw new Error(`The reusable pattern ${path}.followUp is invalid.`);
    exactKeys(value.followUp, ["afterMinutes", "maxAttempts", "messageTemplate", "disclosure"], `${path}.followUp`);
    if (typeof value.followUp.afterMinutes !== "number" || !Number.isSafeInteger(value.followUp.afterMinutes) || value.followUp.afterMinutes < 1 || typeof value.followUp.maxAttempts !== "number" || !Number.isSafeInteger(value.followUp.maxAttempts) || value.followUp.maxAttempts < 1 || value.followUp.disclosure !== "Strelva") throw new Error(`The reusable pattern ${path}.followUp is invalid.`);
    safeText(value.followUp.messageTemplate as string, `${path}.followUp.messageTemplate`, 5_000);
  }
  safePatternJson(value, path);
}
function assertInstallation(value: unknown): asserts value is PatternInstallation {
  if (!objectLike(value)) throw new Error("The inquiry pattern installation projection is invalid.");
  exactKeys(value, ["id", "businessId", "capabilityId", "sourceBusinessId", "sourceCapabilityId", "sourceVersion", "targetVersion", "status", "lastSourceShape", "lastTargetShape", "lastProposalId", ...(Object.hasOwn(value, "pendingUpdate") ? ["pendingUpdate"] : []), "createdAt", "updatedAt"], "installation");
  safeIdentifier(value.id as string, "installation id");
  safeIdentifier(value.businessId as string, "installation business");
  safeIdentifier(value.capabilityId as string, "installation capability");
  safeIdentifier(value.sourceBusinessId as string, "source business");
  safeIdentifier(value.sourceCapabilityId as string, "source capability");
  if (typeof value.sourceVersion !== "number" || !Number.isSafeInteger(value.sourceVersion) || value.sourceVersion < 1 || typeof value.targetVersion !== "number" || !Number.isSafeInteger(value.targetVersion) || value.targetVersion < 1) throw new Error("The inquiry pattern installation version is invalid.");
  if (value.status !== "installed" && value.status !== "update_available" && value.status !== "conflicted") throw new Error("The inquiry pattern installation status is invalid.");
  assertPatternShape(value.lastSourceShape, "installation.lastSourceShape");
  assertPatternShape(value.lastTargetShape, "installation.lastTargetShape");
  if (value.lastProposalId !== null) safeIdentifier(value.lastProposalId as string, "installation proposal");
  if (value.pendingUpdate !== undefined) {
    if (!objectLike(value.pendingUpdate)) throw new Error("The inquiry pattern pending update is invalid.");
    exactKeys(value.pendingUpdate, ["proposalId", "baseSourceVersion", "sourceVersion", "targetVersion", "sourceShape"], "installation.pendingUpdate");
    safeIdentifier(value.pendingUpdate.proposalId as string, "pending pattern proposal");
    for (const key of ["baseSourceVersion", "sourceVersion", "targetVersion"] as const) {
      const version = value.pendingUpdate[key];
      if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) throw new Error("The inquiry pattern pending update version is invalid.");
    }
    assertPatternShape(value.pendingUpdate.sourceShape, "installation.pendingUpdate.sourceShape");
  }
  timeFor(value.createdAt as string);
  timeFor(value.updatedAt as string);
}
function fieldShape(field: InquiryPatternShape["form"]["fields"][number], path: string): PatternFieldShape {
  const placeholder = "placeholder" in field && field.placeholder !== undefined
    ? safePlaceholder(field.placeholder, `${path}.placeholder`)
    : undefined;
  const options = field.options?.map((option, index) => safeText(option, `${path}.options.${index}`, 200));
  return {
    id: safeIdentifier(field.id, `${path}.id`),
    label: safeText(field.label, `${path}.label`, 200),
    kind: field.kind,
    component: field.component,
    required: field.required,
    ...(placeholder ? { placeholder } : {}),
    ...(options ? { options } : {}),
  };
}
/**
 * Project a capability into the reusable pattern shape. The explicit field
 * list makes it difficult for future capability additions to accidentally
 * leak records or provider state into a copied pattern.
 */
export function patternShape(definition: InquiryCapabilityDefinition): InquiryPatternShape {
  ensureDefinition(definition);
  const formFields = definition.form.fields.map((field, index) => fieldShape(field, `form.fields.${index}`));
  const recordFields = definition.record.fields.map((field, index) => fieldShape(field, `record.fields.${index}`));
  // Validate the shape as JSON once before returning it. This also protects
  // against a future caller adding a sensitive field to this projection.
  const shape = {
    projectionVersion: INQUIRY_PATTERN_PROJECTION_VERSION,
    version: definition.version,
    name: safeText(definition.name, "name", 200),
    form: {
      title: safeText(definition.form.title, "form.title", 300),
      intro: safeText(definition.form.intro, "form.intro", 5_000),
      fields: formFields,
    },
    record: {
      singularLabel: safeText(definition.record.singularLabel, "record.singularLabel", 200),
      pluralLabel: safeText(definition.record.pluralLabel, "record.pluralLabel", 200),
      fields: recordFields,
    },
    routing: definition.routing
      ? { channel: "email" as const, withinMinutes: definition.routing.withinMinutes }
      : null,
    followUp: definition.followUp
      ? {
        afterMinutes: definition.followUp.afterMinutes,
        maxAttempts: definition.followUp.maxAttempts,
        messageTemplate: safeText(definition.followUp.messageTemplate, "followUp.messageTemplate", 5_000),
        disclosure: "Strelva" as const,
      }
      : null,
  } satisfies InquiryPatternShape;
  assertPatternShape(shape, "shape");
  return clone(shape);
}
function shapeValue(shape: InquiryPatternShape, path: string): JsonValue | null {
  const parts = path.split(".");
  let current: unknown = shape;
  for (const part of parts) {
    if (!part || SENSITIVE_KEYS.has(part) || current === null || typeof current !== "object") return null;
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
  return current === undefined ? null : safePatternJson(current, path);
}
function objectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function changedPaths(before: unknown, after: unknown, path: string, output: string[]): void {
  if (equal(before, after)) return;
  // Field and option lists are merged as one reusable shape value. Treating
  // an array index as a writable object path would either reject an added
  // field or leave a removed field behind, so the whole list becomes an
  // explicit conflict when both sides changed it.
  if (Array.isArray(before) || Array.isArray(after)) {
    output.push(path);
    return;
  }
  // Version is carried separately as the source pin. A version bump is the
  // reason to build a proposal, not a field to merge into the definition.
  if (path === "version") return;
  if (objectLike(before) && objectLike(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) changedPaths(before[key], after[key], path ? `${path}.${key}` : key, output);
    return;
  }
  output.push(path);
}

function applyShapeToDefinition(
  current: InquiryCapabilityDefinition,
  shape: InquiryPatternShape,
  version: number,
  now: string,
): InquiryCapabilityDefinition {
  const next = clone(current);
  const currentShape = patternShape(current);
  const preserveUnchangedPlaceholders = (
    currentFields: InquiryCapabilityDefinition["form"]["fields"],
    currentShapeFields: PatternFieldShape[],
    nextFields: PatternFieldShape[],
  ): PatternFieldShape[] => nextFields.map((field) => {
    const before = currentFields.find((item) => item.id === field.id);
    const beforeShape = currentShapeFields.find((item) => item.id === field.id);
    if (before?.placeholder !== undefined && equal(field.placeholder, beforeShape?.placeholder)) {
      return { ...field, placeholder: before.placeholder };
    }
    return field;
  });
  next.version = version;
  next.updatedAt = now;
  next.name = shape.name;
  next.form.title = shape.form.title;
  next.form.intro = shape.form.intro;
  next.form.fields = preserveUnchangedPlaceholders(current.form.fields, currentShape.form.fields, shape.form.fields);
  next.record.singularLabel = shape.record.singularLabel;
  next.record.pluralLabel = shape.record.pluralLabel;
  next.record.fields = preserveUnchangedPlaceholders(current.record.fields, currentShape.record.fields, shape.record.fields);
  next.routing = shape.routing
    ? {
      component: "routing_rule",
      id: `${next.id}:routing`,
      sentence: `Send each new inquiry to ${next.routing?.destination ?? "your team"} within ${shape.routing.withinMinutes} minutes.`,
      destination: next.routing?.destination ?? "your team",
      channel: "email",
      withinMinutes: shape.routing.withinMinutes,
    }
    : null;
  next.followUp = shape.followUp
    ? {
      component: "follow_up_rule",
      id: `${next.id}:follow-up`,
      sentence: `If nobody replies within ${formatDuration(shape.followUp.afterMinutes)}, Strelva follows up once.`,
      afterMinutes: shape.followUp.afterMinutes,
      maxAttempts: shape.followUp.maxAttempts,
      messageTemplate: shape.followUp.messageTemplate,
      disclosure: "Strelva",
    }
    : null;
  ensureDefinition(next, current.businessId);
  return next;
}

function workForCapability(host: InquiryEngineHost, capabilityId: string): InquiryWork | undefined {
  return host._state().requests
    .filter((work) => work.capabilityId === capabilityId && work.draft)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
}

function installationFor(host: InquiryEngineHost, capabilityId: string): PatternInstallation {
  const installation = installations(host).find((item) => item.capabilityId === capabilityId && item.businessId === host.businessId);
  if (!installation) throw new Error("This capability is not a reusable pattern installation.");
  return installation;
}

function currentDefinitionFor(host: InquiryEngineHost, capabilityId: string): { definition: InquiryCapabilityDefinition; requestId: string | null } {
  const capability = host._capability(capabilityId);
  const work = workForCapability(host, capabilityId);
  const definition = work?.draft ?? capability.live;
  if (!definition) throw new Error("The installed inquiry capability has no current definition.");
  ensureDefinition(definition, host.businessId);
  return { definition: clone(definition), requestId: work?.id ?? null };
}

/** Register a target-scoped installation while copying a pattern definition. */
export function registerPatternInstallation(
  host: InquiryEngineHost,
  sourceDefinition: InquiryCapabilityDefinition,
  targetDefinition: InquiryCapabilityDefinition,
  input: { sourceBusinessId?: string; sourceCapabilityId?: string; now?: string },
): PatternInstallation {
  ensureDefinition(sourceDefinition);
  ensureDefinition(targetDefinition, host.businessId);
  if (sourceDefinition.businessId !== (input.sourceBusinessId ?? sourceDefinition.businessId)) {
    throw new Error("The source definition does not belong to its declared pattern business.");
  }
  const sourceBusinessId = safeIdentifier(input.sourceBusinessId ?? sourceDefinition.businessId, "source business");
  const sourceCapabilityId = safeIdentifier(input.sourceCapabilityId ?? sourceDefinition.id, "source capability");
  if (sourceDefinition.id !== sourceCapabilityId) throw new Error("The source definition does not belong to its declared capability.");
  const now = time(host, input.now);
  const existing = installations(host).find((item) => item.capabilityId === targetDefinition.id);
  if (existing) throw new Error("This capability already has a pattern installation.");
  const installation: PatternInstallation = {
    id: host._id("pattern_installation"),
    businessId: host.businessId,
    capabilityId: targetDefinition.id,
    sourceBusinessId,
    sourceCapabilityId,
    sourceVersion: sourceDefinition.version,
    targetVersion: targetDefinition.version,
    status: "installed",
    lastSourceShape: patternShape(sourceDefinition),
    lastTargetShape: patternShape(targetDefinition),
    lastProposalId: null,
    createdAt: now,
    updatedAt: now,
  };
  installations(host).unshift(installation);
  return clone(installation);
}

/** Return only target-scoped installation metadata, never source records or credentials. */
export function listPatternInstallations(host: InquiryEngineHost): PatternInstallation[] {
  return clone(installations(host).filter((item) => item.businessId === host.businessId));
}

export function getPatternInstallation(host: InquiryEngineHost, installationId: string): PatternInstallation {
  const installation = installations(host).find((item) => item.id === installationId && item.businessId === host.businessId);
  if (!installation) throw new Error("That pattern installation is unavailable.");
  return clone(installation);
}

/**
 * Build a source-version-pinned update. The operation is read-only apart from
 * recording the proposal id on the installation projection for traceability.
 * It never changes the live capability or calls a provider.
 */
export function proposePatternUpdate(host: InquiryEngineHost, input: PatternUpdateInput): PatternUpdateProposal {
  const installation = installationFor(host, input.capabilityId);
  ensureDefinition(input.sourceDefinition);
  if (input.sourceDefinition.businessId !== installation.sourceBusinessId || input.sourceDefinition.id !== installation.sourceCapabilityId) {
    throw new Error("The source definition does not match this pattern installation.");
  }
  const requestedVersion = input.sourceVersion ?? input.sourceDefinition.version;
  if (!Number.isSafeInteger(requestedVersion) || requestedVersion < 1 || requestedVersion !== input.sourceDefinition.version) {
    throw new Error("The requested pattern version must match the supplied source definition exactly.");
  }
  const { definition: currentDefinition, requestId } = currentDefinitionFor(host, input.capabilityId);
  const currentShape = patternShape(currentDefinition);
  const sourceShape = patternShape(input.sourceDefinition);
  const sourcePaths: string[] = [];
  changedPaths(installation.lastSourceShape, sourceShape, "", sourcePaths);
  if (requestedVersion < installation.sourceVersion) {
    throw new Error("The supplied pattern version is older than this installation's pinned version.");
  }
  if (requestedVersion === installation.sourceVersion && sourcePaths.length > 0) {
    throw new Error("The supplied pattern changed without a newer version. Refresh the source pattern.");
  }
  const localPaths: string[] = [];
  changedPaths(installation.lastTargetShape, currentShape, "", localPaths);
  const localPathSet = new Set(localPaths);
  const changes: PatternUpdateChange[] = [];
  const conflicts: PatternUpdateConflict[] = [];
  const merged = clone(currentShape);
  for (const path of sourcePaths) {
    if (!path) continue;
    const sourceBefore = shapeValue(installation.lastSourceShape, path);
    const sourceAfter = shapeValue(sourceShape, path);
    const localValue = shapeValue(currentShape, path);
    const localChanged = localPathSet.has(path);
    if (localChanged) {
      conflicts.push({ path, sourceBefore, sourceAfter, localValue, reason: "local_edit_and_source_update" });
      changes.push({ path, sourceBefore, sourceAfter, localValue, action: "conflict" });
      continue;
    }
    setShapeValue(merged, path, sourceAfter);
    changes.push({ path, sourceBefore, sourceAfter, localValue, action: "apply" });
  }
  const sourcePathSet = new Set(sourcePaths);
  for (const path of localPaths) {
    if (!path || sourcePathSet.has(path)) continue;
    const localValue = shapeValue(currentShape, path);
    changes.push({
      path,
      sourceBefore: shapeValue(installation.lastSourceShape, path),
      sourceAfter: shapeValue(installation.lastSourceShape, path),
      localValue,
      action: "preserve_local",
    });
  }
  const now = time(host, input.now);
  const proposal: PatternUpdateProposal = {
    id: host._id("pattern_update"),
    installationId: installation.id,
    businessId: host.businessId,
    capabilityId: input.capabilityId,
    requestId,
    baseSourceVersion: installation.sourceVersion,
    sourceVersion: requestedVersion,
    baseTargetVersion: currentDefinition.version,
    targetVersion: currentDefinition.version + 1,
    status: requestedVersion === installation.sourceVersion ? "up_to_date" : conflicts.length > 0 ? "conflicted" : "ready",
    changes,
    preservedLocalPaths: localPaths,
    conflicts,
    nextDefinition: applyShapeToDefinition(currentDefinition, merged, currentDefinition.version + 1, now),
    currentDefinition,
    sourceShape,
    createdAt: now,
    rehearsalRequired: true,
  };
  installation.lastProposalId = proposal.id;
  installation.status = proposal.status === "conflicted" ? "conflicted" : proposal.status === "ready" ? "update_available" : "installed";
  if (proposal.status === "up_to_date") {
    delete installation.pendingUpdate;
  } else {
    installation.pendingUpdate = {
      proposalId: proposal.id,
      baseSourceVersion: proposal.baseSourceVersion,
      sourceVersion: proposal.sourceVersion,
      targetVersion: proposal.targetVersion,
      sourceShape: clone(proposal.sourceShape),
    };
  }
  installation.updatedAt = now;
  return clone(proposal);
}

function setShapeValue(shape: InquiryPatternShape, path: string, value: JsonValue | null): void {
  const parts = path.split(".");
  let current: unknown = shape;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!;
    if (!part || SENSITIVE_KEYS.has(part) || !current || typeof current !== "object") throw new Error("The pattern update path is invalid.");
    if (Array.isArray(current)) {
      const arrayIndex = Number(part);
      if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex >= current.length) throw new Error("The pattern update path is invalid.");
      current = current[arrayIndex];
    } else {
      const object = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(object, part)) throw new Error("The pattern update path is invalid.");
      current = object[part];
    }
  }
  const last = parts.at(-1);
  if (!last || !current || typeof current !== "object" || Array.isArray(current)) throw new Error("The pattern update path is invalid.");
  (current as Record<string, unknown>)[last] = value;
}

/** Resolve all conflicts explicitly, preserving local choices by default only when named. */
export function resolvePatternUpdate(
  proposal: PatternUpdateProposal,
  resolutions: readonly PatternConflictResolution[],
  now = proposal.createdAt,
): ResolvedPatternUpdate {
  const expected = new Set(proposal.conflicts.map((conflict) => conflict.path));
  const seen = new Set<string>();
  for (const resolution of resolutions) {
    if (!expected.has(resolution.path)) throw new Error("The pattern update contains an unknown conflict path.");
    if (seen.has(resolution.path)) throw new Error("Each pattern conflict can be resolved once.");
    if (resolution.choice !== "local" && resolution.choice !== "source") throw new Error("Choose the local or source value for every pattern conflict.");
    seen.add(resolution.path);
  }
  if (seen.size !== expected.size) throw new Error("Resolve every pattern conflict before staging the update.");
  const merged = patternShape(proposal.nextDefinition);
  const resolvedConflicts = proposal.conflicts.map((conflict) => {
    const resolution = resolutions.find((item) => item.path === conflict.path)!;
    if (resolution.choice === "source") setShapeValue(merged, conflict.path, conflict.sourceAfter);
    return { ...resolution, sourceValue: conflict.sourceAfter, localValue: conflict.localValue };
  });
  const definition = applyShapeToDefinition(proposal.currentDefinition, merged, proposal.targetVersion, timeFor(now));
  return { proposalId: proposal.id, definition, resolvedConflicts, rehearsalVersion: proposal.targetVersion };
}

function assertResolvedPatternUpdate(proposal: PatternUpdateProposal, resolution: ResolvedPatternUpdate): void {
  if (resolution.proposalId !== proposal.id || resolution.rehearsalVersion !== proposal.targetVersion) {
    throw new Error("The pattern update resolution is stale or belongs to another proposal.");
  }
  const expected = new Map(proposal.conflicts.map((conflict) => [conflict.path, conflict]));
  if (resolution.resolvedConflicts.length !== expected.size) throw new Error("Resolve every pattern conflict before committing the update.");
  const resolved = new Set<string>();
  const shape = patternShape(resolution.definition);
  for (const item of resolution.resolvedConflicts) {
    const conflict = expected.get(item.path);
    if (!conflict || resolved.has(item.path) || (item.choice !== "local" && item.choice !== "source")) throw new Error("The pattern update conflict choices are invalid.");
    if (!equal(item.sourceValue, conflict.sourceAfter) || !equal(item.localValue, conflict.localValue)) throw new Error("The pattern update conflict evidence is stale.");
    const expectedValue = item.choice === "source" ? conflict.sourceAfter : conflict.localValue;
    if (!equal(shapeValue(shape, item.path), expectedValue)) throw new Error("The resolved pattern definition does not match its explicit conflict choices.");
    resolved.add(item.path);
  }
  if (resolved.size !== expected.size) throw new Error("Resolve every pattern conflict before committing the update.");
}

function hasValidResolution(proposal: PatternUpdateProposal, resolution: ResolvedPatternUpdate | null): boolean {
  if (!resolution) return false;
  try {
    assertResolvedPatternUpdate(proposal, resolution);
    return true;
  } catch {
    return false;
  }
}

function timeFor(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error("Use a valid pattern update timestamp.");
  return value;
}

/**
 * The existing engine's rehearsal runs are the only publication proof. This
 * helper makes the exact-version requirement available to the parent command
 * without introducing another publication path.
 */
export function patternUpdatePublishReadiness(
  proposal: PatternUpdateProposal,
  resolution: ResolvedPatternUpdate | null,
  runs: readonly RehearsalRun[],
): PatternUpdatePublishReadiness {
  const checks: PatternUpdatePublishReadiness["checks"] = [];
  const reasons: string[] = [];
  const add = (id: string, passed: boolean, detail: string) => {
    checks.push({ id, passed, detail });
    if (!passed) reasons.push(detail);
  };
  add("source_version", proposal.sourceVersion > proposal.baseSourceVersion, proposal.sourceVersion > proposal.baseSourceVersion ? `Source pattern version ${proposal.sourceVersion} is newer than the installed pin.` : "The source pattern version is not newer than the installed pin.");
  const validResolution = proposal.conflicts.length === 0
    ? Boolean(resolution && hasValidResolution(proposal, resolution))
    : hasValidResolution(proposal, resolution);
  add("conflicts", validResolution, proposal.conflicts.length === 0 ? "No local and source edits overlap." : validResolution ? "Every overlapping edit has an explicit choice." : "Resolve every local and source conflict before staging the update.");
  add("exact_definition", validResolution, validResolution ? `The staged definition is version ${proposal.targetVersion}.` : `Stage the exact proposed definition version ${proposal.targetVersion}.`);
  const rehearsal = runs.find((run) => run.requestId === proposal.requestId && run.capabilityId === proposal.capabilityId && run.definitionVersion === proposal.targetVersion);
  add("rehearsal", Boolean(rehearsal?.passed && rehearsal.externalWritesBlocked && rehearsal.nothingLive), rehearsal?.passed && rehearsal.externalWritesBlocked && rehearsal.nothingLive ? `Rehearsal passed for version ${proposal.targetVersion}; external writes stayed blocked.` : `Run a passing isolated rehearsal for version ${proposal.targetVersion} before publishing.`);
  return { ready: reasons.length === 0, requestId: proposal.requestId, capabilityId: proposal.capabilityId, exactVersion: proposal.targetVersion, checks, reasons };
}

/**
 * Commit only after the canonical engine reports provider acceptance and a
 * successful read-back. This advances the source pin and target baseline;
 * it does not mutate capability state or inquiry records.
 */
export function commitPatternUpdate(host: InquiryEngineHost, input: CommitPatternUpdateInput): PatternInstallation {
  actor(input.actorId);
  if (input.proposal.sourceVersion <= input.proposal.baseSourceVersion) {
    throw new Error("Only a newer pattern version can be committed.");
  }
  assertResolvedPatternUpdate(input.proposal, input.resolution);
  const installation = installationFor(host, input.proposal.capabilityId);
  if (installation.id !== input.proposal.installationId || installation.sourceVersion !== input.proposal.baseSourceVersion || installation.lastProposalId !== input.proposal.id) {
    throw new Error("This pattern update is stale. Refresh the installation before committing it.");
  }
  if (!installation.pendingUpdate || installation.pendingUpdate.proposalId !== input.proposal.id || installation.pendingUpdate.sourceVersion !== input.proposal.sourceVersion || installation.pendingUpdate.targetVersion !== input.proposal.targetVersion) {
    throw new Error("This pattern update is stale. Refresh the installation before committing it.");
  }
  ensureDefinition(input.sourceDefinition);
  ensureDefinition(input.definition, host.businessId);
  if (input.sourceDefinition.businessId !== installation.sourceBusinessId || input.sourceDefinition.id !== installation.sourceCapabilityId || input.sourceDefinition.version !== input.proposal.sourceVersion) {
    throw new Error("The committed source definition does not match the proposed pattern version.");
  }
  if (input.definition.id !== installation.capabilityId || input.definition.version !== input.proposal.targetVersion) {
    throw new Error("The committed target definition does not match the proposed capability version.");
  }
  if (!equal(patternShape(input.definition), patternShape(input.resolution.definition))) {
    throw new Error("The committed target definition does not match the explicit pattern choices.");
  }
  const now = time(host, input.now);
  installation.sourceVersion = input.sourceDefinition.version;
  installation.targetVersion = input.definition.version;
  installation.lastSourceShape = patternShape(input.sourceDefinition);
  installation.lastTargetShape = patternShape(input.definition);
  installation.status = "installed";
  installation.lastProposalId = input.proposal.id;
  delete installation.pendingUpdate;
  installation.updatedAt = now;
  // Keep the actor validation here even though the publication receipt is
  // owned by the engine. It prevents a future adapter from silently accepting
  // an unbound projection update.
  return clone(installation);
}

/**
 * Finish the target pin from the canonical live definition after the existing
 * publication executor has verified its read-back. The pending source shape is
 * safe durable metadata, so the executor never needs to persist a source
 * capability or source credentials in the target workspace.
 */
export function commitPatternInstallationAfterVerification(
  host: InquiryEngineHost,
  input: { capabilityId: string; actorId: string; now?: string },
): PatternInstallation | null {
  const state = patternState(host);
  if (state.patternInstallations === undefined) return null;
  const installation = installations(host).find((item) => item.capabilityId === input.capabilityId && item.businessId === host.businessId);
  if (!installation) return null;
  const pending = installation.pendingUpdate;
  if (!pending) return null;
  actor(input.actorId);
  if (installation.lastProposalId !== pending.proposalId || installation.sourceVersion !== pending.baseSourceVersion) {
    throw new Error("The verified pattern update is stale. Refresh the installation before committing it.");
  }
  const capability = host._capability(input.capabilityId);
  if (!capability.live || capability.live.version !== pending.targetVersion) {
    throw new Error("The verified live capability does not match the staged pattern update.");
  }
  assertPatternShape(pending.sourceShape, "pending source shape");
  const now = time(host, input.now);
  installation.sourceVersion = pending.sourceVersion;
  installation.targetVersion = capability.live.version;
  installation.lastSourceShape = clone(pending.sourceShape);
  installation.lastTargetShape = patternShape(capability.live);
  installation.status = "installed";
  installation.updatedAt = now;
  delete installation.pendingUpdate;
  return clone(installation);
}

function shapeForPatternUpdate(
  definition: InquiryCapabilityDefinition,
  requestId: string,
  actorId: string,
  now: string,
): InquiryShapeProposal {
  const lines = [
    "form",
    "record",
    ...(definition.routing ? ["routing"] : []),
    ...(definition.followUp ? ["follow_up"] : []),
  ] as InquiryShapeLineKind[];
  return {
    id: `pattern-update:${requestId}`,
    requestId,
    businessId: definition.businessId,
    version: 1,
    intent: `Update ${definition.name}`,
    title: definition.form.title,
    summary: "A source pattern update is staged for this business and needs a fresh rehearsal.",
    lines: lines.map((id) => ({
      id,
      kind: id,
      sentence: id === "form"
        ? "An updated inquiry form on your website."
        : id === "record"
          ? "An updated inquiry request record."
          : id === "routing"
            ? `A routing rule for ${definition.routing!.destination}.`
            : "Strelva follows up when nobody replies.",
      touches: id === "form" ? "website form" : id === "record" ? "inquiry records" : id === "routing" ? "email routing rule" : "follow-up responsibility",
      required: id === "form" || id === "record",
      selected: true,
    })),
    defaults: {
      destination: definition.routing?.destination || "your team",
      followUpAfterMinutes: definition.followUp?.afterMinutes ?? 24 * 60,
      emailConnection: definition.connections[0] as InquiryConnectionBinding,
    },
    selectedLineIds: lines,
    status: "accepted",
    createdAt: now,
    acceptedAt: now,
    acceptedBy: actorId,
  };
}

/** Stage a resolved definition as ordinary inquiry work and a normal receipt. */
export function stagePatternUpdate(host: InquiryEngineHost, input: StagePatternUpdateInput): StagePatternUpdateResult {
  const actorId = actor(input.actorId);
  assertResolvedPatternUpdate(input.proposal, input.resolution);
  if (input.proposal.sourceVersion <= input.proposal.baseSourceVersion || input.proposal.status === "up_to_date") {
    throw new Error("Only a newer pattern version can be staged.");
  }
  const installation = installationFor(host, input.proposal.capabilityId);
  if (installation.id !== input.proposal.installationId || installation.lastProposalId !== input.proposal.id || installation.sourceVersion !== input.proposal.baseSourceVersion) {
    throw new Error("This pattern update is stale. Refresh the installation before staging it.");
  }
  if (!installation.pendingUpdate || installation.pendingUpdate.proposalId !== input.proposal.id || installation.pendingUpdate.sourceVersion !== input.proposal.sourceVersion || installation.pendingUpdate.targetVersion !== input.proposal.targetVersion) {
    throw new Error("This pattern update is stale. Refresh the installation before staging it.");
  }
  const target = clone(input.resolution.definition);
  ensureDefinition(target, host.businessId);
  if (target.id !== input.proposal.capabilityId || target.version !== input.proposal.targetVersion) {
    throw new Error("The staged pattern definition does not match the proposed capability version.");
  }
  const capability = host._capability(input.proposal.capabilityId);
  const currentWork = capability.activeRequestId ? host._request(capability.activeRequestId) : null;
  if (currentWork && ["publishing", "live_unverified"].includes(currentWork.state)) {
    throw new Error("Reconcile the current live boundary before staging a pattern update.");
  }
  const currentDefinition = currentWork?.draft ?? capability.live ?? input.proposal.currentDefinition;
  if (!currentDefinition || currentDefinition.version !== input.proposal.baseTargetVersion) {
    throw new Error("This pattern update is stale. Refresh the current draft before staging it.");
  }
  const now = time(host, input.now);
  const work = currentWork?.draft
    ? currentWork
    : (() => {
      const requestId = host._id("request");
      const next: InquiryWork = {
        id: requestId,
        businessId: host.businessId,
        capabilityId: input.proposal.capabilityId,
        actorId,
        intent: `Update ${currentDefinition.name}`,
        shape: shapeForPatternUpdate(target, requestId, actorId, now),
        plan: null,
        draft: null,
        state: "shaped",
        activeChangeId: null,
        publishApproval: null,
        rehearsalScenarioIds: [],
        rehearsalRunIds: [],
        lastLiveChangeId: null,
        createdAt: now,
        updatedAt: now,
        failureReason: null,
      };
      host._state().requests.unshift(next);
      return next;
    })();
  work.shape = shapeForPatternUpdate(target, work.id, actorId, now);
  work.actorId = actorId;
  work.draft = target;
  work.state = "planned";
  work.publishApproval = null;
  work.rehearsalRunIds = [];
  work.updatedAt = now;
  if (!work.plan) work.plan = planFor(work.shape, target.version, now);
  else work.plan.version = target.version;
  const items = definitionItems(host, currentDefinition, target);
  const change: ChangeReceipt = {
    id: host._id("change"),
    businessId: host.businessId,
    requestId: work.id,
    capabilityId: work.capabilityId,
    baseVersion: capability.live?.version ?? null,
    targetVersion: target.version,
    status: "draft",
    summary: changeSummary(items) || "Inquiry pattern update",
    items,
    preservedInquiryIds: allInquiryIds(host._state(), work.capabilityId),
    undoOfChangeId: null,
    undoAvailable: false,
    actorIds: [actorId],
    createdAt: now,
    updatedAt: now,
    providerAcceptanceId: null,
    providerReceipt: null,
    verification: null,
    failureReason: null,
  };
  host._state().changes.unshift(change);
  work.activeChangeId = change.id;
  capability.activeRequestId = work.id;
  capability.status = capability.live ? "live" : "draft";
  capability.updatedAt = now;
  host._addActionReceipt({
    businessId: host.businessId,
    requestId: work.id,
    capabilityId: work.capabilityId,
    inquiryId: null,
    responsibilityId: null,
    actor: { kind: "person", id: actorId },
    action: "stage_pattern_update",
    what: `Staged inquiry pattern update version ${target.version}.`,
    why: "A source update is staged as ordinary inquiry work after explicit conflict choices; local edits remain visible in the receipt.",
    lookedAt: ["source pattern version", "local edits", `version ${target.version}`],
    outcome: "recorded",
    evidence: ["explicit local/source conflict choices", "requires a new exact-version rehearsal"],
    createdAt: now,
  });
  host._emit();
  return { work: clone(work), change: clone(change) };
}

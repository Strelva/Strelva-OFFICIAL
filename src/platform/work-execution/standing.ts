import { z } from "zod";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import {
  changeResponsibility,
  createResponsibility,
  stepInputSchema,
  type Responsibility,
  type StepInput,
} from "./engine";

const UUID = z.string().uuid();
const DATE = z.string().datetime();
const KEY = z.string().trim().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/);

/** The scope is a concrete set of existing native commands. It cannot name a
 * product, provider or network operation outside the current execution list. */
export const standingScopeSchema = z.object({
  steps: z.array(stepInputSchema).min(1).max(20),
  note: z.string().trim().max(1000).optional(),
}).strict();

export const standingTriggerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual") }).strict(),
  z.object({
    kind: z.literal("interval"),
    everySeconds: z.number().int().min(60).max(31_536_000),
    nextAt: DATE,
  }).strict(),
]);

export const standingLimitsSchema = z.object({
  maxConcurrentJobs: z.number().int().min(1).max(20).default(1),
  maxRuns: z.number().int().min(1).max(10_000).nullable().default(null),
}).strict();

const defaultStandingLimits = { maxConcurrentJobs: 1, maxRuns: null } as const;

const standingInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  intent: z.string().trim().min(1).max(4000),
  scope: standingScopeSchema,
  trigger: standingTriggerSchema,
  limits: standingLimitsSchema.default(defaultStandingLimits),
  // Free text is retained for operator context; the executable boundary is
  // the versioned native scope above.
  exclusions: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  escalation: z.string().trim().max(1000).optional(),
}).strict();

const standingHistorySchema = z.object({
  revision: z.number().int().nonnegative(),
  kind: z.enum(["approve", "pause", "resume", "revoke", "update"]),
  actorId: z.string().min(1).max(256),
  at: DATE,
  detail: z.string().max(2000).optional(),
}).strict();

export const standingResponsibilitySchema = z.object({
  version: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  title: z.string().min(1).max(160),
  intent: z.string().min(1).max(4000),
  ownerId: UUID,
  status: z.enum(["proposed", "active", "paused", "revoked"]),
  approvedBy: UUID.optional(),
  approvedAt: DATE.optional(),
  scope: standingScopeSchema,
  trigger: standingTriggerSchema,
  limits: standingLimitsSchema,
  exclusions: z.array(z.string().min(1).max(500)).max(50),
  escalation: z.string().max(1000).optional(),
  createdAt: DATE,
  updatedAt: DATE,
  history: z.array(standingHistorySchema).max(1000),
}).strict();

export type StandingScope = z.infer<typeof standingScopeSchema>;
export type StandingTrigger = z.infer<typeof standingTriggerSchema>;
export type StandingLimits = z.infer<typeof standingLimitsSchema>;
export type StandingResponsibility = z.infer<typeof standingResponsibilitySchema>;

export const standingResponsibilityCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approve"), expectedRevision: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("pause"), expectedRevision: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("resume"), expectedRevision: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("revoke"), expectedRevision: z.number().int().nonnegative() }).strict(),
  z.object({
    kind: z.literal("update"),
    expectedRevision: z.number().int().nonnegative(),
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(160),
    intent: z.string().trim().min(1).max(4000),
    scope: standingScopeSchema,
    trigger: standingTriggerSchema,
    limits: standingLimitsSchema.default(defaultStandingLimits),
    exclusions: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
    escalation: z.string().trim().max(1000).optional(),
  }).strict(),
]);
export type StandingResponsibilityCommand = z.infer<typeof standingResponsibilityCommandSchema>;

export interface StandingAdmissionInput {
  standingResponsibilityId: string;
  triggerKey: string;
  expectedVersion?: number;
  nextAt?: string;
}

export const standingAdmissionInputSchema = z.object({
  standingResponsibilityId: UUID,
  triggerKey: KEY,
  expectedVersion: z.number().int().positive().optional(),
  nextAt: DATE.optional(),
}).strict();

function copy<T>(value: T): T {
  return structuredClone(value);
}

function conflict(message: string): never {
  throw new WorkspaceConflictError(message);
}

function record(work: StandingResponsibility, kind: StandingResponsibilityCommand["kind"], actorId: string, at: string, detail?: string): StandingResponsibility {
  if (work.history.length >= 1000) conflict("This ongoing responsibility has reached its history limit. Create a new version.");
  work.revision += 1;
  work.updatedAt = DATE.parse(at);
  work.history.push({ revision: work.revision, kind, actorId, at, ...(detail ? { detail } : {}) });
  return standingResponsibilitySchema.parse(work);
}

function validateScope(scope: StandingScope): StandingScope {
  const ids = new Set<string>();
  for (const step of scope.steps) {
    if (step.operation !== "investigation.run") {
      conflict("Ongoing work currently supports saved-record checks only. Keep mutations in a reviewed finite Responsibility.");
    }
    if (Object.keys(step.input).length > 0) {
      conflict("An ongoing investigation scope must leave its current revision and request identity to admission.");
    }
    if (ids.has(step.id) || step.dependsOn.some((id) => !ids.has(id))) {
      conflict("The ongoing responsibility scope must use an ordered set of native steps.");
    }
    ids.add(step.id);
  }
  return copy(scope);
}

export function createStandingResponsibility(raw: unknown, ownerId: string, at: string): StandingResponsibility {
  const input = standingInputSchema.parse(raw);
  if (input.trigger.kind === "interval" && Date.parse(input.trigger.nextAt) <= Date.parse(at)) {
    conflict("An interval trigger must start in the future.");
  }
  return standingResponsibilitySchema.parse({
    ...input,
    version: 1,
    revision: 0,
    ownerId: UUID.parse(ownerId),
    status: "proposed",
    scope: validateScope(input.scope),
    createdAt: DATE.parse(at),
    updatedAt: DATE.parse(at),
    history: [],
  });
}

export function changeStandingResponsibility(raw: StandingResponsibility, rawCommand: unknown, actorId: string, at: string): StandingResponsibility {
  const work = copy(standingResponsibilitySchema.parse(raw));
  const command = standingResponsibilityCommandSchema.parse(rawCommand);
  const actor = UUID.parse(actorId);
  if (command.expectedRevision !== work.revision) conflict("This ongoing responsibility changed. Reload before deciding.");
  if (work.status === "revoked") conflict("This ongoing responsibility has been revoked.");

  switch (command.kind) {
    case "approve":
      if (work.status !== "proposed") conflict("Only a proposed responsibility version can be approved.");
      work.status = "active";
      work.approvedBy = actor;
      work.approvedAt = DATE.parse(at);
      break;
    case "pause":
      if (work.status !== "active") conflict("Only an active ongoing responsibility can be paused.");
      work.status = "paused";
      break;
    case "resume":
      if (work.status !== "paused") conflict("Only a paused ongoing responsibility can resume.");
      work.status = "active";
      break;
    case "revoke":
      if (!work.approvedAt) conflict("Approve this responsibility before revoking it.");
      work.status = "revoked";
      break;
    case "update":
      if (!['proposed', 'paused'].includes(work.status)) conflict("Pause the ongoing responsibility before preparing a new version.");
      if (command.version !== work.version + 1) conflict("The next responsibility version must increment by one.");
      if (command.trigger.kind === "interval" && Date.parse(command.trigger.nextAt) <= Date.parse(at)) {
        conflict("An interval trigger must start in the future.");
      }
      work.version = command.version;
      work.title = command.title;
      work.intent = command.intent;
      work.scope = validateScope(command.scope);
      work.trigger = command.trigger;
      work.limits = command.limits;
      work.exclusions = command.exclusions;
      work.escalation = command.escalation;
      work.approvedBy = undefined;
      work.approvedAt = undefined;
      work.status = "proposed";
      break;
  }
  return record(work, command.kind, actor, DATE.parse(at), command.kind === "update" ? `version ${work.version}` : undefined);
}

/** A standing policy cannot silently turn a paid native command into an
 * unaccepted action. The zero-cost path is the local read/write catalog; paid
 * work must go through the existing per-job budget acceptance flow first. */
export function assertStandingAdmissionAllowed(policy: StandingResponsibility): void {
  if (policy.scope.steps.some((step) => step.maximumCents > 0)) {
    conflict("This ongoing responsibility contains paid work. Accept a budget for each finite job before admitting it.");
  }
  if (policy.scope.steps.some((step) => step.operation !== "investigation.run")) {
    conflict("Ongoing work currently supports saved-record checks only. Keep mutations in a reviewed finite Responsibility.");
  }
  if (policy.scope.steps.some((step) => step.operation === "investigation.run" && Object.keys(step.input).length > 0)) {
    conflict("An ongoing investigation scope must leave its current revision and request identity to admission.");
  }
}

/** Convert one policy version and trigger into the existing finite work shape.
 * The trigger identity lives in the standing job/run tables, so this payload
 * remains byte-compatible with old Responsibility records. */
export function admittedResponsibility(policy: StandingResponsibility, at: string, resolvedSteps = policy.scope.steps): Responsibility {
  assertStandingAdmissionAllowed(policy);
  const proposed = createResponsibility({
    title: policy.title,
    intent: policy.intent,
    steps: resolvedSteps.map((step) => copy<StepInput>(step)),
  }, policy.ownerId, at);
  return changeResponsibility(proposed, { kind: "approve", expectedRevision: proposed.revision }, policy.ownerId, at);
}

export function isStandingDue(policy: StandingResponsibility, at: string): boolean {
  return policy.status === "active"
    && policy.trigger.kind === "interval"
    && Date.parse(policy.trigger.nextAt) <= Date.parse(at);
}

export function nextStandingTrigger(policy: StandingResponsibility): string | undefined {
  if (policy.trigger.kind !== "interval") return undefined;
  return new Date(Date.parse(policy.trigger.nextAt) + policy.trigger.everySeconds * 1000).toISOString();
}

export const __private = { validateScope, record };

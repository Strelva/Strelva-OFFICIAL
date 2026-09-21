import { z } from "zod";
import { WorkspaceConflictError } from "@/platform/workspaces/types";

export const operationSchema = z.enum(["document.edit", "tracker.command", "investigation.run", "schedule.command", "application.command", "website.draft", "learning.collect"]);
export const stepInputSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/), operation: operationSchema,
  workId: z.string().uuid(), input: z.record(z.string(), z.unknown()),
  dependsOn: z.array(z.string()).max(20).default([]), maximumCents: z.number().int().min(0).max(100000),
  /** New work pins the native command; legacy persisted steps read as v1. */
  capabilityVersion: z.number().int().positive().default(1),
  expectedUpdatedAt: z.string().datetime().optional(),
}).strict();
export const responsibilityInputSchema = z.object({
  title: z.string().trim().min(1).max(160), intent: z.string().trim().min(1).max(4000),
  steps: z.array(stepInputSchema).min(1).max(20), budgetId: z.string().uuid().optional(),
}).strict();
export type Operation = z.infer<typeof operationSchema>;
export type StepInput = z.infer<typeof stepInputSchema>;
const stepSchema = stepInputSchema.extend({
  status: z.enum(["pending", "running", "waiting", "completed", "accepted", "failed", "unknown"]),
  attempt: z.number().int().nonnegative(), leaseId: z.string().optional(), startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(), wakeAt: z.string().datetime().optional(),
  reason: z.string().max(2000).optional(), result: z.unknown().optional(),
  effect: z.enum(["none", "accepted", "unknown"]).optional(),
});
export const responsibilitySchema = z.object({
  version: z.literal(1), revision: z.number().int().nonnegative(), title: z.string(), intent: z.string(),
  ownerId: z.string(), approvedBy: z.string().optional(), approvedAt: z.string().datetime().optional(),
  status: z.enum(["proposed", "ready", "running", "waiting", "paused", "needs_attention", "completed", "cancelled"]),
  budgetId: z.string().uuid().optional(), steps: z.array(stepSchema).min(1).max(20),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  history: z.array(z.object({ revision: z.number().int(), kind: z.string(), actorId: z.string(), at: z.string().datetime(), detail: z.string().optional() })).max(1000),
});
export type Responsibility = z.infer<typeof responsibilitySchema>;
export const responsibilityCommandSchema = z.object({
  kind: z.enum(["approve", "set_budget", "pause", "resume", "cancel", "retry", "reconcile"]), expectedRevision: z.number().int().nonnegative(), budgetId: z.string().uuid().optional(),
  stepId: z.string().optional(), resolution: z.enum(["completed", "not_applied"]).optional(), evidence: z.string().trim().min(1).max(2000).optional(),
}).strict();
export interface StepOutcome {
  effect: "none" | "accepted" | "unknown";
  status: "completed" | "waiting" | "failed" | "verification_failed" | "needs_decision";
  result?: unknown; reason?: string; wakeAt?: string;
}
function conflict(message: string): never { throw new WorkspaceConflictError(message); }
function copy(input: Responsibility): Responsibility { return structuredClone(responsibilitySchema.parse(input)); }
function record(work: Responsibility, kind: string, actorId: string, at: string, detail?: string) {
  if (work.history.length >= 1000) conflict("This responsibility has reached its history limit. Create a reviewed continuation.");
  work.revision += 1; work.updatedAt = z.string().datetime().parse(at);
  work.history.push({ revision: work.revision, kind, actorId, at, ...(detail ? { detail } : {}) });
  return responsibilitySchema.parse(work);
}
export function createResponsibility(raw: unknown, ownerId: string, at: string): Responsibility {
  const input = responsibilityInputSchema.parse(raw);
  const ids = new Set<string>();
  for (const step of input.steps) {
    if (ids.has(step.id) || step.dependsOn.some(id => !ids.has(id))) conflict("Each step must depend only on earlier steps. Cycles and missing dependencies are unsupported.");
    ids.add(step.id);
  }
  return responsibilitySchema.parse({ ...input, version: 1, revision: 0, ownerId, status: "proposed", createdAt: at, updatedAt: at, history: [], steps: input.steps.map(step => ({ ...step, status: "pending", attempt: 0 })) });
}
export function changeResponsibility(raw: Responsibility, input: unknown, actorId: string, at: string): Responsibility {
  const work = copy(raw), command = responsibilityCommandSchema.parse(input);
  if (command.expectedRevision !== work.revision) conflict("This work changed. Reload before deciding.");
  if ((work.status === "cancelled" && command.kind !== "reconcile") || work.status === "completed") conflict("This work is closed.");
  const wasCancelled = work.status === "cancelled";
  const wasPaused = work.status === "paused";
  switch (command.kind) {
    case "approve":
      if (work.status !== "proposed") conflict("Only a proposal can be approved.");
      if (work.steps.some(step => step.maximumCents > 0) && !work.budgetId) conflict("Accept and attach a budget before approving paid work.");
      work.approvedBy = actorId; work.approvedAt = at; work.status = "ready"; break;
    case "set_budget":
      if (work.status !== "proposed" || !command.budgetId) conflict("A budget can only be attached to a proposal.");
      work.budgetId = command.budgetId; break;
    case "pause":
      if (!work.approvedAt) conflict("Approve this work before pausing it.");
      work.status = "paused"; break;
    case "cancel": work.status = "cancelled"; break;
    case "resume":
      if (work.status !== "paused") conflict("Only paused work can resume.");
      work.status = work.steps.every(s => s.status === "completed") ? "completed" : work.steps.some(s => s.status === "running") ? "running" : work.steps.some(s => ["unknown", "accepted", "failed"].includes(s.status)) ? "needs_attention" : "ready"; break;
    case "retry": {
      if (work.status !== "needs_attention") conflict("Only failed work can retry.");
      const failed = work.steps.find(s => s.status === "failed" && s.effect === "none");
      if (!failed || work.steps.some(s => s.status === "unknown" || s.status === "accepted")) conflict("This action may already have happened. Reconcile it; do not replay it.");
      if (failed.attempt >= 3) conflict("Retry limit reached. Review this work before continuing.");
      failed.status = "pending"; failed.reason = undefined; work.status = "ready"; break;
    }
    case "reconcile": {
      const step = work.steps.find(s => s.id === command.stepId);
      if (!step || !["unknown", "accepted", "running"].includes(step.status) || !command.resolution || !command.evidence) conflict("Reconciliation requires the exact step and evidence of its outcome.");
      if (step.status === "running" && Date.parse(at) - Date.parse(step.startedAt ?? at) < 120000) conflict("The worker may still be running. Wait before reconciling.");
      if (command.resolution === "not_applied" && step.effect === "accepted") conflict("An accepted write cannot be declared safe to replay.");
      step.status = command.resolution === "completed" ? "completed" : "failed";
      step.effect = command.resolution === "completed" ? (step.effect === "none" ? "none" : "accepted") : "none";
      step.reason = command.evidence; step.finishedAt = at;
      work.status = work.steps.every(s => s.status === "completed") ? "completed" : command.resolution === "completed" ? "ready" : "needs_attention"; break;
    }
  }
  if (wasCancelled) work.status = "cancelled";
  if (wasPaused && command.kind === "reconcile") work.status = "paused";
  return record(work, command.kind, actorId, at, command.evidence);
}
export function claimNextStep(raw: Responsibility, leaseId: string, at: string, actorId?: string): Responsibility {
  const work = copy(raw);
  if (!work.approvedAt) conflict("Approve the proposed work before it starts.");
  if (work.steps.some(s => s.status === "running")) conflict("A worker already started this action. Reconcile its outcome before another attempt.");
  if (!["ready", "waiting"].includes(work.status)) conflict("This work is not ready to run.");
  const step = work.steps.find(s => ["pending", "waiting"].includes(s.status) && s.dependsOn.every(id => work.steps.find(dependency => dependency.id === id)?.status === "completed"));
  if (!step) conflict("No step can run until its dependencies complete.");
  if (step.wakeAt && Date.parse(step.wakeAt) > Date.parse(at)) conflict("This work is waiting until its next check.");
  step.status = "running"; step.leaseId = leaseId; step.startedAt = at; step.attempt += 1; step.wakeAt = undefined;
  work.status = "running";
  return record(work, "started", actorId ?? work.ownerId, at, step.id);
}
export function recordStepOutcome(raw: Responsibility, leaseId: string, outcome: StepOutcome, at: string, actorId?: string): Responsibility {
  const work = copy(raw), step = work.steps.find(s => s.status === "running" && s.leaseId === leaseId);
  if (!step) conflict("This worker no longer owns the action.");
  step.effect = outcome.effect; step.result = outcome.result; step.reason = outcome.reason; step.finishedAt = at;
  if (outcome.effect === "unknown") step.status = "unknown";
  else if (outcome.status === "verification_failed" || outcome.status === "needs_decision" || (outcome.effect === "accepted" && outcome.status !== "completed")) step.status = "accepted";
  else if (outcome.status === "waiting") {
    if (!outcome.wakeAt || Date.parse(outcome.wakeAt) <= Date.parse(at)) conflict("Waiting work requires a future check time.");
    step.status = "waiting"; step.wakeAt = outcome.wakeAt;
  } else step.status = outcome.status;
  if (work.status !== "cancelled" && work.status !== "paused") {
    work.status = work.steps.every(s => s.status === "completed") ? "completed" : step.status === "waiting" ? "waiting" : step.status === "completed" ? "ready" : "needs_attention";
  }
  return record(work, "outcome", actorId ?? work.ownerId, at, `${step.id}: ${step.status}`);
}

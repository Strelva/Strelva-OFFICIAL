import { createHash } from "node:crypto";
import { getWork, assertWorkspaceMember } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { readWorkspaceDocument } from "@/products/documents/server";
import { documentCommandSchema } from "@/products/documents/contracts";
import { readWorkspaceInvestigation } from "@/products/investigations/server";
import { reconcileBudgetedAction } from "@/platform/work-economics/runtime";
import { responsibilityCommands, type ExecutionAdapter } from "@/platform/work-execution/runtime";
import { insertResponsibility, persistResponsibility, readResponsibility } from "@/platform/work-execution/repository";
import { changeResponsibility, responsibilityCommandSchema, type Responsibility, type StepInput } from "@/platform/work-execution/engine";
import { executeJobEconomicsCommand, readJobEconomics } from "@/platform/work-economics/service";
import { admittedResponsibility, changeStandingResponsibility, createStandingResponsibility as buildStandingResponsibility, nextStandingTrigger, standingAdmissionInputSchema, standingResponsibilityCommandSchema, type StandingResponsibility } from "@/platform/work-execution/standing";
import { admitStandingResponsibility as persistStandingAdmission, createStandingResponsibility as persistStandingPolicy, readStandingResponsibility, readStandingRun, readStandingRunForWork, recordStandingRun, persistStandingResponsibility, readStandingRunForTrigger, type StandingAdmission, type StandingResponsibilityRecord, type StandingRun, type StandingRunStatus } from "@/platform/work-execution/standing-repository";
import { nativeExecutionAdapter } from "./native-execution";

const nativeCommands = responsibilityCommands({ read: readResponsibility, write: persistResponsibility, create: insertResponsibility }, nativeExecutionAdapter);

function standingExecutionAdapter(actor: WorkspaceActor, standingId: string, policyVersion: number): ExecutionAdapter {
  const guard = async () => {
    const current = await readStandingResponsibility(actor, standingId);
    assertStandingOwner(current, actor);
    if (current.policy.status !== "active" || current.policy.version !== policyVersion) {
      throw new WorkspaceConflictError("This ongoing responsibility is paused, revoked, or has a newer approved version.");
    }
  };
  return {
    recheck: async (runActor, workspaceId, step, responsibilityId) => {
      await guard();
      await nativeExecutionAdapter.recheck(runActor, workspaceId, step, responsibilityId);
    },
    perform: async (runActor, workspaceId, responsibilityId, step, executionKey, budgetId) => {
      await guard();
      return nativeExecutionAdapter.perform(runActor, workspaceId, responsibilityId, step, executionKey, budgetId);
    },
  };
}

function standingCommands(actor: WorkspaceActor, standingId: string, policyVersion: number) {
  return responsibilityCommands(
    { read: readResponsibility, write: persistResponsibility, create: insertResponsibility },
    standingExecutionAdapter(actor, standingId, policyVersion),
  );
}

type SavedResponsibility = { id: string; workspaceId: string; payload: Responsibility };

async function inspectBudget(actor: WorkspaceActor, saved: SavedResponsibility) {
  if (!saved.payload.budgetId) return null;
  const budget = await readJobEconomics(actor, saved.payload.budgetId);
  if (budget.job.workspaceId !== saved.workspaceId || budget.job.workId !== saved.id) throw new WorkspaceConflictError("This budget belongs to different work.");
  return budget;
}

/** A closed responsibility closes its known-cost budget without another owner task. */
async function finalizeBudget(actor: WorkspaceActor, saved: SavedResponsibility) {
  if (!saved.payload.budgetId || !["completed", "cancelled"].includes(saved.payload.status)) return saved;
  const budget = await inspectBudget(actor, saved);
  if (!budget || ["settled", "cancelled"].includes(budget.job.status)) return saved;
  if (saved.payload.status === "cancelled") {
    // The ledger releases only work that never started. Running/unknown costs stay held.
    await executeJobEconomicsCommand(actor, { action: "cancel", jobId: budget.job.id });
  } else if (!(budget.executions ?? []).some(item => item.status !== "finished" || item.amountCents === null)
    && budget.usage.every(item => item.amountCents !== null)) {
    await executeJobEconomicsCommand(actor, { action: "settle", jobId: budget.job.id, actualCents: budget.job.usedCents });
  }
  return saved;
}

async function verifyReconciliation(actor: WorkspaceActor, saved: SavedResponsibility, step: Responsibility["steps"][number], resolution: "completed" | "not_applied"): Promise<string> {
  await assertWorkspaceMember(actor, saved.workspaceId);
  const target = await getWork(actor, step.workId);
  if (!target || target.workspaceId !== saved.workspaceId) throw new WorkspaceAccessError();
  if (step.operation === "document.edit") {
    const command = documentCommandSchema.parse(step.input);
    if (command.kind !== "edit") throw new WorkspaceConflictError("This document operation needs an operator to verify its outcome.");
    const { document } = await readWorkspaceDocument(actor, step.workId);
    if (resolution === "not_applied") {
      if (document.revision !== command.expectedRevision) throw new WorkspaceConflictError("The document changed. Its absence of effect cannot be verified.");
      return `document:${step.workId}:unchanged:${document.revision}`;
    }
    const receipt = document.history.find(item => item.revision === command.expectedRevision + 1);
    if (!receipt || receipt.kind !== "edit" || receipt.actorId !== saved.payload.ownerId
      || receipt.after.title !== command.title || receipt.after.text !== command.text
      || (step.startedAt && Date.parse(receipt.at) < Date.parse(step.startedAt))) {
      throw new WorkspaceConflictError("The document history does not verify this exact change. Its action remains unresolved.");
    }
    return `document:${step.workId}:revision:${receipt.revision}`;
  }
  if (step.operation === "investigation.run") {
    const work = await readWorkspaceInvestigation(actor, step.workId);
    const executionKey = `${saved.id}:${step.id}:${step.attempt}`;
    const result = step.result && typeof step.result === "object" ? step.result as { finding?: { requestId?: unknown; reused?: unknown } } : {};
    const receiptKey = typeof result.finding?.requestId === "string" ? result.finding.requestId : executionKey;
    const run = work.payload.runs.find(item => item.requestId === receiptKey);
    if (resolution === "not_applied") throw new WorkspaceConflictError("A missing investigation receipt does not prove the check never ran. An operator must verify it.");
    if (!run) throw new WorkspaceConflictError("The investigation has no receipt for this exact attempt.");
    // Live work needs current evidence before dependent actions may continue.
    // Cancelled work can only close its historical receipt and cost hold; it
    // cannot resume, so a later source edit must not strand that known outcome.
    if (saved.payload.status !== "cancelled") {
      for (const reference of run.sources) {
        // A public website receipt is the result of the guarded read itself.
        // It has no saved-work row to re-read here; the investigation runner
        // already performed its stability recheck before recording the receipt.
        if (reference.kind === "public_website") continue;
        const source = await getWork(actor, reference.workId);
        if (!source || source.workspaceId !== saved.workspaceId || source.updatedAt !== reference.updatedAt) throw new WorkspaceConflictError("A compared source changed. Review a fresh check before allowing dependent work.");
      }
    }
    // The owner still decides whether a discrepancy permits dependent work to continue.
    return `investigation:${step.workId}:request:${receiptKey}`;
  }
  throw new WorkspaceConflictError("Automatic verification is unavailable for this operation. Keep it unresolved until its native outcome can be checked.");
}

export const workspaceResponsibilityCommands = {
  create: nativeCommands.create,
  async command(actor: WorkspaceActor, workId: string, raw: unknown) {
    const saved = await readResponsibility(actor, workId);
    if (saved.payload.ownerId !== actor.userId) throw new WorkspaceAccessError();
    const command = responsibilityCommandSchema.parse(raw);
    // Validate revision, state, cooldown and accepted-write rules before changing either authority.
    changeResponsibility(saved.payload, command, actor.userId, new Date().toISOString());
    if (command.kind === "set_budget" || command.kind === "approve") {
      const budgetId = command.kind === "set_budget" ? command.budgetId : saved.payload.budgetId;
      if (budgetId) {
        const budget = await inspectBudget(actor, { ...saved, payload: { ...saved.payload, budgetId } });
        if (budget?.job.status !== "accepted" || budget.job.acceptedBy !== budget.job.payerId || !budget.job.acceptedAt) throw new WorkspaceConflictError("The named payer must accept this budget before work is approved.");
      }
    }
    if (command.kind === "reconcile") {
      const step = saved.payload.steps.find(item => item.id === command.stepId)!;
      const evidenceReference = await verifyReconciliation(actor, saved, step, command.resolution!);
      const budget = await inspectBudget(actor, saved);
      if (budget) {
        const executionKey = `${saved.id}:${step.id}:${step.attempt}`;
        const execution = budget.executions?.find(item => item.executionKey === executionKey);
        if (execution && (execution.status !== "finished" || execution.effect === "unknown" || execution.amountCents === null)) await reconcileBudgetedAction(actor, { jobId: budget.job.id, executionKey,
          maximumCents: step.maximumCents, kind: "tool", expectedTarget: { workspaceId: saved.workspaceId, workId: saved.id } },
        { async resolve() { return { amountCents: 0, effect: command.resolution === "completed" ? "accepted" : "none", evidenceReference }; } });
      }
    }
    const changed = await nativeCommands.command(actor, workId, command) as SavedResponsibility;
    // A linked finite work remains the source of truth for its native state,
    // but every generic command must refresh the standing projection before
    // returning. This keeps cancel/reconcile entries consistent with the
    // standing run entry and lets a failed checkpoint recover on the next
    // ordinary read or sweep.
    const standingRun = await readStandingRunForWork(actor, saved.workspaceId, workId);
    if (standingRun) await syncStandingRun(actor, standingRun, changed.payload, undefined, false);
    return finalizeBudget(actor, changed);
  },
  async run(actor: WorkspaceActor, workId: string) {
    const saved = await readResponsibility(actor, workId);
    const standingRun = await readStandingRunForWork(actor, saved.workspaceId, workId);
    if (standingRun) {
      const result = await runStandingResponsibility(actor, standingRun.id);
      return finalizeBudget(actor, result.finiteWork);
    }
    // A lost settlement response can be retried without ever replaying completed work.
    if (saved.payload.status === "completed" || saved.payload.status === "cancelled") {
      if (saved.payload.ownerId !== actor.userId) throw new WorkspaceAccessError();
      return finalizeBudget(actor, saved);
    }
    return finalizeBudget(actor, await nativeCommands.run(actor, workId) as SavedResponsibility);
  },
};

function standingNow(): string {
  return new Date().toISOString();
}

function assertStandingOwner(policy: StandingResponsibilityRecord, actor: WorkspaceActor): void {
  if (policy.policy.ownerId !== actor.userId) throw new WorkspaceAccessError();
}

/** A standing scope can only name saved investigations in its own workspace.
 * Membership in two workspaces must not let a policy in one workspace reach a
 * saved record from the other. */
async function assertStandingScopeWorkspace(
  actor: WorkspaceActor,
  workspaceId: string,
  policy: StandingResponsibility,
): Promise<void> {
  await Promise.all(policy.scope.steps.map(async (step) => {
    const target = await readWorkspaceInvestigation(actor, step.workId);
    if (target.workspaceId !== workspaceId) {
      throw new WorkspaceConflictError("An ongoing check must use a saved investigation from the same workspace.");
    }
  }));
}

/** Create a proposed policy. Approval is a separate command so the version
 * that admits future jobs is always explicit and visible. */
export async function createStandingResponsibility(
  actor: WorkspaceActor,
  workspaceId: string,
  input: unknown,
): Promise<StandingResponsibilityRecord> {
  const policy = buildStandingResponsibility(input, actor.userId, standingNow());
  await assertStandingScopeWorkspace(actor, workspaceId, policy);
  return persistStandingPolicy(actor, workspaceId, policy);
}

export async function commandStandingResponsibility(
  actor: WorkspaceActor,
  standingId: string,
  input: unknown,
): Promise<StandingResponsibilityRecord> {
  const saved = await readStandingResponsibility(actor, standingId);
  assertStandingOwner(saved, actor);
  const command = standingResponsibilityCommandSchema.parse(input);
  const changed = changeStandingResponsibility(saved.policy, command, actor.userId, standingNow());
  await assertStandingScopeWorkspace(actor, saved.workspaceId, changed);
  return persistStandingResponsibility(actor, saved.id, saved.workspaceId, saved.policy.revision, changed);
}

function standingInvestigationRequestId(standingId: string, triggerKey: string, stepId: string): string {
  const digest = createHash("sha256").update(`${standingId}:${triggerKey}:${stepId}`).digest("hex").slice(0, 16);
  return `standing:${standingId}:${stepId.slice(0, 20)}:${digest}`;
}

/** Resolve the only repeatable read-only operation at admission time. The
 * finite job then carries the exact revision and request identity that was
 * observed, so a later source edit causes a conflict instead of broadening
 * the policy or silently checking a different record. */
async function resolveStandingSteps(
  actor: WorkspaceActor,
  standingId: string,
  triggerKey: string,
  policy: StandingResponsibilityRecord,
): Promise<StepInput[]> {
  return Promise.all(policy.policy.scope.steps.map(async (step) => {
    if (step.operation !== "investigation.run") return step;
    if (Object.keys(step.input).length > 0) {
      throw new WorkspaceConflictError("An ongoing investigation scope must leave its current revision and request identity to admission.");
    }
    const target = await readWorkspaceInvestigation(actor, step.workId);
    if (target.workspaceId !== policy.workspaceId) {
      throw new WorkspaceConflictError("An ongoing check must use a saved investigation from the same workspace.");
    }
    return {
      ...step,
      input: {
        expectedRevision: target.payload.revision,
        requestId: standingInvestigationRequestId(standingId, triggerKey, step.id),
      },
    };
  }));
}

/** Admit one repeat trigger into one ordinary, finite Responsibility. The
 * trigger key and policy version are durable metadata; the finite payload is
 * the existing Responsibility shape and retains its exact receipts. */
export async function admitStandingResponsibility(
  actor: WorkspaceActor,
  standingId: string,
  input: unknown,
): Promise<StandingAdmission> {
  const saved = await readStandingResponsibility(actor, standingId);
  assertStandingOwner(saved, actor);
  const admission = standingAdmissionInputSchema.parse({ ...((input && typeof input === "object") ? input : {}), standingResponsibilityId: standingId });
  // A duplicate trigger is an idempotent read of an already accepted finite
  // job. It remains readable after pause/revoke, while a new trigger still
  // reaches the active/version checks in the SQL admission transaction.
  const existing = await readStandingRunForTrigger(actor, standingId, admission.triggerKey);
  if (existing) {
    if (admission.expectedVersion !== undefined && existing.job.policyVersion !== admission.expectedVersion) {
      throw new WorkspaceConflictError("This trigger refers to an older ongoing responsibility version.");
    }
    return { policy: saved, job: existing.job, run: existing.run, replayed: true };
  }
  if (saved.policy.status !== "active" || !saved.policy.approvedAt) {
    throw new WorkspaceConflictError("Approve this ongoing responsibility before admitting a job.");
  }
  if (admission.expectedVersion !== undefined && admission.expectedVersion !== saved.policy.version) {
    throw new WorkspaceConflictError("This trigger refers to an older ongoing responsibility version.");
  }
  const at = standingNow();
  const resolvedSteps = await resolveStandingSteps(actor, standingId, admission.triggerKey, saved);
  const finite = admittedResponsibility(saved.policy, at, resolvedSteps);
  const nextAt = nextStandingTrigger(saved.policy);
  return persistStandingAdmission(actor, { ...admission, nextAt }, saved, finite as unknown as Record<string, unknown>);
}

function runStatus(finite: Responsibility): StandingRunStatus {
  switch (finite.status) {
    case "completed": return "completed";
    case "waiting": return "waiting";
    case "needs_attention": return "needs_attention";
    case "cancelled": return "cancelled";
    case "running": return "running";
    case "ready": return "admitted";
    case "proposed": return "failed";
    default: return "failed";
  }
}

function runReceipts(finite: Responsibility) {
  return finite.steps
    .filter((step) => Boolean(step.effect) && step.status !== "pending")
    .map((step) => ({
      stepId: step.id,
      attempt: step.attempt,
      status: step.status,
      effect: step.effect ?? "none",
      ...(step.result !== undefined ? { result: step.result } : {}),
      ...(step.reason ? { reason: step.reason } : {}),
      ...(step.finishedAt ? { finishedAt: step.finishedAt } : {}),
    }));
}

async function syncStandingRun(
  actor: WorkspaceActor,
  run: StandingRun,
  finite: Responsibility,
  error?: unknown,
  advanceAttempt = true,
): Promise<StandingRun> {
  const status = error && finite.status === "waiting" ? "waiting" : error ? "failed" : runStatus(finite);
  const wakeAt = finite.steps.find((step) => step.status === "waiting")?.wakeAt;
  const hasFiniteAttempt = finite.steps.some((step) => step.attempt > 0);
  // A terminal finite row can outlive a lost projection response. Preserve
  // the evidence that at least one native attempt happened without inventing
  // another wrapper invocation during recovery.
  const attempt = error && status === "waiting"
    ? run.attempt
    : !advanceAttempt
      ? Math.max(run.attempt, hasFiniteAttempt ? 1 : 0)
      : run.attempt + 1;
  return recordStandingRun(actor, {
    runId: run.id,
    status,
    attempt,
    ...(wakeAt ? { wakeAt } : {}),
    ...(error instanceof Error ? { lastError: error.message } : {}),
    ...(status === "cancelled" ? { cancelledAt: standingNow() } : {}),
    receipts: runReceipts(finite),
  });
}

export interface StandingRunExecution {
  run: StandingRun;
  finiteWork: Awaited<ReturnType<typeof readResponsibility>>;
}

export async function runStandingResponsibility(actor: WorkspaceActor, runId: string): Promise<StandingRunExecution> {
  const { run, policy } = await readStandingRun(actor, runId);
  assertStandingOwner(policy, actor);
  const current = await readResponsibility(actor, run.finiteWorkId);
  if (["completed", "cancelled"].includes(current.payload.status)) {
    const updated = await syncStandingRun(actor, run, current.payload, undefined, false);
    return { run: updated, finiteWork: current };
  }
  let finite = current;
  let failure: unknown;
  try {
    finite = await standingCommands(actor, policy.id, run.policyVersion).run(actor, run.finiteWorkId) as Awaited<ReturnType<typeof readResponsibility>>;
  } catch (error) {
    failure = error;
    try { finite = await readResponsibility(actor, run.finiteWorkId); } catch { /* preserve the original error */ }
  }
  const updated = await syncStandingRun(actor, run, finite.payload, failure);
  if (failure) throw failure;
  return { run: updated, finiteWork: finite };
}

export async function cancelStandingRun(actor: WorkspaceActor, runId: string): Promise<StandingRunExecution> {
  const { run, policy } = await readStandingRun(actor, runId);
  assertStandingOwner(policy, actor);
  let finite = await readResponsibility(actor, run.finiteWorkId);
  if (!["completed", "cancelled"].includes(finite.payload.status)) {
    finite = await workspaceResponsibilityCommands.command(actor, run.finiteWorkId, {
      kind: "cancel", expectedRevision: finite.payload.revision,
    }) as Awaited<ReturnType<typeof readResponsibility>>;
  }
  const updated = await syncStandingRun(actor, run, finite.payload);
  return { run: updated, finiteWork: finite };
}

export async function reconcileStandingRun(actor: WorkspaceActor, runId: string, input: unknown): Promise<StandingRunExecution> {
  const { run, policy } = await readStandingRun(actor, runId);
  assertStandingOwner(policy, actor);
  const command = responsibilityCommandSchema.parse(input);
  if (command.kind !== "reconcile") throw new WorkspaceConflictError("A run reconciliation needs a reconcile command.");
  const finite = await workspaceResponsibilityCommands.command(actor, run.finiteWorkId, {
    ...command,
  }) as Awaited<ReturnType<typeof readResponsibility>>;
  const updated = await syncStandingRun(actor, run, finite.payload);
  return { run: updated, finiteWork: finite };
}

/** Existing background-work sweep entry. It admits the current interval
 * cursor once, then uses the same finite runner as a user-triggered run. */
export async function admitAndRunDueStandingResponsibility(actor: WorkspaceActor, standingId: string): Promise<StandingRunExecution> {
  const policy = await readStandingResponsibility(actor, standingId);
  if (policy.policy.trigger.kind !== "interval") throw new WorkspaceConflictError("Only interval ongoing work can be dispatched by the due sweep.");
  const triggerKey = `interval:${policy.policy.trigger.nextAt}`;
  const admission = await admitStandingResponsibility(actor, standingId, {
    triggerKey,
    expectedVersion: policy.policy.version,
  });
  return runStandingResponsibility(actor, admission.run.id);
}

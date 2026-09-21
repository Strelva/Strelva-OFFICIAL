import { createHash } from "node:crypto";
import { getWork, assertWorkspaceMember, agencyAssignedWorkAccess } from "@/platform/workspaces/repository";
import { isSuperAdminUser } from "@/lib/db/repositories";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { editWorkspaceDocument, readWorkspaceDocument } from "@/products/documents/server";
import { documentCommandSchema, changeDocument } from "@/products/documents/contracts";
import { editSavedTracker, readSavedTracker } from "@/products/tracker/server";
import { trackerCommandSchema } from "@/products/tracker/contracts";
import { applyTrackerCommand } from "@/products/tracker/client";
import { changeWorkspaceApplication, readWorkspaceApplication, rehearseApplicationCandidateForAssignment } from "@/products/applications/server";
import { applicationCommandSchema } from "@/products/applications/contracts";
import { changeWorkspaceSchedule, readWorkspaceSchedule } from "@/products/scheduling/server";
import { scheduleCommandSchema } from "@/products/scheduling/contracts";
import { runWorkspaceInvestigation, readWorkspaceInvestigation } from "@/products/investigations/server";
import { agencyWebsiteDraftAdapter } from "@/products/operations/website-draft-adapter";
import {
  CapabilityUnavailableError,
  createCapabilityInvoker,
  type CapabilityAdapterMap,
  type CapabilityInvocationContext,
  type QualifiedExecutableCapability,
} from "@/platform/capabilities";
import {
  executableCapabilityRegistry,
  requireExactExecutableCapability,
} from "@/server/capabilities";
import { executeBudgetedAction, reconcileBudgetedAction, BudgetExecutionNotStartedError } from "@/platform/work-economics/runtime";
import type { WorkAllowanceUnitKind } from "@/platform/work-economics/allowances-types";
import { responsibilityCommands, type ExecutionAdapter } from "@/platform/work-execution/runtime";
import { insertResponsibility, persistResponsibility, readResponsibility } from "@/platform/work-execution/repository";
import { changeResponsibility, responsibilityCommandSchema, type Responsibility, type StepInput, type StepOutcome } from "@/platform/work-execution/engine";
import { executeJobEconomicsCommand, readJobEconomics } from "@/platform/work-economics/service";
import {
  admittedResponsibility,
  changeStandingResponsibility,
  createStandingResponsibility as buildStandingResponsibility,
  nextStandingTrigger,
  standingAdmissionInputSchema,
  standingResponsibilityCommandSchema,
  type StandingResponsibility,
} from "@/platform/work-execution/standing";
import {
  admitStandingResponsibility as persistStandingAdmission,
  createStandingResponsibility as persistStandingPolicy,
  readStandingResponsibility,
  readStandingRun,
  readStandingRunForWork,
  recordStandingRun,
  persistStandingResponsibility,
  assertStandingExecutionAllowed,
  readStandingRunForTrigger,
  type StandingAdmission,
  type StandingResponsibilityRecord,
  type StandingRun,
  type StandingRunStatus,
} from "@/platform/work-execution/standing-repository";
import {
  createOperationalAssignmentService,
  postgresOperationalAssignments,
  type AssignedResponsibility,
} from "@/platform/work-participation";

type InvestigationRun = Awaited<ReturnType<typeof readWorkspaceInvestigation>>["payload"]["runs"][number];
function findingReceipt(run: InvestigationRun, reused = false) {
  return {
    requestId: run.requestId,
    at: run.at,
    result: run.result,
    differenceCount: run.differences.length,
    sourceCount: run.sources.length,
    ...(run.unavailableReason ? { unavailableReason: run.unavailableReason } : {}),
    ...(run.retryable !== undefined ? { retryable: run.retryable } : {}),
    ...(run.sourceStates ? { sourceStates: run.sourceStates } : {}),
    reused,
  };
}
async function reusableFinding(actor: WorkspaceActor, workspaceId: string, work: Awaited<ReturnType<typeof readWorkspaceInvestigation>>) {
  const latest = work.payload.runs.at(-1);
  if (!latest || latest.result === "unavailable") return null;
  // A public page must be read again before dependent work trusts it. Saved
  // work can use its durable revision receipt as before.
  if (work.payload.sources.some(source => "kind" in source)) return null;
  const sources = await Promise.all(work.payload.sources.map(source => "workId" in source ? getWork(actor, source.workId) : null));
  return sources.every(source => source && source.workspaceId === workspaceId
    && latest.sources.some(captured => captured.workId === source.id && captured.updatedAt === source.updatedAt)) ? latest : null;
}

const LEGACY_CAPABILITY_VERSION = 1;

function selectedRunnerCapability(step: StepInput): QualifiedExecutableCapability {
  const version = step.capabilityVersion ?? LEGACY_CAPABILITY_VERSION;
  try {
    return requireExactExecutableCapability(step.operation, version, "runner");
  } catch (error) {
    if (error instanceof CapabilityUnavailableError) {
      throw new WorkspaceConflictError(`The selected operation ${step.operation}@${version} is unavailable. Review a new responsibility.`);
    }
    throw error;
  }
}

function nativeInvocationContext(
  actor: WorkspaceActor,
  workspaceId: string,
  step: StepInput,
  capability: QualifiedExecutableCapability,
  extras: Pick<CapabilityInvocationContext, "responsibilityId" | "executionKey" | "budgetId" | "delegated"> = {},
): CapabilityInvocationContext {
  return {
    actor,
    workspaceId,
    workId: step.workId,
    expectedUpdatedAt: step.expectedUpdatedAt,
    capabilityId: capability.definition.id,
    capabilityVersion: capability.definition.version,
    ...extras,
  };
}

function rawRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

async function assertNativeTarget(context: CapabilityInvocationContext, checkFreshness = false) {
  if (!context.workId || !context.capabilityId || context.capabilityVersion === undefined) throw new WorkspaceAccessError();
  if (context.responsibilityId) await assertStandingExecutionAllowed(context.actor, context.workspaceId, context.responsibilityId);
  if (!context.delegated) await assertWorkspaceMember(context.actor, context.workspaceId);
  const target = await getWork(context.actor, context.workId);
  const capability = requireExactExecutableCapability(context.capabilityId, context.capabilityVersion, "runner");
  if (!target || target.workspaceId !== context.workspaceId
    || target.productId !== capability.definition.productId
    || target.resourceKind !== capability.definition.resourceKind) throw new WorkspaceAccessError();
  if (checkFreshness && context.expectedUpdatedAt && context.expectedUpdatedAt !== target.updatedAt) {
    throw new WorkspaceConflictError("The source changed since this work was approved. Review a new proposal.");
  }
  return target;
}

const nativeCapabilityAdapters: CapabilityAdapterMap = new Map([
  ["documents.edit", {
    key: "documents.edit",
    async inspect(context) {
      await assertNativeTarget(context);
    },
    async recheck(context, input) {
      await assertNativeTarget(context, true);
      const document = await readWorkspaceDocument(context.actor, context.workId!);
      changeDocument(document.document, documentCommandSchema.parse(input), context.actor.userId);
    },
    async perform(context, input) {
      const saved = await editWorkspaceDocument(context.actor, context.workId!, input);
      return saved.document;
    },
  }],
  ["tracker.command", {
    key: "tracker.command",
    async prepare(context, input) {
      await assertNativeTarget(context);
      const saved = await readSavedTracker(context.actor, context.workId!);
      if (saved.workspaceId !== context.workspaceId) throw new WorkspaceAccessError();
      return {
        ...rawRecord(input),
        trackerId: saved.tracker.id,
        actorId: context.actor.userId,
        at: new Date().toISOString(),
      };
    },
    async inspect(context) {
      await assertNativeTarget(context);
    },
    async recheck(context, input) {
      await assertNativeTarget(context, true);
      const saved = await readSavedTracker(context.actor, context.workId!);
      if (saved.workspaceId !== context.workspaceId) throw new WorkspaceAccessError();
      applyTrackerCommand(saved.tracker, trackerCommandSchema.parse(input));
    },
    async perform(context, input) {
      return editSavedTracker(context.actor, context.workId!, input);
    },
  }],
  ["applications.command", {
    key: "applications.command",
    async inspect(context) {
      await assertNativeTarget(context);
    },
    async recheck(context, input) {
      await assertNativeTarget(context, true);
      const target = await readWorkspaceApplication(context.actor, context.workId!);
      const command = applicationCommandSchema.parse(input);
      const candidateRevision = target.payload.candidate?.designRevision ?? target.payload.designRevision ?? target.payload.revision;
      const releaseVersion = target.payload.release?.version ?? null;
      const recordsRevision = target.payload.recordsRevision ?? target.payload.records.length;
      if (command.kind === "publish") {
        if (command.expectedCandidateRevision !== candidateRevision || command.expectedReleaseVersion !== releaseVersion) throw new WorkspaceConflictError();
      } else if (command.kind === "rollback_release") {
        if (command.expectedDesignRevision !== candidateRevision || command.expectedReleaseVersion !== releaseVersion) throw new WorkspaceConflictError();
      } else if (command.kind === "submit" && command.expectedReleaseVersion !== undefined && command.expectedRecordsRevision !== undefined) {
        if (command.expectedReleaseVersion !== releaseVersion || command.expectedRecordsRevision !== recordsRevision) throw new WorkspaceConflictError();
      } else {
        const expectedRevision = command.kind === "revise" || command.kind === "rehearse" || command.kind === "install" || command.kind === "retire"
          ? command.expectedRevision ?? command.expectedDesignRevision
          : command.expectedRevision;
        if (expectedRevision !== target.payload.revision && expectedRevision !== candidateRevision) throw new WorkspaceConflictError();
      }
    },
    async perform(context, input) {
      const command = applicationCommandSchema.parse(input);
      if (context.delegated && command.kind === "rehearse") {
        const expectedDesignRevision = command.expectedDesignRevision ?? command.expectedRevision;
        if (expectedDesignRevision === undefined) throw new WorkspaceConflictError("A candidate revision is required.");
        return (await rehearseApplicationCandidateForAssignment(
          context.actor,
          context.workId!,
          expectedDesignRevision,
        )).payload;
      }
      const saved = await changeWorkspaceApplication(context.actor, context.workId!, input);
      return saved.payload;
    },
  }],
  ["websites.draft", agencyWebsiteDraftAdapter],
  ["scheduling.command", {
    key: "scheduling.command",
    async inspect(context) {
      await assertNativeTarget(context);
    },
    async recheck(context, input) {
      await assertNativeTarget(context, true);
      const target = await readWorkspaceSchedule(context.actor, context.workId!);
      if (scheduleCommandSchema.parse(input).expectedRevision !== target.payload.revision) throw new WorkspaceConflictError();
    },
    async perform(context, input) {
      const saved = await changeWorkspaceSchedule(context.actor, context.workId!, input);
      return saved.payload;
    },
  }],
  ["investigations.run", {
    key: "investigations.run",
    async prepare(context, input) {
      await assertNativeTarget(context);
      const target = await readWorkspaceInvestigation(context.actor, context.workId!);
      if (target.workspaceId !== context.workspaceId) throw new WorkspaceAccessError();
      const value = rawRecord(input);
      return {
        ...value,
        expectedRevision: typeof value.expectedRevision === "number" ? value.expectedRevision : target.payload.revision,
        requestId: typeof value.requestId === "string" ? value.requestId : context.executionKey ?? `native:${context.workId}`,
      };
    },
    async inspect(context) {
      await assertNativeTarget(context);
    },
    async recheck(context, input) {
      await assertNativeTarget(context, true);
      const target = await readWorkspaceInvestigation(context.actor, context.workId!);
      const expectedRevision = rawRecord(input).expectedRevision;
      if (expectedRevision !== undefined && expectedRevision !== target.payload.revision) {
        throw new WorkspaceConflictError("The investigation changed since this work was accepted. Review a fresh check.");
      }
    },
    async perform(context, input) {
      const saved = await runWorkspaceInvestigation(context.actor, context.workId!, {
        expectedRevision: rawRecord(input).expectedRevision,
        requestId: rawRecord(input).requestId,
      });
      return saved.payload;
    },
  }],
  ["product-learning.collect", {
    key: "product-learning.collect",
    async prepare(context, input) {
      await assertNativeTarget(context);
      const { readWorkspaceLearning } = await import("@/products/product-learning/server");
      const target = await readWorkspaceLearning(context.actor, context.workId!);
      if (target.workspaceId !== context.workspaceId) throw new WorkspaceAccessError();
      const value = rawRecord(input);
      return {
        ...value,
        expectedRevision: typeof value.expectedRevision === "number" ? value.expectedRevision : target.learning.revision,
      };
    },
    async inspect(context) {
      await assertNativeTarget(context);
      const { readWorkspaceLearning } = await import("@/products/product-learning/server");
      await readWorkspaceLearning(context.actor, context.workId!);
    },
    async recheck(context, input) {
      await assertNativeTarget(context, true);
      const { readWorkspaceLearning } = await import("@/products/product-learning/server");
      const target = await readWorkspaceLearning(context.actor, context.workId!);
      const expectedRevision = rawRecord(input).expectedRevision;
      if (expectedRevision !== undefined && expectedRevision !== target.learning.revision) throw new WorkspaceConflictError();
    },
    async perform(context, input) {
      const { collectWorkspaceLearning } = await import("@/products/product-learning/server");
      const expectedRevision = rawRecord(input).expectedRevision;
      if (typeof expectedRevision !== "number") throw new WorkspaceConflictError();
      return collectWorkspaceLearning(context.actor, context.workId!, expectedRevision);
    },
  }],
]);

const nativeCapabilityInvoker = createCapabilityInvoker(executableCapabilityRegistry, nativeCapabilityAdapters);

type NativeExecutionGuard = (
  actor: WorkspaceActor,
  workspaceId: string,
  responsibilityId: string,
  step: StepInput,
) => Promise<void>;

function allowanceUnit(operation: StepInput["operation"]): WorkAllowanceUnitKind | undefined {
  switch (operation) {
    case "document.edit": return "completed_document_change";
    case "tracker.command": return "completed_tracker_change";
    case "application.command": return "completed_application_change";
    case "investigation.run": return "completed_investigation";
    default: return undefined;
  }
}

export function createNativeExecutionAdapter(guard?: NativeExecutionGuard): ExecutionAdapter {
  const adapter: ExecutionAdapter = {
    async inspect(actor, workspaceId, step) {
      const capability = selectedRunnerCapability(step);
      await nativeCapabilityInvoker.inspect(capability.definition.id, capability.definition.version, nativeInvocationContext(actor, workspaceId, step, capability), step.input);
    },
    async recheck(actor, workspaceId, step, responsibilityId) {
      const delegated = Boolean(guard && responsibilityId);
      if (guard && responsibilityId) await guard(actor, workspaceId, responsibilityId, step);
      if (responsibilityId) await assertStandingExecutionAllowed(actor, workspaceId, responsibilityId);
      const capability = selectedRunnerCapability(step);
      await nativeCapabilityInvoker.recheck(
        capability.definition.id,
        capability.definition.version,
        nativeInvocationContext(actor, workspaceId, step, capability, { responsibilityId, delegated }),
        step.input,
      );
    },
    async perform(actor, workspaceId, responsibilityId, step, executionKey, budgetId) {
      const perform = async (): Promise<StepOutcome> => {
      try {
        // Standing policy and exact capability selection are pre-effect
        // guards. A revoked or unavailable action is a known no-effect
        // outcome; failures after the native call remain unknown.
        await assertStandingExecutionAllowed(actor, workspaceId, responsibilityId);
        const capability = selectedRunnerCapability(step);
        const responsibility = await readResponsibility(actor, responsibilityId);
        const active = responsibility.payload.steps.find(current => current.id === step.id);
        if (responsibility.payload.status !== "running" || active?.status !== "running" || `${responsibilityId}:${active.id}:${active.attempt}` !== executionKey) throw new WorkspaceConflictError("This work was paused or cancelled before the native action.");
        // A direct adapter call is still an execution boundary. Recheck the
        // exact qualified command before any waiting or reconciliation branch.
        const delegated = Boolean(guard);
        await nativeCapabilityInvoker.recheck(
          capability.definition.id,
          capability.definition.version,
          nativeInvocationContext(actor, workspaceId, step, capability, { responsibilityId, executionKey, budgetId, delegated }),
          step.input,
        );
        if (capability.definition.adapterKey === "investigations.run") {
          const target = await readWorkspaceInvestigation(actor, step.workId);
          if (target.payload.status !== "active") throw new WorkspaceConflictError("This investigation is paused.");
          if (Date.parse(target.payload.nextRunAt) > Date.now()) {
            const latest = await reusableFinding(actor, workspaceId, target);
            if (latest) return { effect: "none", status: latest.differences.length ? "needs_decision" : "completed", result: { workId: target.id, operation: step.operation, finding: findingReceipt(latest, true) },
              ...(latest.differences.length ? { reason: "A recent source check found differences. Review them before allowing the dependent change." } : {}) };
            return { effect: "none", status: "waiting", wakeAt: target.payload.nextRunAt, reason: "Waiting for the next source check." };
          }
        }
        await assertStandingExecutionAllowed(actor, workspaceId, responsibilityId);
        if (guard) await guard(actor, workspaceId, responsibilityId, step);
        const nativeResult = await nativeCapabilityInvoker.perform(
          capability.definition.id,
          capability.definition.version,
          nativeInvocationContext(actor, workspaceId, step, capability, { responsibilityId, executionKey, budgetId, delegated }),
          step.input,
        );
        let result: unknown = nativeResult;
        if (capability.definition.adapterKey === "investigations.run") {
          const investigation = nativeResult as Awaited<ReturnType<typeof readWorkspaceInvestigation>>["payload"];
          const latest = investigation.runs.at(-1);
          if (latest?.result === "unavailable") return {
            effect: "none",
            status: "waiting",
            wakeAt: investigation.nextRunAt,
            result: { workId: step.workId, operation: step.operation, finding: findingReceipt(latest) },
            reason: "The saved source was unavailable. The check will retry after its backoff.",
          };
          if (latest?.differences.length) return { effect: "accepted", status: "needs_decision", result: { workId: step.workId, finding: findingReceipt(latest) }, reason: "The sources disagree. Review the differences before allowing the dependent change." };
          result = latest ? { workId: step.workId, revision: investigation.revision, finding: findingReceipt(latest) } : { workId: step.workId, revision: investigation.revision };
        }
        // Native result stays at its stable link; don't duplicate full private records in receipts.
        const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
        return {
          effect: "accepted",
          status: "completed",
          result: {
            workId: step.workId,
            operation: step.operation,
            ...(record.finding ? { finding: record.finding } : {}),
            ...(capability.definition.adapterKey === "websites.draft" ? {
              websiteDraft: {
                assignmentId: record.assignmentId,
                preparationId: record.preparationId,
                revisionId: record.revisionId,
                bindingId: record.bindingId,
                section: record.section,
                revision: record.revision,
                dataHash: record.dataHash,
              },
            } : {}),
          },
        };
      } catch (error) {
        // Native validation/access/conflict errors occur before an accepted database write.
        if (error instanceof WorkspaceAccessError || error instanceof WorkspaceConflictError) return { effect: "none", status: "failed", reason: error.message };
        throw error;
      }
      };
      if (!budgetId) {
        if (step.maximumCents !== 0) return { effect: "none", status: "failed", reason: "A budget is required before this work can start." };
        // This fixed registry invokes local database commands only. No provider/model spending.
        return perform();
      }
      try {
        const result = await executeBudgetedAction(actor, { jobId: budgetId, executionKey, maximumCents: step.maximumCents, kind: "tool", expectedTarget: { workspaceId, workId: responsibilityId } }, {
          usageUnit: allowanceUnit(step.operation),
          recheck: () => adapter.recheck(actor, workspaceId, step, responsibilityId),
          perform: async () => { const value = await perform(); return { value, effect: value.effect, amountCents: 0 }; },
        });
        if (result.disposition === "performed") return result.value;
        return result.execution.effect === "none"
          ? { effect: "none", status: "failed", reason: "The reserved action did not run. Review it before another attempt." }
          : { effect: result.execution.effect ?? "unknown", status: "verification_failed", reason: "This budgeted action already ran. Inspect its native result before resolving this receipt." };
      } catch (error) {
        if (error instanceof BudgetExecutionNotStartedError) return { effect: "none", status: "failed", reason: error.message };
        throw error;
      }
    },
  };
  return adapter;
}
export const nativeExecutionAdapter: ExecutionAdapter = createNativeExecutionAdapter();
const nativeCommands = responsibilityCommands({ read: readResponsibility, write: persistResponsibility, create: insertResponsibility }, nativeExecutionAdapter);

const operationalAssignments = createOperationalAssignmentService(postgresOperationalAssignments);

export function assertOperationalAssignmentScope(payload: Responsibility, requireRunnable = false): void {
  if (!payload.approvedAt || payload.approvedBy !== payload.ownerId) {
    throw new WorkspaceConflictError("The owner must approve this exact work before assigning it.");
  }
  if (payload.budgetId || payload.steps.some((step) => step.maximumCents !== 0)) {
    throw new WorkspaceConflictError("Paid work cannot be delegated through an operational assignment.");
  }
  if (requireRunnable && !["ready", "waiting"].includes(payload.status)) {
    throw new WorkspaceConflictError("Only ready or waiting work can be assigned to an operator.");
  }
  for (const step of payload.steps) {
    const capability = selectedRunnerCapability(step);
    const definition = capability.definition;
    const input = rawRecord(step.input);
    if (definition.cost.mode !== "none" || definition.cost.source !== "native_local"
      || definition.cost.maximumCents !== 0 || definition.execution.effect === "external_side_effect"
      || definition.support === "internal_only" || definition.support === "managed_only"
      || !["document.edit", "tracker.command", "investigation.run", "schedule.command", "application.command", "website.draft"].includes(definition.id)
      || (definition.id === "application.command" && !["revise", "rehearse", "install"].includes(String(input.kind)))
      || (definition.id === "website.draft" && (input.kind !== "draft" || typeof input.bindingId !== "string" || input.bindingId !== step.workId || typeof input.section !== "string"))
      || (definition.id === "tracker.command" && input.kind === "coordinate_records")) {
      throw new WorkspaceConflictError(`The operation ${definition.id}@${definition.version} cannot be delegated.`);
    }
  }
}

async function assignedSnapshot(
  actor: WorkspaceActor,
  assignmentId: string,
  access: "normal" | "checkpoint" | "inspect" = "normal",
  requireProviderDelivery = true,
) {
  const saved = await operationalAssignments.read(actor, assignmentId, access);
  if (requireProviderDelivery && saved.assignment.assigneeKind === "agency"
    && !(await agencyAssignedWorkAccess(actor, saved.responsibility.workspaceId, saved.responsibility.id))) {
    throw new WorkspaceAccessError();
  }
  if (saved.assignment.assigneeKind === "strelva" && saved.assignment.assigneeUserId === actor.userId
    && !(await isSuperAdminUser(actor.userId))) {
    throw new WorkspaceAccessError();
  }
  assertOperationalAssignmentScope(saved.responsibility.payload);
  return saved;
}

function assignedCommands(assignmentId: string) {
  const guard: NativeExecutionGuard = async (actor, workspaceId, responsibilityId, step) => {
    const current = await assignedSnapshot(actor, assignmentId);
    if (current.responsibility.id !== responsibilityId || current.responsibility.workspaceId !== workspaceId
      || !current.responsibility.payload.steps.some((candidate) => candidate.id === step.id
        && candidate.operation === step.operation && candidate.workId === step.workId)) {
      throw new WorkspaceAccessError();
    }
  };
  const store = {
    async read(actor: WorkspaceActor, _reference: string, access: "normal" | "checkpoint" = "normal") {
      return (await operationalAssignments.read(actor, assignmentId, access)).responsibility;
    },
    async write(
      actor: WorkspaceActor,
      _reference: string,
      workspaceId: string,
      expectedRevision: number,
      payload: Responsibility,
      phase: "command" | "start" | "outcome" = "command",
    ) {
      if (phase === "command") throw new WorkspaceAccessError("Operational assignments cannot change approval, budget, or recovery decisions.");
      const current = await operationalAssignments.read(actor, assignmentId, phase === "outcome" ? "checkpoint" : "normal");
      if (current.responsibility.workspaceId !== workspaceId) throw new WorkspaceAccessError();
      return postgresOperationalAssignments.checkpoint(actor, assignmentId, expectedRevision, payload, phase);
    },
    async create() { throw new WorkspaceAccessError("Operational assignments cannot create work."); },
  };
  return responsibilityCommands(store, createNativeExecutionAdapter(guard), () => new Date().toISOString(), async (actor, saved) => {
    const current = await assignedSnapshot(actor, assignmentId);
    if (current.responsibility.id !== saved.id || current.responsibility.payload.ownerId === actor.userId) {
      throw new WorkspaceAccessError();
    }
  });
}

export async function offerOperationalAssignment(actor: WorkspaceActor, workId: string, input: unknown) {
  const saved = await readResponsibility(actor, workId);
  if (saved.payload.ownerId !== actor.userId) throw new WorkspaceAccessError();
  assertOperationalAssignmentScope(saved.payload, true);
  return operationalAssignments.offer(actor, workId, input);
}

export async function acceptOperationalAssignment(actor: WorkspaceActor, assignmentId: string) {
  // The provider delivery acceptance path accepts the assignment first, then
  // accepts the delivery. Requiring an already accepted delivery here would
  // create a circular prerequisite.
  await assignedSnapshot(actor, assignmentId, "inspect", false);
  return operationalAssignments.accept(actor, assignmentId);
}

export async function revokeOperationalAssignment(actor: WorkspaceActor, assignmentId: string) {
  return operationalAssignments.revoke(actor, assignmentId);
}

export async function inspectOperationalAssignmentForWork(actor: WorkspaceActor, workId: string) {
  const saved = await readResponsibility(actor, workId);
  if (saved.payload.ownerId !== actor.userId) throw new WorkspaceAccessError();
  return operationalAssignments.readForWork(actor, workId);
}

export async function inspectOperationalAssignment(actor: WorkspaceActor, assignmentId: string): Promise<AssignedResponsibility> {
  const saved = await operationalAssignments.read(actor, assignmentId, "inspect");
  assertOperationalAssignmentScope(saved.responsibility.payload);
  return saved;
}

export async function runOperationalAssignment(actor: WorkspaceActor, assignmentId: string) {
  const responsibility = await assignedCommands(assignmentId).run(actor, assignmentId);
  return { assignmentId, responsibility };
}

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

export { listDueWork, sweepDueWork } from "./sweep";
export { listAuthorizedOperationalInbox, listOperationalExceptions } from "./inbox";

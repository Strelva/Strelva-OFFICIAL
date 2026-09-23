import { getWork, assertWorkspaceMember } from "@/platform/workspaces/repository";
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
import { CapabilityUnavailableError, createCapabilityInvoker, type CapabilityAdapterMap, type CapabilityInvocationContext, type QualifiedExecutableCapability } from "@/platform/capabilities";
import { executableCapabilityRegistry, requireExactExecutableCapability } from "@/server/capabilities";
import { executeBudgetedAction, BudgetExecutionNotStartedError } from "@/platform/work-economics/runtime";
import type { WorkAllowanceUnitKind } from "@/platform/work-economics/allowances-types";
import { type ExecutionAdapter } from "@/platform/work-execution/runtime";
import { readResponsibility } from "@/platform/work-execution/repository";
import { type StepInput, type StepOutcome } from "@/platform/work-execution/engine";
import { assertStandingExecutionAllowed } from "@/platform/work-execution/standing-repository";


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

export function selectedRunnerCapability(step: StepInput): QualifiedExecutableCapability {
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

export function rawRecord(input: unknown): Record<string, unknown> {
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

export type NativeExecutionGuard = (
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

import { createHash } from "node:crypto";
import { type QualifiedExecutableCapability } from "@/platform/capabilities";
import { assertWorkspaceMember, persistWorkPlanOutput, readWorkPlanOutput, WorkspaceAccessError, type PersistWorkPlanOutputInput, type PersistedWorkPlanOutput, type WorkspaceActor } from "@/platform/workspaces";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import { executeWorkPlanOutputRequestSchema, workPlanOutputExecutionReceiptSchema, workPlanOutputExecutionSchema, type ExecuteWorkPlanOutputRequest, type WorkPlan, type WorkPlanOutputExecution } from "./contracts";
import { prepareWorkPlanContext } from "./context";
import { WorkPlanInvalidOutputError, WorkPlanExecutionConflictError, WorkPlanExecutionUnsupportedError } from "./errors";
import { assertRequiredDecisions } from "./domain";
import { selectedOperation, buildNativeOutput } from "./native-output";
import { readWorkPlan } from "./repository";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function inputDigest(value: { operationId: string; inputs: unknown; decisions: unknown }): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

async function assertContextFresh(input: {
  actor: WorkspaceActor;
  workspaceId: string;
  plan: WorkPlan;
}): Promise<void> {
  if (!input.plan.context?.sources.length) return;
  let current;
  try {
    current = await prepareWorkPlanContext({
      actor: input.actor,
      workspaceId: input.workspaceId,
      sourceWorkIds: input.plan.context.sources.map((source) => source.workId),
    });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) throw error;
    throw new WorkPlanExecutionConflictError("A source used by this plan is no longer available. Prepare a new plan.");
  }
  const byId = new Map(current.sources.map((source) => [source.workId, source]));
  for (const source of input.plan.context.sources) {
    const latest = byId.get(source.workId);
    if (!latest || latest.updatedAt !== source.updatedAt || latest.revision !== source.revision ||
        latest.version !== source.version || latest.productId !== source.productId ||
        latest.resourceKind !== source.resourceKind) {
      throw new WorkPlanExecutionConflictError("A source used by this plan changed. Prepare a new plan before saving its output.");
    }
  }
}

export async function executeWorkPlanOutput(input: {
  actor: WorkspaceActor;
  workspaceId: string;
  planWorkId: string;
  outputId: string;
  expectedPlanRevision: number;
  operationId?: string;
  inputs?: Record<string, unknown>;
  decisions?: Record<string, string>;
  read?: (input: Pick<
    PersistWorkPlanOutputInput,
    "actor" | "workspaceId" | "planWorkId" | "planRevision" | "outputId" | "operationId" | "idempotencyKey" | "inputDigest"
  >) => Promise<PersistedWorkPlanOutput | null>;
  persist?: (input: PersistWorkPlanOutputInput) => Promise<PersistedWorkPlanOutput>;
}): Promise<WorkPlanOutputExecution> {
  const request: ExecuteWorkPlanOutputRequest = executeWorkPlanOutputRequestSchema.parse({
    workspaceId: input.workspaceId,
    planWorkId: input.planWorkId,
    outputId: input.outputId,
    expectedPlanRevision: input.expectedPlanRevision,
    ...(input.operationId ? { operationId: input.operationId } : {}),
    inputs: input.inputs,
    decisions: input.decisions,
  });
  await assertWorkspaceMember(input.actor, request.workspaceId);
  const record = await readWorkPlan({ actor: input.actor, workspaceId: request.workspaceId, workId: request.planWorkId });
  if (record.plan.metadata.revision !== request.expectedPlanRevision ||
      record.plan.metadata.workspaceId !== request.workspaceId) {
    throw new WorkPlanExecutionConflictError();
  }
  if (record.plan.status !== "ready") throw new WorkPlanInvalidOutputError("Resolve the plan's required decisions before accepting an output.");
  if (record.plan.neededInputs.some((needed) => needed.required)) {
    throw new WorkPlanInvalidOutputError("Provide the plan's required inputs by revising it before accepting an output.");
  }
  const output = record.plan.proposedOutputs.find((candidate) => candidate.id === request.outputId);
  if (!output) throw new WorkPlanInvalidOutputError("The requested plan output is unavailable.");
  assertRequiredDecisions(record.plan, request.decisions);

  let capability: QualifiedExecutableCapability;
  try {
    capability = selectedOperation(record.plan, output, request.operationId);
  } catch (error) {
    if (error instanceof WorkPlanExecutionUnsupportedError) throw error;
    throw new WorkPlanInvalidOutputError("The requested plan output is unavailable.");
  }

  let native;
  try {
    native = buildNativeOutput({
      actor: input.actor,
      planWorkId: request.planWorkId,
      outputId: request.outputId,
      capability,
      output,
      inputs: request.inputs,
    });
  } catch (error) {
    if (error instanceof WorkPlanInvalidOutputError) throw error;
    throw new WorkPlanInvalidOutputError("The proposed output could not be validated by its native product.");
  }

  const executionInput = {
    operationId: capability.definition.id,
    capabilityVersion: capability.definition.version,
    inputs: native.nativeInput,
    decisions: request.decisions,
  };
  const idempotencyKey = `work-plan-output:${request.planWorkId}:${record.plan.metadata.revision}:${request.outputId}:${capability.definition.id}@${capability.definition.version}`;
  const digest = inputDigest(executionInput);
  const legacyPersistenceKey = capability.definition.version === 1
    ? {
      actor: input.actor,
      workspaceId: request.workspaceId,
      planWorkId: request.planWorkId,
      planRevision: record.plan.metadata.revision,
      outputId: request.outputId,
      operationId: capability.definition.id,
      idempotencyKey: `work-plan-output:${request.planWorkId}:${record.plan.metadata.revision}:${request.outputId}:${capability.definition.id}`,
      inputDigest: inputDigest({
        operationId: capability.definition.id,
        inputs: native.nativeInput,
        decisions: request.decisions,
      }),
    }
    : undefined;
  const persistenceKey = {
    actor: input.actor,
    workspaceId: request.workspaceId,
    planWorkId: request.planWorkId,
    planRevision: record.plan.metadata.revision,
    outputId: request.outputId,
    operationId: capability.definition.id,
    idempotencyKey,
    inputDigest: digest,
  };
  const readOutput = input.read ?? readWorkPlanOutput;
  let previouslyPersisted: PersistedWorkPlanOutput | null;
  try {
    previouslyPersisted = await readOutput(persistenceKey);
  } catch (error) {
    // Before capability versions were persisted, v1 accepted outputs used the
    // unversioned key and digest. The current read RPC reports a conflict when
    // it finds one of those receipts, so retry that exact legacy identity once.
    if (!legacyPersistenceKey || !(error instanceof WorkspaceConflictError)) throw error;
    previouslyPersisted = await readOutput(legacyPersistenceKey);
    if (!previouslyPersisted) throw error;
  }
  if (previouslyPersisted) {
    if (previouslyPersisted.nativeProductId !== native.nativeProductId ||
        previouslyPersisted.nativeResourceKind !== native.nativeResourceKind) {
      throw new WorkPlanInvalidOutputError("The saved output receipt did not match the native product.");
    }
    const persistedReceipt = previouslyPersisted.receipt && typeof previouslyPersisted.receipt === "object"
      ? previouslyPersisted.receipt as Record<string, unknown>
      : {};
    if (persistedReceipt.capabilityVersion !== undefined && persistedReceipt.capabilityVersion !== capability.definition.version) {
      throw new WorkPlanExecutionUnsupportedError(capability.definition.id);
    }
    const receipt = workPlanOutputExecutionReceiptSchema.parse({
      ...persistedReceipt,
      capabilityVersion: capability.definition.version,
    });
    return workPlanOutputExecutionSchema.parse({
      planWorkId: request.planWorkId,
      outputId: request.outputId,
      status: "already_completed",
      nativeWorkId: previouslyPersisted.nativeWorkId,
      nativeProductId: previouslyPersisted.nativeProductId,
      nativeResourceKind: previouslyPersisted.nativeResourceKind,
      capabilityVersion: capability.definition.version,
      receipt,
    });
  }

  // Source revisions are checked immediately before the one write transaction.
  // A replay above intentionally returns its durable receipt even if a source
  // changed after the original acceptance.
  await assertContextFresh({ actor: input.actor, workspaceId: request.workspaceId, plan: record.plan });

  const persisted = await (input.persist ?? persistWorkPlanOutput)({
    actor: input.actor,
    workspaceId: request.workspaceId,
    planWorkId: request.planWorkId,
    planRevision: record.plan.metadata.revision,
    outputId: request.outputId,
    operationId: capability.definition.id,
    idempotencyKey,
    inputDigest: digest,
    ...native,
    nativeInput: executionInput,
    expectedSourceReferences: record.plan.context?.sources,
  });
  if (persisted.nativeProductId !== native.nativeProductId || persisted.nativeResourceKind !== native.nativeResourceKind) {
    throw new WorkPlanInvalidOutputError("The saved output receipt did not match the native product.");
  }
  const receipt = workPlanOutputExecutionReceiptSchema.parse(persisted.receipt);
  const versionedReceipt = workPlanOutputExecutionReceiptSchema.parse({
    ...receipt,
    capabilityVersion: capability.definition.version,
  });
  return workPlanOutputExecutionSchema.parse({
    planWorkId: request.planWorkId,
    outputId: request.outputId,
    status: persisted.replayed ? "already_completed" : "completed",
    nativeWorkId: persisted.nativeWorkId,
    nativeProductId: persisted.nativeProductId,
    nativeResourceKind: persisted.nativeResourceKind,
    capabilityVersion: capability.definition.version,
    receipt: versionedReceipt,
  });
}

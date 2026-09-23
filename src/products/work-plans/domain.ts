import { generatedWorkPlanSchema, workPlanSchema, type GeneratedWorkPlan, type WorkPlan, type WorkPlanNativeOperation } from "./contracts";
import { WorkPlanUnsupportedOperationError, WorkPlanInvalidOutputError } from "./errors";

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new WorkPlanInvalidOutputError(`${label} identifiers must be unique`);
}

function resolveOperations(generated: GeneratedWorkPlan, catalog: readonly WorkPlanNativeOperation[]): WorkPlanNativeOperation[] {
  const ids = [
    ...generated.supportedNativeOperationIds,
    ...generated.proposedOutputs.flatMap((output) => output.nativeOperationIds),
    ...generated.steps.flatMap((step) => step.nativeOperationIds),
  ];
  const uniqueIds = [...new Set(ids)];
  const byId = new Map<string, WorkPlanNativeOperation>();
  for (const operation of catalog) {
    if (byId.has(operation.id)) throw new WorkPlanInvalidOutputError(`Native operation identifier is ambiguous: ${operation.id}`);
    byId.set(operation.id, operation);
  }
  return uniqueIds.map((id) => {
    const operation = byId.get(id);
    if (!operation) throw new WorkPlanUnsupportedOperationError(id);
    return operation;
  });
}

export function normalizePlan(
  generatedValue: unknown,
  input: { userGoal: string; workspaceId: string; actorId: string; createdAt: string; context?: WorkPlan["context"] },
  catalog: readonly WorkPlanNativeOperation[],
): WorkPlan {
  const parsed = generatedWorkPlanSchema.safeParse(generatedValue);
  if (!parsed.success) throw new WorkPlanInvalidOutputError("The planning model returned an invalid structured plan");
  const generated = parsed.data;
  assertUnique(generated.proposedOutputs.map((output) => output.id), "Output");
  assertUnique(generated.steps.map((step) => step.id), "Step");
  assertUnique(generated.neededInputs.map((needed) => needed.id), "Input");
  assertUnique(generated.requiredDecisions.map((decision) => decision.id), "Decision");

  const stepIds = new Set<string>();
  for (const step of generated.steps) {
    for (const dependency of step.dependsOn) {
      if (!stepIds.has(dependency)) throw new WorkPlanInvalidOutputError("Steps must depend only on earlier steps");
    }
    stepIds.add(step.id);
  }

  const operations = resolveOperations(generated, catalog);
  for (const output of generated.proposedOutputs) {
    if (generated.status === "ready" && output.nativeOperationIds.includes("create_application") && output.draft?.kind !== "application") {
      throw new WorkPlanInvalidOutputError("A create_application output needs a reviewable application draft");
    }
  }
  let status = generated.status;
  const requiredDecisions = [...generated.requiredDecisions];
  if (status === "ready" && operations.length === 0) status = "needs_scoping";
  if (status === "needs_scoping" && requiredDecisions.length === 0) {
    requiredDecisions.push({
      id: "scope",
      question: "Which supported result should Strelva prepare first?",
      reason: "The request is not yet specific enough to select a native operation.",
    });
  }

  return workPlanSchema.parse({
    version: 1,
    status,
    userGoal: input.userGoal,
    summary: generated.summary,
    proposedOutputs: generated.proposedOutputs,
    steps: generated.steps,
    neededInputs: generated.neededInputs,
    supportedNativeOperations: operations,
    estimatedCost: null,
    requiredDecisions,
    ...(input.context ? {
      context: {
        version: input.context.version,
        sources: input.context.sources,
      },
    } : {}),
    metadata: {
      revision: 1,
      actorId: input.actorId,
      createdBy: input.actorId,
      workspaceId: input.workspaceId,
      createdAt: input.createdAt,
    },
  });
}

export function assertRequiredDecisions(plan: WorkPlan, decisions: Record<string, string>): void {
  const known = new Set(plan.requiredDecisions.map((decision) => decision.id));
  for (const decision of plan.requiredDecisions) {
    if (!decisions[decision.id]?.trim()) {
      throw new WorkPlanInvalidOutputError(`Answer the required decision: ${decision.question}`);
    }
  }
  for (const id of Object.keys(decisions)) {
    if (!known.has(id)) throw new WorkPlanInvalidOutputError("The request included an unknown plan decision");
  }
}

export function draftInputs(
  output: WorkPlan["proposedOutputs"][number],
  inputs: Record<string, unknown>,
  adapterKey: string,
): Record<string, unknown> {
  if (Object.keys(inputs).length > 0) return inputs;
  if (!output.draft) throw new WorkPlanInvalidOutputError("This output has no reviewable draft. Use the native product flow to provide one.");
  if (adapterKey === "applications.create_draft" && output.draft.kind === "application") {
    return { title: output.draft.title, fields: output.draft.fields, components: output.draft.components };
  }
  if (adapterKey === "documents.create" && output.draft.kind === "document") {
    return { title: output.draft.title, text: output.draft.text };
  }
  if (adapterKey === "tracker.create" && output.draft.kind === "tracker") {
    return { templateId: output.draft.templateId, ...(output.draft.title ? { title: output.draft.title } : {}) };
  }
  throw new WorkPlanInvalidOutputError("The proposed draft does not match its native operation.");
}

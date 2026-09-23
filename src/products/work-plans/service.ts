import { executeBudgetedAction, recordTrustedProviderReceipt, type BudgetExecution } from "@/platform/work-economics";
import { ProviderEvidenceUnavailableError } from "@/platform/work-economics/provider-evidence";
import { assertCanSaveWork, saveWork, type PersistedWorkPlanOutput, type WorkspaceActor } from "@/platform/workspaces";
import { createWorkPlanRequestSchema, WORK_PLAN_PRODUCT_ID, WORK_PLAN_RESOURCE_KIND, workPlanOutputExecutionReceiptSchema, workPlanOutputExecutionSchema, type WorkPlanEvidence, type WorkPlanOutputExecution, type WorkPlanRecord, type CreateWorkPlanRequest } from "./contracts";
import { prepareWorkPlanContext, preparedWorkPlanContextSchema } from "./context";
import { WorkPlanUnavailableError, WorkPlanFundingRequiredError, WorkPlanGenerationReplayError, WorkPlanInvalidOutputError } from "./errors";
import { type WorkPlanGenerationInput, type WorkPlanGenerator, planningEnabled, configuredModels, defaultGenerate, unwrapGeneration } from "./generation";
import { normalizePlan } from "./domain";
import { nativeOperationCatalog } from "./native-output";

export async function createWorkPlan(input: {
  actor: WorkspaceActor;
  workspaceId: string;
  userGoal: string;
  evidence?: readonly WorkPlanEvidence[];
  sourceWorkIds?: readonly string[];
  planningEconomics?: CreateWorkPlanRequest["planningEconomics"];
  generate?: WorkPlanGenerator;
  now?: () => Date;
}): Promise<WorkPlanRecord & {
  planningReceipt?: BudgetExecution;
  planningReconciliation?: {
    status: "settled" | "unresolved";
    code?: string;
    message?: string;
  };
}> {
  const request = createWorkPlanRequestSchema.parse({
    workspaceId: input.workspaceId,
    userGoal: input.userGoal,
    evidence: input.evidence,
    sourceWorkIds: input.sourceWorkIds,
    planningEconomics: input.planningEconomics,
  });

  // Membership and saved-work capacity are checked before the bounded model call.
  await assertCanSaveWork(input.actor, request.workspaceId);
  if (!planningEnabled()) throw new WorkPlanUnavailableError("Planning is not enabled");
  if (!input.generate && !request.planningEconomics) {
    // Preserve the existing unavailable state when no model is configured, but
    // never let a configured provider run without an explicit funding boundary.
    if (!configuredModels().length) throw new WorkPlanUnavailableError("No planning model is configured");
    throw new WorkPlanFundingRequiredError();
  }

  const context = request.sourceWorkIds?.length
    ? await prepareWorkPlanContext({
      actor: input.actor,
      workspaceId: request.workspaceId,
      sourceWorkIds: request.sourceWorkIds,
    })
    : undefined;
  const evidence = [...request.evidence, ...(context?.evidence ?? [])];
  if (evidence.length > 12) {
    throw new WorkPlanInvalidOutputError("Choose fewer sources or provide less planning evidence");
  }

  const catalog = nativeOperationCatalog();
  const generationInput = {
    userGoal: request.userGoal,
    evidence,
    allowedOperations: catalog,
  } satisfies WorkPlanGenerationInput;
  let generated: unknown;
  let planningReceipt: BudgetExecution | undefined;
  let planningReconciliation: {
    status: "settled" | "unresolved";
    code?: string;
    message?: string;
  } | undefined;
  if (request.planningEconomics) {
    const executionContext = {
      actor: input.actor,
      expectedTarget: { workspaceId: request.workspaceId, workId: null },
      jobId: request.planningEconomics.jobId,
      executionKey: request.planningEconomics.executionKey,
      maximumCents: request.planningEconomics.maximumCents,
      kind: "model" as const,
      attribution: "normal" as const,
    };
    const result = await executeBudgetedAction(input.actor, {
      jobId: request.planningEconomics.jobId,
      executionKey: request.planningEconomics.executionKey,
      maximumCents: request.planningEconomics.maximumCents,
      kind: "model",
      expectedTarget: { workspaceId: request.workspaceId, workId: null },
    }, {
      recheck: async () => { await assertCanSaveWork(input.actor, request.workspaceId); },
      perform: async () => ({
        value: await (input.generate ?? defaultGenerate)({ ...generationInput, executionContext }),
        // Provider token usage is not a trusted dollar amount. Keep the accepted
        // maximum held until an independently verified receipt exists.
        amountCents: null,
        effect: "accepted" as const,
      }),
    });
    if (result.disposition === "replayed") throw new WorkPlanGenerationReplayError();
    const generation = unwrapGeneration(result.value);
    generated = generation.output;
    planningReceipt = result.execution;
    if (generation.providerEvidence) {
      try {
        planningReceipt = (await recordTrustedProviderReceipt(executionContext, generation.providerEvidence)).execution;
        planningReconciliation = { status: "settled" };
      } catch (error) {
        if (!(error instanceof ProviderEvidenceUnavailableError)) throw error;
        // The plan itself is still a useful durable result. Keep the execution
        // held and expose the precise recovery state to the caller; never
        // convert a mismatch or missing receipt into zero.
        planningReconciliation = {
          status: "unresolved",
          code: error.code,
          message: error.message,
        };
      }
    } else {
      planningReconciliation = {
        status: "unresolved",
        code: "provider_billing_unavailable",
        message: "The provider returned no trusted billed-cost receipt. Token usage is not a dollar amount, so the accepted maximum remains held.",
      };
    }
  } else {
    // Custom generators are the deterministic local test/fixture seam. The
    // production path above cannot invoke a configured model without funding.
    generated = await input.generate!(generationInput);
  }
  const createdAt = (input.now ?? (() => new Date()))().toISOString();
  const plan = normalizePlan(generated, {
    userGoal: request.userGoal,
    workspaceId: request.workspaceId,
    actorId: input.actor.userId,
    createdAt,
    context,
  }, catalog);
  const work = await saveWork(input.actor, request.workspaceId, {
    productId: WORK_PLAN_PRODUCT_ID,
    resourceKind: WORK_PLAN_RESOURCE_KIND,
    title: `Plan: ${request.userGoal}`.slice(0, 160),
    payload: plan,
    input: {
      userGoal: request.userGoal,
      evidence: request.evidence,
      ...(context ? {
        // Keep only source identities in saved input. Bounded evidence is sent
        // to the provider for this request and is never retained as a second
        // copy of private document or tracker content.
        context: preparedWorkPlanContextSchema.pick({ version: true, sources: true }).parse({
          version: context.version,
          sources: context.sources,
        }),
      } : {}),
    },
  });
  return {
    work,
    plan,
    ...(planningReceipt ? { planningReceipt } : {}),
    ...(planningReconciliation ? { planningReconciliation } : {}),
  };
}

function presentOutputExecution(value: PersistedWorkPlanOutput): WorkPlanOutputExecution | null {
  try {
    const receipt = workPlanOutputExecutionReceiptSchema.parse(value.receipt);
    return workPlanOutputExecutionSchema.parse({
      planWorkId: value.planWorkId,
      outputId: value.outputId,
      status: "completed",
      nativeWorkId: value.nativeWorkId,
      nativeProductId: value.nativeProductId,
      nativeResourceKind: value.nativeResourceKind,
      ...(receipt.capabilityVersion ? { capabilityVersion: receipt.capabilityVersion } : {}),
      receipt,
    });
  } catch {
    return null;
  }
}

export function presentWorkPlan(record: WorkPlanRecord & {
  planningReceipt?: BudgetExecution;
  planningReconciliation?: {
    status: "settled" | "unresolved";
    code?: string;
    message?: string;
  };
}, executions?: readonly PersistedWorkPlanOutput[]) {
  const { work, plan } = record;
  const response = {
    work: {
      id: work.id,
      workspaceId: work.workspaceId,
      productId: work.productId,
      resourceKind: work.resourceKind,
      title: work.title ?? "Work plan",
      createdBy: work.createdBy,
      createdAt: work.createdAt,
      updatedAt: work.updatedAt,
    },
    plan,
    ...(record.planningReceipt ? { planningEconomics: record.planningReceipt } : {}),
    ...(record.planningReconciliation ? { planningReconciliation: record.planningReconciliation } : {}),
  };
  if (executions === undefined) return response;
  return {
    ...response,
    executions: executions.map(presentOutputExecution).filter((value): value is WorkPlanOutputExecution => Boolean(value)),
  };
}

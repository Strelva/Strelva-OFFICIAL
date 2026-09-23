import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { JobEconomicsAccessError, JobEconomicsNotFoundError, JobEconomicsConflictError, JobEconomicsValidationError, MAX_JOB_ECONOMICS_CENTS } from "./types";
import { executionInput, type BudgetExecutionInput, type BudgetExecution, BudgetExecutionNotStartedError, type BudgetExecutionMeasurement, type BudgetExecutionEvidenceResolver, type BudgetExecutionStore, type BudgetExecutionResult, type BudgetExecutionHandlers, type BudgetExecutionAllowanceAccounting } from "./execution-contracts";

/** A durable key represents one opportunity to act, never a retry permission. */
export function createBudgetedExecutor(store: BudgetExecutionStore, allowances?: BudgetExecutionAllowanceAccounting) {
  return async function execute<T>(actor: WorkspaceActor, input: BudgetExecutionInput, handlers: BudgetExecutionHandlers<T>): Promise<BudgetExecutionResult<T>> {
    const parsed = executionInput.safeParse(input);
    if (!parsed.success) throw new JobEconomicsValidationError("The budget execution command is invalid.");
    const command = parsed.data;
    let claim: Awaited<ReturnType<BudgetExecutionStore["claim"]>>;
    try {
      await store.authorize(actor, command);
      claim = await store.claim(actor, command);
    } catch (error) {
      if (error instanceof JobEconomicsAccessError || error instanceof JobEconomicsNotFoundError || error instanceof JobEconomicsValidationError) {
        throw new BudgetExecutionNotStartedError(error.message, error);
      }
      throw error;
    }
    if (!claim.claimed) {
      if (claim.execution.status === "finished") {
        // Repair accounting after a lost response without repeating the native effect.
        if (allowances && handlers.usageUnit) await allowances.settle(actor, command);
        return { disposition: "replayed", execution: claim.execution };
      }
      throw new JobEconomicsConflictError("This action already has a reservation or may have acted. Reconcile it before continuing.");
    }
    try {
      if (allowances && handlers.usageUnit) await allowances.reserve(actor, command, handlers.usageUnit);
      await handlers.recheck();
      // Membership and native target can have changed while checking the domain.
      await store.authorize(actor, command);
      await store.start(actor, command);
    } catch (error) {
      try {
        await store.finish(actor, command, { amountCents: 0, effect: "none" });
      } catch (receiptError) {
        // Do not release the allowance without a confirmed durable receipt.
        throw new Error("The action did not start, but its reservation could not be closed. Reconcile it before continuing.", {
          cause: new AggregateError([error, receiptError], "Pre-action denial and receipt finalization failed."),
        });
      }
      if (allowances && handlers.usageUnit) await allowances.settle(actor, command);
      throw new BudgetExecutionNotStartedError(error instanceof Error ? error.message : "Access changed before the action.", error);
    }
    let result: BudgetExecutionMeasurement & { value: T };
    try {
      result = await handlers.perform();
      if ((result.amountCents !== null && (!Number.isSafeInteger(result.amountCents) || result.amountCents < 0 || result.amountCents > MAX_JOB_ECONOMICS_CENTS))
        || !["accepted", "none", "unknown"].includes(result.effect)) {
        throw new JobEconomicsValidationError("The action returned an invalid cost or effect measurement.");
      }
    } catch (error) {
      // A timeout can happen after provider acceptance. Hold the cap and prevent replay.
      await store.finish(actor, command, { amountCents: null, effect: "unknown" });
      if (allowances && handlers.usageUnit) await allowances.settle(actor, command);
      throw error;
    }
    const execution = await store.finish(actor, command, result);
    if (allowances && handlers.usageUnit) await allowances.settle(actor, command);
    return { disposition: "performed", value: result.value, execution };
  };
}

/** Build a reconciler whose amount comes from a server-side evidence authority. */
export function createBudgetedReconciler(store: BudgetExecutionStore, allowances?: BudgetExecutionAllowanceAccounting) {
  return async function reconcile(actor: WorkspaceActor, input: BudgetExecutionInput, resolver: BudgetExecutionEvidenceResolver): Promise<BudgetExecution> {
    const parsed = executionInput.safeParse(input);
    if (!parsed.success) throw new JobEconomicsValidationError("The budget execution command is invalid.");
    // Authorization and exact target binding happen before the evidence adapter
    // can query a provider or native receipt in another workspace.
    await store.authorize(actor, parsed.data);
    const evidence = await resolver.resolve({
      actor,
      jobId: parsed.data.jobId,
      executionKey: parsed.data.executionKey,
      expectedTarget: parsed.data.expectedTarget,
      maximumCents: parsed.data.maximumCents,
      kind: parsed.data.kind,
      attribution: parsed.data.attribution,
    });
    const measured = z.object({ effect: z.enum(["accepted", "none"]), amountCents: z.number().int().min(0).max(MAX_JOB_ECONOMICS_CENTS), evidenceReference: z.string().trim().min(1).max(256) }).strict().safeParse(evidence);
    if (!measured.success) throw new JobEconomicsValidationError("A known amount and verified evidence reference are required.");
    // Evidence lookup may cross a network boundary. Recheck membership and the
    // native target immediately before applying it to the durable receipt.
    await store.authorize(actor, parsed.data);
    const execution = await store.reconcile(actor, parsed.data, measured.data);
    // Reconciliation closes a held receipt, not a new opportunity to spend or act.
    if (allowances) await allowances.settle(actor, parsed.data);
    return execution;
  };
}

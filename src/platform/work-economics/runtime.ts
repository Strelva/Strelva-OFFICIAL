import type { WorkspaceActor } from "@/platform/workspaces/types";
import { type BudgetExecutionInput, type BudgetExecution, type BudgetExecutionEvidenceResolver, type BudgetExecutionResult, type BudgetExecutionHandlers, type BudgetExecutionAllowanceAccounting } from "./execution-contracts";
import { createBudgetedExecutor, createBudgetedReconciler } from "./execution-engine";

/** No provider is invoked by this module; a caller must supply its governed native action. */
export async function executeBudgetedAction<T>(actor: WorkspaceActor, input: BudgetExecutionInput, handlers: BudgetExecutionHandlers<T>): Promise<BudgetExecutionResult<T>> {
  const { budgetExecutionStore } = await import("./runtime-store");
  const accounting = handlers.usageUnit ? await allowanceAccounting() : undefined;
  return createBudgetedExecutor(budgetExecutionStore, accounting)(actor, input, handlers);
}

async function allowanceAccounting(): Promise<BudgetExecutionAllowanceAccounting> {
  const { reserveAvailableWorkAllowance, settleWorkAllowanceExecution } = await import("./allowances-service");
  return {
    async reserve(actor, command, unitKind) {
      await reserveAvailableWorkAllowance(actor, { jobId: command.jobId, executionKey: command.executionKey, unitKind, units: 1 });
    },
    async settle(actor, command) {
      await settleWorkAllowanceExecution(actor, { jobId: command.jobId, executionKey: command.executionKey });
    },
  };
}

/** Resolve a held cost only through a trusted native or provider evidence adapter. */
export async function reconcileBudgetedAction(actor: WorkspaceActor, input: BudgetExecutionInput, resolver: BudgetExecutionEvidenceResolver): Promise<BudgetExecution> {
  const { budgetExecutionStore } = await import("./runtime-store");
  return createBudgetedReconciler(budgetExecutionStore, await allowanceAccounting())(actor, input, resolver);
}

export { type BudgetExecutionInput, type BudgetExecutionCommand, type BudgetExecutionEffect, type BudgetExecution, BudgetExecutionNotStartedError, type BudgetExecutionMeasurement, type BudgetExecutionReconciliation, type BudgetExecutionEvidenceContext, type BudgetExecutionEvidenceResolver, type BudgetExecutionStore, type BudgetExecutionResult, type BudgetExecutionHandlers, type BudgetExecutionAllowanceAccounting } from "./execution-contracts";
export { createBudgetedExecutor, createBudgetedReconciler } from "./execution-engine";

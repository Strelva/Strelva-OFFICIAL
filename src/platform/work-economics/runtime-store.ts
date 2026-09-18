import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/db/client";
import { assertJobTargetAccess } from "./adapters";
import { mapBudgetExecution, readJobEconomics } from "./repository";
import { JobEconomicsAccessError, JobEconomicsConflictError, JobEconomicsNotFoundError, JobEconomicsPersistenceError, JobEconomicsPayerError, JobEconomicsTargetError, JobEconomicsValidationError } from "./types";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { BudgetExecutionNotStartedError } from "./runtime";
import type { BudgetExecution, BudgetExecutionCommand, BudgetExecutionMeasurement, BudgetExecutionReconciliation, BudgetExecutionStore } from "./runtime";

type RuntimeDatabase = { public: {
  Tables: Record<string, never>; Views: Record<string, never>; Enums: Record<string, never>; CompositeTypes: Record<string, never>;
  Functions: { job_economics_execution_command: { Args: { p_command: unknown; p_actor_id: string; p_verified_email: string }; Returns: unknown } };
} };


async function command(actor: WorkspaceActor, input: Record<string, unknown>): Promise<{ claimed: boolean; execution: BudgetExecution }> {
  const client = getSupabase() as unknown as SupabaseClient<RuntimeDatabase> | null;
  if (!client) throw new JobEconomicsPersistenceError("Work economics storage is not configured.");
  const result = await client.rpc("job_economics_execution_command", {
    p_command: input, p_actor_id: actor.userId, p_verified_email: actor.verifiedEmail,
  });
  if (result.error) {
    const detail = result.error.message;
    if (detail.includes("identity_denied") || detail.includes("workspace_denied")) throw new JobEconomicsAccessError();
    if (detail.includes("payer_required")) throw new JobEconomicsPayerError();
    if (detail.includes("target_not_found")) throw new JobEconomicsTargetError();
    if (detail.includes("not_found")) throw new JobEconomicsNotFoundError();
    if (detail.includes("command_invalid")) throw new JobEconomicsValidationError("The budget execution command is invalid.");
    if (input.action === "claim" && (detail.includes("reservation_exceeded") || detail.includes("concurrency_exceeded") || detail.includes("runtime_managed") || detail.includes("invalid_transition"))) {
      throw new BudgetExecutionNotStartedError(detail.includes("reservation_exceeded") ? "This action exceeds the remaining authorized budget." : detail.includes("concurrency_exceeded") ? "Another action is using this budget." : "This budget is not available for execution.");
    }
    if (detail.includes("job_economics_")) throw new JobEconomicsConflictError(
      detail.includes("concurrency_exceeded") ? "Another action is using this budget."
        : detail.includes("reservation_exceeded") ? "This action exceeds the remaining authorized budget."
          : detail.includes("runtime_managed") ? "This budget already has manual accounting. Use a new budget for runtime execution."
            : "The budget or execution changed. Inspect its current receipt before continuing.",
    );
    throw new JobEconomicsPersistenceError(undefined, { cause: result.error });
  }
  const data = result.data as { claimed?: unknown; execution?: unknown } | null;
  if (!data || typeof data.claimed !== "boolean") throw new JobEconomicsPersistenceError("The execution command returned no receipt.");
  return { claimed: data.claimed, execution: mapBudgetExecution(data.execution) };
}

export const budgetExecutionStore: BudgetExecutionStore = {
  async authorize(actor: WorkspaceActor, input: BudgetExecutionCommand) {
    const inspection = await readJobEconomics(actor, input.jobId);
    if (!inspection) throw new JobEconomicsNotFoundError();
    if (inspection.job.workspaceId !== input.expectedTarget.workspaceId || inspection.job.workId !== input.expectedTarget.workId) throw new JobEconomicsTargetError();
    await assertJobTargetAccess(actor, inspection.job);
  },
  claim(actor, input) {
    const { expectedTarget: _target, ...fields } = input;
    return command(actor, { action: "claim", ...fields });
  },
  async start(actor, input) {
    return (await command(actor, { action: "start", jobId: input.jobId, executionKey: input.executionKey })).execution;
  },
  async finish(actor: WorkspaceActor, input: BudgetExecutionCommand, result: BudgetExecutionMeasurement) {
    return (await command(actor, { action: "finish", jobId: input.jobId, executionKey: input.executionKey,
      effect: result.effect, amountCents: result.amountCents })).execution;
  },
  async reconcile(actor: WorkspaceActor, input: BudgetExecutionCommand, evidence: BudgetExecutionReconciliation) {
    return (await command(actor, {
      action: "reconcile", jobId: input.jobId, executionKey: input.executionKey,
      maximumCents: input.maximumCents, kind: input.kind, attribution: input.attribution,
      ...evidence,
    })).execution;
  },
};

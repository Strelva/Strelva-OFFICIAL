import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { WorkAllowanceUnitKind } from "./allowances-types";
import { JobEconomicsAccessError, JobEconomicsNotFoundError, JobEconomicsConflictError, JobEconomicsValidationError, MAX_JOB_ECONOMICS_CENTS } from "./types";

const executionInput = z.object({
  jobId: z.string().uuid(),
  executionKey: z.string().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
  maximumCents: z.number().int().min(0).max(MAX_JOB_ECONOMICS_CENTS),
  kind: z.enum(["provider", "model", "tool", "human"]),
  attribution: z.enum(["normal", "strelva_retry"]).default("normal"),
  /** Planning is admitted against a workspace before its saved plan exists. */
  expectedTarget: z.object({ workspaceId: z.string().uuid(), workId: z.string().uuid().nullable() }).strict(),
}).strict();
export type BudgetExecutionInput = z.input<typeof executionInput>;
export type BudgetExecutionCommand = z.output<typeof executionInput>;
export type BudgetExecutionEffect = "accepted" | "none" | "unknown";
export interface BudgetExecution {
  jobId: string;
  executionKey: string;
  maximumCents: number;
  kind: BudgetExecutionCommand["kind"];
  attribution: BudgetExecutionCommand["attribution"];
  status: "reserved" | "running" | "finished";
  effect: BudgetExecutionEffect | null;
  amountCents: number | null;
  billableCents: number | null;
  createdBy: string;
  reconciliationReference?: string | null;
}
export class BudgetExecutionNotStartedError extends Error {
  constructor(message: string, cause?: unknown) { super(message, { cause }); this.name = "BudgetExecutionNotStartedError"; }
}
export interface BudgetExecutionMeasurement {
  amountCents: number | null;
  effect: BudgetExecutionEffect;
}
export interface BudgetExecutionReconciliation {
  effect: "accepted" | "none";
  amountCents: number;
  /** A native provider receipt or other independently checked record, never a model inference. */
  evidenceReference: string;
}
export interface BudgetExecutionEvidenceContext {
  actor: WorkspaceActor;
  jobId: string;
  executionKey: string;
  expectedTarget: BudgetExecutionCommand["expectedTarget"];
  maximumCents: number;
  kind: BudgetExecutionCommand["kind"];
  attribution: BudgetExecutionCommand["attribution"];
}
export interface BudgetExecutionEvidenceResolver {
  /** Read a native receipt or provider billing authority. Never copy a browser-supplied amount. */
  resolve(context: BudgetExecutionEvidenceContext): Promise<BudgetExecutionReconciliation>;
}
export interface BudgetExecutionStore {
  authorize(actor: WorkspaceActor, command: BudgetExecutionCommand): Promise<void>;
  claim(actor: WorkspaceActor, command: BudgetExecutionCommand): Promise<{ execution: BudgetExecution; claimed: boolean }>;
  start(actor: WorkspaceActor, command: BudgetExecutionCommand): Promise<BudgetExecution>;
  finish(actor: WorkspaceActor, command: BudgetExecutionCommand, result: BudgetExecutionMeasurement): Promise<BudgetExecution>;
  reconcile(actor: WorkspaceActor, command: BudgetExecutionCommand, evidence: BudgetExecutionReconciliation): Promise<BudgetExecution>;
}
export type BudgetExecutionResult<T> =
  | { disposition: "performed"; value: T; execution: BudgetExecution }
  | { disposition: "replayed"; execution: BudgetExecution };
export interface BudgetExecutionHandlers<T> {
  /** Chosen by the native operation, never inferred from a browser usage claim. */
  usageUnit?: WorkAllowanceUnitKind;
  /** Domain permissions, consent and version authority still belong to the native command. */
  recheck(): Promise<void>;
  /** An exception is ambiguous. Return effect:none explicitly only after proving no effect. */
  perform(): Promise<BudgetExecutionMeasurement & { value: T }>;
}

export interface BudgetExecutionAllowanceAccounting {
  reserve(actor: WorkspaceActor, command: BudgetExecutionCommand, unit: WorkAllowanceUnitKind): Promise<void>;
  /** Reads the durable execution receipt; callers cannot report billable completion. */
  settle(actor: WorkspaceActor, command: BudgetExecutionCommand): Promise<void>;
}

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

/** Resolve a held cost only through a trusted native or provider evidence adapter. */
export async function reconcileBudgetedAction(actor: WorkspaceActor, input: BudgetExecutionInput, resolver: BudgetExecutionEvidenceResolver): Promise<BudgetExecution> {
  const { budgetExecutionStore } = await import("./runtime-store");
  return createBudgetedReconciler(budgetExecutionStore, await allowanceAccounting())(actor, input, resolver);
}

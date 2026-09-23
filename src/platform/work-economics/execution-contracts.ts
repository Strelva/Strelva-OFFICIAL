import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { WorkAllowanceUnitKind } from "./allowances-types";
import { MAX_JOB_ECONOMICS_CENTS } from "./types";


export const executionInput = z.object({
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

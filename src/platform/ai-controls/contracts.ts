/**
 * Contracts for per-client usage controls (pause, monthly limit, review-reply
 * hold). Pure: client components import this file, so it reads no environment
 * and no server module.
 */
import { z } from "zod";

const money = z.string().regex(/^\d+(?:\.\d{1,8})?$/);

export const aiControlsStateSchema = z.object({
  paused: z.boolean(),
  monthlyCapCents: z.number().int().min(0).nullable(),
  reviewAutoPost: z.enum(["client_choice", "held"]),
  revision: z.number().int().min(0),
  setBy: z.object({ kind: z.enum(["agency", "operator"]), agencyName: z.string().nullable() }).strict().nullable(),
  changedAt: z.string().nullable(),
}).strict();
export type AiControlsStateView = z.infer<typeof aiControlsStateSchema>;

export const aiControlsBudgetSchema = z.object({
  spentUsd: money,
  reservedUsd: money,
  since: z.string(),
  resetsAt: z.string(),
  capCents: z.number().int().nonnegative().nullable(),
  subscribed: z.boolean(),
  unknownCostCalls: z.number().int().nonnegative(),
  controls: aiControlsStateSchema,
}).strict();

const controlFields = {
  workspaceId: z.string().uuid(),
  paused: z.boolean(),
  monthlyCapCents: z.number().int().min(0).max(10_000_000).nullable(),
  reviewAutoPost: z.enum(["client_choice", "held"]),
  expectedRevision: z.number().int().min(0),
  reason: z.string().trim().min(3).max(500),
};
export const aiControlsCommandSchema = z.object({ agencyWorkspaceId: z.string().uuid(), ...controlFields }).strict();
export type AiControlsCommand = z.infer<typeof aiControlsCommandSchema>;
export const operatorAiControlsCommandSchema = z.object(controlFields).strict();
export type OperatorAiControlsCommand = z.infer<typeof operatorAiControlsCommandSchema>;

export const aiControlsClientSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string(),
  budget: aiControlsBudgetSchema,
  linkedTenantIds: z.array(z.string()),
}).strict();
export type AiControlsClient = z.infer<typeof aiControlsClientSchema>;

export const agencyAiControlsViewSchema = z.object({
  agencyWorkspaceId: z.string().uuid(),
  canChange: z.boolean(),
  clients: z.array(aiControlsClientSchema).max(500),
}).strict();
export type AgencyAiControlsView = z.infer<typeof agencyAiControlsViewSchema>;

export const operatorAiControlsHistorySchema = z.object({
  at: z.string(),
  kind: z.enum(["agency", "operator"]),
  agencyName: z.string().nullable(),
  reason: z.string(),
  after: z.record(z.string(), z.unknown()),
}).strict();
export const operatorAiControlsViewSchema = aiControlsClientSchema.extend({ history: z.array(operatorAiControlsHistorySchema).max(20) }).strict();
export type OperatorAiControlsView = z.infer<typeof operatorAiControlsViewSchema>;

export const aiControlsScopeSchema = z.object({ agencyWorkspaceId: z.string().uuid(), workspaceId: z.string().uuid().nullable() }).strict();

/** What the server enforces, so a screen can explain a limit it does not set itself. */
export interface AiUsageEnforcement {
  /** STRELVA_BUSINESS_AI_BUDGET is on: the plan or free allowance binds. */
  budgetEnforced: boolean;
  freeCapUsd: number | null;
}

export interface AiUsageLine {
  usedUsd: number;
  heldUsd: number;
  limitUsd: number | null;
  limitSource: "agency" | "operator" | "plan" | "free" | null;
  resetsAt: string;
  /** Some calls this period have no recorded cost, so a limit cannot be trusted to admit more work. */
  unknown: boolean;
}

/** One client's usage and the limit that binds it. Pass enforcement from the server; never read env here. */
export function aiUsageLine(client: Pick<AiControlsClient, "budget">, enforcement: AiUsageEnforcement): AiUsageLine {
  const { budget } = client;
  const agencyLimit = budget.controls.monthlyCapCents === null ? null : budget.controls.monthlyCapCents / 100;
  const planLimit = !enforcement.budgetEnforced ? null : budget.subscribed ? (budget.capCents === null ? null : budget.capCents / 100) : enforcement.freeCapUsd;
  const agencySource = budget.controls.setBy?.kind === "operator" ? "operator" : "agency";
  const planSource = budget.subscribed ? "plan" : "free";
  let limitUsd: number | null = null;
  let limitSource: AiUsageLine["limitSource"] = null;
  if (agencyLimit !== null && (planLimit === null || agencyLimit <= planLimit)) { limitUsd = agencyLimit; limitSource = agencySource; }
  else if (planLimit !== null) { limitUsd = planLimit; limitSource = planSource; }
  return { usedUsd: Number(budget.spentUsd), heldUsd: Number(budget.reservedUsd), limitUsd, limitSource, resetsAt: budget.resetsAt, unknown: budget.unknownCostCalls > 0 };
}

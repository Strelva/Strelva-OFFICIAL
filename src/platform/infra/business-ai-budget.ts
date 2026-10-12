import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import type { ModelCallPurpose } from "./model-call-log";

/**
 * Usage pauses at the payer's cap (ADR 0015). Off unless
 * STRELVA_BUSINESS_AI_BUDGET=1. A business on a plan uses its subscription's
 * spending cap; a business with no plan uses STRELVA_FREE_MONTHLY_AI_CAP_USD
 * when set. Neither number lives in code. Platform work for the operator and
 * the public check's own probe never count against a business.
 */
export class ModelBudgetPausedError extends Error {
  constructor(readonly spentUsd: number, readonly capUsd: number) {
    super("This business has used its included usage for this period. Building pauses until the next period or a higher limit. Nothing was changed.");
    this.name = "ModelBudgetPausedError";
  }
}

const BUSINESS_PAID: ReadonlySet<ModelCallPurpose> = new Set<ModelCallPurpose>(["ask", "ask.background", "rebuild", "work_plan", "report", "review_reply", "suggestion", "weekly_brief"]);
const budgetSchema = z.object({ spentUsd: z.string(), since: z.string(), capCents: z.number().int().nonnegative().nullable(), subscribed: z.boolean() }).strict();
export type BusinessAiBudget = z.infer<typeof budgetSchema>;

type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
export async function readBusinessAiBudget(workspaceId: string, client: Rpc | null = getSupabase() as unknown as Rpc | null): Promise<BusinessAiBudget | null> {
  if (!client) return null;
  const { data, error } = await client.rpc("business_ai_budget", { p_workspace_id: workspaceId });
  if (error) return null;
  const parsed = budgetSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** The cap in dollars that applies, or null for no cap. */
export function businessAiCapUsd(budget: Pick<BusinessAiBudget, "capCents" | "subscribed">, environment: Record<string, string | undefined> = process.env): number | null {
  if (budget.subscribed) return budget.capCents === null ? null : budget.capCents / 100;
  const free = Number(environment.STRELVA_FREE_MONTHLY_AI_CAP_USD);
  return environment.STRELVA_FREE_MONTHLY_AI_CAP_USD && Number.isFinite(free) && free >= 0 ? free : null;
}

/**
 * Throws ModelBudgetPausedError when a business-paid call would start past its
 * cap. A budget that can't be read never blocks the call: cost control must
 * not take a business's Ask down; the call is still logged with its cost.
 */
export async function assertBusinessAiBudget(context: { purpose: ModelCallPurpose; workspaceId?: string | null }, deps: {
  environment?: Record<string, string | undefined>; read?: (workspaceId: string) => Promise<BusinessAiBudget | null>;
} = {}): Promise<void> {
  const environment = deps.environment ?? process.env;
  if (environment.STRELVA_BUSINESS_AI_BUDGET !== "1" || !context.workspaceId || !BUSINESS_PAID.has(context.purpose)) return;
  const budget = await (deps.read ?? readBusinessAiBudget)(context.workspaceId).catch(() => null);
  if (!budget) return;
  const cap = businessAiCapUsd(budget, environment);
  const spent = Number(budget.spentUsd);
  if (cap !== null && Number.isFinite(spent) && spent >= cap) throw new ModelBudgetPausedError(spent, cap);
}

import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import type { ModelCallPurpose } from "./model-call-log";
import { selfServeBillingConfig } from "@/platform/business-billing/workspace-checkout";

/** Optional payer limit (ADR 0015). Platform work and public probes are exempt. */
export class ModelBudgetPausedError extends Error {
  constructor(readonly spentUsd: number, readonly capUsd: number, environment: Record<string, string | undefined> = process.env) {
    const reason = capUsd === 0
      ? "Building is paused because this business has no included building usage."
      : "Building is paused because this work would exceed this period’s budget.";
    const next = selfServeBillingConfig(environment).enabled
      ? "Open Plan and billing to choose a plan."
      : "Bring in an agency to continue with help.";
    super(`${reason} ${next}`);
    this.name = "ModelBudgetPausedError";
  }
}

export class ModelBudgetUnavailableError extends Error {
  constructor() {
    super("Usage could not be confirmed. Building is paused. Open Plan and billing to check your usage.");
    this.name = "ModelBudgetUnavailableError";
  }
}

const BUSINESS_PAID: ReadonlySet<ModelCallPurpose> = new Set<ModelCallPurpose>(["ask", "ask.background", "rebuild", "work_plan", "report", "review_reply", "suggestion", "weekly_brief"]);
export function isBusinessPaidModelPurpose(purpose: ModelCallPurpose): boolean {
  return BUSINESS_PAID.has(purpose);
}
const decimal = z.string().regex(/^\d+(?:\.\d{1,8})?$/).refine((value) => Number.isFinite(Number(value)));
const budgetSchema = z.object({
  spentUsd: decimal,
  reservedUsd: decimal,
  since: z.string().datetime({ offset: true }),
  resetsAt: z.string().datetime({ offset: true }),
  capCents: z.number().int().nonnegative().nullable(),
  subscribed: z.boolean(),
  unknownCostCalls: z.number().int().nonnegative(),
}).strict().refine((budget) => Date.parse(budget.resetsAt) > Date.parse(budget.since));
export type BusinessAiBudget = z.infer<typeof budgetSchema>;
const reservationSchema = z.object({
  status: z.enum(["reserved", "paused"]),
  reservationId: z.string().uuid().nullable(),
  budget: budgetSchema,
}).strict();
export type BusinessAiReservation = z.infer<typeof reservationSchema>;

type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
export async function readBusinessAiBudget(workspaceId: string, client: Rpc | null = getSupabase() as unknown as Rpc | null): Promise<BusinessAiBudget | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.rpc("business_ai_budget", { p_workspace_id: workspaceId });
    if (error) return null;
    const parsed = budgetSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

/** A configured cap in dollars, or null when this business has no cap. */
export function businessAiCapUsd(budget: Pick<BusinessAiBudget, "capCents" | "subscribed">, environment: Record<string, string | undefined> = process.env): number | null {
  if (budget.subscribed) return budget.capCents === null ? null : budget.capCents / 100;
  const value = environment.STRELVA_FREE_MONTHLY_AI_CAP_USD;
  if (!value) return null;
  if (!decimal.safeParse(value).success) throw new ModelBudgetUnavailableError();
  return Number(value);
}

export async function reserveBusinessAiBudget(workspaceId: string, maximumCostUsd: string, freeCapUsd: string | null, client: Rpc | null = getSupabase() as unknown as Rpc | null): Promise<BusinessAiReservation | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.rpc("reserve_business_ai_budget", {
      p_workspace_id: workspaceId, p_maximum_cost_usd: maximumCostUsd, p_free_cap_usd: freeCapUsd,
    });
    if (error) return null;
    const parsed = reservationSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

/**
 * Admit exactly one bounded provider attempt. The helper must bound the input,
 * output, retries and steps before passing maximumCostUsd, and carry the returned
 * reservation into that attempt's log rows. Missing bounds or unavailable state
 * pause capped work. Failed/unknown calls retain their full reservation until reset.
 */
export async function assertBusinessAiBudget(context: { purpose: ModelCallPurpose; workspaceId?: string | null; maximumCostUsd?: string | (() => string | undefined) }, deps: {
  environment?: Record<string, string | undefined>;
  read?: (workspaceId: string) => Promise<BusinessAiBudget | null>;
  reserve?: (workspaceId: string, maximumCostUsd: string, freeCapUsd: string | null) => Promise<BusinessAiReservation | null>;
} = {}): Promise<string | null> {
  const environment = deps.environment ?? process.env;
  if (environment.STRELVA_BUSINESS_AI_BUDGET !== "1" || !BUSINESS_PAID.has(context.purpose)) return null;
  if (!context.workspaceId) throw new ModelBudgetUnavailableError();
  const raw = await (deps.read ?? readBusinessAiBudget)(context.workspaceId).catch(() => null);
  const parsed = budgetSchema.safeParse(raw);
  if (!parsed.success) throw new ModelBudgetUnavailableError();
  const budget = parsed.data;
  const cap = businessAiCapUsd(budget, environment);
  // An uncapped paid relationship needs a valid entitlement read, not a known
  // dollar total. Unknown historical costs still prevent capped admission.
  if (cap === null) return null;
  if (budget.unknownCostCalls > 0) throw new ModelBudgetUnavailableError();
  const committed = Number(budget.spentUsd) + Number(budget.reservedUsd);
  if (committed >= cap) throw new ModelBudgetPausedError(committed, cap, environment);
  let maximumCostUsd: string | undefined;
  try { maximumCostUsd = typeof context.maximumCostUsd === "function" ? context.maximumCostUsd() : context.maximumCostUsd; }
  catch { throw new ModelBudgetUnavailableError(); }
  if (!decimal.safeParse(maximumCostUsd).success || Number(maximumCostUsd) <= 0) throw new ModelBudgetUnavailableError();
  const reservation = await (deps.reserve ?? reserveBusinessAiBudget)(
    context.workspaceId, maximumCostUsd!, budget.subscribed ? null : environment.STRELVA_FREE_MONTHLY_AI_CAP_USD ?? null,
  ).catch(() => null);
  const result = reservationSchema.safeParse(reservation);
  if (!result.success || result.data.budget.unknownCostCalls > 0) throw new ModelBudgetUnavailableError();
  if (result.data.status === "paused") {
    const current = result.data.budget;
    const currentCap = businessAiCapUsd(current, environment);
    if (currentCap === null) throw new ModelBudgetUnavailableError();
    throw new ModelBudgetPausedError(Number(current.spentUsd) + Number(current.reservedUsd), currentCap, environment);
  }
  if (!result.data.reservationId) throw new ModelBudgetUnavailableError();
  return result.data.reservationId;
}

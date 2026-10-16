import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import type { ModelCallPurpose } from "./model-call-log";
import { selfServeBillingConfig } from "@/platform/business-billing/workspace-checkout";
import { aiControlsReleaseEnabled, businessAiBudgetV2Enabled } from "./ai-controls-release";

/** Optional payer limit (ADR 0015). Platform work and public probes are exempt. */
export class ModelBudgetPausedError extends Error {
  constructor(readonly spentUsd: number, readonly capUsd: number, environment: Record<string, string | undefined> = process.env) {
    const open = selfServeBillingConfig(environment).enabled;
    // October 16 money decision: plans aren't open, so a business with nothing
    // included hears that plainly and is offered the waitlist, not a wall.
    const message = capUsd === 0
      ? open
        ? "Strelva can't take this on yet because this business has no plan. Nothing changed. Choose a plan on Plan and usage."
        : "Strelva can't take on new work for this business until plans open. Nothing changed. Put this business on the list for plans, or bring in an agency now."
      : `This month's Strelva work for this business is used up. Nothing changed. ${open ? "Choose a plan on Plan and usage." : "Bring in an agency to keep going."}`;
    super(message);
    this.name = "ModelBudgetPausedError";
  }
}

const resetDate = (resetsAt: string) => new Date(resetsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** An agency or Strelva operator paused Strelva work for this business. Still a budget pause to every existing catch. */
export class ModelAiPausedError extends ModelBudgetPausedError {
  constructor(readonly pausedBy: AiControlsState["setBy"], environment: Record<string, string | undefined> = process.env) {
    super(0, 0, environment);
    this.name = "ModelAiPausedError";
    this.message = pausedBy?.kind === "agency" && pausedBy.agencyName
      ? `${pausedBy.agencyName} paused Strelva work for this business. Nothing changed. Ask ${pausedBy.agencyName} to turn it back on.`
      : "Strelva work is paused for this business by a Strelva operator. Nothing changed.";
  }
}

/** The monthly limit an agency or operator set is reached. Names who set it and when the period resets. */
export class ModelAgencyCapReachedError extends ModelBudgetPausedError {
  constructor(spentUsd: number, capUsd: number, readonly setBy: AiControlsState["setBy"], readonly resetsAt: string, environment: Record<string, string | undefined> = process.env) {
    super(spentUsd, capUsd, environment);
    this.name = "ModelAgencyCapReachedError";
    const who = setBy?.kind === "agency" && setBy.agencyName ? setBy.agencyName : "A Strelva operator";
    this.message = `${who} set a monthly limit for Strelva work on this business, and this period's limit is reached. Nothing changed. It resets ${resetDate(resetsAt)}.`;
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
const budgetObject = z.object({
  spentUsd: decimal,
  reservedUsd: decimal,
  since: z.string().datetime({ offset: true }),
  resetsAt: z.string().datetime({ offset: true }),
  capCents: z.number().int().nonnegative().nullable(),
  subscribed: z.boolean(),
  unknownCostCalls: z.number().int().nonnegative(),
});
const resetsAfterSince = (budget: { since: string; resetsAt: string }) => Date.parse(budget.resetsAt) > Date.parse(budget.since);
const budgetSchema = budgetObject.strict().refine(resetsAfterSince);
export type BusinessAiBudget = z.infer<typeof budgetSchema>;
/** Per-client usage controls an agency or Strelva operator set (supabase business_ai_controls_state). */
export const aiControlsStateSchema = z.object({
  paused: z.boolean(),
  monthlyCapCents: z.number().int().min(0).nullable(),
  reviewAutoPost: z.enum(["client_choice", "held"]),
  revision: z.number().int().min(0),
  setBy: z.object({ kind: z.enum(["agency", "operator"]), agencyName: z.string().nullable() }).strict().nullable(),
  changedAt: z.string().nullable(),
}).strict();
export type AiControlsState = z.infer<typeof aiControlsStateSchema>;
const budgetV2Schema = budgetObject.extend({ controls: aiControlsStateSchema }).strict().refine(resetsAfterSince);
export type BusinessAiBudgetV2 = z.infer<typeof budgetV2Schema>;
const reservationSchema = z.object({
  status: z.enum(["reserved", "paused"]),
  reservationId: z.string().uuid().nullable(),
  budget: budgetSchema,
}).strict();
export type BusinessAiReservation = z.infer<typeof reservationSchema>;
const reservationV2Schema = z.object({
  status: z.enum(["reserved", "paused"]),
  reason: z.enum(["controls", "agency_cap", "cap"]).nullable(),
  reservationId: z.string().uuid().nullable(),
  budget: budgetV2Schema,
}).strict();
export type BusinessAiReservationV2 = z.infer<typeof reservationV2Schema>;

type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
export async function readBusinessAiBudget(workspaceId: string, client: Rpc | null = getSupabase() as unknown as Rpc | null, environment: Record<string, string | undefined> = process.env): Promise<(BusinessAiBudget & { controls?: AiControlsState }) | null> {
  if (!client) return null;
  const v2 = businessAiBudgetV2Enabled(environment);
  try {
    const { data, error } = await client.rpc(v2 ? "business_ai_budget_v2" : "business_ai_budget", { p_workspace_id: workspaceId });
    if (error) return null;
    const parsed = (v2 ? budgetV2Schema : budgetSchema).safeParse(data);
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

/** Same admission as reserveBusinessAiBudget, with the per-client controls and the ceiling's source. */
export async function reserveBusinessAiBudgetV2(workspaceId: string, maximumCostUsd: string, freeCapUsd: string | null, applyBaseCap: boolean, ceilingSource: "qualified" | "list_price", applyControls: boolean, client: Rpc | null = getSupabase() as unknown as Rpc | null): Promise<BusinessAiReservationV2 | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.rpc("reserve_business_ai_budget_v2", {
      p_workspace_id: workspaceId, p_maximum_cost_usd: maximumCostUsd, p_free_cap_usd: freeCapUsd,
      p_apply_base_cap: applyBaseCap, p_ceiling_source: ceilingSource, p_apply_controls: applyControls,
    });
    if (error) return null;
    const parsed = reservationV2Schema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

/**
 * Admit exactly one bounded provider attempt. The helper must bound the input,
 * output, retries and steps before passing maximumCostUsd, and carry the returned
 * reservation into that attempt's log rows. Missing bounds or unavailable state
 * pause capped work. Failed/unknown calls retain their full reservation until reset.
 */
export async function assertBusinessAiBudget(context: { purpose: ModelCallPurpose; workspaceId?: string | null; maximumCostUsd?: string | (() => string | undefined); ceilingSource?: "qualified" | "list_price" }, deps: {
  environment?: Record<string, string | undefined>;
  read?: (workspaceId: string) => Promise<(BusinessAiBudget & { controls?: AiControlsState }) | null>;
  reserve?: (workspaceId: string, maximumCostUsd: string, freeCapUsd: string | null) => Promise<BusinessAiReservation | null>;
  reserveV2?: (workspaceId: string, maximumCostUsd: string, freeCapUsd: string | null, applyBaseCap: boolean, ceilingSource: "qualified" | "list_price", applyControls: boolean) => Promise<BusinessAiReservationV2 | null>;
} = {}): Promise<string | null> {
  const environment = deps.environment ?? process.env;
  const budgetOn = environment.STRELVA_BUSINESS_AI_BUDGET === "1";
  const controlsOn = aiControlsReleaseEnabled(environment);
  const v2 = businessAiBudgetV2Enabled(environment);
  if (!BUSINESS_PAID.has(context.purpose)) return null;
  // Per-client controls apply even where no payer cap does.
  if (!budgetOn && !controlsOn) return null;
  if (!context.workspaceId) throw new ModelBudgetUnavailableError();
  const raw = await (deps.read ?? ((workspaceId: string) => readBusinessAiBudget(workspaceId, undefined, environment)))(context.workspaceId).catch(() => null);
  const parsed = v2 ? budgetV2Schema.safeParse(raw) : budgetSchema.safeParse(raw);
  if (!parsed.success) throw new ModelBudgetUnavailableError();
  const budget = parsed.data;
  const controls: AiControlsState | null = (budget as { controls?: AiControlsState }).controls ?? null;
  if (controlsOn && controls?.paused) throw new ModelAiPausedError(controls.setBy, environment);
  const baseCap = budgetOn ? businessAiCapUsd(budget, environment) : null;
  const agencyCap = controlsOn && controls && controls.monthlyCapCents !== null ? controls.monthlyCapCents / 100 : null;
  const cap = baseCap === null ? agencyCap : agencyCap === null ? baseCap : Math.min(baseCap, agencyCap);
  // An uncapped paid relationship needs a valid entitlement read, not a known
  // dollar total. Unknown historical costs still prevent capped admission.
  if (cap === null) return null;
  if (budget.unknownCostCalls > 0) throw new ModelBudgetUnavailableError();
  const committed = Number(budget.spentUsd) + Number(budget.reservedUsd);
  if (committed >= cap) {
    if (agencyCap !== null && agencyCap === cap) throw new ModelAgencyCapReachedError(committed, cap, controls!.setBy, budget.resetsAt, environment);
    throw new ModelBudgetPausedError(committed, cap, environment);
  }
  let maximumCostUsd: string | undefined;
  try { maximumCostUsd = typeof context.maximumCostUsd === "function" ? context.maximumCostUsd() : context.maximumCostUsd; }
  catch { throw new ModelBudgetUnavailableError(); }
  if (!decimal.safeParse(maximumCostUsd).success || Number(maximumCostUsd) <= 0) throw new ModelBudgetUnavailableError();
  const freeCap = budget.subscribed || !budgetOn ? null : environment.STRELVA_FREE_MONTHLY_AI_CAP_USD ?? null;
  if (v2) {
    const reservationV2 = await (deps.reserveV2 ?? reserveBusinessAiBudgetV2)(
      context.workspaceId, maximumCostUsd!, freeCap, budgetOn, context.ceilingSource ?? "qualified", controlsOn,
    ).catch(() => null);
    const outcome = reservationV2Schema.safeParse(reservationV2);
    if (!outcome.success || outcome.data.budget.unknownCostCalls > 0) throw new ModelBudgetUnavailableError();
    if (outcome.data.status === "paused") {
      const current = outcome.data.budget;
      const currentControls = current.controls;
      if (outcome.data.reason === "controls") throw new ModelAiPausedError(currentControls.setBy, environment);
      const spent = Number(current.spentUsd) + Number(current.reservedUsd);
      if (outcome.data.reason === "agency_cap") {
        const currentAgencyCap = currentControls.monthlyCapCents === null ? null : currentControls.monthlyCapCents / 100;
        if (currentAgencyCap === null) throw new ModelBudgetUnavailableError();
        throw new ModelAgencyCapReachedError(spent, currentAgencyCap, currentControls.setBy, current.resetsAt, environment);
      }
      const currentCap = businessAiCapUsd(current, environment);
      if (currentCap === null) throw new ModelBudgetUnavailableError();
      throw new ModelBudgetPausedError(spent, currentCap, environment);
    }
    if (!outcome.data.reservationId) throw new ModelBudgetUnavailableError();
    return outcome.data.reservationId;
  }
  const reservation = await (deps.reserve ?? reserveBusinessAiBudget)(
    context.workspaceId, maximumCostUsd!, freeCap,
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

/**
 * The three Strelva subscription tiers, mapped to their live Stripe prices.
 *
 * Env-overridable, with the live price IDs as fallback so the operator "Start
 * plan" flow works without extra env setup. Growth is the default (matches
 * STRIPE_SCAFFOLD_PRICE_ID, the self-serve default). These are Strelva's own
 * Stripe price objects — stable, not secret.
 */
import type { CommercialPlanKey } from "./types";

export type PlanKey = CommercialPlanKey;

export interface Plan {
  key: PlanKey;
  label: string;
  /** Monthly price in whole dollars, for display. */
  monthly: number;
  /** One-line description of what the tier is. */
  blurb: string;
  priceId: string;
}

export const PLANS: readonly Plan[] = [
  {
    key: "presence",
    label: "Presence",
    monthly: 99,
    blurb: "A custom one-page site that gets you found and drives the call.",
    priceId: process.env.STRIPE_PRICE_PRESENCE || "price_1TmeJNA4gUnh4arEMPCLKNor",
  },
  {
    key: "growth",
    label: "Growth",
    monthly: 199,
    blurb: "A full multi-page site where customers can book and buy.",
    priceId: process.env.STRIPE_PRICE_GROWTH || process.env.STRIPE_SCAFFOLD_PRICE_ID || "price_1TmeJmA4gUnh4arEuX0Sx3SH",
  },
  {
    key: "scale",
    label: "Scale",
    monthly: 499,
    blurb: "Everything in Growth plus a managed content engine and priority management.",
    priceId: process.env.STRIPE_PRICE_SCALE || "price_1TmeJwA4gUnh4arEk8464aqi",
  },
] as const;

export const DEFAULT_PLAN: PlanKey = "growth";

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && PLANS.some((plan) => plan.key === value);
}

export function planByKey(key: string | undefined): Plan {
  return PLANS.find((p) => p.key === key) ?? PLANS.find((p) => p.key === DEFAULT_PLAN)!;
}

export function planMonthlyCents(key: string | undefined): number {
  return planByKey(key).monthly * 100;
}

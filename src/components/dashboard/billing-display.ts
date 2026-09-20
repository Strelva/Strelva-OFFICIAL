export type DashboardSubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "none";

interface CurrentPlanDisplayInput {
  status: DashboardSubscriptionStatus;
  isFounderComp: boolean;
  commercialPlanLabel: string;
  commercialPlanMonthlyCents: number;
}

/**
 * Keep the plan line tied to the recorded subscription state. A plan fallback
 * is useful for an active legacy subscription, but it must not become a price
 * claim for an account with no connected subscription.
 */
export function getCurrentPlanDisplay(input: CurrentPlanDisplayInput): string {
  if (input.isFounderComp) return "Founder comp";
  if (input.status === "none") return "No subscription connected";
  if (input.status === "cancelled") return "No active subscription";

  const label = input.commercialPlanLabel.trim() || "Managed plan";
  const cents = Number.isFinite(input.commercialPlanMonthlyCents)
    ? input.commercialPlanMonthlyCents
    : 0;
  return cents > 0 ? `${label} · $${(cents / 100).toLocaleString()}/mo` : label;
}

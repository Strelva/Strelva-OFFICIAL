import { NextResponse } from "next/server";
import { getTenantConfig } from "./tenants";
import { getSubscriptionOverride } from "./storage";

type SubscriptionStatus = "active" | "past_due" | "cancelled" | "none";

export async function getEffectiveSubscriptionStatus(tenant: string): Promise<SubscriptionStatus> {
  const override = await getSubscriptionOverride(tenant);
  if (override) return override as SubscriptionStatus;

  const config = await getTenantConfig(tenant);
  return config?.subscriptionStatus ?? "none";
}

export async function requireActiveSubscription(tenant: string): Promise<NextResponse | null> {
  const status = await getEffectiveSubscriptionStatus(tenant);

  if (status === "cancelled") {
    return NextResponse.json(
      { error: "Subscription required", portalUrl: "/api/billing/portal" },
      { status: 402 }
    );
  }

  return null;
}

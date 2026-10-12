/**
 * The self-serve sale path (ADR 0015): a business with no agency and no tenant
 * starts its own workspace plan. Off unless STRELVA_SELF_SERVE_BILLING=1 and
 * both STRIPE_SECRET_KEY and STRELVA_WORKSPACE_PRICE_ID are set. The price is
 * Jacob's decision and lives only in that Stripe price; nothing here sets an
 * amount. Metadata carries what the existing webhook needs to record the
 * subscription and its allowance against the business and its payer.
 */
export interface SelfServeBillingConfig {
  enabled: boolean;
  priceId: string | null;
  /** A configured allowance key (STRELVA_WORK_ALLOWANCE_CONFIG), or "unavailable" until one is chosen. */
  allowanceConfigKey: string;
}

export function selfServeBillingConfig(environment: Record<string, string | undefined> = process.env): SelfServeBillingConfig {
  const priceId = environment.STRELVA_WORKSPACE_PRICE_ID?.trim() || null;
  const key = environment.STRELVA_WORKSPACE_ALLOWANCE_KEY?.trim();
  return {
    enabled: environment.STRELVA_SELF_SERVE_BILLING === "1" && Boolean(environment.STRIPE_SECRET_KEY) && Boolean(priceId && /^price_[A-Za-z0-9]+$/.test(priceId)),
    priceId: priceId && /^price_[A-Za-z0-9]+$/.test(priceId) ? priceId : null,
    allowanceConfigKey: key && /^[a-z0-9][a-z0-9_.-]{0,79}$/.test(key) ? key : "unavailable",
  };
}

/** The business pays for itself; the paying person is the owner who started the plan. */
export function workspaceCheckoutMetadata(input: { workspaceId: string; payerUserId: string; allowanceConfigKey: string }): Record<string, string> {
  return {
    workspaceId: input.workspaceId,
    payerId: input.payerUserId,
    payerKind: "business",
    allowanceConfigKey: input.allowanceConfigKey,
    planKey: "workspace",
    source: "self_serve",
  };
}

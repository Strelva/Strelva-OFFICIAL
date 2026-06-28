// The single live subscription price. Tiers (Presence $99 / Growth $199 /
// Scale $499) are packaging + build-scope, NOT code-enforced feature flags —
// there is one configured Stripe price (STRIPE_SCAFFOLD_PRICE_ID = Growth), so
// every current subscriber is charged this. If per-tier Stripe prices are added
// later, move this to a per-tenant price captured by the billing webhook.
export const SCAFFOLD_PLAN_MONTHLY_PRICE_CENTS = 19900;
export const SCAFFOLD_PLAN_MONTHLY_PRICE_DOLLARS = SCAFFOLD_PLAN_MONTHLY_PRICE_CENTS / 100;
export const SCAFFOLD_PLAN_MONTHLY_PRICE_CURRENCY = "usd";
export const SCAFFOLD_PLAN_MONTHLY_PRICE_LABEL = "$199/mo";
export const SCAFFOLD_PLAN_MONTHLY_PRICE_DESCRIPTION = "$199/month";

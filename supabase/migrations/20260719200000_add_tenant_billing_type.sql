-- Explicit per-tenant billing classification for managed clients. Replaces the
-- implicit/legacy plan_override='founder_comp' free flag (unused in prod) with a
-- first-class type the operator sets in the admin editor. Four states:
--   'tier'        -> on one of the 3 published tiers (subscription_plan holds which)
--   'custom'      -> we bill a negotiated monthly amount (plan_monthly_cents holds it)
--   'case_study'  -> free / comped (case study, grandfathered, beta)
--   'none'        -> not set up yet = a real open item to resolve
-- Nullable + no default so this is deploy-safe: old code ignores the column, new
-- code treats a missing/null value as 'none'. Reversible: drop the column.
alter table public.tenants
  add column if not exists billing_type text
  check (billing_type is null or billing_type in ('tier', 'custom', 'case_study', 'none'));

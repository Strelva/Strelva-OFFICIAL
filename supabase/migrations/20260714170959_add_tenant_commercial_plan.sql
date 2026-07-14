-- The commercial plan is tenant state, not an inference from feature flags or
-- portfolio-wide defaults. Existing paid tenants default to the historical
-- Growth amount until Stripe metadata confirms a different tier.
alter table public.tenants
  add column if not exists subscription_plan text,
  add column if not exists plan_monthly_cents integer,
  add column if not exists plan_currency text;

update public.tenants
set subscription_plan = coalesce(subscription_plan, 'growth'),
    plan_monthly_cents = coalesce(plan_monthly_cents, 19900),
    plan_currency = coalesce(plan_currency, 'usd')
where subscription_status in ('active', 'trialing', 'past_due')
  and plan_override is distinct from 'founder_comp';

alter table public.tenants
  add constraint tenants_subscription_plan_check
    check (subscription_plan is null or subscription_plan in ('presence', 'growth', 'scale')),
  add constraint tenants_plan_monthly_cents_check
    check (plan_monthly_cents is null or plan_monthly_cents >= 0),
  add constraint tenants_plan_currency_check
    check (plan_currency is null or plan_currency ~ '^[a-z]{3}$');

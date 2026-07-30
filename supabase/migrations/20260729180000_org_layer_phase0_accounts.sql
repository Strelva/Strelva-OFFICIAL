-- Org Layer Phase 0 — DORMANT schema for the account / multi-site model.
--
-- Introduces an "account" grouping ABOVE tenants (= sites) so one customer/payer
-- (e.g. Andy Anderson) can own multiple sites (CoCard + Vermont Unlimited) with
-- shared billing + access. EXPAND-ONLY and fully dormant: nothing reads these
-- tables yet, tenants.subscription_* stays authoritative, and a NULL
-- tenants.account_id = standalone / implicit-solo account (today's exact
-- behavior). Deploy-safe (old code ignores the new column/tables) and reversible
-- (drop them — see the companion rollback file). Design: vault
-- 1-projects/scaffold-web/org-layer-architecture.md.

-- 1) accounts — the customer relationship + payer (one Stripe customer per account)
create table if not exists public.accounts (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  primary_contact_name   text,
  primary_contact_email  text,
  phone                  text,
  stripe_customer_id     text unique,
  billing_email          text,
  status                 text not null default 'active'
                           check (status in ('active', 'paused', 'churned')),
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- 2) account_memberships — a user's access to an ACCOUNT; flows to all its sites.
--    (Direct per-tenant `memberships` stay for granular single-site access; the
--    access resolver becomes the UNION in a later phase.)
create table if not exists public.account_memberships (
  id          bigserial primary key,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  role        text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.users(id) on delete set null,
  unique (account_id, user_id)
);
create index if not exists account_memberships_account_role_idx
  on public.account_memberships (account_id, role);

-- 3) tenants.account_id — the grouping FK. NULLABLE: null = standalone/solo, so
--    every existing site behaves exactly as today. Routing/keys/RLS stay on the
--    tenant slug; this does NOT move them. on delete set null keeps a site alive
--    if its account row is removed.
alter table public.tenants
  add column if not exists account_id uuid references public.accounts(id) on delete set null;
create index if not exists tenants_account_id_idx on public.tenants (account_id);

-- 4) subscriptions — billing as a first-class object on the ACCOUNT: one Stripe
--    customer, one (bundleable) subscription that can cover N sites. During
--    migration tenants.subscription_status stays the authoritative MIRROR; a later
--    phase flips billing reads to here.
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  account_id             uuid not null references public.accounts(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_customer_id     text,
  status                 text,        -- mirrors Stripe: active/trialing/past_due/canceled
  plan                   text,
  amount_cents           integer,
  currency               text default 'usd',
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists subscriptions_account_idx on public.subscriptions (account_id);

-- 5) subscription_items — maps a bundled subscription's line items to sites, so a
--    single $350 sub = 2 items (cocard $199 + vermont $151). Each site's paid state
--    is derivable from its item's parent subscription status.
create table if not exists public.subscription_items (
  id              bigserial primary key,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  tenant_id       text not null references public.tenants(id) on delete cascade,
  stripe_price_id text,
  stripe_item_id  text,
  amount_cents    integer,
  created_at      timestamptz not null default now(),
  unique (subscription_id, tenant_id)
);
create index if not exists subscription_items_tenant_idx on public.subscription_items (tenant_id);

-- RLS: defense-in-depth ONLY. The control plane uses the service-role client which
-- BYPASSES RLS (same posture as tenants/memberships today), so these are not the
-- live enforcement boundary. Enable + deny-by-default now; read policies land in
-- the phase that turns on account-aware reads.
alter table public.accounts            enable row level security;
alter table public.account_memberships enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.subscription_items  enable row level security;

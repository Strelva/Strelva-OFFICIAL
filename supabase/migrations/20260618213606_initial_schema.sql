-- Strelva initial schema (migration foundation)
-- Mirrors the current control-plane data model (Sanity content + Redis
-- operational data + Clerk identity) as Postgres tables. See
-- docs/supabase-migration-plan.md for the mapping + phased plan.
--
-- TABLES ONLY in this migration. RLS policies are a SEPARATE later migration
-- (0002) because their shape depends on the auth decision (Supabase Auth vs
-- keep Clerk) — see plan Decision 2. Do not enable RLS until that's locked.

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ============================================================================
-- IDENTITY & ACCESS (today: Clerk users + publicMetadata roles + env allowlist)
-- ============================================================================

create table users (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  clerk_id    text unique,                 -- one-time migration bridge; drop after cutover
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);

create table tenants (
  id                          text primary key,           -- subdomain, e.g. "gldf"
  site_name                   text not null,
  owner_name                  text,
  owner_email                 text,
  owner_phone                 text,
  industry                    text,
  active                      boolean not null default true,
  created_at                  date not null default current_date,
  template                    text,
  delivery_model              text not null default 'custom_repo',
  production_domain           text,
  admin_domain                text,
  referred_by                 text,
  -- billing
  stripe_customer_id          text,
  stripe_subscription_id      text,
  subscription_status         text not null default 'none',
  subscription_started_at     timestamptz,
  subscription_past_due_since timestamptz,
  commitment_ends_at          timestamptz,
  plan_override               text,
  -- ai / automation
  auto_publish                boolean not null default true,
  auto_approve_threshold      integer,
  business_rules              text,
  personality                 text,
  business_hours              jsonb,
  -- integrations / delivery / features (config -> arrays/jsonb)
  features                    text[],
  integrations                text[],
  custom_domains              text[],
  booking_provider            text,
  booking_url                 text,
  resend_domain               text,
  site_url                    text,
  revalidate_url              text,
  revalidation_secret         text,
  custom_repo                 jsonb,
  visibility                  jsonb,
  site_capabilities           jsonb,
  branding                    jsonb,
  social_config               jsonb,
  reviews_config              jsonb,
  updated_at                  timestamptz not null default now()
);

-- user <-> tenant <-> role (today in Clerk publicMetadata.tenantRoles)
create table memberships (
  id          bigserial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  tenant_id   text not null references tenants(id) on delete cascade,
  role        text not null check (role in ('viewer','editor','admin','owner')),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references users(id) on delete set null,
  unique (user_id, tenant_id)
);
create index memberships_tenant_role_idx on memberships (tenant_id, role);

-- super-admins (today the SUPER_ADMIN_EMAILS env allowlist)
create table super_admins (
  user_id    uuid primary key references users(id) on delete cascade,
  email      text unique not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references users(id) on delete set null,
  revoked_at timestamptz
);

-- pending invites (today Redis reb:invites:{email}, 30d TTL)
create table invites (
  id         bigserial primary key,
  email      text not null,
  tenant_id  text not null references tenants(id) on delete cascade,
  role       text not null check (role in ('viewer','editor','admin','owner')),
  invited_by uuid references users(id) on delete set null,
  invited_at timestamptz not null default now(),
  claimed_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  unique (email, tenant_id)
);
create index invites_email_idx on invites (email) where claimed_at is null;

-- domain ownership + verification (today nested in tenant.domainClaims[])
create table domain_claims (
  tenant_id        text not null references tenants(id) on delete cascade,
  domain           text not null,
  role             text not null,          -- production | admin | additional
  status           text not null,          -- pending | verified | misconfigured | conflict | error
  dns_status       text,
  ssl_status       text,
  verification     text[],
  vercel_project_id text,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (tenant_id, domain)
);
create index domain_claims_status_idx on domain_claims (tenant_id, status);

-- ============================================================================
-- CONTENT (today: Sanity docs, Redis write-through cache)
-- One row per (tenant, section). JSONB keeps per-section shapes flexible.
-- ============================================================================

create table content (
  tenant_id  text not null references tenants(id) on delete cascade,
  section    text not null,                -- hero|services|story|...|theme|navigation|footer
  data       jsonb not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, section)
);

create table draft_content (
  tenant_id  text not null references tenants(id) on delete cascade,
  section    text not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, section)
);

create table page_config (
  tenant_id  text not null references tenants(id) on delete cascade,
  page_name  text not null,
  sections   jsonb not null,
  seo        jsonb,
  version    integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, page_name)
);

create table draft_page_config (
  tenant_id  text not null references tenants(id) on delete cascade,
  page_name  text not null,
  sections   jsonb not null,
  seo        jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, page_name)
);

-- audit trail + version history (today Sanity activityLog; snapshot = restore)
create table activity_log (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        text not null references tenants(id) on delete cascade,
  text             text,
  type             text,
  section          text,
  actor            text,                   -- user | ai | admin
  changes          jsonb,
  snapshot         jsonb,
  event_status     text,
  governance_reason text,
  risk_level       text,
  time             timestamptz not null,
  created_at       timestamptz not null default now()
);
create index activity_log_tenant_time_idx on activity_log (tenant_id, time desc);

-- ============================================================================
-- OPERATIONAL DATA (today: durable Redis keys -> Postgres tables)
-- ============================================================================

-- events queue (today events:{tenant} zset + event:{id}); drop the 90d TTL
create table unified_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references tenants(id) on delete cascade,
  source      text not null,
  type        text not null,
  title       text,
  body        text,
  status      text not null default 'pending',
  metadata    jsonb,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index unified_events_tenant_created_idx on unified_events (tenant_id, created_at desc);
create index unified_events_status_idx on unified_events (tenant_id, status);

-- weekly report payloads (today briefs:{tenant} zset)
create table weekly_briefs (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  text not null references tenants(id) on delete cascade,
  week_start date not null,
  week_end   date not null,
  stats      jsonb,
  sections   jsonb,
  created_at timestamptz not null default now()
);
create index weekly_briefs_tenant_created_idx on weekly_briefs (tenant_id, created_at desc);

-- every outbound email (today reb:maillog:{tenant} zset)
create table mail_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null references tenants(id) on delete cascade,
  kind            text not null,           -- weekly_report | daily_summary | invite | other
  ok              boolean not null,
  message_id      text,
  error           text,
  recipient_email text,
  ts              timestamptz not null default now()
);
create index mail_log_tenant_ts_idx on mail_log (tenant_id, ts desc);

-- dashboard chat (today threads:{tenant}:*)
create table chat_threads (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  text not null references tenants(id) on delete cascade,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_threads_tenant_updated_idx on chat_threads (tenant_id, updated_at desc);

create table chat_messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references chat_threads(id) on delete cascade,
  tenant_id    text not null references tenants(id) on delete cascade,
  role         text not null,              -- user | assistant
  content      text,
  tool_calls   jsonb,
  tool_results jsonb,
  created_at   timestamptz not null default now()
);
create index chat_messages_thread_idx on chat_messages (thread_id, created_at);

-- OAuth/API connections (today connections:{tenant}:{provider}) -- ENCRYPT tokens at rest
create table integrations (
  tenant_id      text not null references tenants(id) on delete cascade,
  provider       text not null,            -- google | instagram | yelp | calendly | vegaro
  access_token   text,
  refresh_token  text,
  expires_at     timestamptz,
  scopes         jsonb,
  last_synced_at timestamptz,
  data           jsonb,
  primary key (tenant_id, provider)
);

-- loyalty (today reb:rewards:{tenant}:*) -- real transactions fix the hincrby race
create table reward_members (
  tenant_id                   text not null references tenants(id) on delete cascade,
  email                       text not null,
  stars_available             numeric not null default 0,
  stars_lifetime              numeric not null default 0,
  tier                        text,
  tier_override               text,
  display_name                text,
  birthday                    text,
  favorite_fruit              text,
  badges                      jsonb,
  subscription_bonus_claimed  boolean not null default false,
  created_at                  timestamptz not null default now(),
  primary key (tenant_id, email)
);

create table reward_transactions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  text not null references tenants(id) on delete cascade,
  email      text not null,
  type       text not null,                -- earn | redeem | admin_credit | admin_debit
  amount     numeric not null,
  reason     text,
  created_at timestamptz not null default now()
);
create index reward_txns_member_idx on reward_transactions (tenant_id, email, created_at desc);

-- per-client pay links (today reb:paylink:{slug})
create table pay_links (
  slug        text primary key,
  client_name text not null,
  door        text not null,               -- build | managed_start
  tenant_id   text references tenants(id) on delete set null,
  lead_slug   text,
  amount_cents integer,
  min_cents   integer,
  max_cents   integer,
  custom_copy text,
  return_url  text,
  created_at  timestamptz not null default now(),
  created_by  text
);
create index pay_links_tenant_idx on pay_links (tenant_id, created_at desc);

-- completed one-time payments / revenue (today reb:build-payment:{sessionId})
create table build_payments (
  session_id     text primary key,
  pay_slug       text,
  lead_slug      text,
  tenant_id      text references tenants(id) on delete set null,
  amount_cents   integer not null,
  currency       text not null default 'usd',
  customer_email text,
  created_at     timestamptz not null default now()
);
create index build_payments_created_idx on build_payments (created_at desc);

-- pre-tenant prospects (today lead:{email} + leads:all)
create table delivery_leads (
  id                text primary key default gen_random_uuid()::text,
  email             text unique not null,
  business_name     text,
  description       text,
  location          text,
  phone             text,
  current_website   text,
  plan              text,                  -- one-time | monthly
  referred_by       text,
  status_token      text,
  delivery_status   text not null default 'received',
  submitted_at      timestamptz not null default now(),
  status_updated_at timestamptz not null default now()
);
create index delivery_leads_status_idx on delivery_leads (delivery_status, submitted_at desc);

-- AI auto-approve streaks (today reb:auto-approve:streak:{tenant})
create table auto_approval_streaks (
  tenant_id    text primary key references tenants(id) on delete cascade,
  streak_count integer not null default 0,
  updated_at   timestamptz not null default now()
);

-- operator SEO / site-health scans (today reb:scan:{tenant} + :hist:)
create table scan_results (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null references tenants(id) on delete cascade,
  url           text,
  overall_score integer,
  grade         text,
  categories    jsonb,
  scanned_at    timestamptz not null default now()
);
create index scan_results_tenant_idx on scan_results (tenant_id, scanned_at desc);

create table scan_history (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null references tenants(id) on delete cascade,
  overall_score integer,
  grade         text,
  scanned_at    timestamptz not null default now()
);
create index scan_history_tenant_idx on scan_history (tenant_id, scanned_at desc);

-- NOTE: ephemeral data (rate limits, locks, caches, heartbeats, alert dedup,
-- booking slot locks, proof-signal counters, portfolio summary) intentionally
-- STAYS in Upstash Redis. It is not modeled here.

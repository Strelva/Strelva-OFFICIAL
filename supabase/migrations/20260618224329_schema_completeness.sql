-- Strelva schema completeness pass (migration 0002)
-- Fills the durable-data gaps the storage-layer audit found vs migration 0001:
-- 8 missing tables + client chat + site traffic counters, plus a few columns.
-- All IF NOT EXISTS so it's idempotent and safe to re-run. Tables only, no RLS
-- (RLS is still 0003, pending the Clerk-vs-Supabase-Auth decision).

begin;

-- ---------------------------------------------------------------------------
-- Missing columns on existing tables
-- ---------------------------------------------------------------------------

-- tenant integration/config fields present in TenantConfig but omitted in 0001
alter table tenants add column if not exists behold_feed_id            text;
alter table tenants add column if not exists slack_webhook_url         text;  -- secret-ish: encrypt later
alter table tenants add column if not exists google_search_console_key text;  -- service-account JSON: encrypt later
alter table tenants add column if not exists instagram_access_token    text;  -- secret: encrypt later

-- connection state (Connection.status / yelp uses apiKey not OAuth)
alter table integrations add column if not exists status  text not null default 'disconnected';
alter table integrations add column if not exists api_key text;

-- the weekly brief (0001) and the sent weekly report are one logical thing;
-- carry the report-store fields so this table serves both.
alter table weekly_briefs add column if not exists page_views     jsonb;
alter table weekly_briefs add column if not exists booking_clicks jsonb;
alter table weekly_briefs add column if not exists top_services   jsonb;
alter table weekly_briefs add column if not exists stale_sections jsonb;
alter table weekly_briefs add column if not exists summary        text;

-- ---------------------------------------------------------------------------
-- Missing durable tables
-- ---------------------------------------------------------------------------

-- customer reservations (today Sanity booking docs; Redis only holds slot locks)
create table if not exists bookings (
  id           text primary key,
  tenant_id    text not null references tenants(id) on delete cascade,
  service_id   text not null,
  service_name text not null,
  date         date not null,
  start_time   text not null,                 -- "HH:MM"
  end_time     text not null,
  client_name  text not null,
  client_email text not null,
  client_phone text not null,
  notes        text,
  status       text not null,                 -- confirmed | cancelled | completed
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz
);
create index if not exists bookings_tenant_date_idx on bookings (tenant_id, date desc);

-- newsletter subscriber list (today Sanity newsletterSubscriber docs)
create table if not exists newsletter_subscribers (
  tenant_id     text not null references tenants(id) on delete cascade,
  email         text not null,
  name          text,
  subscribed_at timestamptz not null default now(),
  status        text not null default 'active',  -- active | unsubscribed
  primary key (tenant_id, email)
);
create index if not exists newsletter_subscribers_status_idx on newsletter_subscribers (tenant_id, status);

-- full-site backups for restore (today Sanity siteSnapshot docs)
create table if not exists site_snapshots (
  id                   text primary key,
  tenant_id            text not null references tenants(id) on delete cascade,
  label                text not null,
  reason               text not null,        -- manual|daily|pre_restore|self_serve_created|system
  author               text not null,        -- user|ai|admin|system
  sections             text[] not null,
  data                 jsonb not null,       -- Partial<ContentMap>
  status               text not null,        -- available | restored
  restored_at          timestamptz,
  actor_user_id        uuid references users(id) on delete set null,
  actor_email          text,
  actor_type           text,
  actor_is_super_admin boolean,
  created_at           timestamptz not null default now()
);
create index if not exists site_snapshots_tenant_created_idx on site_snapshots (tenant_id, created_at desc);

-- per-section version history (today Sanity contentVersion docs)
create table if not exists content_versions (
  id         text primary key,
  tenant_id  text not null references tenants(id) on delete cascade,
  section    text not null,
  data       jsonb not null,
  author     text not null,                  -- user | ai | admin
  status     text not null,                  -- live | rolled-back
  changes    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists content_versions_section_idx on content_versions (tenant_id, section, created_at desc);

-- social drafts/scheduled/published (today Sanity socialPost docs)
create table if not exists social_posts (
  id            text primary key,
  tenant_id     text not null references tenants(id) on delete cascade,
  platform      text not null,               -- instagram | facebook | x
  content       text not null,
  image_url     text,
  status        text not null,               -- draft | scheduled | published
  scheduled_for timestamptz,
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists social_posts_tenant_status_idx on social_posts (tenant_id, status, created_at desc);

-- Google Search Console sync (today Sanity searchData docs)
create table if not exists search_console_data (
  tenant_id         text primary key references tenants(id) on delete cascade,
  queries           jsonb not null,          -- [{ query, clicks, impressions, position }]
  total_clicks      integer not null default 0,
  total_impressions integer not null default 0,
  fetched_at        timestamptz not null default now()
);

-- operator action audit trail (today Sanity auditLog docs) -- distinct from activity_log
create table if not exists audit_logs (
  id                   text primary key,
  tenant_id            text not null references tenants(id) on delete cascade,
  action               text not null,
  target_type          text not null,
  target_id            text,
  time                 timestamptz not null,
  actor_user_id        uuid references users(id) on delete set null,
  actor_email          text,
  actor_type           text,
  actor_is_super_admin boolean not null default false,
  metadata             jsonb,
  created_at           timestamptz not null default now()
);
create index if not exists audit_logs_tenant_time_idx on audit_logs (tenant_id, time desc);
create index if not exists audit_logs_time_idx on audit_logs (time desc);

-- dashboard inbox notifications (today Sanity inboxItem docs)
create table if not exists inbox_items (
  id         text primary key,
  tenant_id  text not null references tenants(id) on delete cascade,
  type       text not null,                  -- ai-action|suggestion|review-alert|booking|subscriber|system
  title      text not null,
  detail     text,
  section    text,
  read       boolean not null default false,
  actions    jsonb,
  time       timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists inbox_items_tenant_read_idx on inbox_items (tenant_id, read, time desc);

-- client-facing chat widget sessions (today Sanity chatSession docs; reb:chat:* is cache)
-- distinct from chat_threads/chat_messages, which are the dashboard agent chat.
create table if not exists chat_sessions (
  tenant_id  text not null references tenants(id) on delete cascade,
  client_id  text not null,
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, client_id)
);

-- site traffic counters: the "N people found you this week" data behind the
-- weekly report (today Redis click counters in analytics-store). Mirrors the
-- per-day, per-metric counter model. metric = page-view | booking-click |
-- booking-click:<serviceId>.
create table if not exists site_metrics (
  tenant_id text not null references tenants(id) on delete cascade,
  metric    text not null,
  day       date not null,
  count     integer not null default 0,
  primary key (tenant_id, metric, day)
);
create index if not exists site_metrics_tenant_day_idx on site_metrics (tenant_id, day desc);

commit;

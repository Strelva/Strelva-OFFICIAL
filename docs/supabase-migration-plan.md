# Strelva → Supabase Migration Plan

**Status:** Draft for Noah + Jacob alignment. No code moved yet.
**Decision (Noah, 2026-06-18):** move the platform's data + auth backbone onto Supabase while it's cheap to do (3 clients, billing off).
**Author:** mapped from a full read of `main` (the live control plane).

## Why (the two smells this fixes)

The live stack is Clerk (auth) + Sanity (content) + Upstash Redis (everything operational) + Vercel Blob. It works, but for a *multi-tenant* platform it has two real problems:

1. **Tenant isolation is enforced only in application code.** The entire audit-and-hardening arc was about making sure tenant A can't see tenant B, line by line, in route handlers. Sanity and Redis have no row-level security. One bad future change reopens it. **Postgres Row-Level Security (RLS) makes isolation a database guarantee instead of a code discipline.** This is the single biggest reason to move.
2. **Durable business data lives in Redis.** Bookings, rewards balances, events, pay-links, leads, the weekly-report data: relational business data sitting in a cache-first key-value store. No real queries/joins/reporting, weaker durability, and the audit found atomicity bugs there. Postgres is the right home for it.

Bonus: it collapses **Clerk + Sanity + Upstash + Vercel Blob (4 vendor logins)** toward **one Supabase platform** Noah owns and understands.

## Target stack

| Layer | Today | Target |
|---|---|---|
| Auth / users / sessions | Clerk | **Supabase Auth** |
| Tenant isolation | app code | **Postgres RLS** (the win) |
| Durable business data | Redis | **Supabase Postgres** |
| Content (source of truth) | Sanity | **Postgres (JSONB)**, or keep Sanity short-term (see Decision 1) |
| Cache / locks / rate-limits / hot ephemeral | Redis | **keep Upstash Redis** (demoted to what it's good at) |
| Image storage | Vercel Blob | **Supabase Storage** |
| Hosting, billing, email, errors, AI, DNS | Vercel / Stripe / Resend / Sentry / Gemini / Cloudflare | **unchanged** |

---

## Proposed Postgres schema

Everything tenant-scoped carries `tenant_id` and gets an RLS policy. `auth.uid()` is the Supabase-Auth user id in policies.

### Identity & access (replaces Clerk metadata)

```sql
-- Users mirror Supabase Auth; clerk_id is a one-time migration bridge.
create table users (
  id uuid primary key default auth.uid(),
  email text unique not null,
  clerk_id text unique,           -- drop after cutover
  verified_at timestamptz,
  created_at timestamptz default now()
);

-- The user <-> tenant <-> role mapping that today lives in Clerk publicMetadata.
create table memberships (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  tenant_id text not null references tenants(id) on delete cascade,
  role text not null check (role in ('viewer','editor','admin','owner')),
  assigned_at timestamptz default now(),
  assigned_by uuid,
  unique (user_id, tenant_id)
);
create index on memberships (tenant_id, role);   -- fast "owners of tenant X"

-- Super-admins (today an env allowlist SUPER_ADMIN_EMAILS); table = runtime-editable.
create table super_admins (
  user_id uuid primary key references users(id) on delete cascade,
  email text unique not null,
  granted_at timestamptz default now(),
  revoked_at timestamptz
);

-- Pending invites (today Redis reb:invites:{email}, 30d TTL).
create table invites (
  id bigserial primary key,
  email text not null,
  tenant_id text not null references tenants(id) on delete cascade,
  role text not null check (role in ('viewer','editor','admin','owner')),
  invited_by uuid references users(id) on delete set null,
  invited_at timestamptz default now(),
  claimed_at timestamptz,
  expires_at timestamptz default now() + interval '30 days',
  unique (email, tenant_id)
);
```

**Role model (preserve exactly):** `viewer(0) < editor(1) < admin(2) < owner(3)`. Permissions: `tenant:read`(viewer), `content:write`+`settings:write`(editor), `domains:manage`+`billing:manage`+`team:manage`+`publishing:manage`(owner). **Invariants that MUST survive the migration:** verified-email-only gate (no role/super-admin granted on an unverified email), and the last-owner guard (a tenant can never reach 0 owners).

### Tenants & content

```sql
create table tenants (
  id text primary key,                  -- subdomain, e.g. "gldf"
  site_name text not null,
  owner_name text, owner_email text, owner_phone text, industry text,
  active boolean not null default true,
  created_at date not null,
  template text, delivery_model text default 'custom_repo',
  production_domain text, admin_domain text, referred_by text,
  -- billing
  stripe_customer_id text, stripe_subscription_id text,
  subscription_status text default 'none',
  subscription_started_at timestamptz, subscription_past_due_since timestamptz,
  commitment_ends_at timestamptz, plan_override text,
  -- ai/automation
  auto_publish boolean default true, auto_approve_threshold int,
  business_rules text, personality text, business_hours jsonb,
  -- integrations / delivery / features (low-cardinality config -> jsonb/arrays)
  features text[], integrations text[], custom_domains text[],
  booking_provider text, booking_url text, resend_domain text, site_url text,
  revalidate_url text, revalidation_secret text,
  custom_repo jsonb, visibility jsonb, site_capabilities jsonb,
  branding jsonb, social_config jsonb, reviews_config jsonb
);

-- Domain ownership + verification (today nested in tenant.domainClaims[]).
create table domain_claims (
  domain text not null,
  tenant_id text not null references tenants(id) on delete cascade,
  role text not null,                   -- production | admin | additional
  status text not null,                 -- pending | verified | misconfigured | conflict | error
  dns_status text, ssl_status text,
  verification text[], vercel_project_id text, error text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  primary key (tenant_id, domain)
);

-- Content: one row per (tenant, section). JSONB keeps the per-section shapes
-- (hero/services[]/events[]/...) flexible; published + draft are one coherent blob.
create table content (
  tenant_id text not null references tenants(id) on delete cascade,
  section text not null,                -- hero|services|story|...|theme|navigation|footer
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz default now(),
  primary key (tenant_id, section)
);
create table draft_content (like content including all);   -- same shape, unpublished
create table page_config (
  tenant_id text not null references tenants(id) on delete cascade,
  page_name text not null,
  sections jsonb not null, seo jsonb,
  version int not null default 1, updated_at timestamptz default now(),
  primary key (tenant_id, page_name)
);
create table draft_page_config (like page_config including all);

-- Audit trail + version history (today Sanity activityLog; snapshot enables restore).
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references tenants(id) on delete cascade,
  text text, type text, section text, actor text,           -- user|ai|admin
  changes jsonb, snapshot jsonb,
  event_status text, governance_reason text, risk_level text,
  time timestamptz not null, created_at timestamptz default now()
);
create index on activity_log (tenant_id, time desc);
```

### Operational data (move OUT of Redis into Postgres)

These are the durable Redis keys today. All tenant-scoped get `tenant_id` + RLS.

| Table | From Redis key | Holds |
|---|---|---|
| `unified_events` | `events:{tenant}` zset + `event:{id}` | the event log (reviews, bookings, mentions, AI actions, change requests). drop the 90d TTL, keep history |
| `weekly_briefs` | `briefs:{tenant}` zset | the weekly report payloads (stats + sections) |
| `mail_log` | `reb:maillog:{tenant}` zset | every outbound email (ok/messageId/error) |
| `chat_threads` + `chat_messages` | `threads:{tenant}:*` | dashboard chat history |
| `integrations` | `connections:{tenant}:{provider}` | OAuth tokens (encrypt at rest) |
| `reward_members` + `reward_transactions` | `reb:rewards:{tenant}:*` | loyalty balances + ledger (the hincrby atomicity bug goes away with a real transaction) |
| `pay_links` | `reb:paylink:{slug}` + index | per-client pay links |
| `build_payments` | `reb:build-payment:{sessionId}` | completed one-time payments (revenue) |
| `delivery_leads` | `lead:{email}` + `leads:all` | pre-tenant prospects + delivery status |
| `auto_approval_streaks` | `reb:auto-approve:streak:{tenant}` | the AI auto-approve counter |
| `scan_results` + `scan_history` | `reb:scan:{tenant}` + `:hist:` | operator SEO/site-health scans |

### What STAYS in Redis (genuinely ephemeral — do not migrate)

Rate limits (`reb:ratelimit:*`), locks (`event-lock:*`, pay-link SET NX, booking slot locks `reb:booking:slot:*`), all caches (`reb:content:*`, `reb:tenants:all`, `reb:domain-map`, chat hot cache), heartbeats (`reb:heartbeat:*`), alert dedup/counters (`reb:alert-*`), proof-signal day counters, the portfolio summary (recompute or cache). Redis stays — just demoted from "system of record" to "hot/ephemeral layer."

### RLS shape (the point of all this)

```sql
alter table content enable row level security;
-- a member of the tenant can read; super-admins see all
create policy content_read on content for select using (
  exists (select 1 from memberships m where m.tenant_id = content.tenant_id and m.user_id = auth.uid())
  or exists (select 1 from super_admins s where s.user_id = auth.uid() and s.revoked_at is null)
);
-- writes gated to editor+; same pattern with a role check
```
Every tenant-scoped table gets the same shape. Tenant isolation stops being something we audit and becomes something the database enforces.

---

## Phased migration (safe, reversible, no big-bang)

The order matters: **data first, auth last** (auth is the riskiest because it touches live sessions).

- **Phase 0 — Schema.** Get Noah into the Supabase project. Apply the schema above as `supabase/migrations/`. Add `@supabase/supabase-js` + a server client. No app behavior change yet.
- **Phase 1 — Backfill (read-only).** One-time scripts copy current Redis + Sanity data into Postgres. Verify counts match. App still reads/writes the old stores.
- **Phase 2 — Dual-write the operational data.** Each durable subsystem (events, rewards, pay-links, leads, mail-log, …) writes to BOTH Redis and Postgres, reads from Postgres with a Redis fallback. Roll out subsystem by subsystem (the storage layer is already cleanly abstracted in `src/lib/storage/*` and `src/lib/events.ts`, so this is per-module, not a rewrite). Bake each for a few days, then drop the Redis write.
- **Phase 3 — Content.** Either move content into the `content`/`page_config` tables (kills the Sanity dependency) or keep Sanity and only mirror for RLS — see Decision 1. Reuse the snapshot/restore + draft machinery as-is.
- **Phase 4 — Auth (the careful one).** Migrate Clerk → Supabase Auth. Export Clerk users → `users`; export `publicMetadata.tenantRoles` → `memberships`; `SUPER_ADMIN_EMAILS` → `super_admins`; Redis invites → `invites`. Cut `auth.protect()` / `isSuperAdmin()` / `hasTenantAccess()` over to Supabase + the membership tables behind a flag, Clerk as fallback during rollout. **This logs users out once** (new session system) — fine at 3 clients, schedule it. Preserve the verified-email gate + last-owner guard exactly.
- **Phase 5 — Turn on RLS + decommission.** Enable RLS policies (the payoff), confirm isolation with tests, then retire the Redis durable keys, Clerk, and (if Decision 1 says so) Sanity. Redis stays for the ephemeral layer.

## Effort / risk

- **Phases 0-1** (schema + backfill): days. Low risk, fully reversible.
- **Phase 2** (dual-write operational): the bulk of the work, but incremental and safe — each subsystem is independent.
- **Phase 4** (auth): highest risk, but small blast radius now (3 clients, one scheduled logout). This is exactly why doing it *now* is right; at 50 clients it's a nightmare.
- This is a multi-week migration done in safe increments, not a weekend rewrite. Nothing forces a big-bang cutover.

## Open decisions (Noah + Jacob)

1. **Sanity: keep or kill?** Content could move fully into Postgres JSONB (one less vendor, content under RLS), or Sanity stays for its editing/versioning UX (the AI agent is built around it). Recommend: move it to Postgres for the consolidation win, *unless* Jacob is relying on Sanity Studio for manual edits.
2. **Auth: Supabase Auth vs keep Clerk.** Supabase Auth + RLS is the tight combo and one less vendor. Clerk's multi-host login (tenant subdomains, custom admin domains) is genuinely slicker and already built. This is the one swap worth debating — if the multi-host auth is painful to replicate, keep Clerk and still move data to Postgres (RLS then keys off a Clerk-JWT claim instead of `auth.uid()`).
3. **Token encryption.** `integrations` holds OAuth access/refresh tokens. Encrypt at rest (pgcrypto or app-level) — don't store them plaintext in Postgres.
4. **The orphaned Supabase project** (`zthifbnrtsirdekzzlxs`): use it as the target, or start a fresh project in an org Noah owns? Check what's in it first.

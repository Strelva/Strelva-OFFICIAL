# Strelva → Supabase Migration Plan

**Status: historical migration record. Migration is COMPLETE in production.**

Supabase Auth replaced Clerk (cutover 2026-06-20; Clerk code fully removed 2026-07-11, PR #146).
Supabase Postgres replaced Sanity and is the source of truth for identity, tenant config,
content, collections, drafts, audit, and activity (Sanity data-source code removed 2026-07-10).
The Clerk dual-path in `auth.ts` and `proxy.ts` is gone; `@clerk/nextjs` is not in `package.json`.

Do not use the dated “today,” “NOT yet done,” or rollback statements below as current state.
Current architecture is in `AGENTS.md`, `persistence-boundaries.md`, and
`auth-tenancy-architecture.md`.

Remaining ops-only tail (not a migration blocker):
- Rewrite legacy Sanity image-asset refs in Postgres `content` rows to Vercel Blob URLs
- Lock the Sanity `production` dataset
- Delete `src/lib/sanity.ts` + `@sanity/image-url` dep + `cdn.sanity.io` CSP entries
- See `clerk-sanity-teardown-checklist.md` “Known issues / TODO” for the full open list

**Known issues / TODO (audit findings, as of 2026-07-30):**
- [HIGH/bug] `google-meta:${t}`, `review-replies:recent:${t}`, `reb:review-nudge-sent:${t}`,
  `reb:order-review-request-sent:${t}:*`, and `reb:review-reply-declined:${t}:*` are NOT in
  the `authoritativePatterns` registry in `src/lib/tenant-rename.ts` — these keys are
  silently NOT moved on a tenant rename, causing silent data loss for GBP meta, review-nudge
  dedup state, and the 180-day declined-reply veto. Add them to the registry.
- [HIGH/bug] `SECRETS_ENC_KEY` missing env causes full platform outage via unguarded throw in
  `loadTenants` (`src/lib/tenants.ts:205-208`). The key removal risk is unguarded. Add
  `SECRETS_ENC_KEY` to the production readiness checklist and add per-row try/catch in
  `loadTenants` so one bad row does not kill all tenants.
- [MEDIUM/tech-debt] `database.types.ts` is stale — `billing_type` and `account_id` columns
  are missing from generated Row types (`src/lib/tenants.ts:65-66` casts around it). Run
  `supabase gen types typescript --project-id <id>` and commit; add a CI staleness check.
- [MEDIUM/security] `reb:tenants:all` Redis cache stores decrypted (plaintext) secrets
  (`src/lib/tenants.ts:206-210`). The `SECRETS_ENC_KEY` at-rest boundary is the 60s
  window; acceptable, but document explicitly.
- [HIGH/security] `SECRETS_ENC_KEY` and `SUPABASE_URL` (private service-role URL, not the
  same as `NEXT_PUBLIC_SUPABASE_URL`) are both missing from `.env.example`,
  `.env.production.example`, and the production checklist. Add both.
- [LOW/bug] Two independent source flags (`CONTENT_SOURCE` for content-store, `DATA_SOURCE`
  for draft-store and operational stores) with no documented relationship. Add a runtime
  guard to `dataSourceIsPostgres()` that fails loudly in `VERCEL_ENV=production` when unset,
  matching the `contentSourceIsPostgres()` guard. Document the intended relationship.

---

**Decision (Noah, 2026-06-18):** move the platform's data + auth backbone onto Supabase while it's cheap to do (3 clients, billing off).
**Decision (Noah, 2026-06-19):** auth is **Supabase Auth** (Decision 2 LOCKED). The hedge to keep Clerk was entirely about user-migration risk; a live read of the Clerk instance settled it — **one user (Jacob), Google-OAuth only, no passwords, zero orgs** → re-onboarding risk is nil. RLS keys off `auth.uid()`; `rls-draft.sql` Variant B (Clerk-JWT) deleted. See "Auth swap" below.
**Author:** mapped from a full read of `main` (the live control plane).

## Progress (2026-06-18)

- **Target project:** `scaffold-web` / `zthifbnrtsirdekzzlxs` in the `websites` Supabase org (was a near-empty stub — one `reb_json_documents` table). Resolves Decision 4.
- **Schema APPLIED:** `supabase/migrations/0001` (initial, 26 tables) + `0002` (completeness, +10 tables) → **36 tables live**, migration history reconciled, both committed (`feat/supabase-foundation` branch). Tables only — **no RLS yet** (it's `0003`, pending the auth decision below).
- **How it's applied:** migration file → Supabase Management API query endpoint with a PAT (the CLI `db push` was blocked by Docker-not-running + a `.env.local` parse bug; the MCP couldn't see the `websites` org). That's the working loop until proper MCP/CLI access is sorted.
- **Phase 4 progress (2026-06-19, build session):** auth-client foundation + identity data layer + the `auth.ts` dual-path rewrite are DONE and green (typecheck + lint + **919 tests**). All additive + flag-gated — **the live app is still 100% Clerk** (Supabase path activates only when `NEXT_PUBLIC_SUPABASE_*` env is set):
  - `src/lib/db/server-client.ts` (request-scoped user-JWT client, `getSessionUser()`, `isSupabaseAuthConfigured()` flag) + `browser-client.ts`.
  - `src/lib/db/repositories.ts` — identity repos (`users`/`memberships`/`super_admins`/`invites`); `listTenantOwnerIds` replaces the paginated Clerk owner scan.
  - `src/lib/auth.ts` — every request-context fn branches on the flag → Supabase path via repos, else Clerk UNCHANGED. Invariants preserved + tested on the Supabase path (`auth-supabase-path.test.ts`, 9 tests): verified-email gate + last-owner guard.
- **DATA + PROVISIONING DONE (2026-06-19, via Management API — verified):**
  - **tenants** backfilled from Sanity → 4 rows (gldf, rohlax, jacobtest, demo).
  - **content** backfilled from Sanity → 39 rows (gldf 12, demo 12, rohlax 9, jacobtest 6). 6 stale `rohlax-wellness`-slug docs skipped (FK-safe; legacy orphans to clean in Sanity). `pageConfig` docs are empty stubs — nothing to backfill.
  - **auth-provisioning trigger** live (`supabase/migrations/20260619120000_auth_provisioning_trigger.sql`): `handle_new_user()` on `auth.users` insert → creates `public.users` (id = auth uid), bootstraps super-admins by email (`super_admin_bootstrap` seeded with rhinehart514@ + noahowsh@), claims invites → memberships. Replaces the Clerk webhook. This is the provisioning model — natural first sign-in provisions everything; no pre-created accounts, no OAuth-linking risk.
  - `.env.local` has the service-role creds (backfill/scripts); the public/auth-flipping keys are present but COMMENTED until sign-in is wired.
- **AUTH PATH BUILT + RUNTIME-VERIFIED (2026-06-19):** Supabase sign-in flow (`SupabaseSignIn` Google+magic-link, `/auth/callback`) + `proxy.ts` dual-path gate (`gateRequest`/`middleware-client.ts`). Dev-server test (Supabase on, bypass off): protected routes 307→/sign-in, public 200, Supabase UI renders. 919 tests + typecheck + lint green.
- **RLS APPLIED + VERIFIED (2026-06-19, Phase 5):** `supabase/migrations/20260619140000_rls.sql` live on scaffold-web — 35 tables, 36 policies, no lockout gaps, perf rules folded in. **Tenant isolation proven with real JWTs:** gldf member sees only gldf, no-access user sees nothing, super-admin sees all 4. Note: the app's *data reads still use the service-role client* (bypasses RLS) — RLS is the proven backstop for when user-facing reads move to the user-JWT client (future data-layer work). Tenant isolation today still rides on the service-role discipline (Plane 3).
- **CONTENT → POSTGRES (Phase 3) DONE + read-verified (2026-06-19):** `getContent`/`setContent` use the Postgres `content` table behind `CONTENT_SOURCE=postgres` (Sanity fallback on miss; `transformSanityImages` keeps image parity). Read proven: planted a marker in the gldf hero row, served it through `/api/v1/content/gldf/hero` while Sanity held the original. The 39 backfilled rows are now servable. Follow-ups: `page_config` (empty stubs), drafts, versions, and the Phase-2 operational dual-write (events/leads/etc. repos exist in `repositories.ts` but aren't wired into the app yet).
- **COMPLETED (2026-06-20 prod flip; 2026-07-10 Sanity code removed; 2026-07-11 Clerk removed):**
  The live app runs on Supabase Auth + Supabase Postgres. Clerk is fully removed. All Sanity
  data-source code is removed (residual is `src/lib/sanity.ts` image resolver only). User-facing
  reads still use the service-role client (RLS is defense-in-depth, not the live boundary — per
  AGENTS.md). The `isSupabaseAuthConfigured()` dual-path flag is gone; `auth.ts` is Supabase-only.

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
- **Phase 3 — Content (Decision 1 LOCKED: move into Postgres, kill Sanity).** Backfill the `content`/`page_config`/`draft_content`/`content_versions`/`site_snapshots` tables from the Sanity dataset, then flip `src/lib/storage/*-store.ts` from the Sanity impl to Postgres (same dual-write-then-cut pattern as Phase 2 — the store abstraction makes it per-module, not a rewrite). Move the 10 Sanity images to Vercel Blob. Map the two non-content types (`suggestion`, `review`). Reuse snapshot/restore + draft machinery as-is. Decommission: `/studio` route, `sanity`/`next-sanity`/`@sanity/*` deps, the `api/sanity/webhook` route.
- **Phase 4 — Auth (the careful one).** Migrate Clerk → Supabase Auth. Export Clerk users → `users`; export `publicMetadata.tenantRoles` → `memberships`; `SUPER_ADMIN_EMAILS` → `super_admins`; Redis invites → `invites`. Cut `auth.protect()` / `isSuperAdmin()` / `hasTenantAccess()` over to Supabase + the membership tables behind a flag, Clerk as fallback during rollout. **This logs users out once** (new session system) — fine at 3 clients, schedule it. Preserve the verified-email gate + last-owner guard exactly.
- **Phase 5 — Turn on RLS + decommission.** Enable RLS policies (the payoff), confirm isolation with tests, then retire the Redis durable keys, Clerk, and (if Decision 1 says so) Sanity. Redis stays for the ephemeral layer.

## Auth swap (Clerk → Supabase Auth) — Phase 4 detail

Decision LOCKED 2026-06-19 (Supabase Auth, `auth.uid()`). The *data* migration is trivial — **1 Clerk user, Google-only, no password hashes to export**. The *code* swap is the real work: **21 files import `@clerk/nextjs`** (13 app + 8 tests). The identity logic itself is small and well-isolated (`src/lib/auth.ts`, 427 lines) — the cost is breadth, not depth.

### Identity port (one-time, near-empty)
- **Users:** one row. Insert Jacob into `users` (his Google email, `verified_at = now()`). `clerk_id` bridge column can even stay null — there's nothing to reconcile against.
- **Super-admins:** today the `SUPER_ADMIN_EMAILS` env allowlist → seed `super_admins` from it (one or two rows).
- **Memberships:** today Jacob's Clerk `publicMetadata.tenantRoles` (`{ jacobtest: "owner" }`) → one `memberships` row. Real client owners (GLDF, Rohlax, RHM) get seeded the same way from their current metadata when they're created in Postgres.
- **Invites:** Redis `reb:invites:{email}` → `invites` table (Phase-1 backfill; likely empty/near-empty).

### API mapping (what each Clerk call becomes)
| Clerk (today) | Supabase (target) | Notes |
|---|---|---|
| `auth()` → `{ userId }` (server) | `createServerClient(@supabase/ssr)` + `supabase.auth.getUser()` | `getUser()` re-validates the JWT server-side (don't trust `getSession()` alone for authz). |
| `currentUser()` + `publicMetadata` | `getUser()` for identity; **roles now come from `memberships`/`super_admins`, not the user object** | This is the conceptual shift: role data leaves the token and lives in Postgres. |
| verified-email gate (`emailAddresses[].verification.status`) | `user.email_confirmed_at` / identity provider | Google OAuth = provider-verified. **Preserve the invariant: never grant a role/super-admin on an unverified email.** |
| `clerkClient().users.getUserList()` paginated, in `getTenantOwnerUserIds` | `select user_id from memberships where tenant_id = $1 and role = 'owner'` | **Strictly better** — the 500-page cap + pagination loop collapses to one indexed query (`memberships_tenant_role_idx` already exists). |
| `clerkClient().users.updateUserMetadata()` in `assignUserToTenant` | `insert into memberships ... on conflict (user_id,tenant_id) do update set role` | Last-owner guard becomes a **transaction** (`select ... for update` on the tenant's owner rows), replacing the Redis `tenant-owner-lock` TOCTOU mitigation — Postgres does this natively and more correctly. |
| `isSuperAdmin()` (env allowlist) | `select 1 from super_admins where user_id = auth.uid() and revoked_at is null` | Same query the RLS helper uses. Runtime-editable instead of redeploy-to-change. |
| `clerkMiddleware` + `auth.protect({ unauthenticatedUrl })` in `proxy.ts` | Supabase SSR session read in `proxy.ts` + manual redirect to sign-in when `getUser()` is null | See multi-host risk below — this is the hard part, not the protect call itself. |
| `createRouteMatcher` (public-route list) | Keep as-is (plain matcher); just gate on the Supabase session instead of Clerk's. | No Clerk dependency in the matcher itself. |
| Clerk React components (`<SignIn>`, `<SignUp>`, `<UserButton>`, `<ClerkProvider>`) | Custom flows via `supabase.auth.signInWithOAuth({ provider: 'google' })` + a small session context | Touches `app/layout.tsx`, `dashboard/layout.tsx`, `sign-in`, `sign-up`, `account`, `no-access`, `UseInvitedEmailButton`. |
| `POST /api/clerk/webhook` (svix `user.created` → auto-assign invite) | **Delete.** Replace with a `handle_new_user()` trigger on `auth.users` insert (insert into `public.users`, claim any matching `invites` row → `memberships`). Keep `claimPendingInviteForCurrentUser` as the on-login safety net (mirrors today's webhook + `/account` dual path). | Removes the svix dependency entirely. |

### File inventory (the 21)
- **Core identity (1):** `src/lib/auth.ts` — rewrite against the Supabase server client + `memberships`/`super_admins`. Preserve the public function signatures (`hasTenantAccess`, `getTenantRole`, `requireTenantAccess`, `assignUserToTenant`, …) so call sites don't churn.
- **Middleware (1):** `src/proxy.ts` — the multi-host gate (below).
- **Tenant lib (1):** `src/lib/tenants.ts` — imports Clerk only at the edges; minimal.
- **Routes (4):** `api/admin/invites`, `api/admin/tenants/assign`, `api/agent`, plus the webhook (`api/clerk/webhook` → deleted).
- **Pages/components (6):** `app/layout`, `dashboard/layout`, `sign-in`, `sign-up`, `(marketing)/account`, `no-access`, `components/auth/UseInvitedEmailButton`.
- **Tests (8):** `__tests__/{account-page,admin-invites-route,agent-custom-change,auth-access-pages,auth-permissions,middleware-routing,route-handlers,routes-integration}` — these mock Clerk today; re-point the mocks at the Supabase client. The role-model + invariant tests (verified-email gate, last-owner guard) are the regression net for the rewrite — keep them green throughout.

### Multi-host sessions — RESOLVED (2026-06-19): single dashboard host
The "one risk that could balloon Phase 4" is **deleted, not solved.** See
`docs/auth-tenancy-architecture.md` for the full record. The dashboard authenticates only on
**`app.strelva.com`, tenant in the path** (`app.strelva.com/{tenant}`), with a **host-only cookie**
— no wildcard, no cross-subdomain session, nothing two-levels deep. Public client sites stay on
their own domains as unauthenticated read paths (they never carry a dashboard cookie).

Rejected: per-tenant subdomains (the `admin.*.strelva.com` two-level form needs DNS+certs
provisioned two-deep per tenant — fine at 3, miserable at 50). Custom admin domains are dropped
(white-label isn't a current goal; re-enters later as a redirect/PKCE handoff if ever needed).

**Effect on the proxy rewrite:** net code *removal* — drop `admin.*` subdomain detection +
`shouldUseFallbackAuthForAdminHost`/`buildTenantFallbackUrl`. The auth gate runs only on
`app.strelva.com`.

### Sequencing within Phase 4 — ALL DONE
1. ✅ **DONE** — Supabase server/browser clients (`@supabase/ssr`) + session helper + flag, additive.
2. ✅ **DONE** — `src/lib/auth.ts` dual-path against `memberships`/`super_admins`; signatures stable; identity repos built.
3. ✅ **DONE** — `proxy.ts` auth gate (`gateRequest`) is Supabase-only; hand-rolled `isPublicRoute`/`isCronRoute` matcher replaces `clerkMiddleware`/`createRouteMatcher`. Fail-closed.
4. ✅ **DONE** — `SupabaseSignIn` (Google OAuth + magic-link) + `/auth/callback` code-exchange live in prod.
5. ✅ **DONE** — `handle_new_user()` trigger applied + super-admin bootstrap seeded; provisioning = natural first sign-in.
6. ✅ **DONE (2026-07-11, #146)** — Clerk dual-path collapsed entirely; `@clerk/nextjs` removed; Clerk CSP entries gone; Playwright auth tests rewritten to the live Supabase flow.

### Open decisions — ALL RESOLVED
1. ~~Sanity: keep or kill?~~ **KILLED (2026-06-19).** Done (2026-07-10, data-source code removed). Ops tail: image-URL rewrite + dataset lock.
2. ~~Auth: Supabase Auth vs Clerk.~~ **Supabase Auth (2026-06-19).** Done (2026-07-11, Clerk fully removed).
3. ~~Token encryption.~~ **DONE (2026-07-15, `src/lib/crypto/secrets.ts`).** AES-256-GCM at rest via `SECRETS_ENC_KEY`; active in prod.
4. ~~Orphaned Supabase project.~~ **RESOLVED:** `zthifbnrtsirdekzzlxs` is the live project.

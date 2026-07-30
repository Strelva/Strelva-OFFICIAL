# Strelva — Auth & Tenancy Architecture

**Current enforcement boundary (updated 2026-07-14):** Supabase Auth establishes identity;
`memberships` and `super_admins` are the authorization source of truth. Server routes enforce
tenant access in application code before calling the service-role Postgres client. That client
bypasses RLS, so RLS is defense-in-depth today, not the live isolation boundary.

> **2026-06-22 — SHIPPED; Clerk teardown COMPLETE 2026-07-11 (#146).** The Clerk →
> Supabase Auth + Postgres swap **cut over in production on 2026-06-20**: Supabase Auth
> is live (`auth.uid()`, Google OAuth + magic link), `memberships`/`super_admins` back
> authorization, **RLS is enabled as defense-in-depth**, and the
> `handle_new_user` trigger provisions users on first sign-in (replacing the
> Clerk webhook). **The destructive Clerk teardown is now done (#146, deployed to prod):**
> `src/proxy.ts` unwrapped `clerkMiddleware` for a plain `proxy()` export with a hand-rolled
> **fail-closed** auth gate + `isPublicRoute`/`isCronRoute` matcher (path-normalized),
> `src/lib/auth.ts` is Supabase-only (dual-path branches collapsed, signatures + invariants
> preserved), and the `@clerk/nextjs` dep + Clerk CSP entries are removed. **Sanity code
> teardown is also DONE (2026-07-10)** — all data-source reads/writes removed; only the
> `sanityImageUrl` resolver is retained for legacy asset URL resolution until the
> content-URL rewrite ops step, after which the Sanity dataset is locked. The three-plane
> model and the service-role discipline below remain the live operating rules.

Grounded in current Supabase guidance (RLS performance lint `0003_auth_rls_initplan`,
Custom Access Token Hook, `@supabase/ssr`, multi-SSO) — verified against live docs, not memory.

---

## The organizing principle: three independent planes

Most multi-tenant auth pain comes from tangling these. Keep them separate and each scales on
its own — changing one never forces changing the others.

1. **Identity** — *who you are.* Supabase Auth, one host.
2. **Authorization** — *what you can touch.* `memberships` / `super_admins` in Postgres, enforced by application guards; RLS backs them up.
3. **Routing** — *where you reach it.* Public sites on client domains; dashboard on `app.strelva.com`.

---

## Plane 1 — Identity (auth host)

**Decision: the dashboard authenticates only on a single host, `app.strelva.com`.**

- **Tenant in the path:** `app.strelva.com/{tenant}/...`. One host, one TLS cert, **host-only
  session cookie**. No wildcard DNS, no cross-subdomain cookie, nothing two-levels deep.
- Tenant context = path + the user's **membership** (the URL is routing, not a security
  boundary — RLS + the membership check are). Single-tenant clients land on their one tenant;
  super-admins switch tenant by changing the path.
- `@supabase/ssr` `createServerClient` with the cookie adapter handles the session. Host-only
  cookie on `app.strelva.com` is tighter than a `.strelva.com`-wide cookie — public preview
  hosts can never carry a dashboard session.

**Rejected: per-tenant subdomains** (`{tenant}.strelva.com` + `admin.{tenant}.strelva.com`).
The two-level `admin.*.strelva.com` form needs DNS + certs provisioned two-deep per tenant
(a single `*.strelva.com` wildcard does not cover a second label). Fine at 3 clients, miserable
at 50. The single-host path model is the standard B2B SaaS shape (GitHub `/org`, Vercel `/team`)
and removes proxy code rather than adding it.

**Auth methods roadmap:**
- **Now:** Google OAuth.
- **Soon:** email magic link (most local-business owners won't have/use Google), email+password optional.
- **Later (reserved, do not build now):** SAML SSO for the higher-ACV "Custom Software" arm —
  Supabase supports multiple SSO providers; the membership model already doesn't preclude it.

---

## Plane 2 — Authorization

The `memberships` / `super_admins` schema (migration 0001) is the textbook Supabase
multi-tenant pattern — keep it as-is.

**Decision: authorization source of truth is the membership table, queried by application
guards (always fresh) — NOT JWT claims.** Baking `tenant_ids`/roles into the token via a Custom Access
Token Hook is faster (no per-request join) but **stale**: a revoked role keeps working until the
token refreshes (~1h). For a trust-sensitive product where access is revoked on offboarding,
fresh beats fast. The hook stays on the table as a *later read-path optimization* if RLS ever
shows up in slow queries — adopted only with the staleness trade-off understood.

**RLS performance rules (the part that silently rots at scale — Supabase lint 0003):**
- Wrap `auth.uid()` as `(select auth.uid())` everywhere so Postgres evaluates it **once per
  query** (initplan), not once per row.
- `security definer` helper functions (`app_tenant_ids()`, `app_is_super_admin()`) — already in
  `rls-draft.sql`; they also let the helper read `memberships` without recursive RLS.
- `TO authenticated` on every policy so it never runs for the `anon` role.
- Index every `tenant_id` and `user_id` FK used in a policy (the tenant-scoped tables, not just
  `memberships_tenant_role_idx`).
- Run `get_advisors` after enabling RLS to catch any regressed policy.

**Invariants that must survive forever (today enforced in `src/lib/auth.ts`):**
- **Verified-email gate** — never grant a role or super-admin on an unverified email.
- **Last-owner guard** — a tenant can never reach 0 owners. In Postgres this becomes a
  transaction (`select … for update` on the tenant's owner rows), replacing the Redis lock.
- Role ladder `viewer(0) < editor(1) < admin(2) < owner(3)` and the permission map, unchanged.

---

## Plane 3 — The service-role boundary (the real long-term risk)

The control-plane server code uses the **service-role client, which bypasses RLS entirely.**
RLS is only a hard floor for paths that carry a user JWT. So tenant isolation at scale depends
on a discipline, written here so it survives team growth:

- **Current:** user-facing routes derive tenant identity from trusted request/auth context,
  call `requireTenantAccess` or a permission guard, then use tenant-scoped repositories through
  the service-role client. Every repository call must carry the trusted tenant id.
- **Target hardening:** request paths may move to the user-JWT client so RLS becomes an enforced
  second boundary. Do not describe that target as shipped until the repositories actually use it.
- **Service-role:** remains appropriate for crons, provisioning, super-admin actions, and the
  public `/api/v1/*` contract, with explicit tenant scoping.

---

## Cross-cutting

- **Billing × auth stay orthogonal.** A past-due tenant still logs in; it hits a paywall.
  Never gate the session on `subscription_status` — gate features. (Billing-on is already a
  separate cliff: `STRIPE_BILLING_GRANDFATHER_TENANTS`.)
- **Token encryption.** `integrations` holds OAuth access/refresh tokens — encrypt at rest
  (pgcrypto or app-level), never plaintext. (= migration-plan Decision 3.)
- **Cutover is a forcing function.** *(Resolved — the Clerk→Supabase swap shipped
  2026-06-20, at the low client count this argued for.)* The swap cost one
  scheduled logout; doing it early avoided forcing a re-login on every client
  added later.

## Future roadmap: block editor + Strelva CMS (reinforces the kill-Sanity call)

Roadmap (Noah, 2026-06-19): a **basic-Framer-style block editor** + a **Strelva CMS** (blogs,
repetitive content, ecom). Counter-intuitively this makes killing Sanity *more* right, not less:

- **Sanity Studio is a form-based editor, not a visual canvas.** A Framer-like block editor is a
  custom frontend you build either way — Sanity doesn't provide it. So the editor doesn't argue
  for Sanity; it just needs a store. Postgres already has the shape: `page_config.sections`
  (JSONB block array) + `draft_*` (draft layer) + `content_versions` (history) + Supabase
  Realtime (live preview/collab).
- **Blogs** = rich text as JSON (TipTap/Lexical) in JSONB. **Repetitive content** = relational,
  Postgres's strength. **Ecom** = orders/inventory/variants = transactional + referential
  integrity = Postgres only; a document store would be an anti-pattern here.
- **Strategic:** if the editor + CMS are *Strelva products*, the data layer must be owned — you
  can't build a CMS product on rented CMS infra, and "leave with everything" must route through
  your own export, not Sanity's. Owning the editor means owning the store.
- **Timing:** keep Sanity now → still migrate off it when Strelva CMS ships, but at higher client
  count + more content + mid-build. Now (4 tenants, agent-only writes) is the cheapest it gets.
- **Real-time co-editing — addable later, store-agnostic (not a Sanity loss).** Collab lives in
  the sync/editor layer, not the DB: a CRDT (Yjs) holds the live shared doc, clients sync over a
  websocket, the converged result persists to the store. Sanity's built-in collab works *only
  inside Sanity Studio* — a custom Framer-like editor would NOT inherit it, so you'd build collab
  yourself either way. Recipe when wanted: **Tiptap + Yjs + Supabase Realtime → persist to
  Postgres JSONB**. Tiers: (0) presence + soft locks ("X is editing the hero", last-write-wins) —
  days, covers ~90% of real need; (1) full Yjs co-editing — weeks, genuinely hard frontend work
  but a known recipe. Keep-the-door-open cost now: zero (content is already structured JSON
  blocks in `page_config.sections`, which CRDTs map onto cleanly).
- **Middle path when the time comes:** **Payload** (OSS CMS framework on your own Postgres) gives
  Sanity-like admin/schema tooling while keeping data owned + under RLS — the thing to evaluate
  vs building from scratch. Either way the store stays Postgres.
- **Do NOT build now.** The AI agent is the editing surface today (the actual differentiator).
  This migration just lays an owned/isolated/transactional foundation so these land cleanly later.

## Explicitly deferred (do NOT build now; nothing here blocks adding them later)

- **White-label admin domains** (login on a client's own domain). Not a current goal. The
  custom-admin-domain auth path is being *removed*. Re-enters later as a redirect → `app.strelva.com`
  or a PKCE token-handoff — additive to the routing plane only.
- **Org-above-tenant layer** (one company, many sites, one bill). Only if a real customer needs
  it. The `tenant_id text` PK doesn't block adding it.
- **SAML SSO**, **JWT custom claims**. As above.

---

## What this changes in code (Phase 4 scope) — status as of 2026-06-22

- `src/proxy.ts` — **DONE (#146, 2026-07-11):** `clerkMiddleware` unwrapped to a plain
  `proxy()` export; `clerkMiddleware`/`createRouteMatcher` replaced with a hand-rolled
  **fail-closed** `gateRequest` + `isPublicRoute`/`isCronRoute` matcher (path-normalized
  against encoded/`//` bypass). The auth gate covers `isAdminSubdomain`, `tenantFromQueryParam`,
  and `tenantFromClientPath` paths. (The `admin.*`/custom-domain fallback-auth helpers were
  kept where still load-bearing.)
- `src/lib/auth.ts` — **DONE (live 2026-06-20; Clerk path removed #146):** Supabase-only
  against the server client + `memberships`/`super_admins`, signatures + invariants
  preserved. The `isSupabaseAuthConfigured()` dual-path branches are collapsed;
  `getTenantOwnerUserIds` is a single indexed query.
- Dashboard routing: client dashboards are reachable on `admin.{client-domain}` (the
  `isAdminSubdomain` path) as well as the `/client/{tenant}/...` fallback path on
  `app.strelva.com`. The single-host `app.strelva.com/{tenant}` model described above
  is the target; the custom-admin-domain path is still active in production.
- Full file inventory + API mapping: `docs/supabase-migration-plan.md` → "Auth swap" section.

## Known issues / TODO (2026-07-30)

- **[LOW][security] Subdomain-resolved tenant requests skip the proxy auth gate**
  (`src/proxy.ts` line ~636). The `needsAuth` condition covers `isAdminSubdomain`,
  `tenantFromQueryParam`, and `tenantFromClientPath`, but NOT `tenantFromSubdomain`
  (non-admin tenant subdomains like `gldf.strelva.com`). Requests resolved by subdomain
  pass through to per-route guards only; the proxy is not a first line of defense for
  this common access pattern. Fix: add `tenantFromSubdomain` as a fourth condition or
  restructure to `needsAuth = !devAccessBypass && !isDemoTenant && !routeIsPublic`.

- **[MEDIUM][security] `businessRules` injected unsanitized into the agent system prompt**
  (`src/lib/agent-prompt-shared.ts` line ~344). The `personality` field already runs through
  `sanitizePromptValue` at line 338, but `businessRules` is interpolated directly. Fix:
  wrap `tenantConfig.businessRules` in `sanitizePromptValue` before interpolation and add a
  max-length cap (e.g. 1000 chars) in the TenantEditor validator.

- **[HIGH][tenant-isolation] `upload_image` tool uses unscoped `uploadFile()` instead of
  `uploadTenantMedia()`** (`src/app/api/agent/route.ts` line ~568-569). Files are stored in
  the shared flat Blob namespace without a tenant prefix. Fix: replace with `uploadTenantMedia`
  which takes a Buffer directly and accepts any MIME type `sniffImageType` returns.

- **[HIGH][security] Seven orphaned Clerk and Sanity secrets still live in Vercel
  environment** after both teardowns. Run `vercel env rm` for each of:
  any remaining `CLERK_*` / `NEXT_PUBLIC_CLERK_*`, `SANITY_PROJECT_ID`, `SANITY_DATASET`,
  `SANITY_API_TOKEN`, `SANITY_WEBHOOK_SECRET`, `REVALIDATION_SECRET` (superseded by
  per-tenant `revalidationSecret`), `CORS_ORIGINS` (no code reference), and Turborepo
  vars (`NX_DAEMON`, `TURBO_*`). Verify via `vercel env ls` before removal.

- **[HIGH][bug] Missing `SECRETS_ENC_KEY` causes full platform outage** if removed after
  activation (`src/lib/tenants.ts` load path, `src/lib/crypto/secrets.ts:62`). `decryptSecret`
  throws on an `enc:v1:` prefixed value when the key is absent, and that throw in `rowToTenant`
  propagates through `loadTenants` to kill all tenant resolution. Add `SECRETS_ENC_KEY` to the
  production readiness checklist and wrap `rowToTenant` in a per-row try/catch in `loadTenants`
  so one bad row cannot take down the entire platform.

- **[MEDIUM][security] `reb:tenants:all` Redis cache stores decrypted (plaintext) secrets**
  (`src/lib/tenants.ts` line ~206-210). The in-memory and Redis tenant-list cache contains
  the decrypted values of `slackWebhookUrl`, `googleSearchConsoleKey`, etc. This is correct
  for reads but expands the at-rest-encryption boundary. Optional defense-in-depth: re-encrypt
  before caching.

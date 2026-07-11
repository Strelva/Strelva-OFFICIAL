# Clerk + Sanity teardown — execution checklist (Phase A)

> **✅ CLERK TEARDOWN DONE (2026-07-11, #146).** Steps 1–4 for Clerk are executed and
> shipped to prod (deploy `dpl_6RxJPpBckUJNwroaAy3NJQ3hCeMQ`): `auth.ts` is Supabase-only,
> `proxy.ts` uses a hand-rolled fail-closed auth gate + `isPublicRoute`/`isCronRoute`
> matcher, `@clerk/nextjs` (+ `svix`, if unused) and the Clerk CSP entries are removed, and
> the auth test suite was migrated off Clerk mocks. Post-deploy headless smoke confirmed the
> route matcher behaves identically to Clerk's (public 200, protected 307→/sign-in, no leak).
> **Still worth a human click:** an interactive Google OAuth sign-in + sign-out on prod (curl
> can't drive OAuth; that Supabase path is unchanged by #146). The **Sanity** steps below
> remain OPS-only (rewrite legacy content-image URLs, lock the dataset, unset `SANITY_*`).
> The Clerk steps are retained below as the historical record of what was executed.

Companion to `docs/post-cutover-runbook.md`. This is the precise, file:line step
list for the HELD destructive end-step of the Clerk+Sanity → Supabase+Postgres
migration. It was compiled from a full-platform audit on 2026-06-26.

## THE GATE (Clerk portion satisfied — see banner above)
Do not start until Noah has done a **real prod Google sign-in smoke test** on
scaffoldweb.com (sign in, land on the dashboard, confirm it works). After Steps 1
and 4 there is **no flag-flip rollback** — only a code revert + redeploy. One PR
per step, CI green between each, soak before the next.

Order is load-bearing: **1 → 2 → 3 → 4**, then cleanup. Step 3's read-client token
edit MUST precede the actual dataset lock, and Step 2 MUST precede Step 3 (the
write client still patches `_type=="tenant"` docs until then).

---

## Step 1 — Collapse the Clerk branches in `src/lib/auth.ts` (second-riskiest)
- Delete the `@clerk/nextjs/server` import (`auth.ts:1`).
- Remove the dead Clerk `else` branch from each dual-path function:
  `verifyAuth` (208-209), `getAuthUserId` (221-222), `findUserIdByEmail` (233-235),
  `getCurrentUserTenants` (248-249), `getCurrentUserEmail` (259-260),
  `isSuperAdmin` (278-285), `getActorContext` (313-326), `getTenantOwnerUserIds`
  (349-370), `assignUserToTenant` (433-489), `claimPendingInviteForCurrentUser`
  (526-549), `hasTenantAccess` (566-569), `getTenantRole` (597-600).
- Delete the now-dead Clerk-only helpers: `ClerkPublicMetadata` (51-54),
  `getUserEmailAddresses` (119-139), `parseTenantAccessMetadata` (145-187),
  `getRoleForTenantFromMetadata` (189-194), `CLERK_USER_PAGE_SIZE/CAP` (332-333).
- Drop the vestigial `SUPER_ADMIN_EMAILS` requirement: `production-readiness-rules.ts:136`
  + `scripts/production-checklist.ts:171` (and the description at `:92`). In prod,
  super-admin is the `super_admins` table, not this env var.
- Orphaned, remove with this step: `getUserByClerkId` (`repositories.ts:222-230`)
  and the `clerk_id` column reference (`database.types.ts:1660`).
- **Blast radius:** removes the graceful Clerk fallback. After this, an unset
  Supabase public env = fail-closed lockout (no data exposure, total outage). The
  Supabase env becomes a hard single-point dependency.

## Step 2 — `tenants.ts` Postgres cutover
- Remove the Sanity read fallback in `loadTenants` (`tenants.ts:159-185`, the
  `hasSanity` branch) **and** fix the MED divergence bug while you're here: a
  zero-row Postgres read currently drops to Sanity and caches it 60s
  (`tenants.ts:154-157,191-201`). Make the empty read **fail-loud / not cached**
  so a transient empty PG read can't pin stale tenant config (incl. a stale
  `active` flag) platform-wide.
- Remove the Sanity dual-writes: create path (`tenants.ts:435-445`), update path
  (`tenants.ts:481-508`), and the `hasSanity` guard at `:123`.
- Drop `sanityToTenant` (`:227`) once unreferenced.
- `tenantsSourceIsPostgres()` is already `postgres` in prod, so reads are PG-first
  today; this is deleting now-dead Sanity branches.

## Step 3 — Lock the Sanity dataset (the security payoff — closes lead/email exposure)
- **PREREQ EDIT FIRST:** `src/lib/sanity.ts:31-42` `getSanityReadClient()` — add
  `token: process.env.SANITY_API_TOKEN` and `useCdn: false`. Without this, locking
  the dataset 403s every read path. This is the single load-bearing change.
- THEN lock the `production` dataset to authenticated-only / disable the public CDN
  (Sanity dashboard — Noah/Jacob action). This closes the public-CDN read of
  historical `onboardLead`/contact emails+phones (HIGH H1).
- Verify these token-dependent read callers still work after the lock:
  `content-store.ts:145`, `reviews.ts:114/152/184`, `media.ts:34/153`,
  `tenant-export/assets/route.ts:44`, `agent/route.ts:1270`, `inbox-store.ts:186`,
  `page-config-store.ts:129/157`, `site-snapshot-store.ts:328/378/503`,
  `search-store.ts:76`, `social-store.ts:102`, `audit-store.ts:159/185`,
  `report-store.ts:234`, `analytics-store.ts:433`, `version-store.ts:153`.
- **NOT closed by this:** media uploads still WRITE to Sanity (`media.ts:111`,
  `upload-store.ts:42`) via the write client. Lockdown ≠ Sanity decommission — the
  image library stays Sanity-hosted until the media subsystem is migrated
  (Vercel Blob / Postgres). That's Phase B, not here.

## Step 4 — Unwrap `clerkMiddleware` in `src/proxy.ts` (ABSOLUTE LAST)
- `proxy.ts:399` `export default clerkMiddleware(async (auth, req) => {…})` → plain
  `export default async function (req) {…}`; drop the `auth` param.
- Remove `gateRequest`'s `auth` arg + the `auth.protect()` fallback (`:381`, `:395`)
  so only the Supabase gate (`:385-393`) remains.
- Remove the Clerk CSP allowlist entries (`proxy.ts:23,25,30`) and the dead
  `/api/clerk/webhook` allowlist entry (`:56`).
- Fix the `?tenant=` comment (`proxy.ts:484-487`): it claims the proxy enforces
  "super-admin impersonation only" but only checks authentication — enforcement is
  delegated to each route's `requireTenantAccess`. The 2026-06-26 audit confirmed
  all 64 routes do guard, so this is a comment-accuracy fix (state the invariant:
  every tenant-from-header read MUST call `requireTenantAccess`), not a hole.
- **Blast radius:** widest (middleware-global), hardest rollback. Functionally
  inert in prod (the Supabase gate already ignores `auth`), but do it alone.

## Step 5 — Dependency + test cleanup (after 1–4 land)
- Remove `@clerk/nextjs` and `svix` deps (both have zero imports once the webhook
  route + auth branches are gone). **Dependency change → needs Noah's review per
  the no-dep-changes rule; do not regenerate the lockfile without sign-off.**
- Re-evaluate the `@babel/plugin-transform-modules-systemjs` override (still
  referenced in the lockfile today — not a free no-op removal; same dep-review gate).
- Rewrite or delete the 8 stale Playwright auth skips (`customer-frontend.spec.ts:128-201`,
  `smoke.spec.ts:39`) — they assert a "Dashboard sign-in is paused / not using Clerk"
  page that no longer exists. Rewrite against the live Supabase flow so the real
  auth path finally has smoke coverage.
- Delete the obsolete vitest skip (`dashboard-route-redirects.test.ts:60`) — it
  `readFileSync`s a deleted `SignInClient.tsx` and would throw if un-skipped.

---

## Not in this teardown (tracked elsewhere)
- **Phase B:** migrate the Sanity media/image library off Sanity; cut the 4
  shadow-write stores (`unified_events`, `mail_log`, `build_payments`,
  `delivery_leads`) from Redis reads to Postgres.
- **Noah-gated, anytime:** rotate the leaked `sbp_` Supabase PAT + 2 other keys
  (enumerate the other two first — only the `sbp_` PAT is recorded); set
  `VERCEL_API_TOKEN` + `VERCEL_TEAM_ID` in the strelva Vercel project.

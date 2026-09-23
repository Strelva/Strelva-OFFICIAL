# Clerk + Sanity teardown — execution checklist (Phase A)

> **Status: Clerk teardown DONE (2026-07-11, #146). Sanity teardown DONE as a data
> source (2026-07-10) with one ops-only image-URL tail remaining.** Steps 1-4 for
> Clerk are executed and shipped. All Sanity data read/write paths are removed; the
> only residual is `src/lib/sanity.ts` + `@sanity/image-url` dep + `cdn.sanity.io`
> in CSP/next.config, retained to resolve legacy Sanity asset refs still stored in
> Postgres content rows. The ops tail: rewrite those content-image URLs, then lock the
> Sanity dataset, unset `SANITY_*`/`NEXT_PUBLIC_SANITY_*`, and delete `src/lib/sanity.ts`
> + the `@sanity/image-url` dep + the `cdn.sanity.io` CSP/remotePatterns entries.
> See "Known issues / TODO" at the bottom.

> **✅ CLERK TEARDOWN DONE (2026-07-11, #146).** Steps 1–4 for Clerk are executed and
> shipped to prod (deploy `dpl_6RxJPpBckUJNwroaAy3NJQ3hCeMQ`): `auth.ts` is Supabase-only
> (the dual-path is fully collapsed; no `@clerk` imports remain), `proxy.ts` uses a
> hand-rolled fail-closed auth gate (`gateRequest`) + `isPublicRoute`/`isCronRoute`
> matcher, `@clerk/nextjs` Clerk CSP entries are removed, and the auth test suite was
> migrated off Clerk mocks. Post-deploy headless smoke confirmed the route matcher behaves
> identically to Clerk's (public 200, protected 307→/sign-in, no leak). The Playwright
> auth tests were rewritten against the live Supabase flow (the old "sign-in paused" skips
> are gone). **Still open from Step 5:** `svix` (1.92.2) is still in `package.json` with
> no remaining import in `src/` — safe to remove with dep-review sign-off.
> `dashboard-route-redirects.test.ts:67` still has an `it.skip` that `readFileSync`s the
> deleted `SignInClient.tsx` — it throws if un-skipped; candidate to delete.
> `@babel/plugin-transform-modules-systemjs` override is still in the lockfile — needs
> evaluation before removal. The `getUserByClerkId` function and `clerk_id` column
> reference remain in `repositories.ts`/`database.types.ts` as bridge artifacts; the
> `SUPER_ADMIN_EMAILS` env var is still required by `production-readiness-rules.ts:128`
> even though the `super_admins` table is the live source in prod — that check should
> be dropped (per the original Step 1 plan). The **Sanity** ops tail is below.
> The Clerk execution steps are retained as the historical record of what was done.

Companion to `docs/post-cutover-runbook.md`. This is the precise, file:line step
list for the HELD destructive end-step of the Clerk+Sanity → Supabase+Postgres
migration. It was compiled from a full-platform audit on 2026-06-26.

## THE GATE
**Clerk gate: SATISFIED.** Clerk teardown (Steps 1-4) is done and deployed to prod.

For the remaining Sanity ops tail (Step 3 revised): the gate is the content-image URL rewrite
completing cleanly. Do not lock the Sanity dataset while legacy Sanity CDN asset refs remain in
production `content` rows — those images will 403 for any user. Rewrite first, then lock.

---

## Step 1 — Collapse the Clerk branches in `src/lib/auth.ts` (DONE)
> **DONE (2026-07-11, #146).** `auth.ts` is Supabase-only. All dual-path Clerk branches
> are removed. The Clerk-only helpers listed below are gone. `SUPER_ADMIN_EMAILS` removal
> from the production readiness check was not yet done (tracked in Step 5 above).
> `getUserByClerkId` in `repositories.ts` and `clerk_id` type refs in `database.types.ts`
> are bridge artifacts still present (tracked in Step 5 above).


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

## Step 2 — `tenants.ts` Postgres cutover (DONE)
> **DONE.** All Sanity read/write branches are removed from `tenants.ts`. Only a comment
> referencing Sanity (in the domain-map comment) remains, which is harmless.


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
> **Revised (verified 2026-07-30):** All Sanity data read/write callers listed below
> are GONE — the Sanity data source was fully torn down (2026-07-10). The only remaining
> Sanity tie is the legacy image-URL resolver (`src/lib/sanity.ts` + `@sanity/image-url`).
> The dataset lock is still the right ops step; the PREREQ EDIT IS NO LONGER NEEDED.
> The token-dependent callers listed below no longer exist.

- Lock the `production` dataset to authenticated-only / disable the public CDN
  (Sanity dashboard — Jacob/Noah action). This closes the public-CDN read of
  historical data (HIGH security payoff from the original plan).
- After locking: the `src/lib/sanity.ts` image resolver still resolves CDN URLs for
  legacy asset refs via `NEXT_PUBLIC_SANITY_PROJECT_ID`. If public CDN is locked,
  those images will 403 until the content-URL rewrite runs and replaces the asset
  refs with Vercel Blob/direct URLs. **Recommended order:** rewrite content image
  URLs first (replace Sanity asset refs in Postgres `content` rows with their Vercel
  Blob equivalents), verify no `sanityImageUrl` calls return Sanity CDN URLs in
  production, THEN lock the dataset.
- After the URL rewrite + lock: delete `src/lib/sanity.ts`, remove `@sanity/image-url`
  dep, remove `cdn.sanity.io` from `proxy.ts` CSP `img-src` (line 29) and from
  `next.config.ts` `remotePatterns` (line 32), unset
  `NEXT_PUBLIC_SANITY_PROJECT_ID`/`NEXT_PUBLIC_SANITY_DATASET` env vars, and remove
  those entries from `.env.example` and `.env.production.example`.
- **NOT applicable anymore:** the Sanity write paths (`media.ts`, `upload-store.ts`)
  are already gone. Media now goes to Vercel Blob directly.

## Step 4 — Unwrap `clerkMiddleware` in `src/proxy.ts` (ABSOLUTE LAST)
> **DONE (2026-07-11, #146).** `proxy.ts` exports a plain async function; `gateRequest`
> is Supabase-only; Clerk CSP entries and `/api/clerk/webhook` allowlist entry are gone.
> The `?tenant=` comment was also updated to state the correct invariant.

## Step 5 — Dependency + test cleanup (after 1–4 land)
> **Partially done.** `@clerk/nextjs` is removed (zero imports remain). Playwright
> auth tests are rewritten — the "sign-in paused / not using Clerk" skips are gone;
> `customer-frontend.spec.ts` now tests the live Supabase sign-in flow. Still open:

- Direct `svix` 1.92.2 removed in the September 22 source cleanup after the
  repository-wide caller check. Resend still owns its transitive Svix 1.86.0
  dependency; that dependency is retained. No webhook verification path changed.
- `dashboard-route-redirects.test.ts:67` still has an `it.skip` referencing the
  deleted `SignInClient.tsx` — it throws if un-skipped; safe to delete the whole test.
- Re-evaluate `@babel/plugin-transform-modules-systemjs` override (still in lockfile;
  same dep-review gate applies before removal).
- `getUserByClerkId` (`repositories.ts:241`) + `clerk_id` column refs in
  `database.types.ts` are bridge artifacts; safe to remove once there is no migration
  risk (the `clerk_id` column still exists in the `users` table schema).
- `SUPER_ADMIN_EMAILS` is still listed as a required env var in
  `production-readiness-rules.ts:128`. In prod, super-admin is the `super_admins`
  table — this check is stale and should be dropped (per the original Step 1 plan).

---

## Not in this teardown (tracked elsewhere)
- **Phase B / content-URL rewrite (the Sanity tail):** rewrite legacy Sanity asset
  refs stored in Postgres `content` rows with direct Vercel Blob URLs. That step
  unblocks the Sanity dataset lock and the deletion of `src/lib/sanity.ts` /
  `@sanity/image-url` / `cdn.sanity.io` CSP entries. Media migration off Sanity is
  complete (all new media writes go to Vercel Blob); only the stored URL rewrite remains.
- **Phase B / operational Postgres mirrors:** cut the 4 shadow-write stores
  (`unified_events`, `mail_log`, `build_payments`, `delivery_leads`) from Redis
  reads to Postgres-authoritative reads when dual-write parity is confirmed.
- **Noah-gated, anytime:** rotate the leaked `sbp_` Supabase PAT + 2 other keys
  (enumerate the other two first — only the `sbp_` PAT is recorded); set
  `VERCEL_API_TOKEN` + `VERCEL_TEAM_ID` in the strelva Vercel project.
- **Audit findings that belong here:**
  - **DONE (2026-07-30):** 11 orphaned vars removed from Vercel prod + preview + dev:
    `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `CLERK_DOMAIN`,
    `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_DOMAIN`,
    `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`,
    `SANITY_API_TOKEN`, `SANITY_WEBHOOK_SECRET`, `REVALIDATION_SECRET`, `CORS_ORIGINS`.
    `NEXT_PUBLIC_SANITY_DATASET` + `NEXT_PUBLIC_SANITY_PROJECT_ID` kept (legacy image resolver).
  - **DONE (2026-07-30):** `SECRETS_ENC_KEY`, `SUPABASE_URL`, `SUPER_ADMIN_EMAILS`, and
    `APPROVE_LINK_SECRET` added to `.env.example`, `.env.production.example`, and validated
    by `scripts/production-checklist.ts` (`check:prod`). The unguarded-throw risk in
    `loadTenants` is still present — per-row try/catch is a separate follow-up.

## Known issues / TODO (open as of 2026-07-30)

| # | Severity | What | File |
|---|---|---|---|
| 1 | Medium | `svix` still in `package.json` (no imports in `src/`) | `package.json:55` |
| 2 | Low | `it.skip` references deleted `SignInClient.tsx` — throws if un-skipped | `src/__tests__/dashboard-route-redirects.test.ts:67` |
| 3 | Low | `getUserByClerkId` bridge artifact still in repos | `src/lib/db/repositories.ts:241` |
| 4 | Low | `clerk_id` column still in DB types (bridge artifact) | `src/lib/db/database.types.ts:2204` |
| 5 | Low | `SUPER_ADMIN_EMAILS` still required by production-readiness-rules (stale post-Supabase) | `src/lib/production-readiness-rules.ts:128` |
| 6 | Ops | Content-image URL rewrite not yet run (Sanity CDN refs still in Postgres content rows) | `src/lib/storage/content-store.ts`, `src/lib/sanity.ts` |
| 7 | Ops | Sanity dataset not yet locked (closes public-CDN read of historical lead data) | Sanity dashboard |
| 8 | Ops | `@sanity/image-url` dep + `cdn.sanity.io` CSP/remotePatterns alive until URL rewrite | `package.json:36`, `src/proxy.ts:29`, `next.config.ts:32` |
| 9 | ~~Ops~~ DONE | `SECRETS_ENC_KEY` added to `.env.example` + production checklist (2026-07-30) | `.env.example`, `scripts/production-checklist.ts` |
| 10 | ~~Ops~~ DONE | 11 orphaned Clerk/Sanity/misc env vars removed from Vercel prod+preview+dev (2026-07-30) | Vercel dashboard |

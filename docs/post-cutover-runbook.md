# Post-cutover cleanup runbook

**Status:** prod cut over to Supabase Auth + Postgres content (2026-06-20). This is the operational runbook for the remaining cleanup. Strategy/history lives in [supabase-migration-plan.md](./supabase-migration-plan.md). Generic rollback steps: [rollback.md](./rollback.md).

The governing rule: every load-bearing change is flag-gated so rollback is a flag flip in Vercel env, never a redeploy-revert. Do the additive work now, gate the destructive work on a 2-3 day soak.

## Flag reference (and exact rollback)

| Flag (Vercel env) | What it does | On | Rollback |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + anon/publishable key | Activates the Supabase auth path (`isSupabaseAuthConfigured()`). | SET in prod | Unset both -> reverts to Clerk path (Clerk code still present until 2.B). |
| `CONTENT_SOURCE=postgres` | `getContent`/`setContent` read/write the Postgres `content` table, Sanity fallback on miss. | SET in prod | Unset -> reverts to Sanity/dev-file source. |
| `DUAL_WRITE_PG` (new, Phase 1.2) | Write operational rows to Postgres alongside Redis. Reads stay Redis. Null-safe, catch-and-log. | not yet | Unset -> Redis-only, today's behavior. |
| `TENANTS_SOURCE=postgres` (new, Phase 2.A.4) | `getTenantConfig` reads the Postgres `tenants` table, Sanity fallback. | not yet | Unset -> Sanity source. Keep Sanity fallback live through the flip. |

## Phase 1 (now / additive, during soak)

1. **CI fix** (done on `fix/ci-undici-v6`): undici v6 override. No flag.
2. **Dual-writes** behind `DUAL_WRITE_PG`. Wire order, lowest blast radius first: build-payments -> mail -> leads -> events (events LAST, hot path). PG write is fire-and-forget, wrapped so a PG failure never throws into the authoritative Redis write. Verify each: flip flag, do the action, confirm the Postgres row matches the Redis record, zero new errors.
3. **New tables + RLS** (DDL only): reviews, blog_posts, suggestions, site_snapshots, click_analytics, inbox_items, newsletter_config, booking_config/bookings, social_config. Apply on a Supabase branch first, then prod. RLS each, matching `supabase/migrations/20260619140000_rls.sql`. No code reads them yet.

## Phase 2.A: Sanity kill order (after soak)

Per store: backfill Sanity -> Postgres, flip that store's read flag (content-store dual-path shape), confirm that store's Sanity fetch count == 0 in logs for 24h, then next. Never flip two load-bearing reads in one deploy.

1. Non-load-bearing stores: reviews, blog, suggestions, site-snapshots, analytics, inbox, newsletter, booking/social config. A miss degrades a feature, not auth/routing.
2. `page-config-store.ts` (tables exist).
3. **content-store fallthrough close:** content already reads Postgres but falls through to Sanity on a miss (`content-store.ts` ~L137-145). Backfill every tenant/section, make a PG miss for an existing tenant ALERT instead of silently reading Sanity, verify Sanity content-fetch rate == 0 across a full traffic day.
4. **`tenants.ts` LAST + riskiest.** `getTenantConfig` runs every request for auth + routing; null = app down for that host. Repos (`getTenant`/`listActiveTenants`) exist; wiring does not. Dual-path behind `TENANTS_SOURCE=postgres`, Sanity fallback live. Before flip: backfill + diff every tenant row Sanity-vs-PG to byte equality. Flip in a low-traffic window. Verify a synthetic request per host shape (subdomain, custom domain, admin host, path fallback) resolves the right tenant. Keep the 60s Redis cache.

### Sanity lockdown precondition checklist (all must be true)
- [ ] Every store above reads Postgres with Sanity fetch count == 0 for 24h.
- [ ] content-store fallthrough rate == 0 for a full traffic day.
- [ ] `tenants.ts` Postgres-sourced and verified per host shape.
- [ ] **Read client token added first:** `src/lib/sanity.ts` `getSanityReadClient` currently has NO token and uses the public CDN. Add a token + set `useCdn:false` as rollback insurance BEFORE locking the dataset. Locking before this breaks any stray reader with no fallback.

Lockdown order: (1) confirm zero reads, (2) add read-client token + `useCdn:false`, (3) lock dataset to authenticated-only / disable public CDN, (4) watch for 403s. This closes the public-read of onboardLead/contact emails (the security payoff).

## Phase 2.B: Clerk removal order (proxy.ts LAST)

Leaf usages first, request entry point last. Supabase path is already live; Clerk code is dead weight, safe through the soak.

1. Delete `src/app/api/clerk/webhook/route.ts` (replaced by `handle_new_user` trigger).
2. UI ternaries: sign-in / sign-up pages + `UseInvitedEmailButton` -> Supabase branch only.
3. `src/app/layout.tsx` -> drop conditional `ClerkProvider`.
4. `src/lib/auth.ts` -> collapse 9 Clerk branches to Supabase-only. Verify owner/member/super-admin.
5. CSP + `CLERK_*` env in `production-readiness-rules.ts`, `health.ts`, `proof-signals.ts`. `pnpm check:prod` must pass.
6. Update the 9 `@clerk`-mocking test files. `pnpm test` green.
7. Drop `users.clerk_id` only after `getUserByClerkId` has no callers (last; so a code rollback never hits a missing column).
8. **`src/proxy.ts` ABSOLUTE LAST, own isolated PR.** Unwrap `clerkMiddleware(async (auth, req) => {...})` to `export default async function(req)`, drop the `auth` param from `gateRequest`. Atomic in one PR (a split can leave `auth.protect` bound to undefined and fail open or closed). Verify full host matrix: authed-allowed, anon-redirected, protected-route-blocked. Rehearsed one-PR `git revert`.

**Sequencing between 2.A and 2.B:** independent except `auth.ts` (Clerk removal) is imported by `tenants.ts`. Do the auth.ts collapse (2.B.4) and the tenants.ts cutover (2.A.4) as separate, sequenced PRs, never simultaneously.

## Outage traps (do not do)
- Lock the Sanity dataset before reads are zero AND before the read client has a token + `useCdn:false`.
- Flip `tenants.ts` to Postgres without a row-level diff and without keeping the Sanity fallback.
- Cut content off Sanity while the PG-miss fallthrough still silently reads Sanity.
- Unwrap `proxy.ts` in a multi-file Clerk PR.
- Drop `users.clerk_id` before `getUserByClerkId` callers are gone.
- Enable events dual-write without catch-and-ignore on the PG write.

## v1 preview auth (shipped)

`?preview=true` on the v1 public routes (content, page-config, collections) now
serves drafts ONLY to requests carrying a valid HMAC preview token (signed with
the tenant's `revalidationSecret`; headers `x-scaffold-preview-ts` /
`x-scaffold-preview-sig`, 5-minute window). An unauthorized `?preview=true`
degrades to PUBLISHED content. The internal `(public)` pages read drafts via the
storage layer + `x-preview-mode` (proxy-set), so they are unaffected.

Operational follow-up: the updated `custom-repo-starter/scaffold-client.ts` signs
and sends the headers. Deployed client repos (GLDF, Rohlax) keep serving live
(published) content unchanged, but their preview-via-public-URL shows PUBLISHED
until their copy of `scaffold-client.ts` is updated and redeployed. Low urgency
(preview is a dev/staging nicety, not production).

## Noah-gated (blockers, not executable here)
1. Publish the Google OAuth consent screen (blocks client sign-in today).
2. Rotate the 3 leaked keys + update Vercel. See [secret-rotation.md](./secret-rotation.md).
3. Send clients sign-in info (after #1). Owner invites seeded for gldf + rohlax.
4. Noah's own prod sign-in smoke test (gates confidence before 2.B.8, the proxy unwrap).

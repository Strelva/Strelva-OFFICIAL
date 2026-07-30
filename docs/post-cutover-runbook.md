# Post-cutover cleanup runbook (historical)

> This records the 2026 migration sequence and is NOT a current source-of-truth map.
> All migration phases and both teardowns are COMPLETE. **Clerk teardown: done
> (2026-07-11, PR #146).** **Sanity code teardown: done (2026-07-10).** The only
> residual Sanity work is ops-only: rewrite legacy content-image asset URLs stored
> in Postgres rows, then lock the dataset and remove the image resolver.
> Use [persistence-boundaries.md](./persistence-boundaries.md) for current store
> ownership and `AGENTS.md` for current auth/stack status.
> The Phase 2.B checklist below is retained as historical record; steps 4-8 are
> now DONE — do not attempt to re-execute them.

**Status (updated 2026-07-30):** ALL DONE. Migration flipped 2026-06-20, both
teardowns complete. Auth is Supabase-only (`src/lib/auth.ts` is Supabase-only,
no `@clerk` imports remain). Sanity data-source reads and all Sanity write paths
are removed; `@sanity/client`/`next-sanity`/`sanity` deps are gone. The only
Sanity residual is `sanityImageUrl` (+ `@sanity/image-url`) for legacy content-
image URLs still stored in Postgres rows — retained until the content-URL rewrite
ops step, after which the dataset can be locked and the image resolver deleted.
`CONTENT_SOURCE` / `TENANTS_SOURCE` / `DATA_SOURCE` are all `=postgres` in prod.
The Clerk webhook route, `ClerkProvider`, all Clerk-branch ternaries, and the
`@clerk/nextjs` dep are gone. `proxy.ts` uses the hand-rolled `gateRequest` /
`isPublicRoute` auth gate. Strategy/history: [supabase-migration-plan.md](./supabase-migration-plan.md).
Rollback: [rollback.md](./rollback.md).

The governing rule: every load-bearing change is flag-gated so rollback is a flag flip in Vercel env (+ redeploy), never a code revert. The migration phases below are now DONE through the flip; the teardown is the remaining careful step.

## Flag reference (and exact rollback)

| Flag (Vercel env) | What it does | On | Rollback |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + anon/publishable key | Activates the Supabase auth path (`isSupabaseAuthConfigured()`). | SET in prod | Unset both -> reverts to Clerk path (Clerk code still present until 2.B). |
| `CONTENT_SOURCE=postgres` | `getContent`/`setContent` read/write the Postgres `content` table, Sanity fallback on miss. | SET in prod | Unset -> reverts to Sanity/dev-file source. |
| `DUAL_WRITE_PG` (Phase 1.2) | Write operational rows to Postgres alongside Redis. Reads stay Redis. Null-safe, catch-and-log. | **IMPLEMENTED** (`src/lib/db/dual-write.ts`; default-on per `dualWritePgEnabled()`, but inert until Supabase env is set). events/leads/mail/build-payments shadow-write PG behind this flag. | Set `DUAL_WRITE_PG=0` (or `false`) -> Redis-only, no redeploy. |
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

## Phase 2.B: Clerk removal order (COMPLETE)

All steps complete as of 2026-07-11 (#146).

1. ~~Delete `src/app/api/clerk/webhook/route.ts`.~~ **DONE (#83).**
2. ~~UI ternaries → Supabase branch only.~~ **DONE (#83).**
3. ~~Drop `ClerkProvider`.~~ **DONE (#83).**
4. ~~Collapse `auth.ts` to Supabase-only.~~ **DONE (#146).**
5. ~~Remove `CLERK_*` env from `production-readiness-rules.ts`, `health.ts`.~~ **DONE (#146).**
6. ~~Update `@clerk`-mocking test files.~~ **DONE (#146).**
7. ~~Drop `users.clerk_id`.~~ **DONE (#146).**
8. ~~Unwrap `clerkMiddleware` in `proxy.ts` → hand-rolled `gateRequest`.~~ **DONE (#146).**

`@clerk/nextjs` is gone from `package.json` and the lockfile. No `@clerk` imports remain.

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

## Remaining ops work (historical blockers, updated 2026-07-30)

1. ~~Publish the Google OAuth consent screen.~~ Status unknown — verify in Google Cloud Console.
2. ~~Rotate leaked keys.~~ See [secret-rotation.md](./secret-rotation.md) for current state.
3. ~~Send clients sign-in info.~~ Clients should be active; verify per `/admin/clients`.
4. ~~Prod sign-in smoke test before proxy unwrap.~~ Proxy unwrap is done (#146).
5. **Remaining Sanity ops work:** rewrite legacy `cdn.sanity.io` image URLs stored in Postgres content rows, then lock the Sanity dataset and remove `@sanity/image-url` + `sanityImageUrl`. Until this is done, `NEXT_PUBLIC_SANITY_PROJECT_ID` / `NEXT_PUBLIC_SANITY_DATASET` and the `cdn.sanity.io` CSP entry must stay set. (The `SANITY_API_TOKEN` + `SANITY_WEBHOOK_SECRET` write secrets were removed from Vercel 2026-07-30 — only the two public vars remain.)

> For current open issues see `production-readiness.md` Known issues and `rollback.md` Known issues.

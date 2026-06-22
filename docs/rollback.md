# Rollback

> **2026-06-22:** prod cut over to Supabase Auth + Postgres on 2026-06-20
> (`CONTENT_SOURCE`/`TENANTS_SOURCE`/`DATA_SOURCE` = `postgres`, Supabase Auth
> live). Sanity is still dual-written, so the Postgres backbone has a
> flag-flip rollback (below). Clerk is dead-pathed behind
> `isSupabaseAuthConfigured()`.

## Strelva code rollback
1. Redeploy previous Vercel deployment.
2. Confirm `/api/v1/content/gldf/hero`.
3. Confirm dashboard content edits still save.
4. Confirm revalidation dispatch works.

## Content rollback
1. Restore previous content version in Strelva (now persisted in Postgres
   `content_versions`).
2. Trigger GLDF revalidation.
3. Confirm storefront reflects restored version.

## Platform rollback (Postgres/Supabase cutover)
The cutover is designed to be reversible because Sanity is kept current via
dual-write. If the Postgres backbone misbehaves, fall back to the pre-cutover
path **without data loss**:

1. **Data/content/tenants:** unset (or set to `sanity`) the `CONTENT_SOURCE`,
   `TENANTS_SOURCE`, and `DATA_SOURCE` env vars on the Vercel `strelva` project,
   then redeploy. Reads/writes return to Sanity + Redis (still current via
   dual-write).
2. **Auth:** Supabase Auth is the live path. If it must be reverted, Clerk is
   still dead-pathed behind `isSupabaseAuthConfigured()` — reverting requires
   restoring the Clerk env config + redeploy. Treat this as a last resort
   (Clerk has a single migrated user) and coordinate with the owner first.
3. Confirm `/api/health` is green and a dashboard sign-in works after the flip.

> This rollback path holds only **until the deliberate teardown** (remove Sanity
> reads, lock the Sanity dataset, unwrap `clerkMiddleware` in `src/proxy.ts`).
> Once that ships, Postgres/Supabase is the only path and this section retires.

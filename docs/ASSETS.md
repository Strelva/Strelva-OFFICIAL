# Strelva (Websites) — Asset Note

Created 2026-06-10 by observation (first /features run). Last updated 2026-07-30. Update on events, not on schedule. Mark unverified things unverified.

## Non-derivable externals
- **Clients**: GLDF (live custom repo, grandfathered), Rohlax (live custom repo; one-time deal, grandfathered — never recurring). Two referenceable builds; no testimonials captured yet (unverified whether either would give one).
- **Revenue**: Rohlax one-time build payment (via /pay/rohlax; verify in Stripe/`reb:build-payment:*`). Billing live on new Strelva Stripe account (`acct_1Tmc5dA4gUnh4arE`) for new clients.
- **Production data**: per-tenant event streams (Redis `UnifiedEvent` with Postgres mirror via governed-work ontology), weekly-report history, review-poll history (Google/Yelp crons), Search Console pulls, client-site traffic beacons.
- **Relationships/territory**: Buffalo NY presence ("Built in Buffalo" is true), two founders' local network.
- **Research corpus**: docs/strategy/* verified research.

## Portfolio assets (cross-product)
- Deep-research / scout / ideation agent harness (global).
- AI-visibility scorecard script (`scripts/ai-visibility.ts`, --html one-pager) — door-opener artifact, reusable across verticals.

## Derivable (observe live, weakest ground)
- Control plane: agent + governance, weekly brief pipeline, events queue, integrations registry (**GBP write-side IS live**: `buildGbpTools` in `src/lib/agent-shared.ts` provides `create_gbp_post` / `update_business_hours` / `upload_gbp_photo` — all queue a `status:"pending"` event, real write fires on owner approval in `src/lib/event-actions.ts`), pay links, HMAC custom-repo contract, tracker, Collections CMS (blog/video/product via `collection_entries` in Postgres), review-reply drafting + governed auto-post.
- Marketing site: strelva.com live (separate `~/strelva-marketing` repo — marketing changes go there, not this repo). `/tools` scans and the audit scoring engine consolidation: this repo (`strelva-platform`) is now the ONLY audit scoring engine; the old marketing `src/lib/tools/checks/*` shallow engine was deleted 2026-07-14. All `/audit` scoring flows through `src/lib/audit/checks.ts` here.

## Known issues / TODO (platform-wide, 2026-07-30)

Critical items that cross-cut the platform; see individual docs for context:

- [CRITICAL] Next.js 16.2.6 has 4 HIGH + 3 MODERATE CVEs. Bump to 16.2.12 in `package.json` (also bump `eslint-config-next`). Deploy with `vercel --prod --yes --scope strelva`. (Audit finding)
- [HIGH] Seven orphaned Clerk and Sanity secrets still live in Vercel env (`.vercel/.env.production.local` confirms: `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_DOMAIN`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `SANITY_API_TOKEN`, `SANITY_WEBHOOK_SECRET`, `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `REVALIDATION_SECRET`, `CORS_ORIGINS`, `NX_DAEMON`, `TURBO_CACHE`, `TURBO_DOWNLOAD_LOCAL_ENABLED`, `TURBO_REMOTE_ONLY`, `TURBO_RUN_SUMMARY`). Run `vercel env rm` for each across all environments.
- [HIGH] `SECRETS_ENC_KEY` and `SUPABASE_URL` (private, service-role) are missing from `.env.example` and the production checklist (`scripts/production-checklist.ts`). Removing `SECRETS_ENC_KEY` from Vercel causes full platform outage via unguarded throw in `loadTenants`.
- [HIGH] `upload_image` agent tool uses unscoped `uploadFile()` — uploads go to a shared flat Blob namespace instead of `uploadTenantMedia(tenant, ...)`. Fix in `src/app/api/agent/route.ts:568`.
- [HIGH] `google-meta:${tenant}` and several `reb:review-*` keys are missing from `authoritativePatterns` in `src/lib/tenant-rename.ts` — GBP meta and review-reply state are silently stranded on tenant rename.
- [HIGH] `businessRules` field injected unsanitized into the agent system prompt (`src/lib/agent-prompt-shared.ts:343`). Wrap in `sanitizePromptValue` and enforce a max-length cap at write time.
- [HIGH] `Cache-Control: private` missing on v1 collections list and single-entry routes — CDN cache cross-tenant leak risk.
- [HIGH] Fractional star delta causes uncaught Redis error in `adjustStars` (`src/app/api/rewards/members/[email]/adjust/route.ts:35`). Add `Number.isInteger(delta)` guard.
- [HIGH] SSRF: AI-visibility scorer (`src/lib/ai-visibility/score.ts`) fetches user-supplied URL without pre-validation. Call `validateUrlSafety(url)` before fetch.
- [HIGH] `buildOpsReport` has a fully serial N+1 loop — 3 sequential awaits per tenant with no concurrency cap (`src/lib/ops.ts:113-157`).
- See audit findings in AGENTS.md stack notes and individual source files for the full MEDIUM/LOW list.

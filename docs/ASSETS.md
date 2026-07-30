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

## Known issues / TODO (platform-wide)

All items below reflect end-of-day 2026-07-30 state. The 2026-07-30 deep audit closed 139+ issues; see `AGENTS.md` "Audit remediation status" for the authoritative FIXED/REMAINING split and `docs/audit-2026-07-30-deep-audit.md` for the original finding record.

**Open (not yet fixed):**
- [HIGH] `google-meta:${tenant}` and several `reb:review-*` keys are missing from `authoritativePatterns` in `src/lib/tenant-rename.ts` — GBP meta and review-reply state are silently stranded on tenant rename. Add to the registry and the completeness unit test.

**Closed (DONE 2026-07-30):**
- Next.js bumped 16.2.6 → 16.2.12 (+ `eslint-config-next`); `pnpm audit` 24 vulns (14 high) → 3 (1 high dev-only via eslint's `minimatch`, 2 moderate OpenTelemetry/Sentry; 0 high in the production runtime).
- Orphaned Vercel env vars removed (all 11: `CLERK_*` ×7, `SANITY_API_TOKEN`, `SANITY_WEBHOOK_SECRET`, `REVALIDATION_SECRET`, `CORS_ORIGINS`). `NEXT_PUBLIC_SANITY_*` kept for legacy image-URL resolution.
- `SECRETS_ENC_KEY`, `SUPABASE_URL`, `SUPER_ADMIN_EMAILS`, and `APPROVE_LINK_SECRET` added to `.env.example` and validated in `scripts/production-checklist.ts`.
- `upload_image` agent tool now calls `uploadTenantMedia(tenant, ...)` — uploads are tenant-prefixed.
- `businessRules` sanitized in agent system prompt (`src/lib/agent-prompt-shared.ts`).
- `Cache-Control: private` added to both v1 collections routes.
- Fractional star delta guard added to `adjustStars`.
- SSRF guard (`validateUrlSafety`) added to AI-visibility scorer before every fetch.
- `buildOpsReport` N+1 collapsed to `mapPool(active, 8, ...)`.

See `AGENTS.md` "Audit remediation status" for the full list and `docs/audit-2026-07-30-deep-audit.md` for finding detail.

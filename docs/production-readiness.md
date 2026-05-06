# REB Production Readiness

## Branch And Release Model

- Primary branch: `main`.
- GLDF primary branch: `master` until intentionally renamed.
- Tag control-plane releases as `reb-vYYYY.MM.DD.N`.
- Record compatible storefront tags or commit SHAs in each REB release note.

## API Contract

- `src/lib/reb-contracts.ts` is the source of truth for route builders, tenant constants, revalidation payloads, and HMAC signing in this repo.
- GLDF vendors the same contract helpers so both repos build independently without a sibling package dependency.
- Versioned public storefront endpoints:
  - `GET /api/v1/content/:tenant/:section`
  - `GET /api/v1/page-config/:tenant`
- Legacy public aliases currently exist under `/api/public/*`; new storefronts should use `/api/v1/*`.
- Storefront revalidation targets should prefer `/api/v1/revalidate`.

## Tenant Deployment Checklist

- Confirm required platform env vars are set in production:
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`,
  `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `SANITY_API_TOKEN`,
  `SANITY_WEBHOOK_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
  `INTERNAL_API_SECRET`, `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_SCAFFOLD_PRICE_ID`,
  `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_DOMAIN`, `SENTRY_DSN`,
  `NEXT_PUBLIC_SITE_URL`, and tenant-specific revalidation secrets.
- Use `.env.production.example` as the owner handoff template for Vercel
  Production. `.env.example` is for local development and may show test-mode
  placeholders.
- Confirm production env vars are live production values. `pnpm check:prod`
  rejects Clerk `pk_test_` / `sk_test_` keys, Stripe `sk_test_` keys,
  non-`https://` service URLs, localhost site URLs, and webhook/API key values
  that do not match the expected production key shape.
- Keep `AI_AUTO_PUBLISH=false` for first production tenants unless the tenant has explicitly approved automatic publish.
- Provision tenant with `pnpm provision-tenant` and store a unique `revalidationSecret`.
- Set the storefront `REVALIDATE_SECRET` to the same value.
- Set tenant `revalidateUrl` to the storefront `/api/v1/revalidate` endpoint.
- Confirm custom domain mapping resolves tenant from host or use `/api/v1/*` public routes.
- Add production domains in Vercel, including `www` and `admin` variants where used.
- Configure DNS and wait for Vercel domain verification before sending traffic.
- Configure Sanity webhook to call `/api/sanity/webhook` with the production webhook secret.
- Configure Stripe webhook to call `/api/billing/webhook`.
- Configure Clerk webhook to call `/api/clerk/webhook`.
- Run `pnpm lint`.
- Run `pnpm typecheck`.
- Run `pnpm test`.
- Run `pnpm audit --audit-level=high`.
- Run `pnpm build`.
- Run `pnpm check:prod` against production env values.
- Run `PLAYWRIGHT_BASE_URL=<deployment-url> pnpm smoke`.
- Review `docs/launch-blockers.md`; it must be empty or every listed item must be intentionally waived in the release note.
- Review `docs/design-kit.md` and confirm launch surfaces follow the documented token, accessibility, motion, AI transparency, and Core Web Vitals standards.
- Confirm mobile zoom is not locked, focus states are visible, and key flows are keyboard reachable.
- Verify `/dashboard/site` loads, the preview iframe renders with `?preview=true`, a content edit saves, and the preview refreshes. Confirm `/dashboard/content` redirects to `/dashboard/site`.
- Verify public tenant pages cannot be framed without `?preview=true`.
- Verify `admin.<custom-domain>` redirects root traffic to `/dashboard`.
- Verify `/api/cron/*` returns 401 without the bearer secret and succeeds with it.

## Tenant Provisioning Runbook

1. Create or update the tenant record with `id`, `subdomain`, `siteUrl`, `customDomains`, `ownerEmail`, enabled features, and subscription status.
2. Generate a unique revalidation secret with `openssl rand -hex 32`.
3. Store the revalidation secret in tenant config and the matching storefront environment.
4. Add domain entries to `CUSTOM_DOMAIN_MAP` for the apex domain; `www.` and `admin.` resolve through the apex fallback.
5. Add the apex, `www`, and `admin` domains to Vercel if the tenant uses a custom domain.
6. Configure DNS from the registrar to Vercel and confirm Vercel marks each domain valid.
7. Confirm Sanity content exists for the tenant before switching DNS.
8. Run the verification checklist above against the deployment URL and final domains.

## Incident And Rollback Runbook

- Broken deploy: redeploy the previous known-good Vercel deployment, then run smoke tests against the restored URL.
- Tenant fails to load: check `CUSTOM_DOMAIN_MAP`, Sanity tenant status, Redis/domain-map cache, and the `x-tenant` response path in proxy logs.
- DNS issue: verify apex and `www` records in the registrar, then re-check Vercel domain verification.
- Dashboard preview fails: inspect the preview response CSP; preview pages should include dashboard frame ancestors and should not emit `X-Frame-Options: DENY`.
- Revalidation fails: confirm tenant `revalidateUrl`, matching `REVALIDATE_SECRET`, `INTERNAL_API_SECRET`, and webhook delivery status.
- Stripe webhook fails: check webhook signing secret, endpoint URL, Stripe event delivery, and tenant subscription status.
- Sanity webhook fails: confirm webhook URL, secret, and that content publish events include the changed tenant.
- AI content published unexpectedly: set `AI_AUTO_PUBLISH=false`, audit recent generated changes, restore prior content version if needed, and re-run revalidation.

## Content Schema Rollback Plan

- Keep new content fields optional in REB for one storefront release.
- Deploy storefront rendering support before requiring a new field in REB.
- If content breaks a storefront, restore the previous content version from REB version history.
- If code breaks a storefront, redeploy the previous Vercel deployment or release tag.
- For incompatible schema changes, publish a new API version and keep `/api/v1/*` stable until all storefronts migrate.

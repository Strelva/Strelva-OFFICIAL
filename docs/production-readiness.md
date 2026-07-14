# Strelva Production Readiness

> **Status: current release runbook (updated 2026-07-14).** Auth is Supabase-only;
> Postgres owns durable tenant/content state; Redis owns only the operational
> boundaries listed in `persistence-boundaries.md`. Clerk and Sanity code teardown
> are complete. The remaining Sanity work is ops-only legacy image URL cleanup.
> `strelva.com` is the separate marketing property; the canonical control plane
> and API origin is `https://app.strelva.com`.

## Branch And Release Model

- Primary branch: `main`.
- GLDF primary branch: `master` until intentionally renamed.
- Rohlax Wellness primary branch: `main`.
- Tag control-plane releases as `reb-vYYYY.MM.DD.N`.
- Record compatible storefront tags or commit SHAs in each Strelva release note.

## API Contract

- `src/lib/scaffold-contracts.ts` is the source of truth for route builders, tenant constants, revalidation payloads, and HMAC signing in this repo.
- GLDF vendors the same contract helpers so both repos build independently without a sibling package dependency.
- Rohlax Wellness vendors the same v1 contract helpers and exposes the same signed `/api/v1/revalidate` endpoint.
- Versioned public storefront endpoints:
  - `GET /api/v1/content/:tenant/:section`
  - `GET /api/v1/page-config/:tenant`
- The legacy `/api/public/*` aliases were removed; all storefronts use `/api/v1/*` directly.
- Storefront revalidation targets should prefer `/api/v1/revalidate`.

## Tenant Deployment Checklist

- Confirm required platform env vars are set in production:
  `GOOGLE_GENERATIVE_AI_API_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `CONTENT_SOURCE=postgres`, `TENANTS_SOURCE=postgres`, `DATA_SOURCE=postgres` (the live data backbone),
  `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
  `INTERNAL_API_SECRET`, `CRON_SECRET`, `OAUTH_STATE_SECRET`, `SCAFFOLD_CUSTOM_REQUEST_SECRET` (legacy alias `REB_CUSTOM_REQUEST_SECRET`), `STRIPE_SECRET_KEY`, `STRIPE_SCAFFOLD_PRICE_ID`,
  `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_DOMAIN`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`,
  `NEXT_PUBLIC_SITE_URL=https://strelva.com`, `NEXT_PUBLIC_APP_URL=https://app.strelva.com`, and tenant-specific revalidation secrets.
- Confirm the Presence, Growth, and Scale Stripe prices match `billing-plans.ts`.
  `STRIPE_SCAFFOLD_PRICE_ID` remains the compatibility rollout gate and Growth fallback;
  it does not define a tenant's plan or software capabilities.
- Use `.env.production.example` as the owner handoff template for Vercel
  Production. `.env.example` is for local development and may show test-mode
  placeholders.
- Confirm production env vars are live production values. `pnpm check:prod`
  rejects Stripe `sk_test_` keys, short OAuth state secrets, non-`https://`
  service URLs, localhost site URLs, OAuth pairs missing their matching secret
  or client ID, OAuth redirects without `NEXT_PUBLIC_APP_URL`, and
  webhook/API key values that do not match the expected production key shape.
- Confirm the Supabase project URL, publishable key, and service-role key belong
  to the same project. Authorization comes from `memberships` and `super_admins`.
- Keep `AI_AUTO_PUBLISH=false` for first production tenants unless the tenant has explicitly approved automatic publish.
- Before release, review active tenants through `/admin/clients` or the Postgres-backed
  tenant repository and deactivate internal test tenants that should not be customer-facing.
  Every active launch tenant must have a customer-facing `productionDomain` or
  `customDomains` entry, an `adminDomain` or derivable `admin.<productionDomain>`,
  and `revalidateUrl` plus `revalidationSecret`; `pnpm check:prod` fails active tenants
  that are missing those fields.
- Provision tenant with `pnpm provision-tenant` and store a unique `revalidationSecret`.
- Set the storefront `REVALIDATE_SECRET` to the same value.
- Set tenant `revalidateUrl` to the storefront `/api/v1/revalidate` endpoint.
- Set `REB_CUSTOM_REQUEST_SECRET` in Strelva and in any custom storefront that exposes `/api/reb-custom-request`; the values must match exactly and must not include copied newline text.
- Run `pnpm check:custom-repos` from Strelva to verify local GLDF and Rohlax storefront repos still expose the expected Strelva contract files, env templates, capability manifests, and signed revalidation endpoints.
- Confirm custom domain mapping resolves tenant from host or use `/api/v1/*` public routes.
- Add production domains in Vercel, including `www` and `admin` variants where used.
- Configure DNS and wait for Vercel domain verification before sending traffic.
- For Cloudflare-managed tenant domains, keep the Vercel project domain entries and add the records Vercel recommends in Cloudflare. Current Rohlax evidence: `admin.rohlaxwellness.com` is attached to `scaffold-web`, `rohlaxwellness.com` is attached to `rohlax-wellness`, and `www` plus `admin` currently expose a Vercel CNAME alias but still fail `dns.resolve4(...)`/`curl`; Cloudflare still needs `A www.rohlaxwellness.com 76.76.21.21` plus `A admin.rohlaxwellness.com 76.76.21.21`.
- Confirm `https://app.strelva.com/api/health` resolves to the control-plane Vercel
  project and returns JSON. The marketing apex is not an API health target.
- Configure Stripe webhook `https://app.strelva.com/api/billing/webhook` for
  `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, and
  `customer.subscription.deleted`, with `STRIPE_WEBHOOK_SECRET` set to the matching signing secret.
- Run `pnpm lint`.
- Run `pnpm typecheck`.
- Run `pnpm test`.
- Run `pnpm audit`.
- Run `pnpm build`.
- Run `pnpm check:prod` against production env values.
- Run `git status --short` and confirm the branch is clean before any CLI production deploy or release verification that should represent the release branch.
- Redeploy the Vercel Production app after env or code changes from the Vercel dashboard or from a clean release branch with `vercel deploy --prod` before running live verification. The release branch must contain the launch-readiness fixes being verified; do not only redeploy an older artifact, and do not run a CLI production deploy from a dirty local working tree.
- After redeploy, verify the control-plane hostname has the current customer access copy: `PLAYWRIGHT_BASE_URL=https://app.strelva.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm exec playwright test tests/customer-frontend.spec.ts -g "signed-out dashboard customers"`.
- Run `REB_DEV_UNGATED_ACCESS=0 PLAYWRIGHT_BASE_URL=https://app.strelva.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm smoke` only after `https://app.strelva.com/api/health` returns the control-plane health JSON.
- Or run `PLAYWRIGHT_BASE_URL=https://app.strelva.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm check:release` for the local release gate in one command; local smoke runs against the built Next app and `check:release` forces `REB_DEV_UNGATED_ACCESS=0`.
- Review `docs/launch-blockers.md`; `Current Blockers` must be empty or every listed item must be moved to `Waived Blockers` with `Status: waived`, `Owner:`, release note/PR/ticket reference, `Follow-up:`, and `Reason:` so `pnpm check:prod` can validate it.
- GitHub release tagging requires confirming `pnpm check:release` passed or that blockers were owner-waived, plus a real release note, PR, URL, or ticket reference. Placeholder references such as `none`, `n/a`, `todo`, `tbd`, or `pending` are rejected.
- Review `docs/design-kit.md` and confirm launch surfaces follow the documented token, accessibility, motion, AI transparency, and Core Web Vitals standards.
- Confirm mobile zoom is not locked, focus states are visible, and key flows are keyboard reachable.
- Verify signed-out `/dashboard` and `/no-access` redirect to `/sign-in`, never `/app`, and that `/sign-in` and `/sign-up` explain using the exact invited email address. On the app host, auth should finish at `/account` so multi-tenant customers reach the correct site; on tenant/admin hosts, auth should finish at `/dashboard`. Local smoke defaults to port `3100` and does not reuse an existing server, so failures cannot be hidden by a different app running on `localhost:3000`.
- Verify `/dashboard/site` loads, the preview iframe renders with `?preview=true`, a content edit saves, and the preview refreshes. Confirm `/dashboard/content` redirects to `/dashboard/site`.
- Verify public tenant pages cannot be framed without `?preview=true`.
- Verify `admin.greatlakesdriedfruit.com` redirects root traffic to `/dashboard`, then signed-out users reach `/sign-in` with invited-email guidance.
- Verify cron auth with `curl -i https://app.strelva.com/api/cron/maintenance` and `curl -i -H "Authorization: Bearer $CRON_SECRET" https://app.strelva.com/api/cron/maintenance`; the first request must return 401 and the second must return a non-401 response.
- Production Live Verification is not complete until an invited owner reaches `/dashboard/site`, a content edit saves and refreshes preview, Supabase Auth and Stripe webhook verification succeed, and cron 401/success behavior is verified with `CRON_SECRET`.

## Customer Access Handoff

1. Confirm the Supabase URL/publishable key, `RESEND_API_KEY`, and `RESEND_DOMAIN` are set in Vercel Production and that `app.strelva.com` is on the Supabase Auth redirect allowlist.
2. Open `/admin` as a super admin and use each tenant row's `Invite` action to invite the tenant `ownerEmail`. The invite calls `/api/admin/invites`, normalizes the email, stores a 30-day invite, emails the tenant sign-up link with the invited email prefilled when Resend is configured, and immediately assigns an existing Supabase user if the email already has an account.
3. Ask the customer to create or sign into their account with the exact invited email address. The invite link preloads that address on sign-up, the sign-in/sign-up links preserve it if they switch flows, and the Supabase provisioning trigger claims the pending invite on verified sign-in.
4. If the customer starts from `app.strelva.com/sign-in`, confirm they land on `/account` after auth and can open the correct site. If the signed-in email has no tenant access, `/account` must explain that the account has no invited sites and offer `Use invited email` plus support contact.
5. If the customer used the wrong account, send them to `/no-access`, then use `Use invited email` to sign out and return to `/sign-in`.
6. Verify the customer can load `/dashboard/site` on `admin.greatlakesdriedfruit.com` and that `/dashboard/content` redirects to `/dashboard/site`.

## Tenant Provisioning Runbook

1. Create or update the tenant record with `id`, `subdomain`, `siteUrl`, `customDomains`, `ownerEmail`, enabled features, and subscription status.
2. Generate a unique revalidation secret with `openssl rand -hex 32`.
3. Store the revalidation secret in tenant config and the matching storefront environment.
4. Add domain entries to `CUSTOM_DOMAIN_MAP` for the apex domain; `www.` and `admin.` resolve through the apex fallback.
5. Add the apex, `www`, and `admin` domains to Vercel if the tenant uses a custom domain.
6. Configure DNS from the registrar to Vercel and confirm Vercel marks each domain valid.
   For Cloudflare-managed domains, add the exact A/CNAME records Vercel recommends inside Cloudflare rather than changing registrar nameservers unless intentionally moving DNS to Vercel.
7. Confirm Postgres content and the custom-repository capability manifest exist for the tenant before switching DNS.
8. Run the verification checklist above against the deployment URL and final domains.

## Incident And Rollback Runbook

- Broken deploy: redeploy the previous known-good Vercel deployment, then run smoke tests against the restored URL.
- Tenant fails to load: check the Postgres tenant record, domain claims/map cache, and the `x-tenant` response path in proxy logs.
- DNS issue: verify apex and `www` records in the registrar, then re-check Vercel domain verification.
- Dashboard preview fails: inspect the preview response CSP; preview pages should include dashboard frame ancestors and should not emit `X-Frame-Options: DENY`.
- Revalidation fails: confirm tenant `revalidateUrl`, matching `REVALIDATE_SECRET`, `INTERNAL_API_SECRET`, and webhook delivery status.
- Stripe webhook fails: check webhook signing secret, endpoint URL, Stripe event delivery, and tenant subscription status.
- AI content published unexpectedly: set `AI_AUTO_PUBLISH=false`, audit recent generated changes, restore prior content version if needed, and re-run revalidation.

## Content Schema Rollback Plan

- Keep new content fields optional in Strelva for one storefront release.
- Deploy storefront rendering support before requiring a new field in Strelva.
- If content breaks a storefront, restore the previous content version from Strelva version history.
- If code breaks a storefront, redeploy the previous Vercel deployment or release tag.
- For incompatible schema changes, publish a new API version and keep `/api/v1/*` stable until all storefronts migrate.

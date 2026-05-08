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
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`,
  `SUPER_ADMIN_EMAILS`, `GOOGLE_GENERATIVE_AI_API_KEY`,
  `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `SANITY_API_TOKEN`,
  `SANITY_WEBHOOK_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
  `INTERNAL_API_SECRET`, `CRON_SECRET`, `OAUTH_STATE_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_SCAFFOLD_PRICE_ID`,
  `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_DOMAIN`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`,
  `NEXT_PUBLIC_SITE_URL`, and tenant-specific revalidation secrets. Set `NEXT_PUBLIC_APP_URL=https://scaffoldweb.com` when Google, Instagram, or Calendly OAuth connections are enabled.
- Confirm `STRIPE_SCAFFOLD_PRICE_ID` points to the live recurring monthly USD price for exactly $149/month. The checkout route and customer-facing pricing copy assume this plan price.
- Use `.env.production.example` as the owner handoff template for Vercel
  Production. `.env.example` is for local development and may show test-mode
  placeholders.
- Confirm production env vars are live production values. `pnpm check:prod`
  rejects Clerk `pk_test_` / `sk_test_` keys, Stripe `sk_test_` keys,
  Clerk sign-in/sign-up URLs that do not use the app-owned `/sign-in` and
  `/sign-up` routes, short OAuth state secrets, non-`https://` service URLs, localhost site URLs, OAuth pairs missing their matching secret or client ID, OAuth redirects without `NEXT_PUBLIC_APP_URL`, and
  webhook/API key values that do not match the expected production key shape.
- Confirm Clerk publishable key, secret key, and webhook secret all come from the same live Clerk instance. Mixed Clerk instances can make `/sign-in` loop before the customer sees the invited-email guidance.
- Keep `AI_AUTO_PUBLISH=false` for first production tenants unless the tenant has explicitly approved automatic publish.
- Provision tenant with `pnpm provision-tenant` and store a unique `revalidationSecret`.
- Set the storefront `REVALIDATE_SECRET` to the same value.
- Set tenant `revalidateUrl` to the storefront `/api/v1/revalidate` endpoint.
- Confirm custom domain mapping resolves tenant from host or use `/api/v1/*` public routes.
- Add production domains in Vercel, including `www` and `admin` variants where used.
- Configure DNS and wait for Vercel domain verification before sending traffic.
- Confirm `https://scaffoldweb.com/api/health` resolves to the Vercel Next.js app, not a domain-forwarding or link-shortener service. For Porkbun-managed DNS, Vercel currently recommends `A scaffoldweb.com 76.76.21.21` or changing nameservers to `ns1.vercel-dns.com` and `ns2.vercel-dns.com`. `pnpm check:prod` fails this check when the public production host redirects away from `scaffoldweb.com` or does not return Vercel health JSON.
- Configure Sanity webhook `https://scaffoldweb.com/api/sanity/webhook` for content create/update/delete events with `SANITY_WEBHOOK_SECRET` set to the matching webhook secret.
- Configure Stripe webhook `https://scaffoldweb.com/api/billing/webhook` for `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, and `customer.subscription.deleted`, with `STRIPE_WEBHOOK_SECRET` set to the matching signing secret.
- Configure Clerk webhook `https://scaffoldweb.com/api/clerk/webhook` for the `user.created` event and set `CLERK_WEBHOOK_SECRET` to the matching endpoint signing secret.
- Run `pnpm lint`.
- Run `pnpm typecheck`.
- Run `pnpm test`.
- Run `pnpm audit`.
- Run `pnpm build`.
- Run `pnpm check:prod` against production env values.
- Run `git status --short` and confirm the branch is clean before any CLI production deploy or release verification that should represent the release branch.
- Redeploy the Vercel Production app after env changes from the Vercel dashboard or from a clean release branch with `vercel deploy --prod` before running live verification. Do not run a CLI production deploy from a dirty local working tree.
- After redeploy, verify the Vercel app hostname has the current customer access copy before relying on final DNS: `PLAYWRIGHT_BASE_URL=https://reb-studio.vercel.app PLAYWRIGHT_TENANT_ORIGIN=https://admin.greatlakesdriedfruit.com pnpm exec playwright test tests/customer-frontend.spec.ts -g "signed-out dashboard customers"`.
- Run `REB_DEV_UNGATED_ACCESS=0 PLAYWRIGHT_BASE_URL=https://scaffoldweb.com PLAYWRIGHT_TENANT_ORIGIN=https://admin.greatlakesdriedfruit.com pnpm smoke` only after `https://scaffoldweb.com/api/health` stays on `scaffoldweb.com` and returns the Vercel Next.js health response.
- Or run `PLAYWRIGHT_BASE_URL=https://scaffoldweb.com PLAYWRIGHT_TENANT_ORIGIN=https://admin.greatlakesdriedfruit.com pnpm check:release` for the local release gate in one command; `check:release` forces `REB_DEV_UNGATED_ACCESS=0` for smoke.
- Review `docs/launch-blockers.md`; `Current Blockers` must be empty or every listed item must be moved to `Waived Blockers` with `Status: waived`, `Owner:`, release note/PR/ticket reference, `Follow-up:`, and `Reason:` so `pnpm check:prod` can validate it.
- GitHub release tagging requires confirming `pnpm check:release` passed or that blockers were owner-waived, plus a real release note, PR, URL, or ticket reference. Placeholder references such as `none`, `n/a`, `todo`, `tbd`, or `pending` are rejected.
- Review `docs/design-kit.md` and confirm launch surfaces follow the documented token, accessibility, motion, AI transparency, and Core Web Vitals standards.
- Confirm mobile zoom is not locked, focus states are visible, and key flows are keyboard reachable.
- Verify signed-out `/dashboard` and `/no-access` redirect to `/sign-in`, never `/app`, and that `/sign-in` and `/sign-up` explain using the exact invited email address. On root marketing hosts, auth should finish at `/account` so multi-tenant or custom-domain customers reach the correct site; on tenant/admin hosts, auth should finish at `/dashboard`. Local smoke defaults to port `3100` and does not reuse an existing server, so failures cannot be hidden by a different app running on `localhost:3000`.
- Verify `/dashboard/site` loads, the preview iframe renders with `?preview=true`, a content edit saves, and the preview refreshes. Confirm `/dashboard/content` redirects to `/dashboard/site`.
- Verify public tenant pages cannot be framed without `?preview=true`.
- Verify `admin.greatlakesdriedfruit.com` redirects root traffic to `/dashboard`, then signed-out users reach `/sign-in` with invited-email guidance.
- Verify cron auth with `curl -i https://scaffoldweb.com/api/cron/maintenance` and `curl -i -H "Authorization: Bearer $CRON_SECRET" https://scaffoldweb.com/api/cron/maintenance`; the first request must return 401 and the second must return a non-401 response.
- Production Live Verification is not complete until an invited owner reaches `/dashboard/site`, a content edit saves and refreshes preview, Clerk/Sanity/Stripe webhook deliveries are confirmed in provider dashboards, and cron 401/success behavior is verified with `CRON_SECRET`.

## Customer Access Handoff

1. Confirm `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`, live Clerk keys, `CLERK_WEBHOOK_SECRET`, `RESEND_API_KEY`, and `RESEND_DOMAIN` are set in Vercel Production.
2. Open `/admin` as a super admin and use each tenant row's `Invite` action to invite the tenant `ownerEmail`. The invite calls `/api/admin/invites`, normalizes the email, stores a 30-day invite, emails the tenant sign-up link when Resend is configured, and immediately assigns an existing Clerk user if the email already has an account.
3. Ask the customer to create or sign into their account with the exact invited email address. Clerk `user.created` webhooks consume the stored invite and assign the tenant role automatically.
4. If the customer starts from `scaffoldweb.com/sign-in`, confirm they land on `/account` after auth and can open the correct site. If the signed-in email has no tenant access, `/account` must explain that the account has no invited sites and offer `Use invited email` plus support contact.
5. If the customer used the wrong account, send them to `/no-access`, then use `Use invited email` to sign out and return to `/sign-in`.
6. Verify the customer can load `/dashboard/site` on `admin.greatlakesdriedfruit.com` and that `/dashboard/content` redirects to `/dashboard/site`.

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

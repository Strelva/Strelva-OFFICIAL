# REB Launch Blockers

Last local audit: May 8, 2026.

This file tracks launch blockers that cannot be resolved by code changes alone. `pnpm check:prod` fails while this file contains unwaived blockers. A release is not complete until this file is empty or every remaining item is explicitly waived in the release note with owner approval.

## Current Blockers

### Required Production Env Vars And Stripe Price

`vercel env pull .env.production.local --environment=production` now succeeds locally, and `pnpm check:prod` reads the pulled Production values. The remaining required launch failures are:

- `CLERK_WEBHOOK_SECRET`
- `SANITY_WEBHOOK_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_APP_URL` if Google, Instagram, or Calendly OAuth is enabled.
- `STRIPE_SCAFFOLD_PRICE_ID` currently points at live active Stripe price `price_1TM7v0D99ZGeTugfpmyYup3V` on product `prod_UKnWPSG3QOtOUz`, but that price is `$20/month USD` instead of the required `$149/month USD` Scaffold Web plan.

Pulled Production values that now pass the checker include `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_DOMAIN`, `CRON_SECRET`, `INTERNAL_API_SECRET`, `OAUTH_STATE_SECRET`, `NEXT_PUBLIC_SITE_URL`, `CUSTOM_DOMAIN_MAP`, `MARKETING_DOMAINS`, `AI_AUTO_PUBLISH`, `SMS_SUGGESTIONS_ENABLED`, Sanity project/dataset/API token, and `GOOGLE_GENERATIVE_AI_API_KEY`.

Vercel access is now confirmed locally: `vercel whoami` returns `rhinehart514-5576`, and `vercel env ls production` can read encrypted Production env variable names for project `reb-studio`.

Required owner action:

1. Set each value in Vercel Production for the REB control-plane project with live production credentials.
2. Use `.env.production.example` as the checklist for required and optional Vercel Production values.
3. Confirm matching webhook secrets in Clerk, Sanity, and Stripe.
4. Keep generated local secrets such as `CRON_SECRET`, `INTERNAL_API_SECRET`, and `OAUTH_STATE_SECRET` at least 32 characters long; all three are currently present in pulled Production env.
5. Create or select the live Stripe recurring monthly USD price for exactly $149/month, then update `STRIPE_SCAFFOLD_PRICE_ID` in Vercel Production to that price ID.
6. Pull the Vercel Production env locally with `vercel env pull .env.production.local --environment=production`.
7. Re-run `pnpm check:prod`; the checklist loads `.env.production.local` before local development env files.
8. Redeploy the Vercel Production app after env changes, either from the Vercel dashboard or from a clean release branch with `vercel deploy --prod`, before running live verification. Do not run a CLI production deploy from a dirty local working tree.

Copyable Vercel env commands for the current failures:

```bash
vercel env add CLERK_WEBHOOK_SECRET production
vercel env add SANITY_WEBHOOK_SECRET production
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
vercel env add SENTRY_DSN production
vercel env add NEXT_PUBLIC_SENTRY_DSN production
```

Because `STRIPE_SCAFFOLD_PRICE_ID` already exists but points at the wrong price, remove the old Production value first if Vercel will not overwrite it:

```bash
vercel env rm STRIPE_SCAFFOLD_PRICE_ID production --yes
vercel env add STRIPE_SCAFFOLD_PRICE_ID production
```

Add this only if Google, Instagram, or Calendly OAuth is enabled:

```bash
vercel env add NEXT_PUBLIC_APP_URL production
```

Provider value sources:

- `CLERK_WEBHOOK_SECRET`: Clerk Dashboard -> Webhooks -> endpoint for `https://scaffoldweb.com/api/clerk/webhook` -> signing secret.
- Clerk publishable key, secret key, and webhook secret must come from the same live Clerk instance; mixed instances can make `/sign-in` loop before the invited-email UI loads.
- `SANITY_WEBHOOK_SECRET`: Sanity project webhook settings for `https://scaffoldweb.com/api/sanity/webhook`; use the same secret value in Sanity and Vercel.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis database -> REST API section.
- `SENTRY_DSN`: Sentry project settings -> Client Keys / DSN for server-side event reporting.
- `NEXT_PUBLIC_SENTRY_DSN`: Sentry browser/client DSN for the same production project.
- `STRIPE_SCAFFOLD_PRICE_ID`: Stripe live-mode Products -> Scaffold Web plan -> recurring monthly USD price for exactly $149/month. Current wrong value resolves to `price=price_1TM7v0D99ZGeTugfpmyYup3V`, `product=prod_UKnWPSG3QOtOUz`, `livemode=true`, `active=true`, `amount=2000`, `currency=usd`, `interval=month`.
- `NEXT_PUBLIC_APP_URL`: set to `https://scaffoldweb.com` only when Google, Instagram, or Calendly OAuth is enabled.

Do not overwrite the values already passing the checker unless the provider dashboard says they are wrong. If any generated local secret must be rotated, generate it first with `openssl rand -hex 32`, update the matching provider or caller, pull env again, then rerun `pnpm check:prod`.

After `pnpm check:prod` no longer reports env failures, redeploy before live verification. Prefer the Vercel dashboard redeploy flow unless the local branch is clean and ready to ship:

```bash
git status --short
vercel deploy --prod
PLAYWRIGHT_BASE_URL=https://reb-studio.vercel.app PLAYWRIGHT_TENANT_ORIGIN=https://admin.greatlakesdriedfruit.com pnpm exec playwright test tests/customer-frontend.spec.ts -g "signed-out dashboard customers"
```

Minimum production values to confirm in Vercel:

- Clerk: live publishable key, live secret key, webhook secret, and sign-in/sign-up URLs set to `/sign-in` and `/sign-up`.
- Admin: `SUPER_ADMIN_EMAILS` includes the owner/admin email addresses that can access the control plane.
- AI: `GOOGLE_GENERATIVE_AI_API_KEY` is set for the production agent.
- Sanity: project ID, dataset, API token, and webhook secret are all production values.
- Redis: Upstash REST URL and token. Required for distributed rate limiting, events, queues, chat state, and production storage paths.
- Stripe: live secret key, Scaffold monthly price ID for exactly $149/month USD, and billing webhook secret.
- Resend: API key and sending domain.
- Internal safety: `CRON_SECRET`, `INTERNAL_API_SECRET`, `OAUTH_STATE_SECRET` with at least 32 characters, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SITE_URL=https://scaffoldweb.com`, and `NEXT_PUBLIC_APP_URL=https://scaffoldweb.com` when OAuth connections are enabled.
- Optional OAuth: Google, Instagram, and Calendly client IDs and secrets must be set as complete pairs or both omitted. If one side is set without the other, `pnpm check:prod` fails and prints a `vercel env add ... production` action for the missing side.
- Webhooks: Clerk `/api/clerk/webhook`, Sanity `/api/sanity/webhook`, and Stripe `/api/billing/webhook` configured with matching secrets.

### Production Live Verification

- Status: blocked.
- Evidence: local smoke and build gates pass, and the Vercel app-host freshness check now confirms `https://reb-studio.vercel.app/sign-in` serves `Sign in to Scaffold Web | Scaffold Web`. Authenticated production dashboard access, live webhook delivery, and live cron execution still require production credentials, provider access, the remaining env fixes, and the public `scaffoldweb.com` DNS fix before final customer-access verification.
- Required owner action: after production env, redeploy, and DNS are resolved, run `PLAYWRIGHT_BASE_URL=https://scaffoldweb.com PLAYWRIGHT_TENANT_ORIGIN=https://admin.greatlakesdriedfruit.com pnpm check:release`, verify `/dashboard/site` loads for an invited owner, confirm a content edit saves and refreshes preview, confirm Clerk/Sanity/Stripe webhook deliveries in provider dashboards, and verify cron 401/success behavior: `/api/cron/*` returns `401` without `Authorization: Bearer <CRON_SECRET>` and succeeds with it.

### Production Domain Routing

- Status: blocked.
- Evidence: `curl -I -L https://scaffoldweb.com/api/health` on May 8, 2026 at 19:16 UTC still redirects to `https://scaffoldweb-com.l.ink/` and returns `server: openresty` / `x-powered-by: PHP/8.0.30`, not the Vercel Next.js app. `dig +short scaffoldweb.com A` currently returns `44.230.85.241` and `52.33.207.7`, not Vercel's `76.76.21.21`. `https://reb-studio.vercel.app/api/health` returns `200` from Vercel, so the app hostname is healthy but the public apex domain is misrouted. `vercel domains inspect scaffoldweb.com` confirms the domain is attached to `reb-studio`, but current nameservers are Porkbun (`curitiba.ns.porkbun.com`, `fortaleza.ns.porkbun.com`, `maceio.ns.porkbun.com`, `salvador.ns.porkbun.com`) instead of Vercel nameservers.
- Required owner action: in Porkbun DNS, remove the current l.ink forwarding and set `A scaffoldweb.com 76.76.21.21` as Vercel recommends, or change nameservers to `ns1.vercel-dns.com` and `ns2.vercel-dns.com`. Wait for DNS and SSL propagation, then rerun `pnpm check:prod`.

Copyable DNS verification commands:

```bash
vercel domains inspect scaffoldweb.com
dig +short scaffoldweb.com A
dig +short scaffoldweb.com NS
dig +short '*.scaffoldweb.com' CNAME
curl -I -L https://scaffoldweb.com/api/health
pnpm check:prod
```

Expected DNS/HTTP results:

- `dig +short scaffoldweb.com A` includes `76.76.21.21`, or the nameserver check shows `ns1.vercel-dns.com` / `ns2.vercel-dns.com`.
- The wildcard CNAME resolves to Vercel when wildcard subdomains are managed through DNS records.
- `curl -I -L https://scaffoldweb.com/api/health` stays on `https://scaffoldweb.com/api/health`, returns Vercel headers, and does not redirect to `scaffoldweb-com.l.ink`.

Copyable verification commands:

```bash
PLAYWRIGHT_BASE_URL=https://scaffoldweb.com PLAYWRIGHT_TENANT_ORIGIN=https://admin.greatlakesdriedfruit.com pnpm check:release

curl -i https://scaffoldweb.com/api/cron/maintenance
curl -i -H "Authorization: Bearer $CRON_SECRET" https://scaffoldweb.com/api/cron/maintenance
```

Expected results:

- Only run the production smoke command after `https://scaffoldweb.com/api/health` stays on `scaffoldweb.com` and returns the Vercel Next.js health response.
- First cron request returns `401`.
- Second cron request returns a non-`401` response and logs an authorized maintenance run.
- Root marketing-host sign-in or sign-up finishes at `/account`, where the invited owner can choose the correct site if needed; if that signed-in email has no tenant access, `/account` offers `Use invited email` and a support contact instead of only sales onboarding.
- Invited owner can reach `/dashboard/site` on `admin.greatlakesdriedfruit.com`.
- Saving a content edit refreshes the preview iframe.
- Clerk, Sanity, and Stripe provider dashboards show successful webhook deliveries for the configured production endpoints.

## Waived Blockers

Move an item here only with owner approval in the release note. Each waiver must use this shape so `pnpm check:prod` can validate it:

```md
### <Blocker name>

- Status: waived
- Owner: <name or email>
- Release note: <release note, PR, or ticket reference>
- Follow-up: <YYYY-MM-DD>
- Reason: <why the release can proceed without resolving it>
```

## Verified Locally

- `docs/design-kit.md` exists and covers WCAG 2.2 AA, Core Web Vitals, AI surfaces, and template expansion rules.
- `vercel whoami` returns `rhinehart514-5576`, and `vercel env ls production` can read encrypted Production env variable names for `rhinehart514-gmailcoms-projects/reb-studio`.
- `pnpm lint` passes.
- `pnpm typecheck` passes.
- `pnpm test` passes: 261 tests across 28 files.
- `pnpm audit` passes with no known vulnerabilities after upgrading Clerk, Next, Vercel Blob, next-sanity, Sanity, Vitest, and eslint-config-next and forcing patched transitive dependency versions with pnpm overrides.
- The old `react-social-media-embed` dependency was removed; the Instagram section now renders dependency-free outbound cards, avoiding a React 19 peer warning and third-party embed-script CSP risk.
- `pnpm build` passes on Next 16.2.6 with the `src/proxy.ts` convention.
- `REB_DEV_UNGATED_ACCESS=0 pnpm smoke` passes: 20 Playwright tests on an isolated local port so an unrelated `localhost:3000` server cannot satisfy smoke checks. The suite covers direct `/dashboard` access, signed-out `/account` handoff, signed-out `/no-access` recovery, rendered auth page titles, root and admin-host sign-up guidance, invited-email sign-in context, the `admin.gldf.localhost` dashboard entry point, and cron protection.
- `pnpm check:launch` passes end to end with lint, typecheck, 261 unit tests across 28 files, `pnpm audit`, `pnpm build`, and 20 smoke tests with `REB_DEV_UNGATED_ACCESS=0`.
- `pnpm check:prod` verifies the customer frontend smoke suite still covers dashboard, account handoff, no-access, admin-host, rendered auth page titles, sign-up invite guidance, invited-email recovery, Clerk JS CSP, cron protection, and no `/app` regressions.
- `pnpm check:prod` verifies the auth page source still routes root marketing-host auth through `/account`, routes tenant/admin-host auth to `/dashboard`, avoids `/app`, includes the support email, keeps invite-focused browser metadata, and keeps no-access account switching.
- `pnpm check:prod` verifies `/admin` tenant rows expose owner-email invites and that the invite modal posts to `/api/admin/invites` with exact-email guidance, accessible dialog/status semantics, and persistent open/copy manual signup fallback when email delivery is unavailable.
- `pnpm check:prod` verifies every `vercel.json` cron path maps to an `/api/cron/*` route file and that `src/proxy.ts` covers those routes with fail-closed `CRON_SECRET` bearer validation.
- `pnpm check:prod` prints a "Required Release Actions" section with `vercel env add ... production` commands for failed env checks and webhook setup reminders.
- `pnpm check:prod` verifies this file includes owner-ready blocker actions, env pull/recheck steps, generated-secret guidance, and the waiver template.
- `pnpm check:prod` verifies `docs/production-readiness.md` keeps the release gate, waiver metadata, and signed-out access verification instructions.
- `pnpm check:prod` verifies `.github/workflows/release.yml` still enforces release gate confirmation before tagging.
- `pnpm check:prod` verifies `package.json` keeps `check:launch` and `check:release` aligned with lint, typecheck, tests, audit, build, production checks, and gated smoke.
- `pnpm check:prod` verifies `.github/workflows/ci.yml` runs launch-aligned CI, including full audit and gated smoke.
- The "Required Release Actions" output also separates generated secrets from vendor-provided credentials and prints the production env pull/recheck commands.
- Sign-in/access flow has been locally verified through source checks and Playwright smoke coverage: `/sign-in` shows invite-email guidance and a direct support email, Clerk redirects are forced back to `/dashboard`, and the dead `/app` route is no longer the post-auth destination. `/sign-up` mirrors the invited-email and support guidance. The Codex in-app browser could not reach the local Next.js server because its local navigation rewrote to `127.0.0.1` and returned `ERR_CONNECTION_REFUSED`, so current local access verification relies on the isolated Playwright server instead of an existing `localhost:3000` process.
- The `/no-access` recovery page now signs users out before returning them to `/sign-in`, so a customer who used the wrong account can switch to the invited email without getting stuck in the same Clerk session. Its secondary action points to `/account` as `Choose another site`, avoiding an admin-host loop from `/` back into `/dashboard` and `/no-access`.
- `docs/production-readiness.md` now includes a Customer Access Handoff for `/admin` invites, `/api/admin/invites`, exact invited-email sign-up/sign-in switching, wrong-account recovery, and final authorized dashboard verification.
- Invite and direct-assignment APIs now reject malformed JSON with clear `400` responses, normalize/validate email addresses, and trim tenant IDs before storing invites or looking up Clerk users, reducing wrong-email and bad-request access failures. `src/lib/invite-email.ts` escapes dynamic site names and signup URLs in invite HTML, provides a plain-text invite with the signup link, and strips CR/LF from the subject tenant name. `src/__tests__/route-handlers.test.ts` directly covers malformed invite/assignment requests and invalid invite fields, `src/__tests__/invite-email.test.ts` behaviorally covers invite email escaping and plain-text rendering, `src/__tests__/admin-invites-route.test.ts` covers the successful invite route sending both HTML and text through Resend with normalized email/tenant input, and `src/__tests__/production-readiness-rules.test.ts` guards the route/helper wiring.
- Sensitive write routes now require role permission checks across content, version restore, agent, approval queue, media/upload, newsletter, social, reviews, booking updates/settings, suggestions, integrations, OAuth initiation, and offboarding request surfaces. Paid mutation paths also require active subscriptions.
- `pnpm check:prod` verifies `/api/admin/domains` stays a thin compatibility alias to the tenant-scoped `/api/tenant/domains` route, and that domain mutations require the `x-tenant` header plus `domains:manage` permission instead of trusting tenant IDs from request bodies.
- `pnpm check:prod` verifies `/api/v1/content/:tenant/:section` and `/api/v1/page-config/:tenant` stay thin aliases to the public storefront routes, and that those routes validate tenant slugs, active tenants, and allowed template sections before reading public storefront data.
- `pnpm check:prod` verifies Google, Instagram, and Calendly OAuth callbacks call `verifyOAuthState(state)`, reject invalid state, derive `tenantId` from `verifiedState`, and only then save tenant connections.
- Sanity webhooks now fail closed when `SANITY_WEBHOOK_SECRET` is missing or provider signature verification fails, using `next-sanity/webhook` rather than a hand-rolled signature parser.
- Production webhook handoff now documents the exact Sanity endpoint (`https://scaffoldweb.com/api/sanity/webhook`), Stripe endpoint (`https://scaffoldweb.com/api/billing/webhook`), required Stripe events, and matching `SANITY_WEBHOOK_SECRET`/`STRIPE_WEBHOOK_SECRET` values in `docs/production-readiness.md`; `pnpm check:prod` also prints those setup reminders.
- Clerk webhooks fail closed without `CLERK_WEBHOOK_SECRET`, verify Svix signatures, and only auto-assign invited users from signed `user.created` events; `pnpm check:prod` verifies this route coverage.
- Calendly and Vegaro booking webhooks now fail closed when their webhook secret is missing, the signature is missing, or signature verification fails.
- Public storefront checkout now uses distributed rate limiting and prices Stripe sessions from server-side tenant product content instead of trusting browser-submitted names or prices.
- Billing checkout and customer portal return URLs now derive from forwarded host/proto instead of trusting the browser `Origin` header; subscription checkout also normalizes customer emails.
- Public onboarding and booking forms now use distributed rate limiting and sanitize/validate submitted fields; booking creation derives service name/duration from tenant content instead of browser-submitted service text, and availability checks reject unknown or coming-soon services.
- Newsletter subscribes and sends now use Redis-backed async rate limiting; subscriber names are trimmed/capped before storage.
- Duplicate tenant `rohlax-wellness` is inactive in Sanity; launch tenant `rohlax` has client/admin domains and revalidation configured.
- `https://scaffoldweb.com/home` returns `200`.
- `https://greatlakesdriedfruit.com/` redirects to `https://www.greatlakesdriedfruit.com/` and returns `200`.
- `https://admin.greatlakesdriedfruit.com/` redirects to `/dashboard`, then to `/sign-in` for signed-out users and returns the Vercel/Next.js sign-in page.
- Root body background/text color now comes from CSS instead of duplicate inline body styles, removing a React hydration mismatch warning seen during smoke runs.

## Release Gate

Run these after the production env/domain blockers are resolved:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm audit
pnpm build
pnpm check:prod
git status --short
REB_DEV_UNGATED_ACCESS=0 PLAYWRIGHT_BASE_URL=https://scaffoldweb.com PLAYWRIGHT_TENANT_ORIGIN=https://admin.greatlakesdriedfruit.com pnpm smoke
```

Equivalent one-command local gate:

```bash
PLAYWRIGHT_BASE_URL=https://scaffoldweb.com PLAYWRIGHT_TENANT_ORIGIN=https://admin.greatlakesdriedfruit.com pnpm check:release
```

The GitHub Release workflow refuses to create a `reb-vYYYY.MM.DD.N` tag unless the operator confirms `pnpm check:release` passed or owner-waived blockers are documented in a real release note, PR, URL, or ticket reference. Placeholder references such as `none`, `n/a`, `todo`, `tbd`, or `pending` are rejected.
`pnpm check:release` forces `REB_DEV_UNGATED_ACCESS=0` for smoke so signed-out access checks cannot be bypassed by the dev-access flag.

Then manually verify:

- Signed-out `/dashboard` and `/no-access` redirect to `/sign-in`, never `/app`.
- `/sign-in` and `/sign-up` explain using the exact invited email address.
- `/dashboard/site` loads for an authorized owner.
- Preview iframe renders the tenant storefront with `?preview=true`.
- A content edit saves and refreshes the preview.
- Public tenant pages cannot be framed without `?preview=true`.
- `admin.greatlakesdriedfruit.com` root redirects to `/dashboard`, then signed-out users reach `/sign-in` with invited-email guidance.
- Cron routes return `401` without `Authorization: Bearer <CRON_SECRET>` and succeed with it.

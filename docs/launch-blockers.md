# Strelva Launch Blockers

> **Status: current release gate (updated 2026-07-30).** Only `Current
> Blockers` and `Waived Blockers` determine release status. The long evidence
> record below is historical. Current architecture and commands live in
> `production-readiness.md`: Supabase Auth, Postgres, and `app.strelva.com`.
> **Auth is Supabase-only (Clerk fully removed #146, 2026-07-11). Sanity removed
> as a data source (2026-07-10). Control plane URL is `app.strelva.com`.**

Last local audit: May 14, 2026. Security audit: July 30, 2026.

This file tracks launch blockers that cannot be resolved by code changes alone. `pnpm check:prod` fails while this file contains unwaived blockers. A release is not complete until this file is empty or every remaining item is explicitly waived in the release note with owner approval.

## Current Blockers

_No current blockers from the original release gate — both prior entries are resolved (2026-07-12): Rohlax revalidation is wired and the apex + admin serve; the seed demo tenant `summit` and `jacobtest` are deactivated._

### Security and dependency blockers (2026-07-30 audit — RESOLVED 2026-07-30)

All three items below were resolved and deployed to production on 2026-07-30. Retained here as a historical record.

- **[RESOLVED] Next.js 16.2.6 → 16.2.12** (+ `eslint-config-next`). `pnpm audit` went from 24 vulns (14 high) to 3: 1 high (brace-expansion, dev-only via eslint's pinned `minimatch@3.1.5` — not in the production bundle, cannot be forced to the patched 5.x line without breaking eslint's API), 2 moderate (OpenTelemetry, pinned transitively by Sentry). Zero high vulns in the production runtime.
- **[RESOLVED] Security-pin overrides refreshed.** Updated pins: `dompurify` → `3.4.12`, `postcss` → `8.5.25`, `fast-uri` → `3.1.4`, `sharp` → `0.35.3`, `js-yaml` → `4.3.0`. Also added `@babel/core` pin. All verified via `pnpm audit`.
- **[RESOLVED] 11 orphaned Vercel env vars removed** from production + preview + development: `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `CLERK_DOMAIN`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_DOMAIN`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `SANITY_API_TOKEN`, `SANITY_WEBHOOK_SECRET`, `REVALIDATION_SECRET`, `CORS_ORIGINS`. Each verified unread by code before removal. Kept: `NEXT_PUBLIC_SANITY_DATASET` + `NEXT_PUBLIC_SANITY_PROJECT_ID` (legacy image-URL resolution).

Detail and release runbook retained below.

## Current Release Verification Runbook

- Required owner action: keep production values in Vercel aligned with
  `.env.production.example`; do not perform a production deploy from a dirty local working tree.
- Minimum production values to confirm in Vercel: Supabase project URL (`NEXT_PUBLIC_SUPABASE_URL`),
  private Supabase URL (`SUPABASE_URL` — same value, server-only, required by `src/lib/db/client.ts`),
  publishable key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), service-role key (`SUPABASE_SERVICE_ROLE_KEY`),
  `SECRETS_ENC_KEY` (AES-256-GCM at-rest secret key — missing = full platform outage when encrypted rows exist),
  Postgres source flags (`CONTENT_SOURCE=postgres`, `DATA_SOURCE=postgres`, `TENANTS_SOURCE=postgres`),
  Upstash, Stripe, Resend, Sentry, `CRON_SECRET`, `INTERNAL_API_SECRET`, `OAUTH_STATE_SECRET`,
  and `NEXT_PUBLIC_APP_URL=https://app.strelva.com`.
- Auth is Supabase-only. No Clerk env vars should be present — Clerk vars in the Vercel environment cause auth failures. Remove orphaned Clerk and Sanity secrets via `vercel env rm` before any production deploy.
- Copyable Vercel env commands:
  `vercel env add NEXT_PUBLIC_SUPABASE_URL production`,
  `vercel env add SUPABASE_URL production`,
  `vercel env add UPSTASH_REDIS_REST_URL production`,
  `vercel env add UPSTASH_REDIS_REST_TOKEN production`,
  `vercel env add SECRETS_ENC_KEY production`,
  `vercel env add SENTRY_DSN production`,
  `vercel env add NEXT_PUBLIC_SENTRY_DSN production`, and
  `vercel env add NEXT_PUBLIC_APP_URL production`.
- Provider value sources: Supabase project settings -> API, Upstash Redis
  database -> REST API section, Sentry project settings -> Client Keys / DSN,
  and Stripe live-mode Products/Webhooks. Generate `SECRETS_ENC_KEY` with `openssl rand -hex 32`.
- Do not overwrite the values already passing the checker. Generate local
  shared secrets with `openssl rand -hex 32`, then run
  `vercel env pull .env.production.local --environment=production --scope strelva` and
  `pnpm check:prod`.
- After a clean `git status --short`, deploy with `vercel deploy --prod --scope strelva`, then run:

```bash
PLAYWRIGHT_BASE_URL=https://app.strelva.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm exec playwright test tests/customer-frontend.spec.ts -g "signed-out dashboard customers"
PLAYWRIGHT_BASE_URL=https://app.strelva.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm check:release
curl -I -L https://app.strelva.com/api/health
curl -i https://app.strelva.com/api/cron/maintenance
curl -i -H "Authorization: Bearer $CRON_SECRET" https://app.strelva.com/api/cron/maintenance
```

Production Live Verification requires `https://app.strelva.com/sign-in` to show
`Sign in to Strelva | Strelva`, invited-owner access and content preview to work,
Supabase Auth and Stripe webhook verification to succeed, and cron 401/success
behavior to match the two commands above.

## Historical Release Verification Record

### Rohlax Cloudflare DNS

- Status: resolved (2026-07-12)
- Owner: Jacob Rhinehart
- Evidence: `https://rohlaxwellness.com` returns `200` from Vercel. As of May 14, 2026, `dig +short www.rohlaxwellness.com CNAME` and `dig +short admin.rohlaxwellness.com CNAME` return `931bd7b36e7b2348.vercel-dns-017.com.`, but `dns.resolve4(...)` and `curl` still return `ENOTFOUND` for both hostnames, so the records are not production-routable. `vercel domains inspect` confirms the domain uses Cloudflare nameservers (`dax.ns.cloudflare.com`, `vivienne.ns.cloudflare.com`) instead of Vercel nameservers; Vercel recommends the A records below. `admin.rohlaxwellness.com` is attached to `scaffold-web`; the apex is attached to `rohlax-wellness`; `www.rohlaxwellness.com` is found under the account but still reports as not configured.
- Required owner action: confirm the `www` hostname is attached to the intended Vercel project if needed, add these Cloudflare DNS records, wait for propagation, then rerun `pnpm check:prod`.

```text
A www.rohlaxwellness.com 76.76.21.21
A admin.rohlaxwellness.com 76.76.21.21
```

### Jacob Test Tenant Launch Configuration

- Status: resolved (2026-07-12)
- Owner: Jacob Rhinehart
- Evidence: As of May 14, 2026, a read-only Sanity query found active tenant `jacobtest` at document `_id` `THl7mfItZYUmELpcZNa2Zr`. The tenant has no customer-facing `productionDomain` or `customDomains`, no `adminDomain` or derivable `admin.<productionDomain>`, no `revalidateUrl`, and no `revalidationSecret`, so `pnpm check:prod` correctly fails `Tenant jacobtest client domain`, `Tenant jacobtest admin domain`, and `Tenant jacobtest revalidation`.
- Required owner action: either deactivate `jacobtest` if it is an internal test tenant, or configure its launch domains and revalidation fields before release. Active launch tenants need a customer-facing `productionDomain`/`customDomains` entry, an `adminDomain` or derivable `admin.<productionDomain>`, and `revalidateUrl` plus `revalidationSecret`.

Copyable DNS verification commands:

```bash
vercel domains inspect strelva.com
vercel domains inspect rohlaxwellness.com
dig +short strelva.com A
dig +short strelva.com NS
dig +short '*.strelva.com' CNAME
dig +short www.rohlaxwellness.com CNAME
dig +short admin.rohlaxwellness.com CNAME
dig +short www.rohlaxwellness.com A
dig +short admin.rohlaxwellness.com A
curl -I -L https://strelva.com/api/health
curl -I -L https://rohlaxwellness.com
curl -I -L https://admin.rohlaxwellness.com
pnpm check:prod
```

Expected DNS/HTTP results:

- `dig +short strelva.com A` includes `76.76.21.21`, or the nameserver check shows `ns1.vercel-dns.com` / `ns2.vercel-dns.com`.
- The wildcard CNAME resolves to Vercel when wildcard subdomains are managed through DNS records.
- The Rohlax CNAME checks may expose partial Vercel aliasing, but launch readiness requires the A checks and `curl` probes to work.
- `dig +short www.rohlaxwellness.com A` and `dig +short admin.rohlaxwellness.com A` return routable records after Cloudflare is updated.
- `curl -I -L https://strelva.com/api/health` stays on `https://strelva.com/api/health`, returns Vercel headers, and does not redirect to `scaffoldweb-com.l.ink`.

Copyable verification commands:

```bash
PLAYWRIGHT_BASE_URL=https://strelva.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm check:release

curl -i https://strelva.com/api/cron/maintenance
curl -i -H "Authorization: Bearer $CRON_SECRET" https://strelva.com/api/cron/maintenance
```

Expected results:

- Only run the production smoke command after `https://strelva.com/api/health` stays on `strelva.com` and returns the Vercel Next.js health response.
- First cron request returns `401`.
- Second cron request returns a non-`401` response and logs an authorized maintenance run.
- Root marketing-host sign-in or sign-up finishes at `/account`, where the invited owner can choose the correct site if needed; if that signed-in email has no tenant access, `/account` offers `Use invited email`, a support contact, and the private-beta access request.
- Invited owner can reach `/dashboard/site` on `admin.greatlakesdriedfruit.com`.
- Saving a content edit refreshes the preview iframe.
- Clerk and Stripe provider dashboards show successful webhook deliveries for the configured production endpoints.

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

### Production Live Verification

- Status: app freshness resolved on May 14, 2026; Rohlax DNS and `jacobtest` resolved 2026-07-12.
- Evidence: production env was pulled from Vercel, the local built-app gate passes, and the Vercel app-host freshness check sees `https://app.strelva.com/sign-in` serve `Sign in to Strelva | Strelva` from Vercel. The Vercel project is `strelva-admin` under team `strelva` (previously listed as `scaffold-web`/`rhinehart514-gmailcoms-projects` — those are the old project/team names; use `--scope strelva` for all CLI operations). Auth is Supabase-only as of 2026-07-11 (#146) — no Clerk webhook deliveries to verify; check Supabase Auth and Stripe webhook deliveries in provider dashboards.
- Required owner action: use `PLAYWRIGHT_BASE_URL=https://app.strelva.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm check:release` for release verification. Manually verify that an invited owner reaches `/dashboard/site`, a content edit saves and refreshes preview, Supabase Auth and Stripe webhook deliveries are visible in provider dashboards, and cron 401/success behavior works before announcing a customer go-live. Also confirm `SECRETS_ENC_KEY` and `SUPABASE_URL` (private) are set in Vercel prod (see production-readiness.md Known issues).

### Production Domain Routing

- Status: resolved locally on May 10, 2026.
- Evidence: Porkbun DNS now has `A strelva.com 76.76.21.21` and `CNAME *.strelva.com cname.vercel-dns.com`. `dig +short strelva.com A` returns `76.76.21.21`, public resolvers `1.1.1.1`, `8.8.8.8`, and `9.9.9.9` return the same, and `curl -I -L https://strelva.com/api/health` stays on `strelva.com`, returns `HTTP/2 200`, `server: Vercel`, `content-type: application/json`, and no longer redirects to `scaffoldweb-com.l.ink`.
- Required owner action: keep the DNS verification commands in this file for future rotations and rerun them after any registrar, nameserver, or Vercel domain changes.

- Resolved env handoff reference:
  - Required owner action: Production env has been set, pulled, and rechecked locally; keep this handoff text for future rotations.
  - Minimum production values to confirm in Vercel: live Clerk keys and webhook secret, `SUPER_ADMIN_EMAILS`, Google AI key, Upstash REST URL/token, Stripe live key/price/webhook secret, Resend key/domain, generated `CRON_SECRET` / `INTERNAL_API_SECRET` / `OAUTH_STATE_SECRET`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SITE_URL=https://strelva.com`, and `NEXT_PUBLIC_APP_URL=https://strelva.com` when Google, Instagram, or Calendly OAuth is enabled.
  - Copyable Vercel env commands retained for rotation reference (NOTE: `CLERK_WEBHOOK_SECRET` is removed — Clerk is fully torn down as of #146): `vercel env add UPSTASH_REDIS_REST_URL production`, `vercel env add UPSTASH_REDIS_REST_TOKEN production`, `vercel env add SENTRY_DSN production`, `vercel env add NEXT_PUBLIC_SENTRY_DSN production`, `vercel env add REB_CUSTOM_REQUEST_SECRET production`, and `vercel env add NEXT_PUBLIC_APP_URL production` when OAuth is enabled.
  - Provider value sources: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from Upstash Redis database -> REST API section; `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` from Sentry project settings -> Client Keys / DSN; `REB_CUSTOM_REQUEST_SECRET` is a generated shared custom-storefront bearer secret; `STRIPE_SCAFFOLD_PRICE_ID` is optional while admin-side pricing is undecided — when set it must be a live recurring monthly USD Stripe price configured under Stripe live-mode Products. (Clerk is fully removed — no Clerk webhook secret needed.)
  - (HISTORICAL — Clerk is fully removed as of #146.) Auth is now Supabase-only. Orphaned Clerk and Sanity env vars were removed from Vercel on 2026-07-30 (see Current Blockers history above).
  - Do not overwrite the values already passing the checker unless the provider dashboard says they are wrong. If a generated secret must be rotated, generate it with `openssl rand -hex 32`, update the matching provider or caller, run `vercel env pull .env.production.local --environment=production`, then rerun `pnpm check:prod`.
  - Redeploy the Vercel Production app after env changes. Prefer the Vercel dashboard or a clean release branch; check `git status --short` first and do not run `vercel deploy --prod` from a dirty local working tree. After redeploy, run the Vercel-host freshness probe with `PLAYWRIGHT_BASE_URL=https://strelva.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm exec playwright test tests/customer-frontend.spec.ts -g "signed-out dashboard customers"` and confirm `https://strelva.com/sign-in` serves `Sign in to Strelva | Strelva`.
- Required Vercel Production env values now pass after pulling `vercel env pull .env.production.local --environment=production`: `CLERK_WEBHOOK_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, and `REB_CUSTOM_REQUEST_SECRET` are set. `NEXT_PUBLIC_APP_URL` remains required only if Google, Instagram, or Calendly OAuth is enabled. Provider sources were Clerk Dashboard -> Webhooks -> `https://strelva.com/api/clerk/webhook`, Upstash Redis -> REST API, Sentry project settings -> Client Keys / DSN, and a generated shared custom-storefront bearer secret. Historical add commands for the resolved env handoff were `vercel env add CLERK_WEBHOOK_SECRET production`, `vercel env add UPSTASH_REDIS_REST_URL production`, `vercel env add UPSTASH_REDIS_REST_TOKEN production`, `vercel env add SENTRY_DSN production`, `vercel env add NEXT_PUBLIC_SENTRY_DSN production`, and `vercel env add REB_CUSTOM_REQUEST_SECRET production`.
- `STRIPE_SCAFFOLD_PRICE_ID` is intentionally unpinned: client sites are free for now and the admin-side price is undecided. `pnpm check:prod` skips the price check when the env var is unset and only validates the recurring-monthly-USD shape when it is set.
- `pnpm check:prod` now confirms Upstash Redis connectivity with `PING: PONG`; the remaining Redis warning is only that the tenant cache is empty and will populate on first request.
- `docs/design-kit.md` exists and covers WCAG 2.2 AA, Core Web Vitals, AI surfaces, and template expansion rules.
- `vercel whoami` returns `rhinehart514-5576`, and `vercel env ls production` can read encrypted Production env variable names for `rhinehart514-gmailcoms-projects/scaffold-web`.
- `pnpm lint` passes.
- `pnpm typecheck` passes.
- `pnpm test` passes: 345 tests across 36 files.
- `pnpm audit` passes with no known vulnerabilities after upgrading Clerk, Next, Vercel Blob, next-sanity, Sanity, Vitest, and eslint-config-next and forcing patched transitive dependency versions with pnpm overrides.
- The old `react-social-media-embed` dependency was removed; the Instagram section now renders dependency-free outbound cards, avoiding a React 19 peer warning and third-party embed-script CSP risk.
- `pnpm build` passes on Next 16.2.12 with the `src/proxy.ts` convention.
- `REB_DEV_UNGATED_ACCESS=0 pnpm smoke` passes: 21 Playwright tests on an isolated local port so an unrelated `localhost:3000` server cannot satisfy smoke checks. The suite covers direct `/dashboard` access, signed-out `/account` handoff, signed-out `/no-access` recovery, rendered auth page titles, root and admin-host sign-up guidance, invited-email sign-in context, the `admin.gldf.localhost` dashboard entry point, and cron protection.
- `pnpm check:launch` passes end to end with lint, typecheck, 345 unit tests across 36 files, `pnpm audit`, `pnpm build`, and 21 built-app smoke tests with `REB_DEV_UNGATED_ACCESS=0`.
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
- Admin tenant creation/update now rejects malformed JSON with clear `400` responses, trims launch-critical tenant setup fields, filters feature arrays to strings, and normalizes production/admin domains before storage.
- Sensitive write routes now require role permission checks across content, version restore, agent, approval queue, media/upload, newsletter, social, reviews, booking updates/settings, suggestions, integrations, OAuth initiation, and offboarding request surfaces. Paid mutation paths also require active subscriptions.
- Content section, version restore, page-config, tenant settings, admin draft approval/rejection, and rewards adjustment write routes now reject malformed or non-object JSON with `400 Invalid request body` before validation/storage work.
- Dashboard queue approvals, event actions, inbox mark-read, thread create/update writes, chat transcript saves, suggestion actions, newsletter sends, review add/reply writes, and social post create/update writes now reject malformed or invalid-shape JSON with `400 Invalid request body` before event, inbox, thread, chat, suggestion, newsletter, review, or social storage/send work.
- `pnpm check:prod` verifies `/api/admin/domains` stays a thin compatibility alias to the tenant-scoped `/api/tenant/domains` route, and that domain mutations require the `x-tenant` header plus `domains:manage` permission instead of trusting tenant IDs from request bodies.
- `pnpm check:prod` verifies `/api/v1/content/:tenant/:section` and `/api/v1/page-config/:tenant` stay thin aliases to the public storefront routes, and that those routes validate tenant slugs, active tenants, and allowed template sections before reading public storefront data.
- `pnpm check:prod` verifies Google, Instagram, and Calendly OAuth callbacks call `verifyOAuthState(state)`, reject invalid state, derive `tenantId` from `verifiedState`, and only then save tenant connections.
- Production webhook handoff now documents the exact Stripe endpoint (`https://strelva.com/api/billing/webhook`), required Stripe events, and matching `STRIPE_WEBHOOK_SECRET` value in `docs/production-readiness.md`; `pnpm check:prod` also prints those setup reminders.
- Stripe billing webhooks fail closed without `STRIPE_WEBHOOK_SECRET`, verify the `stripe-signature` with Stripe's webhook verifier, retain event idempotency, and handle the launch-critical subscription events; `pnpm check:prod` verifies this route coverage.
- Clerk webhooks fail closed without `CLERK_WEBHOOK_SECRET`, verify Svix signatures, and only auto-assign invited users from signed `user.created` events; `pnpm check:prod` verifies this route coverage.
- Calendly and Vegaro booking webhooks now fail closed when their webhook secret is missing, the signature is missing, or signature verification fails.
- Public storefront checkout now uses distributed rate limiting and prices Stripe sessions from server-side tenant product content instead of trusting browser-submitted names or prices.
- Subscription checkout now rejects malformed JSON with `400 Invalid request body` and normalizes tenant/customer fields before Stripe metadata and admin return URLs.
- Billing checkout and customer portal return URLs now derive from forwarded host/proto instead of trusting the browser `Origin` header; subscription checkout also normalizes customer emails.
- Public access-request and booking forms now use distributed rate limiting and sanitize/validate submitted fields; booking creation derives service name/duration from tenant content instead of browser-submitted service text, and availability checks reject unknown or coming-soon services.
- Booking update and booking-config writes now reject malformed or non-object JSON with `400 Invalid request body` before storage work.
- Public tracking, access-request, newsletter signup, booking, and checkout POST routes now reject malformed or non-object JSON with `400 Invalid request body` instead of surfacing generic server errors.
- Newsletter subscribes and sends now use Redis-backed async rate limiting; subscriber names are trimmed/capped before storage.
- Stale duplicate tenant `rohlax-wellness` was removed from Sanity; launch tenant `rohlax` has client/admin domains and revalidation configured.
- `https://strelva.com/home` returns `200`.
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
REB_DEV_UNGATED_ACCESS=0 PLAYWRIGHT_BASE_URL=https://app.strelva.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm smoke
```

Equivalent one-command local gate:

```bash
PLAYWRIGHT_BASE_URL=https://app.strelva.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm check:release
```

The GitHub Release workflow refuses to create a `strelva-v<SemVer>` tag unless the tag matches `package.json` and the operator confirms `pnpm check:release` passed or owner-waived blockers are documented in a real release note, PR, URL, or ticket reference. Run `pnpm version:check` first so the app and marketing site are aligned. Placeholder references such as `none`, `n/a`, `todo`, `tbd`, or `pending` are rejected.
`pnpm check:release` runs local smoke against the built Next app and forces `REB_DEV_UNGATED_ACCESS=0` so signed-out access checks cannot be bypassed by the dev-access flag.

Then manually verify:

- Signed-out `/dashboard` and `/no-access` redirect to `/sign-in`, never `/app`.
- `/sign-in` and `/sign-up` explain using the exact invited email address.
- `/dashboard/site` loads for an authorized owner.
- Preview iframe renders the tenant storefront with `?preview=true`.
- A content edit saves and refreshes the preview.
- Public tenant pages cannot be framed without `?preview=true`.
- `admin.greatlakesdriedfruit.com` root redirects to `/dashboard`, then signed-out users reach `/sign-in` with invited-email guidance.
- Cron routes return `401` without `Authorization: Bearer <CRON_SECRET>` and succeed with it.
- Supabase Auth webhook deliveries show success in the Supabase dashboard (Clerk is removed — no Clerk webhooks to verify).

# First-Time Production Secrets Setup

> **Status: updated 2026-07-30.** Reflects the current stack: Supabase Auth,
> Postgres source of truth, Redis cache/operational stores, no Clerk, no Sanity
> write secrets. The canonical control-plane origin is `https://app.strelva.com`.
> Vercel project is `strelva-admin` on the `strelva` team (`--scope strelva`).

This is the plain-English checklist for getting Strelva production-ready from a
clean Vercel environment. Do not paste real secrets into ChatGPT, Slack, GitHub,
or docs. Put them directly into Vercel Production environment variables.

## Goal

Make this command pass:

```bash
pnpm check:prod
```

## Before You Start

You need admin access to:

- Vercel project: `strelva-admin` (team: `strelva`)
- Supabase project (prod)
- Upstash account
- Sentry account
- Stripe live account
- Resend account
- DNS registrar for `strelva.com` / `app.strelva.com`

From the repo:

```bash
vercel whoami
vercel link --scope strelva
```

Confirm the linked Vercel project is `strelva-admin`.

## How To Add A Secret To Vercel

Use this pattern for each value:

```bash
vercel env add VARIABLE_NAME production
```

Vercel prompts you to paste the value. After changing values:

```bash
vercel env pull .env.production.local --environment=production
pnpm check:prod
```

> Note: `vercel env pull` returns blank for Sensitive-tagged vars even when set.
> Use `vercel env ls` or the Vercel dashboard to confirm a var exists before
> concluding it is unset.

## 1. Supabase

The auth, identity, tenant configuration, content, and audit backbone.

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production       # https://<project>.supabase.co
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production  # publishable anon key
vercel env add SUPABASE_SERVICE_ROLE_KEY production      # service-role (bypasses RLS; keep secret)
vercel env add SUPABASE_URL production                   # same URL as NEXT_PUBLIC_SUPABASE_URL
                                                          # server-only; required by src/lib/db/client.ts
```

All four must belong to the same Supabase project.

## 2. Upstash Redis

Required for caches, queues, locks, rate limits, events, and operational stores.

In Upstash: create or open the production Redis database, find the REST API section, copy both values.

```bash
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
```

## 3. At-rest secret encryption key

AES-256-GCM key that encrypts provider secrets (OAuth tokens, revalidation
secrets) stored in Postgres. Active in prod since 2026-07-15. If this key is
absent when any tenant row has an `enc:v1:` prefix, `loadTenants` throws and
the entire platform is down.

```bash
openssl rand -hex 32   # generate once; store in 1Password
vercel env add SECRETS_ENC_KEY production
```

After setting the key, run the one-time backfill if the DB already has plaintext secrets:

```bash
npx tsx scripts/backfill-secret-encryption.ts
```

The backfill is idempotent — safe to run again if unsure.

## 4. Internal secrets

```bash
vercel env add CRON_SECRET production              # gates every /api/cron/* handler
vercel env add INTERNAL_API_SECRET production      # domain-map auth + fallback
vercel env add OAUTH_STATE_SECRET production       # OAuth CSRF state signing
vercel env add APPROVE_LINK_SECRET production      # approve-from-email HMAC (falls back to OAUTH_STATE_SECRET → INTERNAL_API_SECRET if absent)
vercel env add SCAFFOLD_CUSTOM_REQUEST_SECRET production  # agent custom-change HMAC
```

Keep `INTERNAL_API_SECRET`, `OAUTH_STATE_SECRET`, and `APPROVE_LINK_SECRET` as
distinct values. They currently share a fallback chain but serve different
purposes — a single compromise has wider blast radius than needed.

## 5. Sentry

```bash
vercel env add SENTRY_DSN production               # server-side
vercel env add NEXT_PUBLIC_SENTRY_DSN production   # client-side
```

Same DSN for both unless Sentry gives you separate values.

## 6. Stripe

Three-tier live billing (Presence $99 / Growth $199 / Scale $499). All Stripe
values must be live-mode (never test-mode `sk_test_` keys).

```bash
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_SCAFFOLD_PRICE_ID production  # Growth price_..., compatibility gate
vercel env add STRIPE_WEBHOOK_SECRET production
```

Configure the Stripe webhook endpoint:

```text
https://app.strelva.com/api/billing/webhook
```

Required events:

```text
checkout.session.completed
invoice.paid
invoice.payment_failed
customer.subscription.deleted
```

## 7. Resend

```bash
vercel env add RESEND_API_KEY production
vercel env add RESEND_DOMAIN production   # updates.strelva.com
```

Email sending is gated by `EMAIL_SENDING_ENABLED`. Do NOT set that to `true`
until client lifecycle email is deliberately switched on. Operator + prospect
emails default on and are not gated by this flag.

## 8. Google AI

```bash
vercel env add GOOGLE_GENERATIVE_AI_API_KEY production  # Gemini 2.5 Flash
```

## 9. AI auto-publish

```bash
# Keep false for first production tenants until a tenant explicitly approves auto-publish
vercel env add AI_AUTO_PUBLISH production   # value: false
```

## 10. Public URLs

```bash
vercel env add NEXT_PUBLIC_SITE_URL production    # https://strelva.com (marketing)
vercel env add NEXT_PUBLIC_APP_URL production     # https://app.strelva.com (control plane)
```

## 11. Vercel API (for provisioning automation)

Required for the `/api/admin/provision` Vercel project/env/domain steps:

```bash
vercel env add VERCEL_API_TOKEN production
vercel env add VERCEL_TEAM_ID production
```

Without these, the Vercel automation steps in `provisionTenant()` are silently
skipped (the tenant, content seed, and invite still complete).

## 12. DNS

`app.strelva.com` is the control-plane and API origin. Add in Vercel Domains:

```
app.strelva.com    → CNAME cname.vercel-dns.com
admin.strelva.com  → CNAME cname.vercel-dns.com
```

`strelva.com` is the separate marketing repo — do not point it at this project.

After DNS propagates:

```bash
curl -I -L https://app.strelva.com/api/health
```

Should return JSON, not a redirect.

## 13. Pull env and recheck

After all values and DNS are updated:

```bash
vercel env pull .env.production.local --environment=production
pnpm check:prod
```

## 14. Redeploy production

After `pnpm check:prod` passes:

```bash
git status --short     # must be clean
vercel deploy --prod --yes --scope strelva
```

> **Important:** `vercel redeploy` reuses the target deployment's env snapshot
> and will NOT apply env changes. Use `vercel deploy --prod` for a fresh build
> that picks up the current env.

## 15. Final live verification

```bash
PLAYWRIGHT_BASE_URL=https://app.strelva.com \
  PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com \
  pnpm check:release
```

Then manually verify:

- `https://app.strelva.com/api/health` returns JSON with `status:"healthy"`.
- Signed-out `/dashboard` redirects to `/sign-in`.
- `/sign-in` and `/sign-up` explain using the invited email.
- An invited owner can access `/dashboard/site`.
- A content edit saves and refreshes the preview.
- Stripe webhook delivery succeeds in Stripe dashboard.
- Cron is protected:

```bash
curl -i https://app.strelva.com/api/cron/maintenance
curl -i -H "Authorization: Bearer $CRON_SECRET" https://app.strelva.com/api/cron/maintenance
```

The first request must return 401. The second must not.

## Quick command reference

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add SUPABASE_URL production
vercel env add SECRETS_ENC_KEY production
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
vercel env add CRON_SECRET production
vercel env add INTERNAL_API_SECRET production
vercel env add OAUTH_STATE_SECRET production
vercel env add APPROVE_LINK_SECRET production
vercel env add SCAFFOLD_CUSTOM_REQUEST_SECRET production
vercel env add SENTRY_DSN production
vercel env add NEXT_PUBLIC_SENTRY_DSN production
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_SCAFFOLD_PRICE_ID production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add RESEND_API_KEY production
vercel env add RESEND_DOMAIN production
vercel env add GOOGLE_GENERATIVE_AI_API_KEY production
vercel env add AI_AUTO_PUBLISH production
vercel env add NEXT_PUBLIC_SITE_URL production
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add VERCEL_API_TOKEN production
vercel env add VERCEL_TEAM_ID production

vercel env pull .env.production.local --environment=production
pnpm check:prod
```

## Do not skip

- Do not use Stripe test-mode (`sk_test_`) keys.
- Do not skip `SECRETS_ENC_KEY` — a missing key after secrets were encrypted causes a full platform outage.
- Do not skip `SUPABASE_URL` — it is distinct from `NEXT_PUBLIC_SUPABASE_URL` and required server-side.
- Do not use `vercel redeploy` after env changes — use `vercel deploy --prod`.
- Do not mark launch blockers as waived without an explicit owner-approved reason and follow-up date.
- Do not consider launch complete until `pnpm check:release` passes against `https://app.strelva.com`.

## Known issues / TODO

- **`SECRETS_ENC_KEY` and `SUPABASE_URL` are not yet in `pnpm check:prod`** — the checker will not catch a missing key. Track in `production-readiness.md` Known issues. Add `checkEnvVar('SECRETS_ENC_KEY', true)` and `checkEnvVar('SUPABASE_URL', true)` to `scripts/production-checklist.ts`.
- **Seven orphaned Clerk + Sanity env vars may still be set in Vercel** from before the teardowns. Run `vercel env ls` to audit and `vercel env rm <name> <env>` to remove any of: `CLERK_WEBHOOK_SECRET`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `SANITY_WEBHOOK_SECRET`, `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `SANITY_API_TOKEN`, `REVALIDATION_SECRET` (superseded), `CORS_ORIGINS` (no code reference), and any `TURBO_*` / `NX_DAEMON` vars.

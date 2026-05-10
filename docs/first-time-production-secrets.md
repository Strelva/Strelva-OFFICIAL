# First-Time Production Secrets Setup

This is the plain-English checklist for getting Scaffold Web production-ready.
Do not paste real secrets into ChatGPT, Slack, GitHub, or docs. Put them directly into Vercel Production environment variables.

## Goal

Make this command pass:

```bash
pnpm check:prod
```

Right now the production blocker list is:

- Missing `CLERK_WEBHOOK_SECRET`
- Missing `SANITY_WEBHOOK_SECRET`
- Missing `UPSTASH_REDIS_REST_URL`
- Missing `UPSTASH_REDIS_REST_TOKEN`
- Missing `SENTRY_DSN`
- Missing `NEXT_PUBLIC_SENTRY_DSN`
- `scaffoldweb.com` DNS points to Porkbun/l.ink forwarding instead of Vercel
- Final live verification has not been run

## Before You Start

You need admin access to:

- Vercel project: `reb-studio`
- Clerk production app
- Sanity project
- Upstash account
- Sentry account
- Stripe live account
- Porkbun or wherever `scaffoldweb.com` DNS is managed

From the repo:

```bash
cd /Users/laneyfraass/websites/reb
vercel whoami
vercel link
```

Confirm the linked Vercel project is `reb-studio`.

## How To Add A Secret To Vercel

Use this pattern for each value:

```bash
vercel env add VARIABLE_NAME production
```

Vercel will prompt you to paste the value. Paste it, press enter, and choose the Production environment.

After changing values, pull production env locally and re-run the checker:

```bash
vercel env pull .env.production.local --environment=production
pnpm check:prod
```

## 1. Clerk Webhook Secret

You already have live Clerk keys, but production is missing the webhook signing secret.

In Clerk:

1. Open the production Clerk application.
2. Go to Webhooks.
3. Add an endpoint:

```text
https://scaffoldweb.com/api/clerk/webhook
```

4. Select event:

```text
user.created
```

5. Copy the endpoint signing secret.
6. Add it to Vercel:

```bash
vercel env add CLERK_WEBHOOK_SECRET production
```

Important: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_WEBHOOK_SECRET` must all come from the same live Clerk app.

## 2. Sanity Webhook Secret

Sanity needs a webhook so production content/tenant changes can trigger the app safely.

In Sanity:

1. Open the production project.
2. Go to API or Webhooks.
3. Create a webhook.
4. Endpoint URL:

```text
https://scaffoldweb.com/api/sanity/webhook
```

5. Trigger it for content create/update/delete events.
6. Add a signing secret. Generate one if Sanity asks you to choose it:

```bash
openssl rand -hex 32
```

7. Copy that exact secret into Vercel:

```bash
vercel env add SANITY_WEBHOOK_SECRET production
```

The same value must be configured in Sanity and Vercel.

## 3. Upstash Redis

Redis is required for queues, reports, chat state, rate limits, events, and production storage paths.

In Upstash:

1. Create or open the production Redis database.
2. Find the REST API section.
3. Copy:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

4. Add both to Vercel:

```bash
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
```

## 4. Sentry DSNs

Sentry is required by the production checker for monitoring.

In Sentry:

1. Create or open the Scaffold Web project.
2. Use a Next.js / JavaScript project.
3. Find the DSN/client key.
4. Use the DSN for both server and browser unless Sentry gives you separate values:

```bash
vercel env add SENTRY_DSN production
vercel env add NEXT_PUBLIC_SENTRY_DSN production
```

`SENTRY_DSN` is server-side. `NEXT_PUBLIC_SENTRY_DSN` is browser/client-side.

## 5. Stripe $20 Monthly Price

The current production `STRIPE_SCAFFOLD_PRICE_ID` already points to the intended live `$20/mo` price. You do not need to replace it unless `pnpm check:prod` says the price is invalid.

If you ever need to recreate it in Stripe live mode:

1. Open Products.
2. Create or open the Scaffold Web product.
3. Create a recurring monthly price:

```text
Amount: $20.00
Currency: USD
Billing period: Monthly
Mode: Live
```

4. Copy the `price_...` ID.
5. Replace the Vercel value only if the checker says it is wrong:

```bash
vercel env rm STRIPE_SCAFFOLD_PRICE_ID production --yes
vercel env add STRIPE_SCAFFOLD_PRICE_ID production
```

Paste the new `$20/mo` live `price_...` value.

Stripe webhook should also be configured:

```text
https://scaffoldweb.com/api/billing/webhook
```

Required events:

```text
checkout.session.completed
invoice.paid
invoice.payment_failed
customer.subscription.deleted
```

The current checker says `STRIPE_WEBHOOK_SECRET` is already set, but verify it matches this endpoint.

## 6. DNS For scaffoldweb.com

Right now `scaffoldweb.com` routes to Porkbun/l.ink forwarding, not the Vercel Next.js app.

In Porkbun DNS:

1. Remove URL forwarding / l.ink forwarding for `scaffoldweb.com`.
2. Either point the apex at Vercel:

```text
Type: A
Host: scaffoldweb.com or @
Value: 76.76.21.21
```

3. Or switch nameservers to Vercel:

```text
ns1.vercel-dns.com
ns2.vercel-dns.com
```

Then verify:

```bash
vercel domains inspect scaffoldweb.com
dig +short scaffoldweb.com A
dig +short scaffoldweb.com NS
curl -I -L https://scaffoldweb.com/api/health
```

Expected result: `https://scaffoldweb.com/api/health` should stay on `scaffoldweb.com` and return the Vercel Next.js health response. It should not redirect to `scaffoldweb-com.l.ink`.

## 7. Pull Env And Recheck

After all Vercel env values and DNS are updated:

```bash
vercel env pull .env.production.local --environment=production
pnpm check:prod
```

If `pnpm check:prod` still fails, read the `Required Release Actions` section it prints and fix those items.

## 8. Redeploy Production

After `pnpm check:prod` passes locally, redeploy production. Prefer the Vercel dashboard redeploy flow unless the branch is clean and ready.

If deploying from CLI:

```bash
git status --short
vercel deploy --prod
```

Do not deploy from a dirty working tree unless you intentionally want those local changes shipped.

## 9. Final Live Verification

After env, DNS, and redeploy are complete:

```bash
PLAYWRIGHT_BASE_URL=https://scaffoldweb.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm check:release
```

Then manually verify:

- `https://scaffoldweb.com/api/health` returns the app health response.
- Signed-out `/dashboard` redirects to `/sign-in`.
- `/sign-in` and `/sign-up` explain using the invited email.
- An invited owner can access `/dashboard/site`.
- A content edit saves and refreshes the preview.
- Clerk webhook delivery succeeds in Clerk.
- Sanity webhook delivery succeeds in Sanity.
- Stripe webhook delivery succeeds in Stripe.
- Cron is protected:

```bash
curl -i https://scaffoldweb.com/api/cron/maintenance
curl -i -H "Authorization: Bearer $CRON_SECRET" https://scaffoldweb.com/api/cron/maintenance
```

The first cron request should return `401`. The second should not return `401`.

## Quick Command List

```bash
vercel env add CLERK_WEBHOOK_SECRET production
vercel env add SANITY_WEBHOOK_SECRET production
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
vercel env add SENTRY_DSN production
vercel env add NEXT_PUBLIC_SENTRY_DSN production

vercel env pull .env.production.local --environment=production
pnpm check:prod
```

## Do Not Skip

- Do not use test-mode Clerk or Stripe keys.
- Do not use a Stripe price unless it is live, monthly, USD, and exactly `$20`.
- Do not leave `scaffoldweb.com` forwarding through l.ink.
- Do not mark launch blockers as waived unless there is an explicit owner-approved reason and follow-up date.
- Do not consider launch complete until `pnpm check:release` passes against `https://scaffoldweb.com`.

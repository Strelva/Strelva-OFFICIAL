# Secret Rotation Runbook

> **2026-06-22:** reflects the Supabase Auth + Postgres production stack (cut
> over 2026-06-20). The Supabase secrets below are the live auth/data path;
> Clerk + Sanity secrets are retained only until those services are torn down
> post-cutover, so rotate them only if a leak forces it. This is a reference
> procedure for *when* a secret needs rotating — not a standing to-do list.

How to rotate each production secret without taking the platform (or a live
client site) down. Setup of first-time secrets is a different doc
(`first-time-production-secrets.md`); this is for rotating one that already
exists — after a suspected leak, or when an integration is re-provisioned.

## General procedure (zero-downtime where possible)

1. Mint the new secret at the provider.
2. Add it to Vercel (Production + Preview) under the SAME env var name — this
   replaces the value; deployments pick it up on the next deploy.
3. Redeploy (or `vercel env pull` + redeploy). For dual-key providers (Stripe,
   Clerk), keep the old key valid until the new deploy is live, then revoke.
4. Revoke the old secret at the provider.
5. Confirm via `/api/health` (Redis/Sanity/Clerk/Stripe/Gemini probes) and
   watch Sentry/Slack for auth errors for ~15 min.

`check:prod` (`pnpm check:prod`) validates that required secrets are present
before a production deploy — run it after rotating.

## Per-secret notes

- **CRON_SECRET** — gates every `/api/cron/*` (incl. the heartbeat watchdog).
  Rotating it mid-flight makes Vercel Cron calls 401 until the new value
  deploys. Rotate, deploy, then confirm the next heartbeat populates
  (`/api/cron/heartbeat`). No external party holds this.
- **UPSTASH_REDIS_REST_URL / _TOKEN** — rotating recreates/rekeys the instance.
  Cache + operational data (events, locks, rate limits) is lost on a new
  instance; the platform degrades gracefully (Sanity is the source of truth)
  and rewarms. Prefer rotating the token in-place over recreating the instance.
- **SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL** — the service-role key is the
  high-blast-radius secret (bypasses RLS). It's set per-environment in Vercel;
  rotate it in the Supabase dashboard (Project Settings → API → roll), update
  Vercel (Production + Preview), redeploy, confirm `/api/health` Postgres probe
  + a dashboard sign-in. The publishable/anon key
  (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) is client-safe; rotating it just needs
  a redeploy. Database password rotation is separate (Supabase → Database).
- **SANITY_API_TOKEN** — *legacy.* No longer the source of truth (Postgres is);
  Sanity is dual-written as the rollback mirror until teardown, so a stale token
  breaks the rollback write path, not live reads. To rotate: mint a new token,
  deploy, revoke the old.
- **CLERK_SECRET_KEY / CLERK_WEBHOOK_SECRET** — *legacy, dead-pathed.* Clerk is
  no longer the live auth path (Supabase Auth is, gated by
  `isSupabaseAuthConfigured()`); these secrets are inert until Clerk teardown.
  Only rotate if a leak forces it: add the new key, deploy, revoke the old.
- **STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET** — roll the API key in the
  Stripe dashboard (supports a rolled-key grace window); update the webhook
  signing secret and re-send a test webhook. Billing is OFF today, so blast
  radius is low — but rotate carefully once it's on.
- **RESEND_API_KEY** — weekly reports fail silently if this is wrong; the mail
  log (`/api/admin/mail-logs`) + the >20% unsent alert will catch it. Rotate,
  deploy, send a test report via the cron's `workflow_dispatch`.
- **BLOB_READ_WRITE_TOKEN** — image uploads fail if stale; rotate + deploy.
- **SLACK_WEBHOOK_URL** — alerts go quiet if revoked; not auth-sensitive, but
  re-create the incoming webhook and update Vercel.
- **GOOGLE_* / INSTAGRAM_CLIENT_SECRET / SERP_API_KEY** — per-integration;
  rotating only affects that integration's cron (heartbeat will flag the cron
  if it starts failing).
- **SCAFFOLD_CUSTOM_REQUEST_SECRET** (legacy alias `REB_CUSTOM_REQUEST_SECRET`)
  — HMAC secret for the agent's custom-change POST. Coordinate with the
  receiving endpoint; both sides must rotate together.
- **The client revalidation HMAC secret** — shared with each deployed client
  repo. Rotating it requires updating the client repo's env in the SAME window
  (the `x-reb-*` signed revalidation will 401 otherwise). This is a
  coordinated, per-client rotation — never rotate unilaterally on the control
  plane. See `repo-transfer-runbook.md`.

## After any rotation

- `pnpm check:prod` green.
- `/api/health` all `ok`/`not configured` (no `error`).
- No new auth/permission errors in Sentry or the Slack alert channel.

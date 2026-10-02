# Secret Rotation Runbook

> **Updated 2026-07-30:** Supabase Auth + Postgres are the live identity/data
> path. Clerk secrets removed from Vercel 2026-07-30. Sanity API/write secrets
> removed from Vercel 2026-07-30; only `NEXT_PUBLIC_SANITY_DATASET` +
> `NEXT_PUBLIC_SANITY_PROJECT_ID` remain for legacy image-URL resolution.

How to rotate each production secret without taking the platform (or a live
client site) down. Setup of first-time secrets is a different doc
(`first-time-production-secrets.md`); this is for rotating one that already
exists — after a suspected leak, or when an integration is re-provisioned.

## General procedure (zero-downtime where possible)

1. Mint the new secret at the provider.
2. Add it to Vercel (Production + Preview) under the SAME env var name — this
   replaces the value; deployments pick it up on the next deploy.
3. Redeploy (or `vercel env pull` + redeploy). For dual-key providers such as
   Stripe, keep the old key valid until the new deploy is live, then revoke.
4. Revoke the old secret at the provider.
5. Confirm via `https://app.strelva.com/api/health` (Redis/Postgres probes) and
   watch Sentry/Slack for auth errors for ~15 min.

`check:prod` (`pnpm check:prod`) validates that required secrets are present
before a production deploy — run it after rotating.

## Per-secret notes

- **SECRETS_ENC_KEY** — AES-256-GCM key for at-rest encryption of provider secrets
  (OAuth tokens, `revalidation_secret`, etc.) in the Postgres `tenants` table and
  Redis connection blobs. Active in prod since 2026-07-15. **This is the
  highest-blast-radius rotation:** if you remove or change the key without first
  re-encrypting existing rows, `loadTenants` throws on every row with an `enc:v1:`
  prefix and the platform is fully down. Rotation procedure: (1) mint a new key
  (`openssl rand -hex 32`), (2) run `scripts/backfill-secret-encryption.ts` with
  both the old and new key set (the script re-encrypts all rows), (3) then update
  the Vercel env var and redeploy. Do NOT simply swap the env var without
  re-encrypting. Also note: the `reb:tenants:all` Redis cache holds a decrypted
  copy (60s TTL) — flush it after rotation.
- **CRON_SECRET** — gates every `/api/cron/*` (incl. the heartbeat watchdog).
  Rotating it mid-flight makes Vercel Cron calls 401 until the new value
  deploys. Rotate, deploy, then confirm the next heartbeat populates
  (`/api/cron/heartbeat`). No external party holds this.
- **UPSTASH_REDIS_REST_URL / _TOKEN** — rotating recreates/rekeys the instance.
  Cache + Redis-authoritative operational data (events, locks, rate limits) is
  lost on a new instance; Postgres-backed caches rewarm, but operational stores
  require their own recovery plan. Prefer rotating the token in-place.
- **SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL** — the
  service-role key is the high-blast-radius secret (bypasses RLS). Rotate in the
  Supabase dashboard (Project Settings → API → roll), update Vercel (Production +
  Preview) for both `SUPABASE_SERVICE_ROLE_KEY` AND `SUPABASE_URL` (the private
  server-only copy), redeploy, confirm `/api/health` Postgres probe + a dashboard
  sign-in. The anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, also aliased as
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in some paths) is client-safe; rotating
  it just needs a redeploy. Database password rotation is separate (Supabase →
  Database).
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
- `https://app.strelva.com/api/health` reports healthy required infrastructure.
- No new auth/permission errors in Sentry or the Slack alert channel.

## Known issues / TODO

- ~~**`SECRETS_ENC_KEY` is not validated by `pnpm check:prod`.**~~ **FIXED 2026-07-30.** `checkEnvVar('SECRETS_ENC_KEY', true)` is in `scripts/production-checklist.ts`.
- **`INTERNAL_API_SECRET` serves three roles** (domain-map auth, `OAUTH_STATE_SECRET`
  fallback, approve-link fallback). Prefer setting `APPROVE_LINK_SECRET` and
  `OAUTH_STATE_SECRET` as dedicated secrets so each is scoped to one role.
- ~~**Orphaned Clerk + Sanity secrets still set in Vercel.**~~ **FIXED 2026-07-30.** 11 vars removed (`CLERK_*` ×7, `SANITY_API_TOKEN`, `SANITY_WEBHOOK_SECRET`, `REVALIDATION_SECRET`, `CORS_ORIGINS`) from all three environments.

# Rollback and recovery

Status: **current**
Updated: 2026-07-30

Supabase Auth and Postgres are the only identity/data backbone. Sanity and Clerk
rollback paths no longer exist. Data recovery is forward-only: restore an
authoritative record/version or ship a corrective migration; never flip source
flags back to retired systems.

## Application deployment rollback

1. Promote the last known-good Vercel deployment for `strelva-admin` (Vercel team: `strelva`).
2. Confirm `https://app.strelva.com/api/health` reports both Supabase and Redis.
3. Confirm signed-out auth redirects, one invited owner sign-in, and one tenant
   dashboard read.
4. Read `/api/v1/content/{tenant}/hero` from a live custom repository and
   confirm signed revalidation still reaches it.
5. Record the incident and deployment id before attempting a forward fix.

A deployment rollback changes code only. It does not reverse already accepted
provider writes, Stripe events, emails, or schema migrations.

## Content recovery

1. Restore the prior `content_versions` entry through the governed restore path,
   or restore the most recent verified site snapshot for multi-section damage.
2. Preserve the pre-restore snapshot created by the restore flow.
3. Trigger signed client-site revalidation.
4. Confirm both the Postgres content row and the rendered Site Property.

## Database/schema recovery

- Prefer an additive corrective migration. Supabase migrations are production
  history; do not edit or delete an applied file.
- Use Supabase point-in-time/backups only for an incident that cannot be repaired
  at the record level, with owner approval and an explicit recovery timestamp.
- Reconcile Redis mirrors/caches from the restored authority afterward. A mirror
  is not promoted to authority merely because Postgres was unavailable.

## Redis recovery

Use [`persistence-boundaries.md`](./persistence-boundaries.md) to classify the
affected key family before acting. Postgres-backed caches may be flushed and
re-warmed. Redis-authoritative queues, event bodies, locks, rate limits, and
pre-tenant delivery records have domain-specific TTL/mirror behavior and must
not be described as universally recoverable.

## External side effects

Stripe mutations, GBP posts/hours/photos, review replies, and sent email are not
reversed by a code or data rollback. Reconcile any `processing` Workflow Event
against provider state before retrying. A provider-accepted non-idempotent write
must be resolved as accepted even if read-back verification failed, or a retry
can duplicate it.

## Known issues / TODO

- **[HIGH][bug] `SECRETS_ENC_KEY` removal causes full platform outage.** If this
  key is unset or changed while Postgres already has `enc:v1:`-prefixed secrets,
  `loadTenants` throws on every tenant load. Before a deployment rollback, confirm
  the rolled-back artifact was built with the same `SECRETS_ENC_KEY` that
  encrypted the current DB rows. See `secret-rotation.md` for the correct rotation
  procedure.
- **[HIGH][bug] `withAccountLock` proceeds unlocked when lock acquisition fails**
  (`src/lib/accounts.ts:194-213`). Concurrent Stripe webhook hits can produce
  last-write-wins on subscription state. Recovery after a duplicate webhook storm:
  query Stripe for the canonical subscription state and patch the tenant record
  directly.
- **[MEDIUM][bug] Ordering guard key in the Stripe webhook has no TTL**
  (`src/app/api/billing/webhook/route.ts:211`). The key leaks forever per tenant.
  Add a TTL on the guard key write.
- **[HIGH][bug] Calendly webhook `addEvent` is unguarded** — any Redis/Postgres
  failure returns 500, triggering Calendly retry storms
  (`src/app/api/webhooks/calendly/route.ts:124`). Wrap in try/catch; return 200
  on catch so Calendly does not retry. Add Redis idempotency keyed on `eventUri`.
- **[HIGH][perf] Calendly webhook uses `redis.keys()` full-keyspace scan**
  (`src/app/api/webhooks/calendly/route.ts:64`). Replace with a reverse index:
  write `redis.set('calendly-user-uri:<userUri>', tenantId)` when saving a
  connection; look it up with a single O(1) `redis.get`.
- **[HIGH][bug] GBP writes silently fail after tenant rename** — `google-meta:${t}`,
  `review-replies:recent:${t}`, `reb:review-nudge-sent:${t}`,
  `reb:order-review-request-sent:${t}:*`, and `reb:review-reply-declined:${t}:*`
  are missing from `authoritativePatterns` in `src/lib/tenant-rename.ts`. Add
  them and update the completeness unit test.

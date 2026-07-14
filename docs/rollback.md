# Rollback and recovery

Status: **current**
Updated: 2026-07-14

Supabase Auth and Postgres are the only identity/data backbone. Sanity and Clerk
rollback paths no longer exist. Data recovery is forward-only: restore an
authoritative record/version or ship a corrective migration; never flip source
flags back to retired systems.

## Application deployment rollback

1. Promote the last known-good Vercel deployment for `scaffold-web`.
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

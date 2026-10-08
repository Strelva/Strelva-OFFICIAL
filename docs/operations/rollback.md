# Rollback and recovery

Status: **current**
Updated: 2026-10-08

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
- **Org-layer tables** (`accounts`, `account_memberships`, `subscriptions`,
  `subscription_items`, `tenants.account_id`) are live in prod as of 2026-07-30
  (migration `20260729180000_org_layer_phase0_accounts` applied). Nothing reads them
  yet — `tenants.subscription_*` remains authoritative. Rollback of org-layer work
  is a forward corrective migration, not a revert of the applied migration.

## Prepared 1.0 schema reversals (local evidence only)

The 51 migrations in the 1.0 release packet have companion
`rollback-<forward-file>` SQL, plus a guarded July org-layer companion. The
[release-safety tool contract](../../scripts/release-safety/README.md) owns
order, archive preservation, timeouts, refusal behavior, and local proof
commands. The [Wave 6 handoff](../product/streams/w6-release-safety.md) records
the exact verification and remaining hosted/production limits.

These files prepare an exceptional separately reviewed recovery operation;
they do not authorize a destructive downgrade, rewrite applied migration
history, automatically restore archived rows, or replace the forward
corrective-migration preference above. Reverse conversions before business
billing. Preserve private archives and a verified dump. Hosted PostgreSQL,
current application behavior, lock limits and data compatibility require
separate rehearsal before choosing any live reversal.
Before batch 4, separately approve and run the private
[billing grant capture](../../scripts/release-safety/capture-billing-grants.sql).
Its rollback requires that pre-revoke snapshot; migration-only default grants
do not reproduce the permissions in the restored production dump.

## Current batch 8 runtime recovery

Batch 8 and its corrective tails are forward-only schema on the current runtime.
The [October 7 bounded release receipt](./security-runtime-production-2026-10-07.md)
records exact 266-version hosted history and actual-PUBLIC restored-copy
qualification. Preserve accepted customer work and later security repairs; do
not run the historical companions as a whole populated batch, reverse batches
0–7 beneath it, or restore an old whole database over newly accepted work.

The [release-safety contract](../../scripts/release-safety/README.md#batch-8-runtime-recovery)
owns pre-upgrade capture, original RPC scope capture, approved final catalog
fingerprints, permission disablement, and separately approved reactivation.
It retains all schema and rows. Feature switches/application configuration
remain required: the SQL disables original-scope service RPCs, not direct table
access or every later API. Accepted outside effects require their own recovery.

`pnpm check:release-safety:batch8 --current-tail` proves the exact checked-out
inventory in a disposable local PostgreSQL cluster, including two recovery
rounds and atomic drift/authority refusals. It does not prove hosted Auth,
storage, backups/PITR, a real provider undo, or full 1.0 rollout. Historical
empty-only helpers are outside the current qualification and require a new
reviewed preservation/compatibility plan before use.

## Redis recovery

Use [`persistence-boundaries.md`](../architecture/persistence-boundaries.md) to classify the
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

## Recovery invariants

- `SECRETS_ENC_KEY` is part of the data contract. If it is unset or changed while
  Postgres contains `enc:v1:` values, tenant loading fails closed. Confirm the
  rollback artifact uses the current key and follow `secret-rotation.md` for any
  rotation.
- Account mutations now reject when their Redis lock cannot be acquired; Stripe
  event-order keys expire; Calendly uses a reverse index and guarded writes; and
  tenant rename moves GBP plus review/order dedup authorities. Preserve those
  behaviors in any rollback target.
- After any billing recovery, query Stripe as financial authority and reconcile
  the tenant and account snapshots before reopening access.

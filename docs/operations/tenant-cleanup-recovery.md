# Tenant removal and cleanup recovery

Prepared locally on October 8, 2026. Deployment and native qualification remain separate.

`deprovision_tenant_guarded` still checks billing, export and workspace-owned
records and pauses stored Systems in the same transaction as database removal.
Migration `20261022090100` wraps that transaction with a durable pending cleanup
receipt. A process interruption after commit leaves the receipt in Postgres.

Database removal is not a complete purge. Redis discovery, tenant keys, shared
claims, account grouping and global cache invalidation must finish. The Vercel
project must be deleted or confirmed absent. Missing configuration, refusal,
unconfirmed deletion and `keepVercel` leave cleanup pending. No price, billing
provider subscription or another tenant's account data is changed by cleanup.
The receipt table is closed; service-role RPCs own access. Retained cleanup receipts
block tenant insertion or a rename into that slug under the existing hosted-tenant
lock, including after confirmed cleanup. Completion confirms store cleanup; it
does not reallocate a deleted identity. Another cleanup worker or old slug-scoped
writer could still finish later, so automatic reuse needs a separately qualified
generation protocol. Use a fresh slug rather than deleting the retained receipt.

The operator API returns `202` with `ok:false`, `databaseDeleted:true` and the
cleanup receipt when the database removal committed but cleanup is unfinished.
Safety refusal remains `403`. The admin editor keeps the pending result and offers
an exact-receipt cleanup retry instead of redirecting as a successful deletion.

Recover an interrupted response with authenticated super-admin
`GET /api/admin/tenants/<slug>/deprovision`. Retry with
`POST` on the same endpoint:

```json
{"action":"retry-cleanup","confirmSlug":"<slug>","cleanupReceiptId":"<receipt UUID>"}
```

The CLI uses `--confirm --retry-cleanup=<receipt UUID>` alongside its ordinary
slug argument and typed confirmation. Incomplete cleanup exits with code `3`;
guard refusal exits with code `2`. JSON mode includes both the database state and
cleanup receipt. A stale receipt cannot authorize cleanup. A completed historical
receipt returns without performing more cleanup; the retired slug stays reserved.

Domain claims, email-keyed invites and event/reply keys are changed only under
current Redis ownership. Shared account cleanup removes only the target tenant
from the grouping and keeps subscription/provider fields. It retains the canonical
account lock and mirror hooks, reads the current Redis grouping after database
removal and checkpoints its identity before the reverse index can disappear.
Domain-map and invite/event ownership changes run through atomic Lua; failed
operations are not empty-store evidence.

The read-only `tenant_cleanup_teardown_blockers` preview includes native public
booking grants and bookings by the exact tenant stable identity, alongside
publications and reservations. It uses the same protected-record predicates as
the atomic execution guard, including retained booking rows; it does not weaken
execution or rely on calling a write/lock path from a dry run.

Qualification still required on the composed source:

- Execute `tests/tenant-cleanup-receipts-schema.sql` on a disposable migrated DB;
  verify guarded failures, pending reuse refusal, completion, another tenant's
  preserved rows and stale-receipt identity refusal.
- With `keep_fixture=true`, then execute `tests/tenant-cleanup-blockers-readonly.sql`
  under its literal `BEGIN READ ONLY` to prove the booking-only hold and preserved
  public-role denial. The publication row is fictional fixture state, not provider
  acceptance.
- Run `STRELVA_TENANT_CLEANUP_REDIS_PROOF=1 pnpm exec vitest run
  src/__tests__/deprovision-shared-cleanup-redis.test.ts --maxWorkers=2` in the
  coordinator's isolated Redis window.
- Typecheck and observe the pending/retry editor state. No browser, build,
  database, hosted provider or production changes are established by the focused
  mock-based unit and route checks.

The inverse refuses when any cleanup receipt exists, including completed history.
It must never remove the only retry record or outstanding reuse fence.

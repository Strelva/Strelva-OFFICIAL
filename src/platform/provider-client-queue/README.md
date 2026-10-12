# Provider client delivery queue

`GET /api/workspace/provider-client-queue?workspaceId=<agency>` reads a page of
failed/different Google and outside-write read-backs, unchecked/unconfirmed
website deployments, and owner decisions that have not been delivered. The
agency Home composes the two lists in its existing Queue and, with Systems off,
its client attention section.

The confirmed session supplies identity. The service-only Postgres RPC checks
current agency membership, the exact agency's active provider seat and the
person's active client staff assignment in each READ COMMITTED statement. This
is the existing provider seat's grant for internal client work, not a grant to
send another outside write. Platform operator status grants nothing here.
Named Systems must exist and belong to that business; business-level records
without a System remain eligible. Creator identity does not determine ownership.

A page contains at most 50 rows through the HTTP route (100 at the RPC boundary),
ordered by timestamp and source-prefixed UUID. The next cursor is advisory, not
an authorization token. Every page rechecks current scope. Completed workspace exits are excluded even
when provider-seat cleanup has not finished. UI refresh discards
previous pages; permission failure clears displayed rows. Failed later pages
keep the loaded rows and state that the queue is incomplete.

The strict projection contains only row key, business identity/name, System id,
kind, title, status and timestamp. It excludes receipt requests, snapshots,
provider references, actors, errors, notes, delivery recipients and owner-link
credentials. No queue action resends a write or an owner message. Opening a
client resolves its current workspace access through the existing experience.

`20261021094000_provider_client_queue.sql` is pending and atomic. Its rollback
owns no customer records, preserves all source rows and refuses a changed
function definition. Historical migrations are unchanged.

Local verification:

```sh
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-provider-client-queue-sql.sh
pnpm exec vitest run src/__tests__/provider-client-queue-route.test.ts src/__tests__/provider-client-queue-ui.test.tsx src/__tests__/agency-home-ui.test.tsx
pnpm typecheck
```

The native harness applies actual ordered migrations to disposable Postgres,
checks role ACLs, exact scope/identity/staff/seat/membership and System ownership,
privacy, pagination, READ ONLY behavior, reader/revocation concurrency, retained
rows through rollback/reapply, changed-successor rollback refusal, and injected
forward/rollback failures. Preview fixtures are fictional, not proof of real
provider use or production delivery.

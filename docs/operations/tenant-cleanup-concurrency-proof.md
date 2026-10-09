# Tenant cleanup concurrency qualification

Prepared October 8, 2026. Source fixtures only; coordinator owns execution and
all database/Redis/Auth/app resource windows. This supplements the actual SQL
CAS, booking READ ONLY and shared Lua qualification reported by the coordinator.
Those earlier results do not establish the new two-worker or UI journeys.

## Native two-worker proof

Use the coordinator's existing disposable database with the complete actual
forward schema, guarded teardown and cleanup receipt CAS already applied. This
fixture creates fictional tenants and leaves their retained receipts in that
disposable database. It neither creates a schema nor substitutes missing tables.
The adapter is limited to real service-role cleanup/client-record RPCs. A missing
function, denied privilege or SQL error remains an error; direct table fallback
throws. Its `psql` transport accepts JSON argv with an explicit local host and DB.

In the authorized window, run:

```sh
STRELVA_TENANT_CLEANUP_NATIVE_PROOF=1 \
STRELVA_TENANT_CLEANUP_PSQL='["-h","/tmp/owned-cluster-socket","-U","postgres","-d","strelva_test"]' \
pnpm exec vitest run src/__tests__/deprovision-concurrent-native.test.ts --maxWorkers=2
```

Set PATH to the coordinator's PostgreSQL binaries. The fixture owns one isolated
Redis process and stops only that process afterward. It runs the actual cleanup,
canonical account lock/persistence, shared ownership Lua and client-record mirrors.
The failure injection pauses and refuses precisely one real Redis account SET
after canonical unlink removed the reverse index. Worker B's actual native
revision-zero reader result is delayed in transport while A checkpoints revision
one. B must fail its final native CAS. A's refused persistence remains pending;
both callers then reload/retry the exact receipt and converge to confirmed Redis
cleanup while preserving the other tenant, subscription, reverse index, invites,
connections and shared domain claims. Recorded account targets remain durable.

Vercel is disabled. Final overall cleanup remains pending with `providerComplete:
false`; this proof does not establish provider absence or complete purge. Actual
client-record mirror removal after tenant deletion reports unknown tenant and
queues repair. The fixture explicitly preserves/checks that pending evidence,
and checks the surviving tenant's real mirror RPC was reached. It does not turn
that failure into successful Postgres removal.

## Actual Auth and loaded-editor proof

The existing local Auth profile can cover the current loaded editor and receipt
API without adding an auth bypass. Both app and runner must have Vercel tokens
absent; no provider write is permitted. Execute in the coordinator's existing
Auth/app window, with all required profile flags retained:

```sh
STRELVA_LOCAL_AUTH_PROOF=1 STRELVA_TENANT_CLEANUP_UI_PROOF=1 \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 \
pnpm exec playwright test tests/tenant-cleanup-authenticated-local.spec.ts
```

It creates real verified local people, seeds super-admin through the existing
loopback fixture helper and uses the actual loaded `/admin/clients/<slug>` editor
at desktop/mobile widths. A tenant owner email remains insufficient authority.
Typed confirmation gates deletion. Native deletion returns 202 pending cleanup;
the editor retains its URL and offers exact-receipt retry. The second real request
uses that id, advances its native revision and remains visibly pending. A separate
authenticated GET recovers the durable receipt after tenant deletion; ordinary
people remain denied and slug reuse remains refused. Screenshots and native
receipt attachments are captured during execution.

The editor requires a tenant row on page load. This fixture does not claim a fresh
page load reconstructs the pending editor after the tenant is gone. Durable
recovery currently belongs to the authenticated receipt API; a standalone
operator recovery surface remains unproven. No fabricated response or route
fulfillment replaces the cleanup request.

## Prepared evidence and next action

Scoped lint passed. The native concurrency test was collected with its explicit
gate off (one skip); Playwright listed both desktop/mobile cases without starting
a browser or server. No native DB, Redis server, Auth, browser, build, provider,
production or dependency operation ran while preparing these fixtures. Root must
execute both on one composed source and retain original errors and receipts.

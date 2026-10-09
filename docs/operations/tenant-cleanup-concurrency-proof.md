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
The adapter is limited to real service-role cleanup/client-record RPCs. Its strict
connection parser allows exactly one `-h`, `-U`, `-d` and optional valid `-p`.
Duplicates, long aliases, URI/service values, arbitrary flags and ambiguous socket
paths are refused. The argv is reconstructed from those fields and all PG/PSQL
environment overrides are removed. Socket directories must resolve inside owned
/tmp with the current user's UID. A missing
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

The standalone `/admin/tenant-cleanup/<slug>` page requires current super-admin
authority and no tenant row. It loads the actual receipt API, displays distinct
loading/unavailable/missing/pending/complete states, confirms the typed slug and
retries only the recovered exact id. The client editor links to it after partial
removal; reloading the old deleted-tenant editor URL routes to it. The updated
actual Auth fixture reloads that URL, verifies native GET recovery, performs a
new exact-receipt retry, observes revision progress and pending provider state,
and checks an ordinary signed-in person cannot enter the recovery page. Browser
execution remains unperformed; this is implemented recovery with prepared proof.

## Prepared evidence and next action

Scoped lint passed. The native concurrency test was collected with its explicit
gate off (one skip); Playwright listed both desktop/mobile cases without starting
a browser or server. No native DB, Redis server, Auth, browser, build, provider,
production or dependency operation ran while preparing these fixtures. Root must
execute both on one composed source and retain original errors and receipts.


Successor source verification: strict adapter regressions reject duplicated/long
host switches, URI/service and extra command/file flags, and remove libpq overrides.
Focused receipt-client tests reject cross-scope/stale/inconsistent/missing retry
receipts and preserve denied/unavailable outcomes. Page authority tests require
current super-admin before mounting recovery. `21st` catalog search/review is
unavailable locally (`command not found`); no dependency was installed. Existing
owned primitives and tokens were reused. Native/UI execution remains root-owned.

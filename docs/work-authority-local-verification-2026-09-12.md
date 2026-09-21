# Local work authority and horizontal execution proof

Verified September 12, 2026. This is local evidence, not a production release,
provider-delivery claim, or human acceptance of the full horizontal product.

## What ran

The proof used the already-running, explicitly isolated
`strelva-horizontal-verify-0911` Docker Supabase Auth, Postgres, REST and Kong
services. The database contained test identities and zero tenants before this
run. Unrelated Docker services were not changed. Application requests used
`http://localhost:3200`; Supabase used loopback port 55421 and the synthetic
Redis transport used loopback port 18079.

These September 12 migrations were applied only to that local Postgres:

- `20260912010000_budgeted_execution.sql`
- `20260912110000_bounded_product_work.sql`
- `20260912120000_work_context_participation.sql`
- `20260912143000_product_learning_work.sql`
- `20260912160000_work_responsibilities.sql`
- `20260912180000_work_plan_application_output.sql`
- `20260912190000_tracker_record_coordination.sql`

PostgREST received a schema reload notification. The authority functions were
then refreshed with the internal-research sharing denial. The two economics
functions were refreshed for verified recovery and automatic settlement without
recreating their tables. No production
connection, environment, deployment, or migration was used.

The local server uses `.next-authority`, workspace/inquiry release flags enabled
only in its process, `TENANTS_SOURCE=postgres`, and both `BYPASS_AUTH=0` and
`ACCESS_BYPASS=0`. `tests/support/local-provider.mjs` is preloaded with explicit
local opt-in and blocks non-loopback fetches except its synthetic Resend
implementation. These journeys did not deliver provider messages or charge a
card. Local Auth credentials stay in the private, mode-0600 temporary environment
file `/tmp/strelva-authority-env.json`; no credential value belongs in this note.

Next automatically adds the chosen generated output path to `tsconfig.json`
while this development server runs. The temporary port3200 server was stopped after the proof, and only its
`.next-authority` generated includes were removed. Existing local Docker
verification services were left unchanged.

## Proven journeys

The following three Playwright tests passed together in 53.3 seconds with real
local Auth sessions and database persistence:

- [Horizontal operations proof](../tests/horizontal-operations-authenticated-local.spec.ts):
  a private document becomes the target of an approved responsibility. An
  accepted budget is attached; unapproved and paused runs are refused. Resuming
  completes the native document edit and records one accepted, zero-cost
  execution. Another account cannot read or run the responsibility. A safe retry of
  the completed responsibility reopens its stored receipt without repeating the
  document edit; its known budget settles. The document reopens with its actual
  changed text in the shared interface.
- The same file exercises a persisted local reservation and overlap rejection;
  application installation refused before rehearsal, then installation and
  record submission; reuse that copies the approved specification but no
  records; and a two-document investigation with durable discrepancy evidence
  and rejection of a premature repeat. This is local scheduling and local
  source comparison, not an external calendar or third-party system proof.
- [Scoped contribution proof](../tests/work-authority-authenticated-local.spec.ts):
  an owner grants one verified outside account read/propose access. Ordinary
  document access remains denied. The recipient opens the scoped page on a
  390-pixel viewport, submits a proposal, and reopens it after reload. The owner
  reviews it on desktop. Acceptance records review without changing the original
  document. Revocation blocks the recipient's target read and next contribution.

The final integration pass also passed three tests in 2.6 minutes, including the
updated operation behavior: completed retries reopen the existing receipt,
preserve the document revision, and leave one automatically settled execution.
[Tracker coordination](../tests/tracker-coordination-authenticated-local.spec.ts)
used two real private trackers and a separately seeded local workspace member.
Assignment and an exact-version record link persisted; a later cell edit survived
Undo of the coordination change. A stranger, invalid assignee and stale related
record were refused. The seeded membership is fixture setup, not proof of a
membership-invitation interface.

[Plan application output](../tests/work-plan-application-authenticated-local.spec.ts)
passed separately in 37.6 seconds. A synthetic ready-plan fixture was accepted
through the authenticated output API, producing one native private application
with server-owned maintenance. An outsider was denied and a retry reopened the
same application. No model was invoked. This run exposed and fixed a real
receipt-confirmation issue: PostgreSQL offset timestamps were rejected by a
Z-only schema after the application had already been saved. The schema now
accepts valid offset timestamps, including source references.

The mobile and desktop contribution renders were inspected. That review removed
an expected permission-denial message from the guest surface and collapsed the
new-proposal form after a contribution exists, keeping the saved result visible.
The affected real-auth browser journey passed again in 57.9 seconds. Its final
screenshots are in `/tmp/strelva-authority-browser-review/`.

The browser commands read only the private local environment, remove the server
preload from the test runner process, and use a separate artifact directory:

```text
pnpm exec playwright test tests/work-authority-authenticated-local.spec.ts tests/horizontal-operations-authenticated-local.spec.ts --reporter=line --output=/tmp/strelva-authority-browser-results
```

The first run caught a fixture-origin mismatch (`127.0.0.1` versus Next's
normalized `localhost`) and an incorrect test expectation for the economics
execution's `finished` status. Both were corrected without weakening the
application's CSRF or execution checks. Parallel Playwright runs also collided
in the default `test-results` directory; the isolated output path resolved that
artifact collision.

## Focused command and storage proof

The final unit run passed all 348 files: 2,637 tests passed and one skipped,
using `pnpm test --maxWorkers=4 --testTimeout=15000`. Earlier runs at the default
five-second limit hit cold-import timeouts in older route tests on this
workstation. Two imports were moved outside timed assertions; the final command
allows the remaining cold imports more time without changing repository timeout
configuration or weakening assertions. This is a qualified local pass, not a
claim that the default-timeout CI command was green.

Full ESLint, TypeScript, product-boundary and ontology checks passed. The custom
repository compatibility gate passed all 54 checks against representative
consumers, and app/marketing product versions matched at 0.1.1. Desktop/mobile
fixture journeys and the real local Auth journeys above provide separate
interaction and persistence evidence.

The final production build passed after the recovery changes, using the
CI script's empty-provider environment and disabled workspace/background flags.
Source-map upload credentials were empty. This proves a local production build;
it does not deploy, enable background operation or establish a hosted result.

The complete isolated PostgreSQL harness also passed with the additive
`20260912200000_tracker_handoff_isolation.sql` migration. Its regression fixture
first reproduced copied agency assignments and links, then proved the customer
copy omits that coordination and its Undo receipts while preserving records,
ordinary history and source provenance. The source tracker remains unchanged.
This migration was tested in the temporary SQL cluster, separately from the
seven migrations used by the authenticated browser environment above.

Execution recovery tests additionally prove that recording an interrupted
action's verified outcome preserves paused or cancelled status. A cancelled
investigation can reconcile its exact historical receipt after its sources
change; active work still requires current sources before it can continue.

Eight tests across `work-context.test.ts`, `work-participation.test.ts`, and
`work-authority-routes.test.ts` pass. They exercise the public services and routes
with database/auth boundaries substituted, including current grant scope,
stale review, idempotent contribution retries, unknown/over-budget costs,
preference/authority separation, cross-workspace denial, and release/CSRF gates.

[The SQL fixture](../tests/work-context-participation-schema.sql) passes against a
separate temporary Unix-socket PostgreSQL cluster using the base workspace
schema fixture. It proves service-only RPC privileges, role denial, sponsored
proposal persistence, stale compare-and-swap rejection, revoked read/write
denial, stale-source rejection without overwriting prior context, and exclusion
of internal research from the generic sharing path.

Scoped source grants in this module authorize additional same-workspace saved
work. They do not manufacture provider connections or replace source selections
owned by another native product. A contribution cost is an attributable report,
not a verified provider bill or payment. Exact enterprise identity, retention,
and commercial terms remain separate decisions.

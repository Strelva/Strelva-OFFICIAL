# Horizontal slice local verification

Date: 2026-09-11

This is a bounded local audit of the selected scope in
[horizontal-first-scope-2026-09-11.md](./horizontal-first-scope-2026-09-11.md).
It records what the current code and local checks demonstrate. It is not a
release approval, an authenticated deployment result, or a production claim.

The authenticated local proofs below supersede the earlier mocked-only
tracker and inquiry evidence. External provider configuration, a representative
client installation, and production activation remain separate release gates.

## What is implemented locally

The inquiry and tracker experiences enter the existing `/workspace` frame. The
workspace keeps the durable work identity in `saved_product_work`; inquiry
state stays with the inquiry workspace authority, and tracker state stays with
the tracker API and workspace repository. The browser routes use stable
`workspaceId`, `work`, `view`, and inquiry context parameters. Internal tracker
experiments are presented as typed `research/experiment` work with a bounded
projection, rather than as a second customer tracker catalog.

The tracker slice currently demonstrates CSV-only import, an explicit mapping
review, source-row references, warnings and limits, saved edits, filtering,
revision conflicts, attributable history, reload, read-only delegated access,
and operator-reported experiment evidence. A second import is described as a
new tracker and cannot overwrite a saved tracker silently. Workbook formulas
and spreadsheet-equivalent calculations are not claimed.

The workspace handoff accepts only a valid persisted tracker snapshot or an
existing supported assessment. Its addressed preview exposes bounded tracker
metadata and rows without the original CSV, cell lineage, actor identifiers,
or raw payload. Acceptance reuses the existing workspace copy and delegation
transaction. Agency access remains optional, unchecked by default, read-only,
and revocable by the customer.

The inquiry experience is mounted through the same workspace layout and uses
the server adapter for authenticated routes. The preview adapter covers the
shape, edit, rehearsal, publication, simulated intake, grouped Undo, and
read-only/unavailable states. The inquiry route enforces release gating,
confirmed identity, tenant membership, server business scope, origin checks,
permission checks, and revision conflicts.

## Authenticated local tracker proof

`tests/tracker-authenticated-local.spec.ts` passed against an isolated Supabase
Auth and Postgres stack with the full numeric migration chain. The app ran on
port 3212 with authentication bypass disabled. It used actual sign-in cookies
and request adapters; no browser API interception was used.

The journey created a workspace, imported and saved two different synthetic
CSVs, reopened them, edited a cell, and preserved the edit after reload. The
second file included typed columns, quoted commas and multiline text. A separate
user was denied access. A stale edit returned 409 without overwriting the saved
revision, and deleting the owner's workspace membership caused a subsequent
read to return 403.

The same journey saved an internal R&D record against tracker revision 1,
retained unknown provider cost as null, displayed the record, and returned to the
current tracker. That return link initially left the old screen open; the
workspace navigation callback now updates the selected work and reloads it.
The synthetic effort numbers test persistence only and are not measured savings.

The final tracker browser run passed in 6.0 seconds. This is test execution time,
not a customer setup, review or correction measurement. Mobile inspection used a
390-pixel viewport. The table scrolls horizontally within its container.

![Authenticated local tracker on mobile](../output/tracker-authenticated-local-mobile.png)

## Authenticated local handoff proof

`tests/tracker-handoff-authenticated-local.spec.ts` passed against the same
isolated Auth/Postgres stack. An agency created a saved tracker, addressed a
handoff to one customer, and received read access only after that customer
accepted it with the option selected. Another user could neither inspect nor
accept the handoff. The preview omitted the raw CSV and private source details.

The agency could read the customer's accepted tracker, then lost access after
the customer revoked the delegation. The customer's saved work remained. This
used real request adapters and database transactions; it does not establish an
authenticated deployed result.

## Authenticated local inquiry proof

`tests/inquiry-authenticated-local.spec.ts` passed through real local Supabase
Auth, Postgres and Redis, with no authentication bypass or browser API mocks.
The provider fetch fixture simulated email acceptance and read-back. It did not
connect to Resend or deliver mail to a mailbox.

The journey denied another user's reads and writes, then used the owner's
session to request an inquiry setup, accept its shape, edit the actual form
heading, grant email consent, and run the stored eight-check rehearsal. It
published the exact version and captured an inquiry through the public v1
contract. Capture recorded the inquiry and its receipt without sending mail.

The owner then inspected the exact acknowledgment recipient and text and
clicked Send. The simulated provider accepted it and reported delivery. A
repeated approval returned a non-retryable result without a second provider
write. The authenticated record and Why views reloaded with their recorded
evidence. The same inquiry also opened and reloaded inside the shared workspace
through its stable inquiry link. Undo removed the public form and preserved the received inquiry and
receipt, both in the response and after reload.

Mobile inspection found that the history rail covered the record and could not
close. The inspector now opens automatically on wider screens and by an explicit
Record history button on phones; closing it returns to the visible record.
The final journey opened and closed that mobile history dialog successfully.
A second integration defect was the default job's missing acknowledgment action;
new supervised jobs now permit preparing it while still requiring approval.

The final lifecycle and approved-send run passed in 15.0 seconds. This is local test
duration, not a customer savings measurement. Automatic staff routing and
follow-up gates are additionally covered by focused delivery tests, including
routing-only configurations, exact recipients, retries, accepted-write recovery,
reply evidence, pause, changed policy, consent and budget limits.

![Locally simulated approved message](../output/inquiry-approved-message-desktop.png)

![Preserved inquiry after Undo on mobile](../output/inquiry-preserved-record-mobile.png)

## Acceptance comparison

| Scope requirement | Local evidence | Boundary or remaining proof |
| --- | --- | --- |
| Both experiments appear in shared work and reopen through stable links | `WorkspaceApp`/`WorkspaceLayout`, the workspace release browser file, tracker UI browser file, and the typed experiment projection | Tracker, R&D and embedded inquiry reload also passed through real local Auth/Postgres. No authenticated deployed workspace reload has been proven. |
| Work shows state, decisions, evidence, and unknown cost stays unknown | Tracker UI shows import state, rows, edits and history. `WorkspaceExperimentResult` shows baseline, setup, review, corrections, result, evidence, recorded date, target revision, and `Not recorded` for null provider cost. Inquiry preview shows work, rehearsal, receipt and records | The evidence is synthetic or mocked locally. No real provider cost or live delivery evidence is established. |
| Permitted reviewer can inspect scoped work and handoff | Workspace route tests cover valid tracker handoff, malformed/unsupported denial, delegated denial, addressed bounded preview, and malformed acceptance. Browser coverage accepts a tracker with optional read access and reloads the delegated read-only view. | Authenticated local Auth/Postgres also proves addressed handoff, acceptance, delegated read and revocation. A deployed authenticated service remains unproven. |
| Denial, revocation, unavailable storage, conflicts and interrupted work | Tracker route/server tests cover release, identity, origin, body limits, access, stale revision and stale experiment evidence. Workspace browser coverage covers handoff revocation, stale navigation, unavailable deep links and assessment recovery. Inquiry route tests cover tenant, origin, permission and stale revision denial. | Real local Auth/Postgres proves tracker membership, conflicts and reload; the inquiry proof uses real local Redis too. Provider interruption and recovery failure paths use focused injected-transport tests. |
| Desktop, mobile, keyboard, loading, empty, error and read-only states | Workspace and tracker browser checks include mobile width/overflow assertions. Tracker screenshots show owner and delegated read-only states. Inquiry preview checks mobile navigation, rehearsal notice, read-only and unavailable states. | These are local rendered journeys with synthetic responses, not deployed user sessions. |
| CSV mapping, source preservation and import warnings | `tracker-import.test.ts` covers two structurally different CSVs, quoted/multiline fields, source lineage, duplicate headers, ambiguous types, unsupported formulas, malformed rows, unsupported workbook input, empty headers and limits. | The authenticated browser run imported two structurally different synthetic CSVs. A real customer-data import is outside this scope. |
| Meaningful edits, filtering, history and reload | `tracker-engine.test.ts` and the tracker browser journey cover edits, source lineage, filtering, pagination, history, conflict feedback, and reload. | Durable tracker reload also passed through the real local Auth/Postgres adapters; deployment remains unproven. |
| Re-import cannot overwrite later edits | The tracker UI states that another import creates a new tracker and does not replace saved edits; creation is a separate operation. | There is no saved-tracker re-import flow in this slice, so a full re-import migration journey is not demonstrated. |
| Internal R&D evidence is experimental and not promoted | Tracker experiment route/server tests enforce admin-only recording and expected revision. The projection requires `operator_reported` and `promoted: false`; the UI labels evidence as reported and not verified customer savings. | No same-workload candidate comparison or external promotion decision has been made. |
| Inquiry lifecycle remains in the shared workspace | `InquiryServerWorkspaceExperience` is rendered from the shared layout. Inquiry route and preview journey tests cover canonical actions, durable snapshot projections, rehearsal, simulated intake, grouped Undo and read-only/unavailable states. | Authenticated local tenant reload, exact publication, intake, approved message, duplicate protection and Undo preservation passed through real stores. Provider fetches were simulated; deployed operation and real mail remain unproven. |

## Commands run and results

The focused workspace and tracker unit run passed 86 tests in 8 files:

```sh
pnpm exec vitest run \
  src/__tests__/workspace-routes.test.ts \
  src/__tests__/workspace-presentation.test.ts \
  src/__tests__/product-catalog.test.ts \
  src/__tests__/tracker-route.test.ts \
  src/__tests__/tracker-server.test.ts \
  src/__tests__/tracker-experiment.test.ts \
  src/__tests__/tracker-import.test.ts \
  src/__tests__/tracker-engine.test.ts
# Test Files  8 passed (8)
# Tests       86 passed (86)
```

The tracker rendered journey passed both tests, using intercepted synthetic
workspace and tracker API responses:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3210 STRELVA_WORKSPACE_RELEASE=1 \
  pnpm exec playwright test tests/tracker-ui.spec.ts \
  --output=output/playwright-horizontal-audit --reporter=line
# 2 passed (3.5s)
```

The full shared-workspace browser file passed 26 tests against the local server
on port 3210:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3210 STRELVA_WORKSPACE_RELEASE=1 \
  pnpm exec playwright test tests/workspace-release.spec.ts \
  --output=output/playwright-workspace --reporter=line
# 26 passed (19.5s)
```

The SQL check passed on an isolated local PostgreSQL cluster. It exercises the
workspace schema, handoff copy, delegation and recovery checks, plus the other
isolated SQL checks invoked by the script. It does not connect to production:

```sh
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH npm run check:workspace-sql
# Workspace SQL checks passed on isolated PostgreSQL
```

The full local unit suite passed 316 files: 2,484 tests passed and one was
skipped. The production build passed. Typecheck, product boundaries,
custom-repository compatibility (54/54), and shared app/marketing version parity
(v0.1.1) passed. Lint reported no errors; its one unused test variable was removed
and the affected file passed ESLint afterward.

The full suite initially hit three existing five-second test timeouts while the
production build was running. Running it after compilation completed passed in
6.53 seconds without changing test timeouts or application behavior.

The latest shared workspace/tracker browser run passed 28 tests. Its preview-only
tracker test was skipped because that run did not set the preview flag; running
that test separately with the required flag passed. The inquiry preview/control
run passed five tests. Two delivery fixture browser tests require a separate
local bypass configuration and were skipped in that run; their earlier isolated
fixture run passed. The authenticated inquiry proof is recorded separately.

The approval module extraction passed focused tests and typecheck. The final
source checks passed: lint, product boundaries, ontology, and the production
build. The full suite passed again after the final behavior fixes with the same
2,484 passed and one skipped result.

## Rendered evidence

These images are local browser artifacts. They show UI state only; they do not
prove authenticated deployment, database durability, provider delivery, or a
production result.

![Tracker saved owner desktop](../output/playwright-horizontal-audit/tracker-ui-owner-can-impor-aeaf3-ate-and-record-R-D-evidence-desktop/tracker-owner-saved-desktop.png)

![Tracker delegated read-only mobile](../output/playwright-horizontal-audit/tracker-ui-delegated-track-46975-ble-and-read-only-on-mobile-desktop/tracker-read-only-mobile.png)

The inquiry preview artifacts show the rehearsal boundary and mobile request
entry. They are fixture-backed and explicitly say that nothing is real:

![Inquiry rehearsal receipt](../output/inquiry-receipt-desktop-verified.png)

![Inquiry mobile request](../output/inquiry-new-mobile-verified.png)

## Remaining release gates

Local proof does not establish hosted or production operation. Before external
rollout, verify the actual provider sender and receiving setup, signed webhooks,
delivery and reply correlation using an explicitly authorized test recipient.
Install the shared form in a representative client repository and test its
published storefront contract. Prepare the exact target environment, migrations,
release flags and rollback for explicit activation authority.

The broader horizontal product remains a direction. This first release does not
implement arbitrary generated applications, Excel formulas, every named
connection, third-party agent execution, or verified customer savings. Internal
R&D records support collecting that evidence; the synthetic records above do
not prove a commercial outcome.

No production deployment, provider connection, real email, webhook registration,
production migration, customer-data import, or external write was performed.

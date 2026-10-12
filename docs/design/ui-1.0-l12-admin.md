# L12 admin depth · October 9, 2026

Local presentation implementation on `ui/1.0-l12-admin`; uncommitted at Jacob’s
explicit stop point. No push, merge, deploy, dependency, migration, persisted env change,
email, Stripe operation, DNS change or production-data write was performed.

## Surfaces and evidence

All ten real surfaces are recomposed on the paper kit within L8’s existing
operator chrome. Every route has kit loading/error boundaries. Existing admin
admission, reader/action contracts and release checks remain; denied access still
uses their original gates. Empty data uses explicit empty states.

| Surface | Composition reference | Source implementation |
| --- | --- | --- |
| `/admin/actions` | `RpWy4`, `S706C` | Open grouped suggestions and approvals, separate bulk confirmation, exact draft preview, incomplete/failed action states |
| `/admin/audit` | `E8MFYs` | Wide responsive kit table, retained scan controls, activity filters and named actor records |
| `/admin/digests` | `RpWy4` | Open client sections and upkeep rows, approval/dismissal controls |
| `/admin/drafts` | `RpWy4`, `S706C` | Open draft rows, kit field-change ledger and Google post/hours preview, retained rejection confirmation |
| `/admin/leads` | `RpWy4`, `pNg1m` | Open prospects, status filters, notes, delivery-stage fields and retained conversion path |
| `/admin/needs-you` | `pNg1m` | Business selection rows, responsive policy comparison, existing floor/owner-route constraints |
| `/admin/onboard` | `lRbrh`, `pNg1m` | Native kit form, progress/result steps and next-action rows, retained prefill/storage/provisioning contracts |
| `/admin/ops` | `E8MFYs` | Open service checks/counts/failures with supported retry confirmation; absent detail remains unknown |
| `/admin/pay-links` | `pNg1m` | Kit form and open payment records; existing creation/revoke payloads, paid amounts and `/pay/*` URLs retained |
| `/admin/work` | `RpWy4`, `E8MFYs` | Open human-minute evidence, kit log form/history, links and execution exception rows |

These pages have no dedicated canon frames. The five supplied canon renders were
inspected as composition references. **No surface is claimed visually complete:**
1440/390 rendering, keyboard/focus in a browser and visual state comparison remain
unproved. No dark canon was assigned; optional dark preview is source-supported,
with no rendered dark proof.

The managed-client human-minute panel on `/admin/clients/[id]` retains its earlier
Panel/Vital composition, outside this lane’s page scope. Its shared log/history
pieces now inherit the kit. No redirect-only route changed.

## Preview and remaining screenshot pass

`/preview/strelva/operator-depth?surface=<surface>&scenario=<scenario>` uses the
actual presentation components for all ten surfaces. Surface values are
`actions`, `audit`, `digests`, `drafts`, `leads`, `needs-you`, `onboard`, `ops`,
`pay-links`, `work`. Scenarios: `ready`, `empty`, `loading`, `error`, `denied`.
Add `mode=dark` for token inheritance, or `surface=onboard&result=created` for
completion. Fictional content and transports live only under workspace preview.
The preview is development/`STRELVA_UI_PREVIEW=1` gated and visibly fictional.
Controls either rehearse in memory or remain read-only; unknown requests are
refused. Onboarding preview never restores or saves browser storage.

Screenshots: **none captured or viewed**. Intended destination:
`/Users/jacobrhinehart/Desktop/strelva/design/foundation/code-shots/L12-admin/`.
The prescribed Chrome screenshot runner failed before a page opened with
`SIGABRT`. IAB was unavailable. Chrome connector fallback was rejected because
local-access permission was declined; further browser attempts stopped. The
server also emitted Watchpack `EMFILE` errors. Port 3122 server was stopped.

Next action: Jacob starts the prescribed server, opens `/preview/strelva/kit`,
captures each preview surface/state at 1440 and 390, inspects every capture against
the five references, verifies keyboard/focus and state recovery, then commits the
reviewed worktree. No production action is implied.

```bash
STRELVA_UI_PREVIEW=1 STRELVA_SYSTEMS_RELEASE=1 STRELVA_NEEDS_YOU_RELEASE=1 STRELVA_WORKSPACE_RELEASE=1 pnpm dev -p 3122
```

The supplied `shoot.mjs` command accepts one name/URL pair for each state; use
`CH=1 FULL=1`, and `W=390 H=844` for phone. Stop the server when done.

## Local verification

Final `pnpm typecheck`: exit 0.

```text
✓ Types generated successfully
```

`tsc --noEmit` completed without diagnostics. Focused combined UI/contracts run:

```text
Test Files  17 passed (17)
Tests       191 passed (191)
```

Additional imported operations-inbox contracts/UI:

```text
Test Files  3 passed (3)
Tests       11 passed (11)
```

`npx eslint` over all 61 changed TypeScript/TSX files: exit 0, no warnings.
`git diff --check`: clean. Changed routes/components were source-reviewed; documentation links were checked. Tests cover failure/refusal paths, retained confirmation, request payloads,
lead prefill, unknown minutes and preview isolation; none proves authenticated
provider operation or production behavior.

Earlier failures were corrected: mid-edit draft syntax, two incomplete fixture
shapes, a test using unavailable Node global localStorage, a hook dependency
warning, and an error-copy assertion that incorrectly implied a failed read proved
records unchanged. Duplicate typechecks were stopped before final union proof.

## Shared changes and spec conflict

Kit-only shared extension: section headings/metadata/actions wrap within a phone
column. Its specimen and component inventory are updated. The two operation
components imported by Internal work use kit presentation; their read/authority
paths remain. Draft preview is shared within this lane’s two approval pages.

[The operator spec amendment](../product/specs/operator.md) says platform operators
never sell to, serve or convert clients. Existing leads → onboard, payment-link
controls, managed-site drafting/approval and delivery-minute records still exist
under admin authority. This lane preserves them because the assignment explicitly
requires existing behavior and authorization to remain. Their reconciliation
belongs to the product/backend authority stream; visual adoption does not qualify
those paths against ADR 0013. L8’s fixture-only conversion/on-behalf surfaces stay
unchanged. No privileged endpoint or owner-entry authority was added.

## Exact changed files

- `docs/design/component-system.md`
- `docs/design/ui-1.0-l12-admin.md`
- `src/__tests__/business-effort-ui.test.tsx`
- `src/__tests__/needs-you-operator-policy.test.tsx`
- `src/__tests__/operator-admin-forms-ui.test.tsx`
- `src/__tests__/operator-depth-preview.test.tsx`
- `src/__tests__/operator-depth-records-ui.test.tsx`
- `src/__tests__/operator-depth-review-ui.test.tsx`
- `src/app/admin/actions/PortfolioActionsClient.tsx`
- `src/app/admin/actions/PortfolioOpportunitiesClient.tsx`
- `src/app/admin/actions/error.tsx`
- `src/app/admin/actions/loading.tsx`
- `src/app/admin/actions/page.tsx`
- `src/app/admin/audit/AuditList.tsx`
- `src/app/admin/audit/SiteAuditsBoard.tsx`
- `src/app/admin/audit/error.tsx`
- `src/app/admin/audit/loading.tsx`
- `src/app/admin/audit/page.tsx`
- `src/app/admin/digests/MaintenanceDigests.tsx`
- `src/app/admin/digests/error.tsx`
- `src/app/admin/digests/loading.tsx`
- `src/app/admin/digests/page.tsx`
- `src/app/admin/drafts/DraftActions.tsx`
- `src/app/admin/drafts/DraftChangePreview.tsx`
- `src/app/admin/drafts/DraftsView.tsx`
- `src/app/admin/drafts/error.tsx`
- `src/app/admin/drafts/loading.tsx`
- `src/app/admin/drafts/page.tsx`
- `src/app/admin/leads/LeadRows.tsx`
- `src/app/admin/leads/LeadsView.tsx`
- `src/app/admin/leads/error.tsx`
- `src/app/admin/leads/loading.tsx`
- `src/app/admin/leads/page.tsx`
- `src/app/admin/needs-you/OperatorPolicyEditor.tsx`
- `src/app/admin/needs-you/PolicyView.tsx`
- `src/app/admin/needs-you/error.tsx`
- `src/app/admin/needs-you/loading.tsx`
- `src/app/admin/onboard/OnboardForm.tsx`
- `src/app/admin/onboard/error.tsx`
- `src/app/admin/onboard/loading.tsx`
- `src/app/admin/onboard/page.tsx`
- `src/app/admin/ops/OpsView.tsx`
- `src/app/admin/ops/RetryRevalidationButton.tsx`
- `src/app/admin/ops/error.tsx`
- `src/app/admin/ops/loading.tsx`
- `src/app/admin/ops/page.tsx`
- `src/app/admin/pay-links/PayLinksView.tsx`
- `src/app/admin/pay-links/error.tsx`
- `src/app/admin/pay-links/loading.tsx`
- `src/app/admin/pay-links/page.tsx`
- `src/app/admin/work/BusinessEffort.tsx`
- `src/app/admin/work/EffortEntries.tsx`
- `src/app/admin/work/EffortLogForm.tsx`
- `src/app/admin/work/WorkView.tsx`
- `src/app/admin/work/error.tsx`
- `src/app/admin/work/loading.tsx`
- `src/app/admin/work/page.tsx`
- `src/app/preview/strelva/kit/KitSpecimen.tsx`
- `src/app/preview/strelva/operator-depth/page.tsx`
- `src/components/ui/strelva/kit.module.css`
- `src/experience/operations/OperationalInbox.tsx`
- `src/experience/operations/ServiceRequestInbox.tsx`
- `src/experience/workspace/preview/OperatorDepthPreview.tsx`
- `src/experience/workspace/preview/operator-depth-fixture.ts`

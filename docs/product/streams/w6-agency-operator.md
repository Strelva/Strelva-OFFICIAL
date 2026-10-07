# Wave 6: agency-operator — finished (round 6)

Branch: `w6/agency-operator`. Worktree: `REB-w6-agency-operator`.
Comparison base: `7b7b4d3f`. Round 6 (October 7, 2026) resumed the saved
round-5 checkpoint `056206eb`, parked its unfinished scope, merged
`integrate/reborn-1.0` @ `0479cdab`, and reran every required check on the
merged tree. All evidence below is local. No production access, provider write,
client notification or new dependency occurred.

## Round 6: what changed

- **Parked unfinished round-5 scope.** The checkpoint carried three Version
  migrations (`163500_version_publication_receipts`,
  `163600_version_existing_runtimes`, `163800_version_offering_configuration`)
  and `src/platform/system-versions/offering-runtime.ts`. None had a caller,
  SQL proof, harness entry or handoff line; `163800` had no rollback; `163500`
  renamed the shared `create/save_make_real_activation` functions. They are
  preserved unchanged on `w6/agency-operator-round5-parked` and are not in this
  PR. The launch lines in the spec do not depend on them.
- **Kept the round-5 harness and fixture fixes** (owner-grant ordering,
  millisecond projection precision, supported unlink in exit evidence, native
  rollback/roll-forward, portability rollback) because the full harness now
  proves them.
- **Merged `integrate/reborn-1.0`.** Three conflicts, all unions: preview
  params (`sibling` + `outcomes`, `version` + `outcomes`) and both head-only
  count test blocks, which the merged `countResult` satisfies.
- **File inventory corrected** from 283 to 293 paths (sibling-changes migration,
  rollback, SQL/UI tests and six source files were missing).

## What moved

Agency: one scoped client read, named partial failures, Clients/Queue/Library/
Team, funded Build, private-data-safe Package, per-client bulk preparations,
owner-only sharing, Version creation/adaptation/binding/history. Improvements
appear in the normal System Possibilities panel and use the existing Needs you
Version-release decision. Native application Versions create real owned draft
work; release publishes that destination's runtime atomically with lineage.
SQL rejects unapproved, forged, changed-draft, stale and unsupported releases.
A destination record survives changes and rollback. Custom-repo website work
continues through operator-prepared website Possibilities; a snapshot never
claims it changed a running site.

Operator: one queue with assignments, lead clocks, source actions, owner asks,
write receipts and human effort. Missing, malformed, truncated or unavailable
sources make it incomplete. Missing/stale site health is unknown. Expanded site
checks are gated; flags off preserve the existing rebuild-only selection.
Business lead counts combine durable and legacy records without double counting.
Accepted and uncertain provider writes cannot replay as ordinary retries.

Money/data: business-record reads and the one owner-recipient rule preserve
legacy fallback with either release gate off. All client-record stores have
copy/read/repair paths; retries retain timestamps, survive renames, and cannot
clear a newer concurrent write. Billing groups sites once per business and keeps
existing terms. Exports include assets and all record categories, recover through
fenced workers, and reserve delivery before dispatch. Exit completion records
per-site handoff evidence without deleting accepted/unknown obligations.
Monthly outcome lines group linked sites, include one-store/Calendly bookings,
keep unprovable joins unknown, and share a durable business/month delivery
reservation across legacy and native reports. An unavailable grouping read with
the flag armed suppresses delivery.

The launch-line mappings and their tests are in
[agency-and-versions](../specs/agency-and-versions.md),
[operator](../specs/operator.md), and
[money-and-data](../specs/money-and-data.md).

## Verification

Round 6 results. Logs are in `.scratch/w6-round6/` (uncommitted).

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed before and after the integration merge. |
| `pnpm lint` (full aggregate) | Passed before and after the merge (exit 0, no findings). |
| `pnpm check:boundaries` | Passed on the stream before the merge: baseline unchanged, 204 workspace→lib imports in 93 files, 46 older imports. **Fails after the merge** on 8 imports in `src/experience/workspace/outcomes/*` (`@/lib/motion`, `@/lib/ai-visibility-scorecard`). Those files, the checker and the baseline are byte-identical to `integrate/reborn-1.0` @ `0479cdab`, so the integration tip fails identically. Owned by the workspace-1.0 merge, not this stream. |
| `pnpm test --maxWorkers=2 --testTimeout=30000` (merged) | Passed: **727 files passed / 1 skipped; 6,529 tests passed / 38 skipped** (728 files, 6,567 tests), 100.5 s. |
| `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql` | Passed: workspace, customer-mapping and inquiry clusters, including native publish/rollback/roll-forward, sibling changes, portability rollback, exit evidence and the Postgres-backed Version store contract (vitest 29 + 8 + 29 + 10 + 29 tests). Run before the merge; the merge changed no migration, SQL test or harness file (only five Playwright specs). |
| `pnpm check:custom-repos` (merged) | Passed: **196/196**. |
| `NODE_ENV=production pnpm build` (merged) | Passed: compiled, typechecked and completed static generation (exit 0). |

Retained round-6 failure: the first SQL attempt failed before any check ran.
Postgres 18 refused to start (`postmaster became multithreaded during startup`,
hint: set `LC_ALL`). This is a host locale problem; rerunning with `LC_ALL=C`
passed. Only this run's own stopped clusters were removed.

Round 5 history, retained below. Focused proof includes owner routing (5 files/86 tests), concurrent Redis repairs
(6/50), outcome caller/domain failures (6/54), native Version creation/runtime/
decisions (4/45), and the Version Possibilities bridge (6/72). Local Postgres
contract tests run in the SQL harness rather than claiming skipped unit cases
are database proof.

Rendered real components with fictional content at `localhost:3046`: Queue at
1280×800 and 390×844; loading/error/denied, source gaps, keyboard focus and 48px
actions; Library at 1280px and Version comparison/loading/error/read-only/empty
at 390px; export prepare/download and exit ready/completed/error/owner-only.
No observed horizontal overflow. Seven headless Playwright journeys additionally
prove Version comparison→prepare→the same Needs you Make real on desktop/mobile,
trying a native draft with an isolated synthetic record, and five mobile states.
The collaborative browser disconnected with an explicit unsupported-host error;
only then was the existing local Playwright fallback used. Fixtures send nothing.
These journeys do not prove authenticated production access or provider effects.

Retained failures: initial typecheck fixture errors, three escaped-apostrophe lint
errors and a Version unavailable-store status expectation (500→503) were fixed.
The default-worker full test was stopped at repeated 5-second import timeouts
under concurrent wave load. The first bounded run completed 715 passed files,
2 failed, 1 skipped; 6,440 passed tests, 2 failed, 38 skipped. Both failures were
corrected and passed focused reruns (strict-source fixture sampled before final
code; fixture omitted source kinds now correctly marked incomplete). SQL first
found owner-grant migration ordering, then a 5-second contract timeout, then a
microsecond-vs-millisecond fixture comparison; each was corrected. An accidentally
duplicated local SQL start was cancelled; it touched only throwaway clusters.
Subsequent SQL exposed native fixture expression/column mistakes, a missing
report-snapshot prerequisite in the harness, brittle System-count and direct
unlink fixtures, and a recovery row-variable/alias collision. Corrected
fixtures preserve exact record-set/isolation checks; the actual recovery
function was fixed. Targeted SQL passes for each. Disk exhaustion interrupted
one SQL and one test attempt; only this stream’s generated caches and stopped
clusters were cleared. After recovery, the full suite found missing readiness
sentinels for the two new tables; those were added, nine focused tests passed,
and the final full suite is green. No failure was treated as a pass.

First build compiled/typechecked but failed prerender under inherited nonstandard
NODE_ENV; explicit production mode passed. New boundary imports were removed
through existing entrypoints, without raising the baseline. Optional ontology
check fails on unchanged `src/lib/delivery-email.ts` (1011 counted lines >1000;
base has the same file). This stream does not own that pre-existing file.

## Flags — all additions default off

| Gate | Scope / prerequisites |
| --- | --- |
| `STRELVA_SYSTEMS_RELEASE` | Existing workspace release resolver, including per-business Systems/Needs you prerequisites for agency work. |
| `STRELVA_OPERATOR_QUEUE_RELEASE` | Queue, strict sources, expanded website/domain verification. |
| `STRELVA_WORKSPACE_RELEASE` + `STRELVA_BUSINESS_RECORD_READS` | Business facts and the shared owner-recipient rule. Either off preserves old reads. |
| `STRELVA_CLIENT_RECORDS_DUAL_WRITE` | Requires `DUAL_WRITE_PG` not disabled; copy/repair only. |
| `STRELVA_CLIENT_RECORDS_READ` | Comma-separated per-store read selection, only after that store's parity clock. |
| `STRELVA_BUSINESS_BILLING` | Billing home/metadata mirror; no price or charge change. |
| `STRELVA_GOOGLE_BINDINGS` | Approved Google operations and durable dispatch receipts. |
| `STRELVA_TENANT_RECEIPT_RETENTION` | Keep historical tenant receipts and expire draft grants during teardown. |
| `STRELVA_EXPORT_SCHEMA_3` | Requires workspace release; complete business archive and owner access. |
| `STRELVA_EXPORT_RECOVERY` | Requires workspace + schema 3; durable recovery cron. |
| `STRELVA_EXPORT_LINK_EMAIL` | Separate owner export-email gate. |
| `STRELVA_EXIT_HANDOFF` | Requires workspace release; recorded site handoff evidence. |
| `STRELVA_FINITE_JOBS_RELEASE`, `STRELVA_APPROVAL_STORE_RELEASE` | Existing workspace release resolver; additive persistent adapters. |
| `STRELVA_INQUIRY_RECORDS` | Existing inquiry rollout; durable notice presentation/delivery state. |
| `STRELVA_BUSINESS_OUTCOME_REPORTS` | Requires workspace release; grouped counts and durable business/month delivery reservation. |
| `STRELVA_UI_PREVIEW` | Development only; fictional previews are unavailable in production. |

Every new customer send also requires `EMAIL_SENDING_ENABLED`,
`CUSTOMER_EMAIL_ENABLED`, and every linked tenant's `reb:client-email` override.
No new email transport or owner invitation is introduced. Provider acceptance is
terminal; a failed receipt/read-back becomes attention, never an automatic replay.

## Migration and rollback inventory

All timestamps are inside the assigned 20261010160000–165959 range. Each uses
bounded locking and has the corresponding rollback below. Deployment must apply
by dependency, including owner grants after base Versions and native runtime
after authoring, management, applications and Needs you. The SQL harness proves
those dependencies. Rollbacks preserve business-owned records/receipts where
removal would destroy client history; turning off gates precedes rollback.

| Migration suffix | Purpose | Rollback file (in `supabase/migrations/`) |
| --- | --- | --- |
| `160000_agency_authoring` | Atomic Package/create/preparation commands | `rollback-20261010160000-agency-authoring.sql` |
| `161000_operator_google_attempts` | Google attempt receipts | `rollback-operator-google-attempts.sql` |
| `161100_operator_effort_context` | Human effort contexts | `rollback-operator-effort-context.sql` |
| `161200_operator_content_receipts` | Atomic content receipts | `rollback-operator-content-receipts.sql` |
| `161300_review_reply_reservations` | Review dispatch reservations | `rollback-w6-review-reply-reservations.sql` |
| `161400_operator_complete_sources` | Complete source reads | `rollback-w6-operator-complete-sources.sql` |
| `162000_complete_client_record_stores` | All remaining durable client stores/watermarks | `rollback-w6-complete-client-record-stores.sql` |
| `162100_tenant_receipt_retention` | Retained tenant history | `rollback-w6-tenant-receipt-retention.sql` |
| `162200_inquiry_delivery_records` | Durable inquiry delivery state | `rollback-w6-inquiry-delivery-records.sql` |
| `163000_agency_operator_overview` | Scoped batched agency read | `rollback-20261010163000-agency-operator-overview.sql` |
| `163100_version_management` | Owner draft/history commands | `rollback-20261010163100-version-management.sql` |
| `163200_version_owner_grants` | Owner-only data/lineage sharing | `rollback-20261010163200-version-owner-grants.sql` |
| `163300_version_native_applications` | Real draft/runtime with approved atomic release | `rollback-20261010163300-version-native-applications.sql` |
| `163400_version_sibling_changes` | Scoped sibling Version changes, private data masked | `rollback-20261010163400-version-sibling-changes.sql` |
| `164000_finite_job_adapters` | Persistent jobs/approval adapters | `rollback-w6-finite-job-adapters.sql` |
| `165000_tenant_business_context` | Confirmed public business facts | `rollback-tenant-business-context.sql` |
| `165500_business_portability` | Billing/outcomes/asset+exit projections; report receipts | `rollback-w6-business-portability.sql` |
| `165600_exit_handoff_evidence` | Per-site completion evidence | `rollback-w6-exit-handoff-evidence.sql` |
| `165700_export_recovery` | Fenced durable workers and send reservations | `rollback-w6-export-recovery.sql` |
| `165800_unbounded_export_archive` | Complete paged archives | `rollback-w6-unbounded-export-archive.sql` |
| `165900_export_build_access` | Fenced owner/export access | `rollback-w6-export-build-access.sql` |

New cron: `/api/cron/workspace-export-recovery`, every ten minutes in
`vercel.json`; `requireCronRequest`, recovery gate and heartbeat maximum age
30 minutes. Existing website-health/domain-verification crons expand only under
the operator gate. Existing lead reconciliation repairs durable client records.
Monthly report adds business outcomes only under its independent gate.

## Shared edits and integration

[Complete file inventory](./w6-agency-operator-files.md) lists every shared edit,
new file, migration, rollback and test against the fixed wave base. It is part of
this handoff. Primary conflicts to reconcile with owner-ask/catalog/booking:
`src/lib/workspace-ports.ts`, `src/server/workspace-ports.ts`,
`src/platform/needs-you/{server,systems-sources}.ts`,
`src/platform/release-flags/resolve.ts`, `src/experience/systems/SystemPage.tsx`,
`src/experience/workspace/preview/WorkspacePreview.tsx`, billing/monthly/Calendly
routes, `src/products/websites/{index,site-report}.ts`, database repositories,
media infrastructure/re-exports, `scripts/check-workspace-sql.sh`, `vercel.json`
and `docs/design/component-system.md`. Root owns owner-recipient, which all
expanded notice paths call; do not introduce a second recipient rule or sender.

## Remaining decisions and production proof

The new flat workspace plan is typed but deliberately unsellable: no amount or
Stripe price. Jacob must choose price/terms; every existing client's charge stays
unchanged. Twin Trees' owner must choose one business or two before conversion.
Packet finding 19 keeps tenant receipt history indefinitely and expires drafts;
no deletion policy is invented. Review-request sending on a client's behalf
remains separately authorized work. Proposed lead/owner-silence clocks remain
explicit policy assumptions, not measured customer tolerance.

Jacob supplied the observation that batch 0 is applied, 0.2.1 dual-writes leads,
and backfill is 43/43. This stream did not access production or verify it.
Still required: scrubbed-copy conversion/backfill/byte-parity; approved migration
batches; per-client conversion/provider marks; seven-day store parity before any
read flip; fourteen-day operator queue parity; Stripe test-mode metadata/payment
proof and separate production metadata approval; real owner email approval and
accepted/read-back provider receipts; complete export/exit on the Strelva-owned
test business; linked monthly outcome correctness; measured human minutes per
client/month. Local proof does not substitute for any of these clocks or effects.

## ADR 0012 conflict: where this stream assumes Strelva staff

Reported, not fixed. ADR 0012 makes Strelva's agency an ordinary agency on a
neutral platform. This stream was built before it and assumes the agency actor
is Strelva: a client admin membership from conversion, or a `super_admins`
operator. Every place below is NEW in this branch unless marked. The
neutral-access issues should target them: #245 (provider seat), #255 (one
acting-provider predicate on effects), #247 (separate operator from agency).

**Agency reach = Strelva's admin membership (#245).**
- `20261010160000_agency_authoring.sql:44-52`: entry via `workspace_providers`/delegation/assignment, then building requires owner/admin in the client via `system_actor_scope`.
- `20261010163100_version_management.sql:39-45, 69` and `20261010163300_version_native_applications.sql:25-28`: create/bind Versions require owner/admin in both businesses; `read_version_binding_choices` refuses non-members.
- `20261010163000_agency_operator_overview.sql:20-21`: decisions and receipts only for `work_ids is null` (admin-member) clients.
- `src/experience/workspace/agency/version-server.ts:29-30, 87, 119` and `authoring-server.ts:20, 28, 82, 94`: `canManage`/authoring require a direct owner/admin membership (`read_version_actor`).
- UI filters to `reach==="member"` owner/admin clients: `AgencyAuthoring.tsx:22`, `AgencyVersionCreate.tsx:28`; controls gated on `canManage`: `SystemVersionManagement.tsx:37, 62`, `SystemVersionImprovements.tsx:81, 143-154`. Copy: `AgencyAuthoring.tsx:28` "require admin access in that client's business".
- Export/exit treat any admin as `'operator'`: `20261010165500_business_portability.sql:58-67, 139, 186`, `165600_exit_handoff_evidence.sql:45`, `165700_export_recovery.sql:28` (via pre-existing `workspace_export_v3_role`), `src/platform/workspace-exports/v3.ts:106`, `src/app/api/workspace-export/v3/route.ts:18, 44`, `src/platform/workspace-exit/repository.ts:101-104`, `WorkspaceExit.tsx:113`. Monthly outcomes run as "the operator for an owner with no login".
- Pre-existing, now depended on: `system_actor_scope` (`20261004120000_systems.sql:354`), `business_record_assert_actor` (`20261002120000_business_record.sql:387`), `read_version_actor` (`20261007150000_system_versions.sql:445`), `reach:"member"` = conversion admin membership (`src/experience/workspace/agency-clients.ts:40-41`).

**Internal operator queue merged into the agency view (#247).**
- `src/experience/workspace/agency/operator-overview.ts:12-31, 49-51`: the `super_admins` operator Queue is merged into the agency Queue for `reach==="member"` clients; a non-operator agency gets nothing extra. Wired in `agency-server.ts:60-67` to `STRELVA_OPERATOR_QUEUE_RELEASE`.
- `AgencyViews.tsx:139` (operator `QUEUE_KIND_LABELS`), `AgencyHome.tsx:350` ("shared operator Queue" gaps), `agency-home.ts:140` (`operator: "Strelva's work"`).
- `20261010161400_operator_complete_sources.sql:6, 27-29`: client sources listed with `super_admins` as operators.
- `src/app/admin/queue/source-actions.ts:15-31, 86-100` and `actions.ts:44-45`, `QueueBoard.tsx:163, 323`, `QueueSourceActions.tsx:43`: a super admin accepts/declines client service requests where `provider.kind==="strelva"`, triages/quotes change requests and bulk-approves "Strelva drafts". This is the platform operator acting as the client's provider.
- `src/platform/operator-queue/rules.ts:38`: an uncertain client Google write moves to `"strelva"`.
- Copy: `SystemVersionImprovements.tsx:129` "receipt is in Strelva handled", `native-runtime.ts:21` and `version-server.ts:60` "operator-prepared", `systems-fixture.ts:110` fixture agency "Strelva Agency".

**Outside effects gated on the operator, not the acting agency (#255).**
- `20261010161000_operator_google_attempts.sql:5, 74`, `src/platform/operator-queue/store.ts:99-111`, `sources.ts:506-508`: client Google writes recorded in `operator_google_write_attempts`, readable only through `operator_queue_assert_operator` (`super_admins`).
- Global `STRELVA_OPERATOR_QUEUE_RELEASE` gates Google/content writes instead of an agency verification: `src/lib/gbp-management.ts:387, 506, 653`, `gbp-replies.ts:165`, `event-actions.ts:501`, `storage/content-store.ts:203`.

**New gaps no issue covers yet.**
- `20261010163300_version_native_applications.sql:152` with `src/platform/system-versions/preparation.ts:26`: a client's Live Version release can be approved by `route='strelva_reviews'`, `decided_by_kind='operator'`. Under ADR 0012 an operator power must not serve a client; closest is #247.
- `20261010161200_operator_content_receipts.sql:4, 26`: client content publishing is `write_operator_content` with provider `'strelva_content'` (adjacent to #255).
- `src/app/workspace/billing/page.tsx:32`: "Strelva needs to record the existing agreement" assumes Strelva is every client's payer of record (ADR 0012 rule 2, payer per business).

Not used by this branch: `resolveStrelvaAgencyWorkspaceId`, `designate_strelva_agency_workspace`, the `strelva` assignee kind.

## Exact next action

Coordinator: review and merge the PR into `integrate/reborn-1.0`, then fix the
8 inherited `outcomes/*` boundary imports in the integration branch (route
`@/lib/motion` and `@/lib/ai-visibility-scorecard` through `src/platform/infra`
or move them into the workspace layer). Add this stream's migration, flag, cron
and rollback steps to the release packet. Feed the ADR 0012 list above into
#245/#255/#247 and file the three uncovered gaps. Decide separately whether the
parked `w6/agency-operator-round5-parked` scope (Version publication receipts,
attaching existing runtimes, offering-configuration Versions) is still wanted
after the neutral-access work reshapes Version authority; it needs its own
callers, SQL tests and a `163800` rollback before it can ship. No production
action is authorized by this handoff.

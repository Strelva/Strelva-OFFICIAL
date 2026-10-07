# Wave 6: agency-operator — round 5

Branch: `w6/agency-operator`. Worktree: `REB-w6-agency-operator`.
Comparison base: `7b7b4d3f`. Resumed clean at `c3685728` after four interrupted
rounds. All evidence below is local. No production access, provider writes,
client notification, new dependency, push, PR or merge occurred.

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

Final source checks passed. The final whole-schema run is still completing;
its result is recorded below before this handoff is committed.

| Check | Local result |
| --- | --- |
| `pnpm typecheck` | Passed on frozen sources, including the final readiness map. |
| `pnpm lint` | Pending final aggregate; each owned source group passed focused lint. |
| `pnpm check:boundaries` | Passed: baseline unchanged, 204 workspace→lib imports in 93 files, 46 older imports. |
| `pnpm test --maxWorkers=2 --testTimeout=30000` | Passed: **725 passed files / 1 skipped; 6,481 passed tests / 38 skipped** (726 files, 6,519 tests). |
| `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql` | Pending final aggregate, including native publish/failure/rollback and outcome fixtures. |
| `pnpm check:custom-repos` | Passed: **196/196**. |
| `NODE_ENV=production pnpm build` | Passed: compiled, typechecked and completed static generation. |
| `git diff --check` | Passed before final documentation update; rerun before commit. |

Focused proof includes owner routing (5 files/86 tests), concurrent Redis repairs
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

## Exact next action

Integrate these commits locally with the other wave streams, reconcile the
listed shared paths, rerun the aggregate checks and inspect the combined owner
approval journeys. Add these migration/flag/cron/rollback steps to the release
packet in the integration stream. Prepare the scrubbed-copy results and exact
production batches for Jacob's approval. No production action is authorized by
this handoff. Larger capability/vault reviews remain wave-integration work; this
stream selected no new offer, price, provider authority or live promotion.

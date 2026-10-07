# Issue #505 — effort log coverage

Objective: make ADR 0009 human minutes per business per UTC month trustworthy.
Selected behavior: all customer businesses returned by the current business reader
are the scope for every window period. No historical lifecycle cohort is inferred.
A non-voided entry supplies log coverage, including explicit zero-minute manual
entries. Coverage does not certify that all work was logged. Missing periods are
unknown. Portfolio median/average require coverage for the full denominator.

Implementation: pure measure, /admin/work and managed-client effort display,
zero-minute validation/form, uncapped SQL readers. New migration
`20261009160000_business_effort_coverage.sql`; pinned migrations unchanged.
Rollback preserves history by refusing when any zero-minute entry exists.
Keep the forward schema in that case; do not delete history to enable rollback.

Observed before/after: [before-after.json](./before-after.json), generated from
base versus patched measure with 40, 20, 0 minutes: old median 30 over 2 active
businesses; new median and average 20 over all 3. Missing log after a first log:
old 0, new null / not_logged.

Local checks before rebasing onto newly integrated w6:
- Targeted Vitest: 4 files, 61 tests passed.
- Full Vitest (pnpm's `--` forwarded positional filters incorrectly): 687 files
  passed, 1 skipped; 6265 tests passed, 37 skipped.
- typecheck, lint, product boundaries, workspace SQL passed.
- Full-schema upgrade initially failed because the old test expected rejection
  of zero; changed its invalid case to negative minutes and added coverage test.
  Upgrade rehearsal now passed.
- Workspace SQL includes >500 businesses, >10000 entries, voided zeros,
  authority, retry/conflict, rollback/reapply and rollback refusal.
- Browser: real component with fictional data, 1280/390px inspection, 320px
  reflow (scroll width 320), width checks 360/768/1600; complete/incomplete,
  empty/unavailable/denied/disabled, zero entry enabled and release-off rejection
  retained input, keyboard Tab to next field showed a 2px focus outline.
  Loading during a real authenticated save was not exercised in the browser.

Compatibility: read w6 effort diff and attribution migration. Its queue field
and measureQueueEffort append are independent; this migration keeps
business_effort_row unchanged so queue context survives. merge-tree against
w6 and the newly updated origin integration branch both merged without conflict.
Shared files: measure.ts, types.ts, BusinessEffort.tsx, SQL check scripts and
operator/design docs. Repository.ts is untouched.

Remaining proof: deployment, production-scale RPC latency and completeness of
operator-entered logs. No production, external provider or billing actions.
Next: finish verification on the rebased integration tree, push and open the
#505 PR; orchestrator reviews/integrates and schedules any authorized rollout.

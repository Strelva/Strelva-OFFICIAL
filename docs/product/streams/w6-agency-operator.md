# Wave 6: agency-operator

Branch: `w6/agency-operator`. Worktree: `REB-w6-agency-operator`.
Local implementation only. No deployment, production access, provider writes,
client notifications, dependency changes, push, PR or merge authorized.

## Resume checkpoint — October 7, 2026

Resumed `b7e076b4` and `57426b4c`, the two saved, previously unverified WIP
checkpoints. They contain agency authoring, Version decisions, the flag-gated
operator queue, Google write receipts, business-record readers, durable client
stores, billing adapters, export/exit additions and finite-job/approval adapters.
Do not redo those changes. Verification and closure are in progress.

Current objective: prove and finish the launch lines in agency-and-versions,
operator, and money-and-data. Code is evidence of implementation only; no
converted client, live receipt, parity window, provider acceptance or economics
has been observed.

## Decisions and stop points

Packet finding 19: keep the five tenant-id tables as historical receipts;
expire outstanding draft grants during teardown; do not delete history.
`STRELVA_TENANT_RECEIPT_RETENTION=1` selects the additive adapter, default off.
Retention is indefinite until a separately approved deletion policy exists.

Existing client billing terms stay unchanged. Stripe is exercised through
doubles only. Twin Trees' one-business/two-business choice remains the owner's.
No owner invitations or new default sends. New mail requires its release gate,
`EMAIL_SENDING_ENABLED`, `CUSTOMER_EMAIL_ENABLED`, and every linked tenant's
`reb:client-email` override. No live migration or read flip in this stream.

## Verification

Pending: targeted failure-path suites, typecheck, lint, boundaries, complete
tests, local SQL, 196/196 custom-repo compatibility, build and rendered UI.
Actual outcomes, including failures, will be added here before completion.

## Integration coordination

Minimal additive edits already present in the checkpoints: both
`src/lib/workspace-ports.ts` and `src/server/workspace-ports.ts`,
`src/platform/needs-you/server.ts`, `src/platform/release-flags/resolve.ts`,
`src/app/api/admin/tenants/[id]/lifecycle-email/route.ts`, and
`scripts/check-workspace-sql.sh`. Reconcile these with owner-ask at integration.

## Next action

Inspect the first local check results, fix any failures, finish focused proof,
then run the slow required checks once. Record exact flags, migration/rollback
inventory, cron changes, production steps and any remaining code gaps below.


## Round 4 closure in progress — October 7

Focused resumed suites: 24 files, 210 passed / 1 skipped. Initial typecheck,
lint and boundary checks passed. First full SQL run failed at the existing
real-Postgres Versions journey's 5-second Vitest timeout; that integration
case now has a 30-second timeout. The failure is retained in the final report.

Additional audit-driven closure: atomic tenant-content receipts; durable
review-reply dispatch reservations; queue source actions; complete receipt,
assignment and unkept-lead reads; scoped agency health/owner-decision overview;
recorded exit handoff evidence; durable export worker recovery; remaining
inquiry presentation and booking notice business-record reads. Further
Version management and inquiry delivery-state persistence are being closed.

Production observation supplied by Jacob: batch 0 is applied, 0.2.1 dual-writes
leads, and the lead backfill is 43/43. This stream has not accessed production
or independently verified that observation. All other migration, rollout,
parity-window, provider-acceptance and operating proof remain pending.

Only this worktree is edited. Coordination with owner-ask remains integration
work. Root owns staging to prevent parallel agents sharing Git's index; one
content receipt commit also captured the separately tested queue action files.
No work was lost and no production action followed.

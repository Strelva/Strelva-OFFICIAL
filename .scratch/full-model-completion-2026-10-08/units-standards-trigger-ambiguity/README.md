# Units standards save failure: prepared ambiguity correction

Objective: unblock the real Auth Units case at the service's draft adoption
without weakening exact qualification, actor authority, CAS, standard locks,
owner decision history or withdrawal assertions.

Observed: fresh Auth failure 9 reports `WorkspaceStoreError: The Version could
not be saved` at Units spec line 164, service `adoptImprovement` -> store
`updateLineage` -> native `save_system_version`. Private browser log records the
fallback at line 319. Captured browser/app/stack logs contain no `42702` or
`ambiguous` diagnostic and no current `ENOSPC`. No private payload was copied.

Confirmed by coordinator-owned PostgreSQL log: at 2026-10-09 04:01:18.576 UTC,
`42702` / `column reference "path" is ambiguous`, context
`system_version_enforce_standards()` line 17 FOR over SELECT rows. Earlier
access-denial entries are expected negative checks, not this adoption failure.

Root cause: `system_version_enforce_standards` declares a local
`path` and, only after a locked baseline is adopted, executes an override query
with unqualified `length(path)`. The table also owns `path`, so PostgreSQL's
normal PL/pgSQL variable-conflict error policy can produce `42702` instead of
completing the deferred standards trigger. The generic store mapping discards
unclassified native details; the coordinator captured its exact underlying SQLSTATE and trigger context.

The migration is in proposed batch 22, marked full-model source convergence /
qualification pending / not production-authorized. It appears in neither the
launch deployed migration hash receipt nor the launch-completion applied list.
It is a new prepared migration, not one of the original 508 historical files.
The precise fix therefore updates this prepared migration and supplies the
current root batch-22 SHA patch separately, avoiding unrelated manifest edits.
Original historical migration bytes are untouched.

Prepared forward/inverse candidates compare the exact current function body
before replacement. The forward qualifies override columns and renames only the
foreach variable to `locked_path`. The trigger's comparison, deferred timing,
bundle projection and all denial conditions are identical. CREATE OR REPLACE
preserves function identity/owner/ACL; no table, fixture, grant or permission is
changed. The inverse is a bounded review aid, not an instruction to restore a
known failure. Historical migrations are untouched.

Evidence status: source preparation only; native candidate and original Auth
repro have not been executed in this lane. Coordinator owns the active native
stack and live source freeze. No correction is proven until native red/green.

The regression patch preserves the existing real Auth case/title and all
qualification/standard rejection/CAS/withdrawal assertions. It attaches only
sanitized SQLSTATE on an actual save error, returns the genuine error unchanged,
and reads the committed baseline/locks/fields override/decision history/release
count after adoption. It writes no raw native state or fake authority.

Current prepared migration SHA256: `519bcd8ce0182e8816322bbb4165a1bc038b3d07c9ea586783850aa226637d2f`. Prior hash: `4763d5f8c03aa989c977444161a40e06398982a4fa0dedfa43c5e1e28f648a6e`.

Exact next action: coordinator uses an owned disposable native
window to run the unchanged Units standards Auth case on current source (red),
apply forward.sql, rerun the same complete case (green), including standard
rejection and authority withdrawal. A different SQLSTATE/condition invalidates
this diagnosis. Verify exact function/catalog permissions remain unchanged;
update the prepared migration and apply the supplied exact batch-22 hash patch
only after that evidence and independent review. The full successor test is
stored as `.spec.ts.review` for inspection; apply its patch to the real test
path for execution, preserving its support imports and 34-case inventory. Keep private traces/logs/session credentials out of commits and reports.

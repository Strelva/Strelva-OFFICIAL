# Wave 6 release safety

Branch: `w6/release-safety`; rebased onto `integrate/reborn-1.0` at `864474fe`.
Scope: local release preparation only. No production/provider calls, pushes,
PRs, merges, deployment, or client notices are authorized or performed.

## Current objective and continuation

Resume checkpoint commits `2c70127b` and `731bbba1`; prove all packet batches
0–7 forward → rollback → forward, the July org layer, and retained pre-1.0
behavior. Finish dump/restore, silent rollout, and offline staging checks.

The local deliverables are implemented and pass `pnpm check:release-safety`:
3 test files / 34 tests, all eight batch reversals/reapplications, full reversal,
July org layer, populated private archives, and two dump/restore rehearsals.
`pnpm typecheck` and `pnpm check:boundaries` pass; `pnpm check:custom-repos`
passes 196/196. The [tool contract](../../../scripts/release-safety/README.md)
owns usage, failure handling, recovery order and scope.

Round 4: the full suite passes with two workers (687 files passed, one skipped;
6,242 tests passed, 37 skipped; 264.97s). Lint, boundaries and client-repo
compatibility (196/196) pass. Snapshot/release-tool focused tests pass 40/40,
including the integration fix's missing-table tests and a new unknown-204
active-count stop. Build, workspace SQL and restored-production rehearsals are
running; finish these before the final handoff. Earlier failures remain below.

Round 5 checkpoint: `864474fe` is an ancestor of HEAD. Round 4 build passed.
`pnpm check:workspace-sql` now exits 0, including real-Postgres Version,
Possibility, Make real, booking, customer-mapping and inquiry contracts. The
checkpoint's Version connection assignment was separated from its command by
a comment; repaired before this run. Authority race checks now use an explicit
transaction barrier and observe the competing lock wait before release.
`pnpm check:release-safety` also exits 0 (34 tests; eight batch cycles, full
reversal, July layer, private populated archives and both dump/restores).
Logs: `.scratch/release-safety/round5-workspace-sql.log` and
`.scratch/release-safety/round5-release-safety.log`. The restored-production
rehearsal is still pending; round 4 reached batch 1 forward then failed its
first rollback. No production operation was performed.

## Packet edits for the integration owner

**Batch 0 is done in production.** Round 4's supplied production record says
`20261005090000_tenant_leads` is applied, the lead backfill is 43/43, and 0.2.1
(PR #213) is live at `main` `2dd3453a`, deployment
`dpl_9ViM5iWeCepPiio8k3AZ5NFwKFPx`. This stream did not inspect production.
Start pending execution at batch 1 after a fresh authorized history snapshot;
do not push or reverse batch 0 as part of the pending release rehearsal.
The local manifest deliberately retains batch 0 for baseline/history checks.
Shared release-packet and launch-spec files remain untouched per the brief.

The final populated proof is
`.scratch/release-safety/round3-release-safety-final-2.log`. Its private cluster,
dumps and full row-count receipts are at
`/var/folders/0t/9xnfycn50vd2yv5gb7p4cdsh0000gn/T/strelva-release-safety-xbYIYa`.
Upgraded dump: 191 tables, 2,697,710 bytes, 1.099s dump / 4.739s restore.
Rolled-back dump: 204 tables (includes archives), 1,582,246 bytes,
0.359s dump / 0.945s restore. These small synthetic fixtures do not estimate
production recovery time.

Round 3 failures remain in the ignored local investigation directory. Fixed
and rerun: nonexistent fixture billing/lead columns; trigger functions
misclassified as callable RPCs; generated-column dependency on a dropped
function; missing constraint parenthesis; archive work after an early commit;
wrong history column (`flag` instead of `subject`); temporary function creation
in a read-only transaction; strict indexed-access errors in checkpoint scripts.
The original checkpoint commits are retained; verified follow-through starts
at `931dcdbb`.

## Authority and limits

These tools prepare recovery; they grant no production authority. Recovery
archives preserve removed records privately; schema rollback does not replay
them, reverse external effects, or reconcile Supabase migration history.
Hosted Postgres/Auth/storage/Redis recovery, deployed old-app compatibility,
live lock behavior, fresh target/environment facts, and separately approved
production execution remain unproven. Owner invites remain deferred.

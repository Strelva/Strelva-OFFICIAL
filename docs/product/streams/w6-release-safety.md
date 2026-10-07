# Wave 6 release safety

Branch: `w6/release-safety`; baseline `integrate/reborn-1.0` at `7b7b4d3f`.
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

Exact next action: finish aggregate validation and update the verification
section before the final handoff. The first aggregate run recorded two 5-second
test timeouts (`approve-route`, `model-call-sites`) and a workspace SQL race
assertion (`save_workspace_calendar_connection`). Separate reruns are in
progress/planned; these are not cleared by the focused release-safety pass.
Build and final lint remain running. No release packet edits have been made.

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

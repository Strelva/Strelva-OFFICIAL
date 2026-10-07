# Wave 6 release safety

Branch: `w6/release-safety`; baseline `integrate/reborn-1.0` at `7b7b4d3f`.
Scope: local release preparation only. No production/provider calls, pushes,
PRs, merges, deployment, or client notices are authorized or performed.

## Current objective and continuation

Resume checkpoint commits `2c70127b` and `731bbba1`; prove all packet batches
0–7 forward → rollback → forward, the July org layer, and retained pre-1.0
behavior. Finish dump/restore, silent rollout, and offline staging checks.

The checkpoints contain 51 rollback files, a revised July rollback, TypeScript
rehearsal/staging/preflight tools, and snapshot stop conditions. Round 3 now
passes `pnpm check:release-safety`: 3 test files / 33 tests; every batch 0–7
forward → rollback → forward; whole-release reversal; July reversal/reapply;
wrong-order, function-drift and premature July rollback refusals; held-lead
archive preservation and private archive access. Dump/restore matches all 204
table counts, 1,581,421 bytes, dump 0.309s, restore 0.444s (small synthetic
fixture, not production recovery time).

`pnpm typecheck`, `pnpm lint`, and `pnpm check:boundaries` pass. Exact next
action: strengthen populated recovery fixtures and retain a final proof receipt,
then run the remaining required aggregate checks once and finalize this handoff.

Evidence: `.scratch/release-safety/round3-release-safety-9.log`,
`round3-typecheck-final.log`, `round3-lint.log`, `round3-boundaries.log` (local,
untracked). The private cluster and restore receipt are at
`/var/folders/0t/9xnfycn50vd2yv5gb7p4cdsh0000gn/T/strelva-release-safety-dvPjqv`.
The release packet remains unchanged.

Round 3 failures preserved in `round3-release-safety*.log`: invalid fixture
billing/lead columns; trigger functions misclassified as callable RPCs;
generated-column dependency on a dropped function; a missing constraint
parenthesis; archive work after an early commit; an incorrect history column
(`flag` instead of `subject`); and temporary function creation in a read-only
transaction. Fixed and rerun. Initial typecheck failures in checkpoint scripts
are also retained, corrected under strict indexed access.

## Authority and limits

These tools prepare recovery; they grant no production authority. Recovery
archives preserve removed records privately; schema rollback does not replay
them, reverse external effects, or reconcile Supabase migration history.
Hosted Postgres/Auth/storage/Redis recovery, deployed old-app compatibility,
live lock behavior, fresh target/environment facts, and separately approved
production execution remain unproven. Owner invites remain deferred.

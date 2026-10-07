# Issue #500: disposable PostgreSQL cleanup

Objective: stop/remove only each SQL check's own temporary PostgreSQL cluster,
including failed initialization/startup/SQL and SIGINT/SIGTERM; supply a safe
locale internally. Branch: `a1/temp-cluster-cleanup`, base
`origin/integrate/reborn-1.0`. No production actions or dependency additions.

## Implementation and evidence

- Four shell checks use `scripts/temp-postgres.sh`; their SQL bodies remain
  unchanged. The helper installs traps before allocation, records the cluster
  path/postmaster PID, rereads the PID on exit to catch partial startup, stops
  the owned cluster, and removes its data/socket paths.
- Release safety uses `scripts/release-safety/temp-postgres.ts` for the same
  lifecycle; receipts persist under ignored `output/release-safety/`, while
  the database and dump files are removed. Private error logs remain separate.
- If both shutdown attempts fail with a live recorded PID, the runner fails
  and reports the retained path. SIGKILL cannot execute traps.
- Scripts set `LC_ALL=C`; callers need only the PostgreSQL binary path.
- Baseline reproduction: an injected `initdb` failure exited 42 and left
  `strelva-workspace-sql.*` behind. The reproduction cleaned its own sandbox.
- New Node regression suite: 15 passed, 0 failed, 0 skipped with PostgreSQL 18.
  Covers all four shell checks' initdb/startup/SQL failures, own PID shutdown,
  preservation of another directory, shell signals, and release-safety failure
  and signals. Tests also supply an invalid ambient locale.
- `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`,
  `pnpm check:boundaries`, shell syntax and `git diff --check`: passed.
- `pnpm exec vitest run src/__tests__/release-safety-tools.test.ts
  src/__tests__/release-restore.test.ts`: 22 passed.
- `pnpm check:release-safety`: 39 passed / 1 failed before the rehearsal, due
  to the existing missing sentinel for `20261011120000_business_policies.sql`.
  Direct `pnpm exec tsx scripts/check-release-safety.ts`: passed all batches,
  rollback guards, catalog/legacy checks and both dump/restore rehearsals.

## Remaining verification

Two runs of both workspace commands are in progress. Global `$TMPDIR` snapshots
include concurrent agents' directories and the rehearsal's intentional diagnostic
logs, so a second proof uses an exclusively owned `$TMPDIR` under `/tmp`. Each
command must exit 0 and leave zero new `strelva-*` entries or upgrade sockets.
Evidence logs/JSON are local and ignored in this directory.

Next: finish the isolated repeat-run proof, inspect final diff against the base,
commit/push, open and link a PR against `integrate/reborn-1.0` with `Closes #500`.
The release-readiness missing sentinel belongs to another stream; do not edit it
for this cleanup fix. Shared conflict surfaces: the top/startup lines of four
SQL shell scripts and the release-safety entry point/primitives.

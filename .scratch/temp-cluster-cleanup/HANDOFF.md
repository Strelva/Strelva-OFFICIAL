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
  preservation of another directory and a separate live postmaster, shell signals,
  and release-safety failure
  and signals. Tests also supply an invalid ambient locale.
- `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`,
  `pnpm check:boundaries`, shell syntax and `git diff --check`: passed.
- `pnpm exec vitest run src/__tests__/release-safety-tools.test.ts
  src/__tests__/release-restore.test.ts`: 22 passed.
- `pnpm check:release-safety`: 39 passed / 1 failed before the rehearsal, due
  to the existing missing sentinel for `20261011120000_business_policies.sql`.
  Direct `pnpm exec tsx scripts/check-release-safety.ts`: passed all batches,
  rollback guards, catalog/legacy checks and both dump/restore rehearsals.

## Repeat-run proof and handoff

Both workspace commands passed twice using the ordinary shared `$TMPDIR`, and
both passed twice again with an exclusively owned `$TMPDIR` under `/tmp`.
`LC_ALL` was unset and `LANG=invalid-locale` in both runs. The private proof
reported **zero new `strelva-*` directories after all four commands**; both owned
upgrade socket paths were verified absent. Global snapshots included concurrent
agents' directories; those were left untouched. Evidence: `isolated-results.json`,
`isolated-sockets.json`, `node-tests.log` and per-command logs here (ignored).

Issue #500 is done locally. No production verification or deployment is claimed.
The combined release-safety gate still fails on the existing missing migration
sentinel; its rehearsal passes directly. Forced stop failure was not injected;
SIGKILL cannot run traps.

Next: open the PR for `a1/temp-cluster-cleanup` against `integrate/reborn-1.0`, then
orchestrator review/integration. The missing readiness sentinel belongs to another
stream; do not edit it for this cleanup fix. Shared conflict surfaces: the
top/startup lines of four SQL shell scripts and the release-safety entry
point/primitives. SQL bodies and migrations were untouched.

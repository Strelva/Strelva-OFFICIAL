# Nested PostgreSQL checker cleanup — October 8, 2026

Prepared locally from release evidence `e9ac136f`; no production action, SQL
migration or existing checkout was changed.

## Current finding

Issue #500 is closed and PR #543 is merged. Its top-level workspace/upgrade
cleanup fixes are present and their existing 16 lifecycle/environment tests pass.
The normal upgrade run leaves no PostgreSQL directory. A normal full workspace
SQL run, however, invokes `check-agency-prospects-sql.sh` and leaves that nested
checker's stopped cluster behind: approximately 40 MB on this workstation.
Its trap explicitly preserved the cluster directory, relied on a flag set only
after startup, and did not assign nonzero signal exit codes.

The focused normal-run regression fails in under a second before the fix:
expected only the sibling sentinel, but found `strelva-agency-prospects.*` too.
This is a newly demonstrated nested gap, not a reversal of #500's earlier proof.

## Repair and proof

The nested checker now uses the existing `temp-postgres.sh` lifecycle. It records
the postmaster, stops only its owned server before removing owned directories,
handles partial startup/error/INT/TERM, normalizes macOS locale, and scrubs inherited
libpq settings. No shared helper, root checker, SQL fixture or migration changes.

- `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH node --test scripts/tests/temp-postgres.node-test.mjs scripts/tests/temp-postgres-env.node-test.mjs`
  passes 22 cases with no skips. New nested cases cover normal completion,
  initdb failure, partial startup, SQL failure, SIGINT and SIGTERM.
- The nested TERM case also starts a separate live sibling cluster: its process
  and sentinel survive while the terminated checker's postmaster and data disappear.
  Test-finally cleanup stops any test-owned failed-startup server before removing
  that sandbox, including while reproducing a failing regression.
- A full `pnpm check:workspace-sql` run in a unique local `TMPDIR` passes and leaves
  zero PostgreSQL directories; the unrelated sentinel remains. Node compile/tsx
  caches are distinguished from database clusters and were not called leaks.
- `pnpm check:workspace-upgrade` on the unchanged baseline passes and leaves zero
  PostgreSQL directories. `pnpm typecheck`, targeted ESLint, shell syntax and
  `git diff --check` pass.

Logs are local: `/tmp/issue500-nested-before.log`,
`/tmp/issue500-nested-after.log`, `/tmp/issue500-unrelated-live.log`,
`/tmp/issue500-fixed-normal-sql.log`, `/tmp/issue500-normal-upgrade.log` and
`/tmp/issue500-typecheck.log`. Transient clusters and tool caches are not committed.
SIGKILL and a shutdown that cannot stop its owned postmaster retain the shared
helper's explicit limitations; this patch does not claim cleanup for them.

## Adjacent tracker reconciliation

#505 is also closed; merged PR #514's current implementation includes logged
zeros in every-business portfolio denominators and preserves unknown periods.
The four business-effort test files pass all 61 cases on this release source.
No metric, pricing or economics policy change was needed.

## Continuation

Objective: remove the demonstrated recurring nested cluster accumulation without
touching another agent's process/data. Next: independent review and private
integration of this draft, then rerun the combined workspace SQL/lifecycle gates.
Hosted CI is not established by these local runs. No issue was reopened, closed
or commented on; no duplicate #505 patch was created. Canonical product/model
changes are unnecessary for this local checker repair; its nearest proof owner
is `testing-and-ci.md`.

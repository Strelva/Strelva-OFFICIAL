# O01 watchdog incident repair

Prepared in `foundation/program-20261009` after program-record commit
`645b94339`, based on implementation source `6ddc03f4d`.

A fresh heartbeat reporting `ok: false` previously produced no watchdog alert.
A continuing stale heartbeat changed its dedup key whenever `ageSeconds` changed.
The regression route tests reproduced four failures before the repair.

The watchdog now emits `cron_failed` for an unsuccessful run, including one
that has also become stale, or `cron_stale` for a stale successful/unknown run.
Each event uses the registered cron name as its stable identity, retaining the
six-hour repeat window. Measurements and a generated request id remain alert
evidence. A still-current fresh successful observation atomically clears both named incident markers,
so a later failure pages without waiting for the old window to expire. Unknown
observations cannot establish recovery. Authentication still precedes all reads
and writes; the watchdog records its own completion.

The existing monitoring module owns dedup and delivery. Its watchdog entry
reconciles failure, staleness and recovery against the current Redis heartbeat
in one atomic Lua command. Both old healthy and old failed snapshots are rejected
before they can erase or recreate a later incident marker. Existing `alertOnce`
callers and their Redis key bytes retain their behavior. Recovery is best effort
and sends no notification. No migration, dependency, environment, destination or cron schedule
changed. Existing private-workspace Sentry filters and secret scrubbing remain
in place. Only projected cron metadata reaches the watchdog alerts; raw heartbeat
extras are excluded.

## Local evidence

- Before: heartbeat route regression suite, four failures and two passes.
- After: heartbeat route, observability, Sentry scrubber and workspace presentation
  suites: 49 tests pass in four suites, one worker.
- `pnpm typecheck`: pass. Scoped ESLint: pass. `git diff --check`: pass.
- Frozen existing lock installed offline with scripts disabled; no dependency
  bytes changed. Shell Node26 was used, so this is not pinned Node22 qualification.
- Real monitoring/dedup code is exercised with an in-memory Redis adapter;
  Sentry delivery is mocked. No SQL, build, native stack or real alert was run. A separately owned private
  Unix-socket Redis fixture extracts the production Lua and covers both overlap
  orders, malformed/missing heartbeats, marker scope and expiry. Syntax checks
  pass; execution waits for the explicit resource allocation.

## Integration and remaining proof

O01 remains dependent on F01 convergence. Review rounds found both opposite snapshot races; their deterministic
regressions now pass. Round3 returned no new findings. Exact combined
source checks must finish before integration. A real delivered-alert test and
any production/environment changes remain separately gated by AGENTS.md.
The Redis NX window can suppress repeat alerts; it cannot prove provider delivery.
The prior fallback when Redis is absent or failing remains unchanged and cannot
guarantee dedup during an outage.

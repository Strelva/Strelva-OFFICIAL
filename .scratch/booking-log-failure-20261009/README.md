# Booking receipt failure cleanup correction

Complete descendant of 8584a856d9a47386ee8060825c1f3cdd3ee5e407; all prior composition and SQL preserved. Independent review and native PostgreSQL qualification remain required. No root checkout writes, runtime lease, PostgreSQL/network/provider calls, or dependency added.

## Observed HOLD

Independent actual harmless process witness: /private/tmp/strelva-booking-858-review-tgl0cztq/source/signal-log-failure-witness/receipt.json and run.log. Failed child_close_start log append returned before closing a tracked child: helper exit 1, ownedChildAliveAfterHelperExit true. Reviewer emergency closed only that recorded fictional child.

## Correction

Receipt append failures now set a sticky receipt_failed flag, emit the attempted structured receipt to stderr, and return normally so every owned resource cleanup still runs. Final qualification fails permanently if any receipt write failed. Cleanup fixture DELETE no longer redirects SQL output to the primary log before invoking SQL; captured output goes through the same fallback receipt writer. Bounded child wait/escalation and signal status retention remain unchanged. A terminal signal retains 130/143; lost log never grants PASS.

## Source proof

Actual directory replacement makes the owned log unwritable even under elevated test execution. New controls inject failure during cleanup termination query, owned child closure, and fixture deletion. Each requires helper exit 1, stderr fallback receipts, fake fixture absence, no PASS cleanup, and every recorded live harmless child gone before helper exit. Original nine transport and actual INT/TERM controls and 30 existing owned identity/atomic controls are retained.

Frozen predecessor actual new query control RED retained at /private/tmp/strelva-booking-transport-signal-unit-0miZVu; predecessor lacked fallback receipts and skipped fixture deletion. Original independent witness supplies actual child survival evidence. No predecessor source was edited.

All 589 predecessor migrations compared byte-for-byte unchanged; forward SHA256 6497dd7346ce3f9e9e77409b5fc933871ac931dc266e792dd4806ffcf0b07ce6 unchanged. Scoped lint, Bash syntax and diff checks passed. Native catalog/backend/functional/concurrency/Auth/typecheck/build/deployed proof remains outside these harmless Bash/Node fake-psql controls.

## Next action

Root independently reviews the complete successor, then runs the existing private-cluster qualification sequence under its exclusive lease. Root owns registry/count, integration, browser and native execution. Preserve prior 858 and 864 failure witnesses and all prior source receipts. Follow .scratch/booking-transport-signal-20261009/README.md for exact owned private-cluster prerequisites and proof boundaries; this successor adds no runtime authority.

Final combined source control execution: 42 PASS, zero failures/skips, session 45937. Includes all 39 predecessor controls plus the three actual unwritable-log boundary controls.

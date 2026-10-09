# Enterprise/IDX bounded tenant-cleanup handoff

Objective: correct the additional teardown reporting gap in the composed runtime
review. Source inspection: integration `10d43c70d21d3b8cb6d5a20bcf34ab88717de94b`.
Baseline alignment commit `4d880915` copies the coordinator's existing guarded
teardown runtime into this lane; do not cherry-pick that baseline commit.

Prepared change: database removal commits with an outstanding native cleanup
receipt; Redis/provider failures and explicit provider retention remain incomplete.
Retained cleanup receipts fence new tenant insertion/id changes under the original
advisory lock, including after cleanup completes. Completion alone cannot fence
another in-flight cleanup worker or old slug-scoped writer. Automatic identity
reallocation therefore remains closed until a generation-safe protocol is qualified;
no production policy or existing live slug is changed here. Exact receipt
recovery/retry remains available after the tenant disappears.
The API exposes pending cleanup as 202 with a false completion flag; the admin
editor retains that result and can retry. CLI preserves the receipt and exits 3.
Shared account grouping retains its canonical account lock and mirror hooks;
its identity is checkpointed before index removal and survives later unavailable
Redis retries. Domain claims and email-keyed invitations recheck ownership atomically.
No subscription/provider billing mutation. The dry-run preview now includes exact
native booking-grant/booking holds through a stable, lock-free reader, matching
the atomic guard's existing protected-record predicates without narrowing them.

Additive migration `20261022090100` follows the coordinator's guarded `22090000`.
No applied migration bytes changed. The guarded predecessor is kept, with direct
service execution revoked; the new wrapper retains its billing/export/workspace
guards. The inverse refuses whenever historical cleanup receipts exist.

Evidence: seven targeted files, 53 passing mock-based unit/route/source checks,
three actual-Lua qualification cases deliberately skipped without the explicit
resource flag. Scoped ESLint and diff whitespace checks pass. The mocks verify
application decisions and failure reporting; they do not prove SQL or Lua behavior.
Native SQL/fixture-persisted literal READ ONLY and explicitly gated isolated-Redis
tests are prepared. A temporary ENOSPC source-write failure was retained in the
coordinator handoff; no file was truncated, and writes resumed only after the
coordinator reclaimed its own ignored idle compiler output.
No native DB, Redis server, browser, build, typecheck, provider/external write,
production access or dependency install was performed in this bounded fix.

Exact next action: coordinator cherry-picks the standalone fix, composes its
preceding guarded migration, runs typecheck and `tests/tenant-cleanup-receipts-schema.sql`,
its persisted-fixture `tests/tenant-cleanup-blockers-readonly.sql`, then the
explicitly gated isolated Redis tests and pending/retry UI. Preserve failed
receipts. Existing provider/public/full-model gates remain unchanged. Canonical model,
state and goal remain coordinator-owned; this source is preparation, not deployed
or commercially qualified teardown. Receipt progress and slug reuse are the only
proposed capability delta; no broader lifecycle/policy choice is promoted.

# Booking settings inverse and cleanup guards — 2026-10-09

**Forward admission HOLD / successor prepared:** root native witness confirmed an inherited default EXECUTE grant could survive the prior forward COMMIT. See [creation authority guard](../booking-config-forward-guard-20261009/README.md). Frozen07497 remains unchanged; inverse/cleanup corrections are retained and native qualification remains pending.

Prepared successor to frozen 5227a455f0c9e09f9fa26175ff1e9437385d44e9. Root independently reviewed the narrow primary writer and found the original native-provenance/companion-overwrite defects closed in source. Native admission remained held for an unconditional inverse DROP and suppressed cleanup failure. Neither prior packet was imported alone. This successor changes no application code, forward migration bytes, historical migration, registry, timestamp allocation or budgets. Prospective forward stays 20261022182000; root owns migration 352 registration and actual native proof.

## Changes

The inverse pins exact forward prosrc SHA256 `438660a6cd739eb617287ea2ab2ecbddf54d93b687ce8afba043be485d388010`. It also requires exact signature/arguments/return type, PL/pgSQL security-definer metadata, volatility/parallel/cost/strictness/support/default/search-path properties, function owner equal to the booking_settings table owner, and exactly owner + service_role non-grantable EXECUTE grants from that owner. Missing/body drift raises booking_settings_atomic_rollback_source_drift; metadata/owner/ACL drift raises booking_settings_atomic_rollback_authority_drift. Only after these checks does the DO block drop the same-signature RPC. No mutable comment or saved snapshot can bless drift.

The native concurrency helper tracks real psql child PIDs, captures its inserted fixture's stable UUID, and retains append-only phase/exit/cleanup statuses in a private booking-settings-cleanup.log. Control queries have finite connect/statement/lock limits. Child closure has a five-second normal wait plus one-second TERM and one-second KILL deadlines; escalation always fails qualification. Successful writers must exit 0; intentional barrier termination retains its actual exit status. Cleanup records termination results, closes all owned clients even after a cleanup query/status append fails, verifies native sessions absent, deletes only the captured stable fixture/settings identity, and independently verifies no fixture remains. Any unconfirmed cleanup forces exit 1. Overall PASS cleanup is printed only after closure, session absence and fixture absence are confirmed.

The fake hung-child regression found an early EXIT trap issue: Bash discarded function-local app/status state during unwinding. The state now lives in the isolated subshell and survives until the trap completes. It does not alter parent shell state.

## Evidence

Actual frozen 5227 inverse/helper bytes with three new bounded tests produced 3 FAIL: missing inverse source pin; termination false accepted exit0; fixture deletion failure accepted exit0. Bytes were restored in finally; frozen checkout remained untouched. No fake hung process was run against the unbounded old helper.

Final `node --test scripts/tests/booking-settings-atomic-guard.node-test.mjs`: 9 PASS. These exercise source/body pin consistency and the actual shell helper against fake psql for success, false/error termination, failed deletion, remaining sessions, remaining fixture, writer exit7, and a child ignoring TERM. They verify retained private statuses, nonzero qualification for failure, bounded KILL escalation, and every logged closed child PID absent. Fake transport never invokes PostgreSQL and proves no SQL correctness or actual native cleanup.

Scoped ESLint, bash -n for both sourced helpers and git diff --check PASS. Forward1820 is byte-identical to frozen5227. No typecheck/build/native/DB/Redis daemon/browser/provider/mail/deployment or root writes were performed. Earlier fake early-trap failure evidence remains at `/private/tmp/strelva-booking-cleanup-unit-hk1sQq`; additional failed fake probes remain under the same owned temporary prefix. A test-authoring ReferenceError in the added writer-status assertion was corrected before final9PASS; its fake evidence remains at `/private/tmp/strelva-booking-cleanup-unit-l7hLGy`. These are fictional shell evidence, not native receipts.

## Root next action

Review the combined chain (69637 held + 5227 atomic + this guard successor), or a squash against base99c4. Do not import either held predecessor alone. Preserve source review receipt `/private/tmp/strelva-booking-atomic-review-x88cux9r/README.md`.

When the root-owned native window is available, apply forward1820, run existing tests/booking-settings-atomic-patch-schema.sql, then source scripts/sql/booking-settings-atomicity.sh and call run_booking_settings_atomicity with root-owned repo_root/cluster_root/psql_args. Require both controlled rowlock orders and final PASS cleanup/exit0/complete=1 statuses.

Source new scripts/sql/booking-settings-inverse-identity.sh and call run_booking_settings_inverse_identity. It prepares five transactional mutations (body, owner, ACL, metadata, missing function), runs the ACTUAL inverse file, requires exact refusal, and verifies the original whole pg_proc + definition fingerprint survives each rollback. It starts no daemon and accepts only a disposable /tmp or /private/tmp Unix socket. Drift probes never reach the inverse COMMIT; closing the failed ON_ERROR_STOP connection rolls their mutation back. Then independently exercise successful inverse/reapply and confirm all settings data and historical ACLs unchanged. Root alone freezes count/SHA/registry and strengthens native claims after those checks.

SQL parsing/catalog/ACL/inverse/concurrency/native cleanup are still unrun by lane. Source checks and fake transport results must not be promoted to actual native qualification. Root standalone workspace SQL on frozenf66c continues separately without lane runtime competition.

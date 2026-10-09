# Booking settings atomic successor — 2026-10-09

**Native admission HOLD / guarded successor prepared:** root source review confirmed narrow writer correction, then required guarded inverse identity and confirmed cleanup. See [guarded successor](../booking-config-guarded-inverse-20261009/README.md). Frozen5227 and its source/fake evidence remain intact; no native qualification is claimed.

## Status and ownership

Prepared successor to HELD 69637d518b091c5842594915bf998b8357222e30. Root review found both native-provenance false success and concurrent companion overwrite. Root did not import the held packet. This isolated checkout is based on that frozen commit so its durable-blob/legacy-cache fix is retained; integration requires both commits or a combined reviewed diff against 99c4f858edadfe28591d2da71eececd89ef7d3d3. Original frozen checkout and commits remain unchanged.

Root reserved valid prospective migration 352: `20261022182000_booking_settings_atomic_patch.sql`, after prospective operator groups 1800 and inquiry budget 1810. Earlier 1780 filename was an uncommitted invalid-time draft, never imported/applied/frozen, renamed before packet freeze. No historical migration bytes or inventory were changed here. Root owns registration, migration count/SHA, native execution, typecheck and canonical model/state.

## Observed defects and correction

Historical upsert_tenant_booking_settings preserves native numeric/hours/overrides when a dual_write caller targets a recorded_via=native row, yet returns updated and increments revision. Thus the held writer could acknowledge the owner's save while keeping old values. Its read-then-full-replacement helper also let simultaneous config and override saves on a previously mirrored row overwrite the companion edit.

The new additive service-role-only `write_tenant_booking_settings_fields` commits only the requested group through PostgreSQL INSERT ON CONFLICT DO UPDATE. Config updates exactly seven legacy-owned fields. Overrides update only bookable_overrides. Each conflict UPDATE evaluates current row revision under the row lock. Neither sends, reads or replaces a companion snapshot. Mode, max_per_day, identity, lifecycle/cancellation/payment policy columns and all other unselected columns remain unchanged. Provenance becomes native so these explicit primary saves are distinguished from bounded mirror writes. Existing mirrors and their SQL remain unchanged.

A fresh row uses normal native instant/null-cap policy. An override-first INSERT receives the actual DEFAULT_BOOKING_CONFIG field map as separate initial_config from the producer. Initial config is validated and ignored on conflict; it is never derived from a current row. Legacy request shapes, permissions and read-source qualification remain unchanged. Unknown scope or RPC errors propagate before any rollback/cache copy.

## Producer evidence

Strengthened unit tests model the historical native-provenance guard. Against actual held store.ts/tenant.ts bytes, 11 tests produced 4 FAIL / 7 PASS: native save kept slot length 60 rather than 45; simultaneous mirrored-row saves restored buffer15/length60; no narrow RPC was called; old writer required unavailable companion read. Source bytes were restored in finally after this read-only-IO unit comparison; held checkout remained untouched.

New producer suite: 11 PASS. Focused command:

`./node_modules/.bin/vitest run src/__tests__/booking-config-cutover.test.ts src/__tests__/booking-config-store.test.ts src/__tests__/booking-one-store.test.ts src/__tests__/booking-store-availability.test.ts --maxWorkers=2`

58 PASS / 1 existing skipped. Existing PSQL-gated native test remains skipped; no new skips. Scoped ESLint, bash -n of new helper and git diff --check pass. Fake RPCs exercise production call sites but do not prove PostgreSQL behavior.

## Native proof prepared, NOT RUN by lane

1. Apply the additive forward in root's disposable native cluster. No production migration authorized.
2. Run `tests/booking-settings-atomic-patch-schema.sql` with ON_ERROR_STOP. It reproduces historical native mirror false ACK against actual SQL, then invokes the new function as service_role and asserts real values, exact unselected-row-column preservation, foreign tenant unchanged, unknown scope, invalid data/policy-key injection, zero failed-write mutation, first-row defaults, explicit anon/authenticated execution denial, unchanged direct-table ACL. All rows rollback.
3. Source `scripts/sql/booking-settings-atomicity.sh` with root-owned repo_root, cluster_root and psql_args; call `run_booking_settings_atomicity`. It starts no daemon. It requires /tmp or /private/tmp Unix socket and existing prepared cluster. A uniquely named fictional tenant is guarded against prior existence and cleaned on exit. Two real service-role SQL connections contend on the actual settings row. An advisory barrier holds the first writer after its UPDATE; pg_stat_activity must observe the second waiting on Lock before release. Both config-first and overrides-first orders must preserve both saves, native request mode/cap/provenance and exactly two revision increments. Barrier termination is limited to this process's exact application names. Logs remain in root cluster_root. Cleanup failures must be checked by root.
4. Test inverse/reapply in disposable cluster: rollback drops only the new RPC, leaving all row data and historical functions/ACLs intact. Roll application consumers back before applying inverse. Reapply and repeat native proof. Root alone updates ordered registry, SHA and frozen count after review.

## Limits and next action

No DB/Redis daemon, native/build/typecheck/browser/provider/mail/deployment or root writes were performed by this lane. Actual SQL/parser/concurrency/ACL/inverse checks are pending root execution and review. Root must not infer native evidence from 58 unit passes. Config and override groups are two independent saves; same-group competing saves intentionally serialize as last writer, and the whole pair is not a transaction. Redis/client-record rollback copies remain best effort after native commit; reconcile before rollback source change. No live adoption or commercial proof.

Next: root independently reviews this successor, runs the exact native adversarial checks, and imports only if those prove the required behavior. Original 69637 remains held unless the combined successor is accepted.

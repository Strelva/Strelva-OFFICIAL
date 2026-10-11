# Booking config authoritative cutover — 2026-10-09

**Superseded / HOLD:** independent review found native-provenance false acknowledgement and concurrent full-companion replacement in 69637. Do not import this packet alone. See [atomic successor](../booking-config-atomic-20261009/README.md); native proof remains pending root execution. The frozen original commit preserves the original report below.

Objective: pair config/override reads with authoritative writes for the existing qualified booking_config client-record cutover and native booking-settings cutover. Isolated branch codex/booking-config-authority-20261009, base 99c4f858edadfe28591d2da71eececd89ef7d3d3. Root coordinator owns integration and native execution.

## Observed failure

Five new producer regressions failed against unchanged base: selected blob saves failed before PG on Redis outage; missing Redis selected development files; blob write failure still resolved success after Redis changed; native settings saves failed before PG on Redis outage; native write failure still resolved success. Exact unit command below. No production/provider IO was used.

## Correction

legacy-store.ts selects actual bookingReadSource first. Native PG commits strict settings writer before rollback copies. Otherwise clientRecordReadSource qualifies blob PG; writeClientRecord must return recorded/updated/unchanged before Redis copy. Failed/skipped writes throw generic error. Qualified reads no longer depend on Redis client presence. Selected native config/overrides read errors propagate rather than serving stale legacy data. Before cutover Redis/dev remains primary and failure propagates. Optional native mirror skips unavailable companion data rather than substituting empty overrides/default config.

tenant.ts adds strict native config and overrides writers. Real context read and upsertBookingSettings errors propagate. Config changes preserve native request mode, daily cap and date overrides; override changes preserve all current settings. Existing never-throw mirror helpers, other booking/slot paths, route auth, request shapes and flags remain unchanged.

Cache copies after durable commit are best effort. A rollback requires reconciling missing copies before switching source. No new migration, dependency, authority bypass or source-selection flag was introduced.

## Evidence

`./node_modules/.bin/vitest run src/__tests__/booking-config-cutover.test.ts src/__tests__/booking-config-store.test.ts src/__tests__/booking-one-store.test.ts src/__tests__/booking-store-availability.test.ts --maxWorkers=2`

55 PASS / 1 existing skipped. New suite 8 PASS covers durable readback on cache outage/absence, primary failure before cache change, native policy/companion preservation, native selected read failure, pre-cutover Redis failure, unqualified blob selection and unavailable optional-mirror companion. The existing skipped describe.runIf(PSQL) case is the throwaway-cluster native test, not a new skip. Scoped ESLint and git diff --check PASS.

No typecheck/build/browser/native/DB/Redis daemon/provider/mail/deployment runs. No root edits, schema writes or dependency installation. Fake RPC results exercise real production writer and reader functions; they do not prove deployed SQL or native behavior.

## Remaining limits and next action

Native writer reads companion settings then writes them; no expected-revision CAS was introduced. Concurrent native edits could overwrite a companion update. Blob config and overrides are separate records and saves are not an atomic pair. Existing native source qualification behavior and booking-context fallback policy are unchanged. Failed cache copies require reconciliation before rollback. Retry/durable repair and production adoption remain unproved.

Root: independently review and compose this four-file packet; run root-owned typecheck and actual native settings save/read regressions under qualified PG with Redis absent/failing, plus legacy offmode. Preserve frozen client contracts and provider holds. Root alone updates canonical model/state after proof.

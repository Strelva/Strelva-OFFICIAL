# C01 — additive v1 contracts

Base: `reborn-1.0` at `6ddc03f4d0f854997ff3f54481d5066625bf62fe`.

Existing behavior: the six-entry contract table checks pinned consumer call paths and sent fields; runtime tests execute leads, track and spam-pit fixtures. The shared conformance guard already executes HMAC and capability-manifest interoperability. Nine manifest consumers resolve two static, five Next beacon and two custom baseline profiles.

Gap: inquiry discovery, booking discovery/reservation/change/cancel/readback and collections list/detail have no table coverage or composed starter-to-route fixtures. Nested resources and PATCH/DELETE cannot be expressed by the current table. Existing strict booking response guards reject unknown fields; additive compatibility must be tested on supported envelopes/optional fields rather than asserted universally.

Owned files: `scripts/custom-repo-v1-contracts.ts`, scoped `src/__tests__/custom-repo-*.test.ts`, new scoped contract tests, and only minimal starter fixtures if needed. No route behavior, limiter, SQL harness, shared model or root program edits. C02 owns the subsequent local checkout runner and its scoped tests/docs.

Implementation: extend the existing table/path checker; retain its current consumer behavior. Compose the real route handlers with the real starter clients over a fake fetch transport and mocked application services. Reuse existing shape guards and conformance execution; no duplicate response snapshots. Record auth location, accepted statuses and replay behavior at the contract seam.

Failure tests: missing required request fields, malformed bodies, release unavailable, unknown/stopped tenant, management-token refusal, conflict/pending/readback outcomes, unauthorized collection preview, storage failures, and deliberate removal of a consumer-required response field. Distinguish route forwarding tests from persistence/provider idempotency proof. Existing booking-service tests remain the latter's local mocked evidence.

Acceptance: old manifest fixtures remain passing; new starter runtime round trips and failure cases pass; supported optional additions and receipt envelopes preserve old consumers; incompatible removal is caught. Manifest keeps SmokinBuddha `tenantConfirmed:false`. Zero missing-sibling proof requires nine clean exact-pin isolated checkouts in strict mode; default worktree skips do not qualify.

Deletion targets: no runtime machinery deleted; replace the six-only limitation and extend the existing checker. Do not create a second conformance framework.

Checks: targeted Vitest custom-repo contract/conformance/profile/release suites plus starter booking/inquiry and existing local booking-service replay suites; `pnpm typecheck`; `pnpm check:custom-repos`; strict pinned consumer check when all local objects are available; scoped lint and `git diff --check`. No full suite, build, Auth/Docker/native SQL or production checks without parent resource/authority grant.

Source limitations: pins are current manifest source assertions, not verified deployments. Source preparation is isolated, unmerged and undeployed. Proposed model/evidence deltas return to the coordinator; shared state remains untouched.

## Local evidence, October 9

- Table expanded from six entries to fourteen visitor/consumer contracts (eight additions). Nested resources and PATCH/DELETE reuse the existing path/field checker.
- `custom-repo-starter-v1-runtime.test.ts` composes the starter with actual v1 handlers and actual local booking service/recovery/projection code over fictional stores/providers. It covers all eight additions, opaque management auth, caller-key replay without a second calendar write, old request-without-key behavior, pending readback, supported additions, and a deliberately removed required receipt field.
- Composed collection preview initially failed: starter signed directly with the revalidation secret; platform requires the existing `preview-token-v1` derived key. Minimal starter-only correction now passes signed preview and missing/wrong/stale/cross-tenant rejection cases. Frozen headers/env names stay unchanged.
- Final targeted run: 9 test files, 133 tests passed. Suites: custom-repo v1, starter-v1-runtime, conformance, workspace inventory, release checks, starter booking-client/inquiry-form, public-booking and public-booking-recovery.
- `pnpm typecheck`, scoped ESLint and `git diff --check` passed. Initial fixture failures (request-body clone after consumption, incomplete fake-store save result and wrong inquiry status) were corrected; initial typecheck caught those fixture typing errors. The preview-signature failure was a real source mismatch, retained above.
- Default `pnpm check:custom-repos`: 20 passed, 9 missing-sibling skips. This alone is not nine-consumer compatibility proof.
- Read-only `runWorkspaceChecks` with manifest local paths resolved to existing Desktop/strelva clones: 196 passed, 0 failed, 0 missing-sibling skips. Consumer call sites read from each available manifest pin; required files/scripts read from current folders. This mixed source/structure run is not strict clean-pin release proof; no owner folder was changed.
- Profiles checked: two static sites (cocard-anderson, vermont-unlimited), five Next beacon sites (mclears, orange-crate, leslie-bookkeeping, rhm-innovations, smokin-buddha), GLDF/Rohlax custom baselines. SmokinBuddha remains `tenantConfirmed:false`; the mocked active-tenant fixture and pinned source check establish no real customer mapping.
- Not run: broad unit suite, Next build, browser/Auth stack, native SQL, hosted/provider checks, production reads or writes. No UI behavior changed.

Proposed coordinator evidence delta: mark C01 implementation/local contract behavior prepared, with the starter preview signing correction and strict unknown-field booking limit recorded. F01 remains a declared integration dependency; re-run contracts on its approved union. No deployed source or customer-mapping claim changes. Next action: C02 local-only runner using existing reviewed manifest pins; cross-private-repo CI access and new secrets remain gated.

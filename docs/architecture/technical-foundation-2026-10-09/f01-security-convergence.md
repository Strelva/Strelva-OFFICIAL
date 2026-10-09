# F01 — bounded security source convergence

Base: `6ddc03f4d0f854997ff3f54481d5066625bf62fe`, `reborn-1.0`.
Owned isolated branch: `foundation/security-convergence-20261009`.

## Existing behavior and gap

Canonical already carries #614 operator admission/audit and immutable audit SQL.
Its newer workspace, Google, presentation and private runtime changes survive.
Missing independent repairs: #615 request-scoped digests, #606 bounded Redis
outage intake, #607 explicit pre-read authority for both backfill stores, #614
actor forwarding in three content-write routes, #608 domain-health/certificate
observations and provider-health proof.

## Owned files and failure tests

Own three content-write calls and narrow actor assertions, digests export/test,
limiter fallback/proof, report-analytics-copy CLI/helper/tests, certificate/health
stores/crons and focused timeout/expiry/store failure tests. Provider queue
wiring in reserved `agency-server.ts` is an exact handoff only. No edits to the
architecture union, SQL harness, dependencies, canonical state, or root program.

Failure coverage: outage counts/window expiry/recovery; missing/malformed/mixed
remote targets perform no reads; malformed targets refused even with authority;
authorized content actor reaches writer; digests remains dynamic with admission
before reads; certificate timeout/sub-day expiry and required store failures;
provider publication/revocation projections under their actual source profile.

## Acceptance and deletion targets

Remove unlimited outage admission and unguarded backfill reads/cache fallback.
Reuse existing stores and version/hash/inventory/stage/current-tail guards.
Candidate provider-health forward/inverse SQL stays outside active migrations
pending approved applied-ledger version disposition. No retimestamp or duplicate
#614 migration. Exact manifest records hashes, predecessors and blockers.
Historical unit/SQL/build receipts are not combined proof.

## Exact checks

Focused Vitest for carried files and existing operator admission/audit/content
failure paths; `pnpm typecheck`; scoped ESLint; `pnpm check:custom-repos` for v1;
`git diff --check`; existing release inventory/staging checks. Full units/build,
Redis HTTP campaign and native fresh/upgrade/current-tail SQL require a parent
resource grant. No production reads/writes or provider calls.

## Exact source disposition

- #614 `083e992fd3a2bb8b9a3ff339d351d34c6206aa0f`: all incremental
  operator admission/audit modules and five SQL files are already identical in
  canonical. Keep canonical later registry/Google/presentation/agency/Make real
  changes. Do not replace SQL harness/readiness inventory with older source.
  The inherited actor-bound content repair is missing: prepared and locally
  tested in [the content patch](f01-content-authority.patch); it is inactive
  until its quarantined SQL is safely staged and qualified. Snapshot recovery
  preserves actor authority and reports unrecovered sections honestly.
- #615 `782d028e25f71e5db3df2aef2f069ccf01313e2a`: carry only `dynamic`
  export, retain canonical admission, add regression for admission-before-read.
  Copying its release-base page would remove canonical admission; that source
  difference was corrected before verification.
- #606 `31fd0bd3a2abb4e51a72b9a0bf74956f3c538123`: carry fallback and proof;
  preserve canonical duplicate-storage failure behavior. Only the limiter hunk
  changes v1. No package script/dependency changes.
- #607 `ead829e078179999a43e5c37de97c2cff4859f13`: carry exact CLI/helper/tests.
  Missing/remote/malformed targets refuse before reads or client construction.
- #608 `8d5e8eaadc329a82721abbd9de3138d05b34fac3`: carry TLS/domain-health
  store/observations and scoped provider projection/tests. Projection is unwired.
  Preserve current global health mail until SQL and the reserved agency-server
  wiring qualify together. [Wiring](f01-provider-wiring.patch) and
  [mail promotion](f01-provider-mail-promotion.patch) are unapplied patches.
  No preview UI is added; no rendered layout changes here.

The [blob comparison](f01-source-comparison.json) records exact source/canonical
objects, including the full #614 incremental file list beyond GitHub's cap.
The release-base packages, agent holds, payer proposals, native Ask setup,
Version-owner setup, public business verification, fact mappings, email owner
extraction and private future runtime are excluded. No blanket ancestry merge.

## Migration status

[The carry manifest](f01-migration-carry.json) pins original forward/inverse
bytes and source batch entries for content-publication authority and provider
health. Both remain outside active migration inventory. Historical deployed266
hashes/rename receipt are inspected reference only; no tracked approved applied
version array was available. No synthetic ledger is described as retained proof.
No timestamp was assigned, active batch changed, applied byte edited or stage
created. Existing version/hash/coverage inventory passes. Staging refusal tests
use their own synthetic filesystem/history and pass; current-tail/fresh/upgrade
SQL remain unrun. The original inverse bytes grant no recovery authority and
must never restore insecure privileges as an assumed security rollback.

## Local verification and retained failures

[Receipt hashes and exact private log paths](f01-local-proof.json).

- Baseline replay of original canonical digest/limiter/backfill sources against
  carried regressions: **50 fail, 11 pass**, 3 files. Sources restored in `finally`.
  Repaired replay: **61 pass**, same three files.
- Final independently landable source: **250 pass**, 16 focused files, one worker.
- Candidate content patch plus operator/domain proof: **88 pass**, 7 files;
  inventory/staging/digests/content candidate profile: **92 pass**, 7 files.
  Candidate tests prove mocked app contracts, not the missing SQL on canonical.
- `pnpm typecheck` passes. Initial carry failed six TLS fixture type errors:
  canonical URL validation requires `family: 4`; fixtures now satisfy that actual
  contract. Original failure log retained.
- Scoped ESLint, source/script product boundaries and `git diff --check` pass.
- `pnpm check:custom-repos`: **20 pass, 9 sibling skips** in bound worktree.
  Exact checked-out client qualification remains with C01; skips are not passes.
- All three health crons retain current mail behavior; focused preservation
  replay: **22 pass**, 3 files. Website-health fixture mocks the actual platform
  pinned-public-text path rather than the legacy re-export.
- Content/provider/mail patches pass `git apply --check` against this base.
- No full unit suite, build, native SQL, Auth/browser/provider or hosted test.
  Redis/loopback campaign is queued and requires explicit resource allocation.
  Local Node26 proof is not Node22 hosted/toolchain proof.

## Proposed evidence delta and exact next action

Coordinator can record that missing independent security repairs are prepared
on canonical with focused local proof; operator audit repair was already carried.
Do not promote content-authority SQL or provider routing, or infer hosted/live
proof. No PRODUCT_MODEL.md/shared strategic state was changed.

Next: allocate the queued one-worker Redis campaign; obtain the exact approved
retained applied-version ledger from its existing owner. Then review candidate
version/hash/order against current successor catalog, classify a new batch without
rewriting applied history, stage with existing tooling, retain the exact manifest
receipt and run current-tail/fresh/retained-row/negative-role proof in an allocated
slot. The architecture owner applies only the bounded provider wiring, preserving
its newer Version library. Promote mail suppression only with that qualified queue.
Combined broad units/build and authenticated provider journey remain acceptance.

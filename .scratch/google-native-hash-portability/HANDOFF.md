# Native Google hash portability and ownership correction

## Objective and evidence

Actual coordinator-owned f66 focused workspace SQL fails native read_grant at tests/native-google-lifecycle-schema.sql:286 with digest(bytea, unknown) missing. This lane inspects source only. The focused runner intentionally omits the historical initial schema's pgcrypto extension; native143 SECURITY DEFINER functions use search_path public, pg_temp and three unqualified digest calls. Extension installation in a production schema is unknown and uninspected. Installing an extension or widening the security-definer path is not the correction.

## Implemented source

Additive 20261021140100 successor changes exactly three calls to pg_catalog.sha256: two owner read_grant hashes and one inverse grant hash. Both full predecessor prosrc hashes and immutable authority/default/ACL properties are pinned before either replacement. Replacements must preserve complete catalog properties and match transformed prosrc hashes. Historical143 and every prior migration remain byte-for-byte unchanged. Inverse is forward-only because restoring the failing hashing dependency reintroduces the defect.

New transactionally rolled-back fixture poisons public.digest, checks independent fixed UTF-8/escape/null/microsecond vectors and denied owner/Auth roles, and seeds exact active plans before checking the inverse verifier. Correct grant reaches missing-receipt refusal after hash evaluation; changed grant reaches hash mismatch. Existing completed-undo fixture still owns positive receipt verification.

Qualification helper adds eight actual successor source/authority/default refusal variants to the original33. It reapplies hash successor after both original lifecycle reapplies. Combined inventory is348 (previous347 plus one) and release registry pins new forward/inverse bytes. Composed tail applies successor then hash fixture before native lifecycle fixture.

Four Google boundary diagnostics corrected: three API routes import the public Google server entry, which exports native command/OAuth handlers; native product composes the existing platform factory with its internal Google ports. Same owner rechecks, actor repositories, approvals, adapters and flags as former experience wrapper; no baseline waiver. Scoped service/HTTP mocks follow actual entry/composition.

## Source validation

- 42 tests across native-google-server, native-google-http and native-google-oauth passed.
- Eight Node source checks passed (four new hash checks, four existing full-model tail checks).
- Scoped TypeScript, modified TypeScript ESLint, shell syntax and git diff --check passed.
- Pure generator produces41 refusal variants; this is generation proof, not SQL execution.
- Actual boundary checker via node --import tsx has no Google diagnostics; ten diagnostics remain in other owners' files. pnpm launcher initially hit sandbox tsx IPC EPERM; same checker invoked directly succeeds in evaluating source and exits1 for those remaining diagnostics.
- Independent SQL review verified immutable guards, release hashes, inventory, reapply order and fixture plan gate; independent HTTP review found no authority or initialization cycle blocker.

## Holds and next action

No SQL, DB, Redis, Auth, browser, provider or production execution in this lane. Original f66 failure is retained as evidence, not relabeled as success. Fresh combined348 focused and full-schema qualification, all41 actual refusal tests, empty inverse/reapply/catalog-row equality and native lifecycle/provider proofs remain pending with coordinator-owned disposable runners. Production extension placement remains unknown. No deployment, external messages or dependencies.

Apply the incremental source packet to coordinator integration, resolve any shared registry/inventory overlap against current source, then run the declared actual SQL qualification at that exact resulting commit. Do not use the frozen347 label for348 execution. Retain any later failure independently. Larger state changes must be reconciled by coordinator, not written here as completion claims.

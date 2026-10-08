# Source revision qualification: preparatory #327 work

This is a local implementation checkpoint, not issue completion or release approval.
It is based on release/security-runtime-20261007 at e9ac136f9a0eecf362421c4046a333f0c20496fd
and requires the separate #326 declaration patch and migration 20261019110000.

## Boundary

Automated evidence is bound to the full source identity and immutable revisionId.
Shareable-definition lint and declaration matching are computed from the stored
revision; the rehearsal uses the existing native data-only application rules.
The actual immediately preceding revision is compared and changed paths retained.
No user request accepts evidence booleans. A trusted rehearsal witness must match
the exact revision, definition and binding requirements.

Human review stays pending. #323 has no recorded decision about who reviews or
what bar applies. There is no human-verdict writer, qualified state, new release
gate, UI, provider call, publication, deployment, or production migration here.
This also applies to Strelva's own agency.

The rehearsal contains no customer records and makes no outside calls. Its pass
proves only the supported data-only native contract, not real delivery or customer
record compatibility. Automated comparison is not human acceptance of changes.

## Checkpoint status

Core evaluator, native rehearsal adapter, append-only memory/Postgres adapters,
SQL ledger/quarantine and isolated SQL runner are prepared. The focused Vitest
qualification file passed 44 tests locally with one worker. The final combined
qualification/declaration/application-use run passed 95 tests across three files. Focused lint and product boundaries
passed. The complete ordered SQL workflow and qualification fixtures passed.
Full Next route type generation and TypeScript checking also passed locally.
Integration and human review policy remain blocked. Do not ship or apply this
checkpoint to a shared or production database.

## Local proof and integration limits

The standalone SQL command is `bash scripts/check-source-revision-qualifications.sh`.
It sources the unchanged complete agency-workflow job, applies the ordered
migration set to its own disposable cluster, and then checks qualification
storage. The run passed on 268 ordered migrations with PostgreSQL 17.11 using
owned loopback TCP (this host cannot create Unix sockets). It proved service-only
RPC/table permissions, direct creator membership, real provider-seat write
refusal while retaining existing read access, stale snapshot/prior-revision
rejection, append-only replay, whole-source cascade cleanup, and evidence
preservation through writer quarantine/reapply. The final read ran in an actual
READ ONLY transaction. No remote or production database was contacted.

The exact #326 migration predecessor used for this run has SHA-256
`7bc067853cfd285d9654e1bf8fe7b2a7e2293acec0ebd47fd60682eae0cff07c`.
The capability evidence shape is reused without granting executable-capability
qualification. The author named by `evaluatedBy` is not a human reviewer.

Every assessment appends a new attempt for the same immutable revision; exact
record-id replay is idempotent and replacement is rejected. A new revision has
no evidence until assessed independently. Qualification reads follow existing
source visibility, including currently valid provider seats. Assessment writes
are restricted to a verified direct source owner/admin and checked again in SQL.

The product-owned native adapter is exposed through `products/applications`.
No route, public UI, publication flow or release gate calls this preparatory
service yet. Manifest admission, existing runner integration and adoption of a
human-review policy are deliberately separate work. No entry is qualified.


The final source check still found release/security-runtime-20261007 at e9ac136f
and no decision comments on #323 or #327. No GitHub write or publication was made.
Focused command: `STRELVA_LOCAL_TEST_WORKERS=1 vitest run src/__tests__/system-revision-qualification.test.ts`.
Type command: `next typegen && tsc --noEmit --incremental false`, using a 4 GB heap.
Focused ESLint, product boundaries, shell syntax and `git diff --check` passed.


After #326 added emitted labels and select-option metadata to its shared-view
egress declaration, this checkpoint was resynchronized to the corrected
predecessor above. The 95-test combined run, full ordered native SQL job,
qualification/rollback/READ ONLY assertions, focused lint, boundaries, and full
Next type generation/TypeScript check all passed again on those exact bytes.
Earlier evidence on predecessor 4cb6bde7 is historical and is not used as proof
for this corrected predecessor.

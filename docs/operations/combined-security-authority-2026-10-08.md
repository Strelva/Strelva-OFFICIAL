# Combined security and operator authority preparation — 2026-10-08

This isolated branch composes reviewed source fixes on release `3f3eac4f`. It is not merged, deployed or a production migration receipt. The MCP body-cap fix remains separate on `4afd7c28` (PR609); existing public-abuse preparation remains PR606. Their proof is not transferred to this branch.

## Composition

| Component | Reviewed source | Contract |
| --- | --- | --- |
| Audit ACL role paths, #528 | e73de548 | Prepared append-only successor refuses transitive inherited/SET/ADMIN, owner, SUPER/CREATEROLE and browser mutation paths; existing lifecycle exceptions retained. |
| Portfolio result audit, #251 | 35bc7bde | Actual returned tenant scopes replace invalid `*`; result audit remains after scan effects. |
| Repair, restore and inquiry attribution, #251 | beeb4223 + d5934c35 | Current repair attempts, forced-review human preparer, native stable inquiry scope and newsletter audit; deleted/reused capture slug refuses disclosure. |
| Eleven support reader compositions, #251 | 42245f95 | Native audit/read transaction; pure reader bodies/signatures/ACLs unchanged; role graph and preserving inverse/reapply checks. |
| Seventeen support admission powers, #251 | 3f09f20a | Enumerated admin and tenant/dashboard bypasses persist admission before protected disclosure; ordinary qualified membership paths retain their original authority. |
| Readiness integration | 97e64d6e | New private audit table has a sentinel; denied table probes remain unknown, never a permission grant or false absence claim. |

Only three composition conflicts required resolution: `check-workspace-sql.sh` and `check-workspace-upgrade.sh` retain both migration38 and39 qualification sections; `batches.json` retains batch17 and18 and the reviewed #528 successor hash. No accepted SQL bytes were changed during composition. Earlier migrations remain unchanged except the explicitly prepared/unapplied #528 successor.

Proposed migration38 forward/inverse hashes: `5c0c7403b74e078427246bdbf051f593751b066c97858f56ea7c63f290e4c57a` / `b0d7219653cfe96ecef4b3e983fdfd36aa2a110d9f5f99d50d991c7923c3c23d`.
Proposed migration39 hashes: `7bcd8d8a942a591136584f20282ed327c68668b136035fcbb598b52dd96a69ff` / `882a103455fa27e8d5249f5416e324b8401cbbb20a24f38944299a1bf35aa6a6`.
The prepared audit successor hash remains `eae9458d3cac3bf13feb5a0dfbf195665c7f579f0db679068443db6a86e5a277`.

## Qualification and preserved failures

Independent component reviews qualify native database behavior and actual shared app helper branches, including stale operator revocation, insufficient membership permissions and missing audit-port failure. Details and exact finite entrypoint inventory remain in the component operating records in this directory.

The combined SQL inventory passed complete ordered fresh agency schema (278 migrations), historical checkpoint, retained-row upgrade, native real-default-service-role audit checks, and two current-tail recovery rounds. Those rounds preserve exact all-public data/catalog/ACL and quarantine the original187 introduced service RPCs; this is the original batch8 permission recovery scope, not a universal tail-API off switch. App admission changes no SQL bytes; the exact combined final recovery is rerun alongside unit/type/boundary qualification.

The first full combined unit run passed9091 tests and failed the new-table readiness sentinel requirement. The missing sentinel was added without granting access to private history; a new test proves permission denial remains unknown. Final qualification follows that correction. Earlier boundary, wildcard-FK, retained-slug, metadata-scanner, stale-role and insufficient-permission failures remain in component records. No failed run is presented as successful proof.

Final unit qualification at `381fb456`: 926 suites passed, three skipped; 9,093 tests passed, 51 skipped. Typecheck, product boundaries, targeted readiness lint and two exact current-tail recovery rounds passed. Independent integration review compared every changed source/SQL blob against the five accepted component pins with zero mismatches, reran 100 focused tests and combined native migration38/39 fixtures. These results qualify the code before this evidence-only update.

Production compilation remains unproven. The initial default build refused the shared dependency symlink. Materializing the existing frozen lockfile offline removed that setup problem, but Turbopack panicked and the webpack attempt exhausted its 4GB heap. During the baseline/higher-heap investigation the local disk reached zero free space; no diagnostic established a code cause. Those runs failed. Only task-created dependency trees, build caches and the temporary unchanged-release worktree were removed; source, proof logs and existing worktrees were preserved. No dependency declaration or lockfile changed. Free sufficient disk/memory and rerun the normal build before any release promotion.

## Rollout boundary and next action

Review this exact source and qualify the target role graph, applied migration bytes and operational acceptance before production. Migration38/39 must precede their runtime callers. Inverses quarantine entrypoints while preserving accepted data/audit; missing or disabled audit infrastructure refuses access. The #528 prepared successor must still be unapplied on the target; an already-applied target requires a new forward migration. No role changes, provider actions, billing, DNS, live data operations or deployment were performed.

Admission and downstream raw reads are separate transactions; successful admission can remain after a failed reader. Ordinary authority/scope resolution is not universal internal-query auditing. Some legacy admission errors produce a generic framework500; typed envelopes remain where already owned. Global access records contain actor UUID, static power/reader name and time, not customer payload or requested query filters. Retention/disclosure policy, typed system read provenance, provider-neutrality acceptance, hosted security/load/native-HTTPS proof and full issue closure remain separate gates.

Next: review the consolidated release draft and separate MCP/public-abuse drafts, then obtain the exact authority needed for target qualification and promotion. Do not infer that closed superseded source proposals mean deployed fixes or completed GitHub issue acceptance.

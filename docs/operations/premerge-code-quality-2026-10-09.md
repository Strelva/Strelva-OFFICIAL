# Premerge code-quality implementation — October 9, 2026

This isolated candidate implements the deletion and architecture findings from the REB working-tree audit. The source change touches 119 paths, adds 723 lines and removes 956 lines, for 233 fewer lines overall. It is based on the newer consolidated `reborn-1.0` source at `38489bc5a0b807c98c3f942ce574efbf78686457`; it does not replay or overwrite the older `reborn-1.0-model` working tree. Other agents continue to own the pending source and prepared private packets.

Branch: `codex/premerge-quality-20261009`. Worktree: `/private/tmp/strelva-premerge-quality-20261009`. Runtime source commit: `93a180f36e7cb6ba28382126fed508a275da82a6`. Qualified source with two test-only corrections: `fafd4cfcd362e34446e90e30b22bed2aa1ab6373`.

## Implemented

- Deleted the unused 506-line `ContentBrowser` renderer. Preserved its nine-line section-summary contract in browser-safe shared infrastructure and updated all four consumers. Removed unused Clerk identity helpers, invite consumption, the synchronous windowed rate-limit helper and obsolete pricing module. Replaced the obsolete pricing-only portfolio assertion with real standard/custom MRR behavior, including archived and unconfigured exclusions.
- Moved twelve live composition modules from platform into `src/server`: Make real, Needs you, operator queue and compatibility booking orchestration. Product internals now cross through owned public entry points. The checker stays strict: 55 product/domain violations and 42 unique older exceptions become zero. The existing 201 legacy workspace-to-lib edges remain, with exact ownership-key transfers for moved files and no new allowed targets.
- Split browser delivery status/contracts from Node crypto, Redis and database implementation. Kept server re-exports for compatibility. Browser regression checks follow emitted runtime imports, distinguish erased types and server-action transports, and prove the old unsafe imports are detected.
- Kept publishing projections in the server entry; its actual client preview and the four changed product client barrels have transitive browser-dependency checks.
- Typed all twelve Systems RPC names and arguments from generated database contracts. Two nullable SQL argument exceptions are named explicitly. Compile-time refusal cases cover unknown functions, omitted actors, wrong UUID types and arguments for the wrong operation. Runtime authorization, argument normalization and response validation remain intact.
- Corrected the authenticated agency-selection expectation to require an explicit agency selection before Save. The real Auth case is retained, not replaced with a dev bypass.
- Kept booking callbacks registered at the app edge through a lightweight runtime-ports module. Implementations load only when called; unavailable calendar reads still fall back to an unchecked request, and notification failures leave durable requests for cron recovery.

## Verification

Final full typecheck, lint, boundary and ontology gates pass. The complete coverage run passes 1,118 suites and 10,880 tests, with four suites / 50 tests explicitly skipped. Coverage: statements 69.59%, branches 62.54%, functions 65.07%, lines 74.04%; every unchanged repository threshold passes. Custom-repo contract/structural checks pass 90/94, with four absent siblings skipped. Secret scanning across all eleven implementation commits passes. The production webpack build passes in 123.63 seconds with an explicit 8 GiB JavaScript heap and cache disabled. This is a local integration receipt, not production release qualification.

Local runtime: Node 24.18.0, Next 16.3.8, TypeScript 5.9.3, Vitest 4.1.11, ESLint 9.39.4 and Playwright 1.59.1. Used existing matching-lock dependencies through direct local CLIs; added no dependency. Providers and telemetry credentials are empty in the proof subprocesses. Vite and Next outputs belong to this isolated candidate. Hosted CI uses a different runtime profile and remains separate evidence.

Editor browser proof: five existing tests passed again on qualified source `fafd4cfcd` in 46.8 seconds with one worker, zero retries and retained traces. Observed desktop draft history restoration, structured text/image controls, mobile draft editing and desktop/mobile permission failures. All five final ZIP trace CRC checks pass. The source manifest is unchanged after every gate, including the final browser run. Screenshots were read. The local fixture has no real Auth, provider or publish operation; its preview iframe and synthetic image are not a live website rendering proof. Croki preview initially operated, then reported its automation host unavailable; the declared Playwright suite used installed Chrome after the bundled Chromium executable was absent.

## Retained failures and corrections

The combined boundary check first rejected the section summary inside a product module. Moved the unchanged contract into shared infrastructure; checker rules were not weakened. Independent review found a publishing client value re-export reaching Node crypto; moved it into the server entry and added a regression.

The first broad coverage run exposed newly eager booking imports during Vitest bootstrap. They cached real Auth, database, Redis and record transport before test mocks. That failing run was stopped deliberately and its log retained. Lightweight callback registration corrected the cause without patching assertions: all five previously failing suites plus registration and calendar-health checks passed 165 tests. The final broad run is distinct.

A completed broad run then passed 10,876 tests but exposed two stale connected-site mock exports and the preexisting 354/355 physical migration mismatch. The mock now forwards the existing store through its new public entry, without changing assertions. Historical ledger admission remains exactly 354. Separate coverage checks exactly the named 355th extension, its forward/inverse hashes and its held proposed status, and explicitly refuses to admit 355 into the historical ledger. No SQL, native proof helpers, migration manifest or release holds were altered. Focused checks passed; the final coverage run follows these test-only corrections.

The first webpack build exhausted the default approximately 4 GiB JavaScript heap. Its failure log is retained. The successful repeat runs the same pinned source, with cache disabled and an explicit 8 GiB heap on this 36 GiB machine; heavy jobs are serialized. This local resource profile is not hosted CI qualification.

An initial proof-wrapper PATH parsing error and a missing bundled browser were retained as tooling failures. Corrected the wrapper and used the installed browser channel. The initial RPC full typecheck caught two implicitly typed arguments in the disposable SQL test fake; those are now explicit, with no authority or SQL behavior change.

## Open release work

This cleanup does not qualify production rollout. Native SQL, Redis transport, disposable Supabase sign-in, hosted provider delivery and all nine pinned client consumers still need their owned release proofs. Four absent client sibling repositories remain explicit skips. The corrected real agency Auth browser case has been discovered but not executed in a disposable Auth stack here.

The privileged managed-rewards migration's target-role capability, held private runtime packets, source-bound release evidence, runtime cycle cleanup and the remaining legacy bridge retirement retain their existing owners. Frozen Redis names, HMAC headers and the live v1 API are preserved. No main merge, production deployment, migration application or provider write was performed.

## Integration into Reborn

Jacob subsequently authorized merging the cleanup into `reborn-1.0`. Its checkout had an unfinished `origin/main` merge with resolved conflicts. Checked the four staged tenant-lead files, passed 40 focused tests, then completed that existing merge at `47065b3fba65485fe1f0641c40de3b3ee9060aa9`. Merged the complete quality branch without conflicts at `6edd7389ce35fbb0c78a94776c3c8e2504cdc04d`. The staged tenant-lead files are preserved byte-for-byte; those four files are the only differences from the earlier qualified candidate.

The merged source passes full nonincremental typecheck, boundary checks and 63 focused tests across eight suites. The two changed TypeScript files pass ESLint. Earlier full coverage, build and browser receipts remain bound to the earlier qualified source; they were not relabeled as new merged-source runs. The application implementation, dependency lock, build configuration and browser fixtures are unchanged from that candidate. The original dirty REB checkout is untouched; later concurrent edits are outside these receipts.

The next action is the source-bound release qualification before `main`. The earlier 4,849-file qualification manifest has digest `3ed7171bd3f45349433ef2a6341d5908803dffff676c7f753883fd0460f37b2c`. Original proof logs remain under `.scratch/premerge-quality-proof` in the isolated worktree; merged-source logs are under `.scratch/premerge-quality-integration-20261009` in the Reborn checkout, with preservation receipts copied to workspace `.scratch/premerge-code-quality-2026-10-09/merge-reborn`. Larger architecture opportunities remain in the original audit and the existing technical-foundation program, not new active product commitments.

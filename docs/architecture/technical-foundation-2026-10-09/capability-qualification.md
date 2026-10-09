# E08 / E03 capability qualification lane

Base: canonical `reborn-1.0`, exact `6ddc03f4d0f854997ff3f54481d5066625bf62fe`.
The earlier `a130` plan is source history. Main/root plans and canonical strategic
state are read-only. This is prepared implementation, with no release authority.

## Release convergence disposition

Jacob's release directive narrows this lane to the completed validator repair at
`080ab594a18bb18ec0f7db6fc85f73b8eda39189`, on top of E08/E03 source
`608ae57cf4daf9f1384cc397bd7a6c92fa738f85`. These exact commits are available for
parent-owned candidate integration; this branch grants no canonical promotion.

Explicit post-1.0 deferrals: Workspace/Ask/MCP/operator consumer adoption and its
optional interfaces/UI; owner prerequisite readers and stronger qualification
receipts; the repository-wide inline-flag ratchet; E04 descriptor/schema work and
outside-write wiring, which also still needs A07 authority. The frozen consumer
patch remains unapplied archival preparation. No demonstrated release dependency
requires its expansion. Reopen only after integration and exact candidate CI are
green and root explicitly assigns the scope.

The 74 focused tests, typecheck and scoped lint qualified the repair locally
before the resource holds. They do not satisfy exact frozen candidate CI, fresh
and upgrade SQL, production migration-ledger reconciliation, preview/nine-client
proof or the #616 release receipt. Root owns those release outcomes. No competing
typecheck/broad/native job is active or authorized in this lane.

## Existing behavior and gap

`src/capability-registry.ts` already adapts six distinct owners and lists each
capability once. Operations have exact-version local qualification witnesses in
`src/server/capabilities.ts`; other declarations have no equivalent qualification
receipt. Scoped release flags already have one layering resolver and store.
Inventory entries omit ownership/contract/evidence references. A description,
installability label, qualified label, or env flag alone cannot prove readiness.

## Intended outcome and ownership

Extend the existing adapters with owner and contract references, existing receipt
references and explicit evidence modes. Produce a serializable status view from
those adapters. Preserve descriptive/commercial, installable and executable roles.
One server-only availability module combines qualification, existing scoped flag
resolution and owner prerequisites. It reports available/unavailable/unknown with
stable reasons, never grants. Missing evidence or prerequisite reads stay unknown;
known release/policy/prerequisite refusal is unavailable.

Own `src/capability-registry.ts`, new app-edge availability module, focused registry
and availability tests, and scoped capability documentation. No changes to owner
catalogs, offering emission tests, architecture union UI/read files, SQL fixtures,
shared strategic state, production flags, dependencies or v1 contracts. Consumer
adapter proposals are recorded here, not applied to reserved files.

## Failure tests and acceptance

- Every owner declaration appears exactly once; contract and evidence references
  resolve and operation evidence is bound to its exact capability/version.
- Source/test/fixture evidence cannot become Auth/native/provider/production proof
  through a status/environment label. No runtime claims for descriptive entries.
- Listing/status projection never calls effects or changes registry admission.
- Scoped kill switch, workspace off/operator/tester rows, missing/mismatched scope,
  failed reads, missing prerequisites and negative prerequisites fail closed.
- Workspace/Ask/MCP/operator receive the same serializable reason for identical
  capability/scope inputs. No client component imports the server registry.

## Deletion targets and exact checks

Keep all six owning catalogs. Delete no owner declarations. The later consumer
adoption removes duplicated availability reasoning only, retaining authoritative
command/Auth/SQL checks. Run focused Vitest registry/availability/release-flag and
executable conformance suites with one worker, scoped ESLint, `pnpm typecheck`,
and `git diff --check`. No full suite/build/native SQL/Auth/browser process without
parent resource grant. This lane changes no rendered UI.

## E04 stop point

After E08/E03, inspect existing Ask-to-tenant adapters and MCP schemas and prepare
an owner-sized descriptor/schema conformance plan. Do not change outside-write
wiring until A07 current owning-writer prerequisites are qualified. Consumer/UI
adoption remains with the architecture union after its freeze.

## Local evidence and continuation

Final focused run: 71 passing tests, zero skipped, four files:
`capability-registry`, `capability-availability`, `capability-runner` and
`release-flags`. Command: `STRELVA_LOCAL_TEST_WORKERS=1 pnpm exec vitest run
src/__tests__/capability-registry.test.ts
src/__tests__/capability-availability.test.ts
src/__tests__/capability-runner.test.ts src/__tests__/release-flags.test.ts`.
`pnpm typecheck`, scoped ESLint on the five source/test files and
`git diff --check` pass locally. Frozen install used existing lockfile dependencies;
package/lock bytes unchanged. No full unit suite, build, native SQL, browser/Auth,
provider or hosted qualification ran.

Retained failures: first typecheck rejected test-reference nullable paths; the
second rejected a test fixture's inferred optional flag property. Both were fixed
in tests. A later focused run reported 70 pass / 1 fail because its subset test
incorrectly expected global declaration order instead of requested-key order;
comparison now checks each key's actual shared projection. Implementation ordering
remains unchanged. These failures provide no production finding.

Source disposition: extend canonical owner adapters in place; no prepared-source
carry, duplicate registry, catalog flattening, catalog/SQL/UI rewrite or strategic
state edit. Existing open architecture/security/candidate PRs remain with owners.

The common availability contract is implemented and locally qualified. E03's real
consumer agreement and repository-wide inline-flag ratchet remain acceptance gaps,
explicitly held by the ownership update. See
[consumer proposals](./capability-consumer-adapters.md) and
[E04 plan](./tool-descriptor-conformance.md). E04 outside-write wiring awaits A07's
current owning-writer application/SQL receipt and parent overlap/resource release.

Proposed canonical evidence delta (not applied): model revision 56 may record
owner-bound source/local-test inventory and available/unavailable/unknown
projection conformance at this branch's exact source. Stronger native/Auth/
provider/production/customer/economics claims stay unknown; real consumer adoption
is pending. Parent alone updates the canonical model and dependent vault/review
state. Factory implication: qualification labels can no longer silently turn
source/fixture references into stronger status in the generated view.

## PR625 review round 1 repair

Review at `608ae57cf4daf9f1384cc397bd7a6c92fa738f85` found that
`Array.every` skips sparse indices in the retained status validator. The three
new regressions reproduce acceptance of fully sparse top-level `entries`, nested
`evidence` and `provenModes` arrays: seven existing tests pass / three new fail
before repair. Explicit index iteration now requires own elements and recursively
compares every position. The regressions also refuse individually deleted
first/middle/last positions and an inherited value replacing an absent element.

After repair, the same four focused suites pass **74 tests / zero skips**;
`pnpm typecheck` and scoped registry/test ESLint pass. No broad/native test or
review delegation ran. Consumer source preparation is authorized against frozen
union `77fc4ea49f61aecc901f92062d8646bd125f21ee`, without applying consumer/interface
changes or merging that union onto this branch. Root coordinates that base first;
inquiry definitions remain reserved and E04 still needs A07 authority proof.

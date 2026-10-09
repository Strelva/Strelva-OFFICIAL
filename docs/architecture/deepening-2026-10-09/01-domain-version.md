# Version working definition and release determination

Stream: `domain-version`. Base: `reborn-1.0` at
`e9511b044b217fc233bde6b174c12988eaa2e950`; initial worktree clean.

## Scoped PRD

**Person/job.** A business owner or its authorized agency prepares an adapted
System for review. They need the same answer about what changed and whether a
release is needed wherever they open or prepare that Version. Preparation never
means publication or approval.

**Before.** Possibilities chooses `currentRelease`; generic preparation and the
Version release command choose the last release. Native bundle preparation
compares JSON serialization, so reordered object keys can create unnecessary
native work. Consumers separately apply overrides and choose comparison bases.
There is no demonstrated reachable difference between current and latest:
release appends and sets current; restoring History changes only the draft.

**After.** One pure determination in the Version module returns its working
definition, latest release, next release number, release-needed verdict and
changed paths. Possibilities, generic preparation, native bundle preparation and
the release command consume it. Object key order has no meaning; array order
does. The first release compares against an empty definition consistently,
so its decision describes the definition being made live, rather than an empty
diff against an unreleased source baseline.

**Existing rules.** Baseline plus shallowest-first overrides defines the draft.
History stays append-only; restoring an earlier release never rewinds Live or
the source baseline. Version/business identity, exact row revision, runtime
qualification, owner approval, destination resource authority, retained receipt
recovery and native conflict resolution stay with their existing owners.
Inquiry and website preparation remain distinct product adapters. Local proof
does not establish Auth, provider operation, production or customer adoption.

**Deletion targets.** Consumer-local override application, release selection,
equality and changed-path decisions; native `JSON.stringify` equality. Reuse
the existing key-order-independent compare implementation. No generic engine,
dependency, component, memoization or context is needed.

**Owned files.** `src/platform/system-versions/{service,possibilities,preparation}.ts`,
`src/experience/workspace/agency/bundle-lifecycle-server.ts`, directly related
Version preparation/consumer tests and this record. `compare.ts` is available
if evidence requires it, but currently needs no change. No edits to
`agency-server.ts`, `agency/version-server.ts`, WorkspaceApp/SystemPage,
website transports, storage/migrations, canonical model or strategic state.

**Failure cases.** Unsupported runtime or unreadable policy creates no approval;
stale native read/commit rejects; retained receipt wins before no-change exit;
conflicting native edits produce named choices without commit; malformed or
foreign commit receipts remain rejected. No-change generic preparation stays
side-effect free; native no-change still reads its exact revision/receipt first.

**Acceptance.** First release, actual override, nested reordered object keys,
restored draft and unchanged draft agree across the three consumers. Restore
keeps current/latest equal and releases intact. Stale revisions, retained
receipt recovery and inquiry/website conflicts keep their original behavior.
Review covers identity, authority, approval versus verification, stale responses,
scope reset and compatibility. Runtime additions/deletions are counted apart
from tests/docs.

## Implementation plan and checks

1. Retain failing consumer regression evidence before source edits.
2. Move the release determination into the existing Version module; replace
   callers' decisions, preserving adapter ordering and all guards.
3. Test behavior across consumer interfaces using fictional local dependencies;
   retain existing authority/recovery/store contracts.
4. Run targeted Vitest suites (all six proof seeds plus Version decisions,
   preparation/consumer regression and approval tests), `pnpm typecheck`,
   `pnpm check:boundaries`, `pnpm check:ontology`, targeted lint and
   `git diff --check`. PostgreSQL-dependent skips remain explicit. No storage or
   permission contract change is planned; if that changes, add the ordered local
   SQL and client compatibility proof before proceeding.
5. Trace System kind consumers and ADR chronology. Record a supported
   distinction or exact remaining semantic alternatives; change no runtime kind
   semantics. Review the diff, commit only owned work, create a draft PR against
   `reborn-1.0`, link it and queue the integration handoff.

## System kind investigation and concrete reconciliation

**Authority and chronology.** The October 9
[glossary](../../../GLOSSARY.md#businesses-and-what-they-run) says one System kind
for life (lines 144–146); its opening makes it the internal word authority.
The October 4 spine (`0d4a3de5f4`) deliberately made kind a mutable descriptor.
The October 5 founder glossary (`9f7bd85052`) subsequently said exactly one kind
for life; October 9 (`aa5cd97575`) retained this. Company ADR 0011 (selected
October 4, proposed) says a proposal grows package selection/onboarding while
keeping identity, but does not authorize a kind change and leaves the new-System
boundary open. Accepted ADR 0012 (October 7) concerns agency/platform standing;
accepted ADR 0013 (October 9) confirms the glossary as word authority. Neither
grants a mutable-kind exception. Company ADRs were read at
`/Users/jacobrhinehart/Desktop/strelva/docs/adr/`; the worktree-relative
`../docs/adr` does not exist. No company ADR or glossary was edited.

**Observed mismatch.** [System contracts](../../../src/platform/systems/contracts.ts)
lines 6–9, 42–49 and 200–205 call kind descriptive and accept updates.
[Invariants](../../../src/platform/systems/invariants.ts) lines 74–84 explicitly
permit proposal → portal without changing identity. Memory/Supabase stores both
implement it. The existing
[SQL](../../../supabase/migrations/20261004120000_systems.sql) accepts `kind` in
`update_business_system` (521–540) under exact change-number protection; its
identity guard omits kind (193–220). Service-role execution is granted at 992.
[Invariant tests](../../../src/__tests__/systems-invariants.test.ts) (71–74),
[store contracts](../../../src/__tests__/systems-store-contract.test.ts)
(108–113) and [SQL fixtures](../../../tests/systems-schema.sql) (89–96) affirm
mutation. No application TypeScript `updateSystem` caller beyond stores/tests
was found in this source. That limits demonstrated reachability; it does not
erase the service-role command or prove hosted behavior.

**Supported narrow distinction.** Existing spine `System.kind` is an updateable
description used by projections and runtime selection. A workspace record's
owning kind is the domain authorized to create/change its record shape.
Changing the spine description does not transfer a record to a different writer,
rewrite its record kind, or grant authority. This describes existing code, not
an exception to the founder's lifelong-kind rule.

[SavedWork](../../../src/platform/workspaces/types.ts) (25–45) retains independent
`productId`/`resourceKind`. [Bounded updates](../../../src/platform/bounded-work/repository.ts)
(25–34) use the saved product; website SQL validates that persisted product and
only updates payload/title/time (`20260920120000_websites.sql`, 29–55).
[Documents](../../../src/products/documents/server.ts) (21, 74) require
`documents/document`; tracker SQL requires `tracker/tracker`
(`20260912190000_tracker_record_coordination.sql`, 17, 68).
[Projection](../../../src/platform/systems/from-existing.ts) (181–189) maps both
application and tracker records to `internal_app`, so the mapping is not one to
one. There is no actual `owningKind` runtime field or central writer registry.
Generic `saveWork` still accepts supplied product/resource kinds
([repository](../../../src/platform/workspaces/repository.ts), 450–463), and
[tracker](../../../src/products/tracker/server.ts) creates research experiments
(120–141). A universally enforced owning-kind registry is not proven.

**Why description alone does not resolve it.** Kind also selects behavior:
[health](../../../src/platform/system-health/business.ts) (105, 131–133) treats
proposal/document/report as static and portal as ongoing;
[presentation](../../../src/experience/systems/from-workspace.ts) (39–56,
129–154) chooses different surfaces; [native candidates](../../../src/experience/systems/server.ts)
(143, 167) and [stored Possibilities](../../../src/experience/systems/stored-possibilities.ts)
(102, 388) filter website/inquiry eligibility. Inquiry follow-up checks kind plus
exact native origin/revision (`ask-follow-up-server.ts`, 9–13). Agent inquiry SQL
filters paused Systems by inquiry kind (`20261020090016_agent_inquiries.sql`,
38–41). No application path changing inquiry kind was demonstrated; potential
pause-filter impact remains a semantic concern, not a reproduced bypass.

**Exact alternatives for a separate decision.**

1. Make persisted `System.kind` the lifetime kind. A proposal gains onboarding
   without changing kind; name/purpose and revisions describe its growing job.
   Remove kind updates from TypeScript/memory contracts, prepare a new forward
   migration enforcing the same in SQL, and turn mutation tests into refusal
   tests. Inventory existing changed kinds and native projections first. This
   follows the latest glossary and stabilizes native/health classification, but
   changes an existing tested contract. No migration is authorized here.
2. Keep mutable description under a separately named concept, while representing
   lifetime System kind explicitly. Preserve old wire compatibility during an
   additive transition, and make native eligibility/writer authority depend on
   authoritative origin/record bindings. Select health/presentation behavior
   deliberately. Unbound Systems need lifetime-kind representation; a record's
   product ID cannot provide it generally. This needs founder acceptance of the
   distinction, possibly an additive field/forward migration, and coordinated
   consumer changes. Redefining System kind as mutable would reverse the current
   glossary and is not selected by this cleanup.

The Version refactor is independent of this choice. Runtime kind behavior,
glossary meaning and migration bytes remain unchanged.

## Handoff

**Implemented.** `determineVersionRelease` in the existing Version module owns
definition, comparison baseline, key-order-independent verdict, next number and
changed paths. Three preparation/projection callers and the release command
consume it. No new runtime module, dependency or component. `compare.ts` is reused
unchanged. Four runtime files: **27 added / 20 deleted (net +7)**. The small net
addition buys one determination while deleting all four callers' release
decisions; no guard was removed to meet a line target. Tests/docs are counted
separately. There is no listed-file overlap with the other streams; the read
performance stream's adjacent Version server is untouched.

**Initial failure retained.** Before runtime edits, the corrected six-test
regression suite had **2 failures / 4 passes**: first release opened detail
`This becomes release 1.` instead of the Possibilities paths; reordered nested
keys returned a native receipt when no new preparation was needed. Log:
`.scratch/domain-version/initial-regression.log`. An earlier test-fixture mistake
used the wrong inquiry draft location; it was corrected with InquiryEngine before
retaining the two product failures. No product failure was removed or skipped.

**Final local proof.**

- Nine targeted suites: **67 passed / 12 skipped**, including the six requested
  seeds, `version-release-consumers`, Version decisions and agency release gate.
  Covers first/unchanged/reordered/overridden/restored definitions, exact revision
  read/commit refusals, retained native receipt, named inquiry conflict and local
  choice, website conflict preservation, approval and interrupted preparation.
- Six additional affected suites: **46 passed**, covering lineage, overlap,
  twin trees, mapping, bundle UI and System store contracts. Total across the
  non-overlapping batches: **113 passed / 12 skipped**. Independent read-only
  review reran consumer/native tests: **11 passed**, not added to that total.
- `pnpm typecheck`, `pnpm check:boundaries`, `pnpm check:ontology`, targeted ESLint
  and `git diff --check` passed. Logs live in `.scratch/domain-version/`.
- Croki `preview_status` → `preview_open` verified the existing fictional preview
  at **1280×800 desktop / 390×844 mobile**, then five explicit states at
  **1280×844 / 390×844**: loading, read error/Retry, empty, read-only and missing
  account. No horizontal overflow. Full journeys prepared the alternative and
  activated through the existing fictional owner decision. Keyboard Enter worked;
  mobile Tab focus on Make real showed a 2px solid outline and a 48px target.
  Screenshots are retained in Croki browser artifacts. The local server used a
  cleared environment, no repository credential files, fictional preview only.
  UI components/inventory were unchanged. This preview substitutes responses and
  does not execute the new server determination; caller tests prove that code.

**Explicit limits/skips.** Twelve optional PostgreSQL tests (Version store plus
agency Library/Review all) lacked `STRELVA_VERSIONS_PSQL`. No local SQL runner,
authenticated browser/provider, hosted/native publication or production proof
was run. SQL/security/migration bytes are untouched. No storage, permission or
`/api/v1` contract changed, so SQL/custom-client checks were not triggered.
Build/full lint/full-suite are not claimed. Existing preview reports unavailable
agency/creator identity and unknown health; this UI proof does not qualify those.

**Review.** Root and independent reviewer checked final runtime diff for identity,
authority, preparation versus verification, stale row revision, receipt recovery,
native conflicts and compatibility. No introduced issue found. Current/latest
alignment is supported by release/restore behavior and native save wrapper
`20261010163300` (106–110); no invented divergence is used to justify this change.

**Proposed canonical evidence deltas (unapplied).** Record one shared Version
release determination, local caller/failure proof and its explicit SQL/provider
limits. Preserve the lifelong-kind requirement as founder intent and mark its
runtime enforcement disputed against the older mutable-kind contracts; retain
the writer/description distinction without claiming universal writer enforcement.
Canonical model, strategic state and both vaults remain with their integration
owner. No capability/offer, commercial policy or production gate is promoted.

**Exact integration action.** Review this draft against `reborn-1.0`, integrate
only its four runtime files, regression suite and this record after the six
streams converge; rerun the combined proof. Independently select alternative 1
or 2 above with Jacob before a separate System-kind contract/migration stream.
No `main` merge or rollout follows from this PR. Branch/commit/PR identity is
sent in the coordinator message after commit and PR creation.

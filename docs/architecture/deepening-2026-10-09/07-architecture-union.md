# Architecture union: scoped PRD and acceptance plan

Stream: `architecture-union`. October 9, 2026: phase one complete; phase two released.
Branch: `integrate/architecture-depth-20261009`; clean starting HEAD
`6ddc03f4d0f854997ff3f54481d5066625bf62fe`. Reviewed reads head
`65ebfc723b25e8a6c891589103be1530636cd83a` is an ancestor. The
[rolling integration record](README.md) was coordinator-owned during preflight; its candidate union update is now delegated here.

## Person, job and bounded result

A business owner or authorized agency opens, changes and reviews the same work
through its workspace or System. Saving must keep the accepted result visible;
navigation, delayed responses and changing permission must never substitute
another business's work or authorize another write.

Before: separate streams deepen Version decisions, location, opened-work dispatch,
website admission/settlement and authorized reads. Their isolated proofs do not
establish that their combined mounted tools, callbacks and authority still agree.
After: exact released source is combined in this worktree, with one behavior proof
across real entrances and tools. The customer keeps the same saved work and truthful
notice during supplemental failures, while access refusals still remove access.
This is prepared local reliability, not a production or commercial claim.

Existing rules come from [CONTEXT](../../../CONTEXT.md#product-model),
[GLOSSARY](../../../GLOSSARY.md) and the peer PRDs: identity survives changes;
Versions describe context, not releases; current authority is independent of
visibility; retained commands are immutable; acceptance and read-back are separate.
Kind meaning is unchanged by #618. Lifetime kind is Jacob's selected separate
contract; include its implementation only if the coordinator explicitly releases it.
Company ADRs 0010, 0011 and 0013 were read from
`/Users/jacobrhinehart/Desktop/strelva/docs/adr/`; `../docs/adr` is absent here.

No runtime/test edits, merges or cherry-picks in phase one. No peer worktree edits,
new dependency, canonical model/state write, production/main action, shared SQL
application, provider, env, billing, DNS or customer-data action. Keep migration
history byte-identical; `/api/v1` remains additive and frozen contract names stay.

## Frozen-source manifest and evidence limits

- **Reads #617:** already included at `65ebfc723b25e8a6c891589103be1530636cd83a`.
  Its [handoff](05-read-performance-handoff.md) records 140 passed / 12 SQL skips
  and the coordinator rerun. Preserve the rolling record's projection-sync caveat.
- **Domain #618:** held exact head `4543251842d0546258e392fdf368635b1deaf6c3`;
  runtime commit `1b70821155f51699d3c1398978ab15bc5517b264`, then proof-doc correction.
  Inspected its PRD/runtime file list. Shared `determineVersionRelease` preserves
  native exact-read/receipt ordering. Reported root proof: 113 passed / 12 SQL skips.
- **Location #619:** corrected, independently cleared exact head
  `3de2cedc580025a0921533bb5efe9b22597c40e2`; do not admit original `ebbeda6e2` alone.
  Inspected corrected PRD, App hunks and real-tool refresh suite. Reported owner
  proof: 171 tests / 11 files and seven browser cases; independent repair proof: 22.
  Its refresh suite exercises V1 and temporary 503, not V2 or recovery usability.
- **Composition #621:** independently reviewed exact head
  `3b898fe5f5c338a02ee28f5258223a6850a34ca3`; runtime
  `e7fe129a5ee706de91d4c071edd69c0e2b888ff3` is unchanged by later docs.
  Inspected PRD, `OpenedWork` and caller hunks. Reported root proof: 113 tests /
  11 files and type/boundary/ontology/focused lint. No bundle claim.
- **Website #620:** original `8ff3578f485f4b207fbbf5be5af2a78d13faa70c` is inspection
  evidence only, **not released**. Its retained 319 tests / 27 suites / zero skips
  do not qualify the pending repair. Wait for the exact final shared URL-policy
  head and revised proof manifest; preserve crawler error compatibility and DNS/
  pinned fetching. Do not copy the intermediate mirrored client URL parser.
- **Lifetime kind:** `arch/lifetime-system-kind-20261009`, based on `a1306213f`,
  **not released**. Coordinator must specify included or held separate. Reported
  ordered workspace SQL failures at Google ACL and booking `created_at`
  preconditions remain failures even if a separate disposable proof passes.

All peer counts above are existing evidence, not preflight reruns or unique union
coverage. Source-release admission requires complete exact heads, review disposition,
proof/skip records and the kind inclusion decision.

## Owned files, overlap and deletion targets

Phase one owns only this document. Phase two owns reconciliation of released peer
files, directly related union tests/fixtures and this handoff. Preserve every peer
PRD, retained failure record and relevant inventory entry; do not overwrite the
coordinator's README with an older peer copy. Canonical evidence deltas go back to
the integration owner, who owns PRODUCT_MODEL and shared strategic state.

Exact inspected overlap, using `e9511b044` line coordinates:

- `WorkspaceApp.tsx`: composition replaces tool imports at 24–34, tracker/document
  dispatch at 481–492 and horizontal dispatch at 671–675. Location changes its
  location import at 6; load/restore at 112–175; callback ownership and navigation/
  start/save helpers at 270–479; inserts save wrappers after 479; and updates
  navigation props at 572, 576, 597, experiment opening at 685 and history cleanup
  at 501, 524, 701, 710. The zero-context diffs show adjacent dispatch/helper hunks,
  without a directly replaced-line collision. This is a file/behavior overlap,
  not a proven conflict-free application. Preserve location generation and active
  workspace checks, composition's caller permissions and workspace/work keys.
- `docs/design/component-system.md`: composition changes the Systems row at 319;
  location adds after 1226; original website adds after 1405. Retain all three.
  Final website/kind release may introduce new overlap; regenerate the map then.
- Reads' `agency/version-server.ts` chooser stays intact. Final #618 touches
  `agency/bundle-lifecycle-server.ts` and `system-versions/{service,possibilities,
  preparation}.ts`, with no actual reads-file overlap in its inspected manifest.
- Composition owns SystemPage/shared dispatch; location owns WorkspaceLayout,
  selection/location and App navigation; website owns experiences/recovery/
  transports/shared URL policy. Kind's final contracts/stores/forward SQL list
  is pending. Never reconcile by taking a whole older App or inventory file.

Delete duplicated release decisions, location clear-lists/start-save choreography,
dispatch/reader wiring, attempt lifecycle and URL parsing through the released
owners. No generic engine, compound context, memoization or cosmetic splitting.
Measure actual union runtime TypeScript/TSX, runtime SQL, tests and docs separately
against both `6ddc03f4` (this stream) and `e9511b044` (whole architecture work).
The original approximate net +8 predates repairs; it is not a final subtraction
claim. Keep meaningful guards regardless of line count.

## Mandatory union acceptance

Use real WorkspaceApp, SystemPage and tools; fictional closed transports are valid.
An isolated helper test or a callback-only substitute cannot satisfy these gates.

1. **Accepted save / delayed refresh:** for V1 and V2, acknowledge save, hold the
   same-workspace GET across a committed render, and assert work ID, exact tool
   DOM node, attempt continuity and accepted notice while pending, after 200 and
   after temporary 500. No extra mutation/replay or false unknown state. 401/403/404
   clear prior access; successful delegated refresh removes write controls;
   missing work becomes unavailable; switching business rejects late old reads.
   Retention after 500 does not restore App callback authority: it remains invalid
   until a successful snapshot. Exercise successful recovery and a subsequent save;
   preserve any usability failure as a separate finding rather than weaken guards.
2. **Departed creation:** start a real new document POST, Home, then Back to the
   same creation URL before it settles. The departed instance's callback cannot
   navigate the replacement; the replacement's own save can acknowledge.
3. **Owning envelopes:** from both actual workspace and System entrances, return
   otherwise-valid V2 successes with wrong workspace ID and, separately, wrong work
   ID. Refuse before foreign title, Confirm or save callback appears. Accepted
   revision 2 survives a delayed revision 1. Do not reject merely malformed fixtures.
4. **Authority and enrichment:** same workspace/work keys survive role changes;
   authority epochs refuse stale acknowledgements without a new unknown replay.
   Optional History/domain failures remain unavailable supplemental evidence and
   cannot undo acceptance, lock a settled write or create duplicate commands.
5. **URL admission / replay:** invalid fresh URL intake never admits a command;
   correcting it can submit. Genuine committed/lost-ack replay uses exact original
   ID/body and yields one record. Shared normalization retains crawler error class,
   code and message; browser literal validation cannot replace server DNS checks,
   redirect checks or pinned fetching.

Desktop/mobile proof includes realistic populated, loading, empty, error and
permission states, keyboard/focus recovery, 320px reflow and no foreign network.
Use existing tokens/components. Update only an actually changed inventory entry.
Fictional UI and local SQL prove neither genuine Auth nor provider/hosted delivery.

## Phase-two plan and exact checks

1. Receive explicit frozen-source release; verify exact commits and ancestry,
   admission records and held-kind decision before combining. Retain peer history
   and reconcile only this checkout. Inventory all new file overlaps before edits.
2. Install existing pinned dependencies with `pnpm install --frozen-lockfile` in
   this worktree. Add no dependency or lockfile change. Retain baseline/first-failure
   logs for new union cases before any corrective runtime edits.
3. Add `src/__tests__/architecture-union.test.tsx` plus directly related fixture/
   browser cases; exercise all five gates above. Fix only evidenced union failures.
4. Run the following combined meaningful suites, then the reads ten-file command
   in its linked handoff, and all final domain/composition/location peer manifests
   (including their additional authority/preview suites). Deduplicate file totals;
   record exact executable manifests and outcomes in the final handoff.

```sh
pnpm exec vitest run src/__tests__/architecture-union.test.tsx \
  src/__tests__/workspace-refresh.test.tsx src/__tests__/workspace-history.test.tsx \
  src/__tests__/workspace-location.test.ts src/__tests__/workspace-selection.test.ts \
  src/__tests__/workspace-open-work.test.ts src/__tests__/workspace-launch-return.test.ts \
  src/__tests__/workspace-template-location.test.ts src/__tests__/workspace-view-for-work.test.ts \
  src/__tests__/business-start.test.ts src/__tests__/public-continuation.test.ts \
  src/__tests__/workspace-exit-ui.test.tsx src/__tests__/opened-work-composition.test.tsx \
  src/__tests__/systems-runtime.test.tsx src/__tests__/version-release-consumers.test.ts \
  src/__tests__/w6-version-possibilities.test.ts src/__tests__/w6-version-native-runtime.test.ts \
  src/__tests__/system-bundle-lifecycle-native.test.ts src/__tests__/system-versions-store-contract.test.ts
pnpm exec vitest run $(cat docs/architecture/deepening-2026-10-09/02-website-test-files.txt)
pnpm typecheck
pnpm check:boundaries
pnpm check:ontology
git diff --check
```

The union test does not exist during preflight. Website's file list must be the
released updated list and include URL-policy/crawler compatibility cases. Focused
ESLint takes the final changed runtime/tests list explicitly; no glob that silently
omits new files. Serial typegen/dev jobs avoid the peer's generated-validator race.
Broader test/build/release checks follow final scope; none is claimed now.

For rendered proof, use Croki `preview_status` then `preview_open`, real tools and
disposable fictional local fixtures. Refuse app startup if credential-bearing repo
`.env`, `.env.local`, `.env.development*` or `.env.production*` files are present
(example files are inert). Start only this worktree's app on an unused port:

```sh
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" STRELVA_UI_PREVIEW=1 \
  NEXT_TELEMETRY_DISABLED=1 pnpm exec next dev --hostname 127.0.0.1 --port 3437
```

Never read/copy credentials or connect an existing app server. Replay the final
fixture route and `tests/opened-work-composition.spec.ts` setup from composition's
handoff, plus `tests/release-workspace-navigation.spec.ts` on this source. The exact
browser command after readiness is:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3437 PLAYWRIGHT_CHANNEL=chrome \
  pnpm exec playwright test tests/opened-work-composition.spec.ts tests/release-workspace-navigation.spec.ts
```

Preview tools remain the primary browser; existing Playwright suites are regression
proof, not an excuse to bypass an available Croki preview. Stop only our server;
remove disposable routes and generated tracked changes before final checks.

If kind is released, run its exact ordered disposable proof and refusal/ordinary-
update contracts, plus:

```sh
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade
```

Preserve the reported Google ACL/
booking baseline failures alongside any custom proof. If permission contracts
change, add `check:agency-workflow` and the authenticated disposable browser proof.
If storefront contracts change, add contract tests and `pnpm check:custom-repos`.
No custom proof can turn a failed required runner into a pass.

5. Review identity, authority, acceptance versus verification, stale responses,
   scope reset, compatibility, migration bytes and subtraction. After original
   union proof only, wait for the separately released bounded inquiry repair below.
   Read the PR skill, commit owned work without a coauthor trailer, push this branch
   without force, draft against `reborn-1.0`, register immediately, then list thread
   PRs. Return exact source/proofs/skips/limits to coordinator; hold canonical merge.

## Deferred adjacent repair and continuation

Observed in this base: `src/platform/offerings/definitions.ts:66` fabricates an
`inquiryWorkspaceId=<resource UUID>` destination. Location cannot safely use it;
the actual entrance needs an actor-authorized tenant slug. The coordinator reports
no exposed authoritative exact-resource mapping and a resolver that can select
another business; resolver behavior was not independently rerun in preflight.
`OfferingInstallation.tsx:159–160` already renders `href:null` as Unavailable.
After original union proof and explicit coordinator release, delete the fabricated
href only; adjust `offering-installations.test.ts` emission and exercise the actual
installation UI. Never alias resource UUID to tenantId or substitute an aggregate
inbox for a promised exact resource. No implementation during preflight.

**Preflight observed:** Git objects for all four inspected peer heads are local;
base/read ancestry is verified; pnpm 10.34.5, Node 26.8.2, Git/gh, PostgreSQL 18
initdb/pg_ctl/psql and installed Chrome exist. Docker and Supabase CLIs are present;
their daemon/Auth stacks were not exercised. This worktree has no node_modules;
default Playwright cache directories are absent. Croki status initially had no tab;
`preview_open(open:false)` succeeded at 1280×800. Only inert `.env.example` and
`.env.production.example` were found. No app, behavior suite or SQL cluster ran.

Docs-only validation: all four relative links and the product-model anchor resolve;
all 18 named existing suite paths resolve in the inspected heads. The union suite
is explicitly planned. Staged/working diff whitespace checks pass; runtime source,
runtime SQL and tests each have zero additions/deletions in phase one.

**Proposed evidence delta, unapplied:** record inspected source ownership and the
combined proof obligation; retain local/SQL/provider limits and the inquiry-link
mapping defect. No capability promotion, offer, economics or domain-meaning change.

**Exact next action:** coordinator releases final website head, disposition of
lifetime kind and the complete approved source manifest. Then resume step 1 here.
Phase one is ready for that source-review gate; the union is not implemented or
qualified yet. No PR or push is needed for this preflight document.

## Phase-two source admission

Coordinator released domain `4543251842d0546258e392fdf368635b1deaf6c3`,
location `3de2cedc580025a0921533bb5efe9b22597c40e2`, composition
`3b898fe5f5c338a02ee28f5258223a6850a34ca3`, website
`5beb3829def795887dc11c822c693bc625c0cc32`, then lifetime kind
`bfb5ab065d934c03cdb6665229022e8e935ccbc0` through a distinct release.
All were merged with complete peer histories into this candidate; reads is already
in the base. Git resolved App/inventory adjacency automatically; combined behavior
is still to be proven. All six input PRs are registered in this thread. Existing
lockfile installation completed without lockfile changes. Candidate ownership now
includes factual union updates to the rolling README, granted by coordinator.
Kind's frozen forward/inverse bytes remain unchanged; no shared SQL is applied.

The original plan above retains its preflight status and findings as history; the
release supersedes its source hold, pending-kind disposition and README ownership.


## Union recovery correction and local proof

At merged checkpoint `01dfae2e29dcf16d416600e86527d07e1ef484f4`, a
supplemental workspace 500/503 retained the accepted tool but left App callback
authority null indefinitely. Tool-local reload could not restore App authority;
naive workspace retry compared selection with null authority and remounted work.
New deferred real-tool cases initially failed: 10 failed / 12 passed in the
expanded refresh suite (the earlier two recovery cases also failed). These are
runtime regression evidence, retained locally in `refresh-deferred-initial.log`.

The bounded correction uses the existing requested workspace for retained
same-work selection, independently of callback authority. The existing sequence,
location and navigation-generation guards remain. Retry invalidates authority
again; only a successful current actor-scoped GET restores callback eligibility.
401/403/404 clear access, missing work becomes unavailable and scope changes reject
late reads/callbacks. A required recovery warning cannot be dismissed; independent
review caught that Dismiss would otherwise remove the only recovery path. No
retained data grants permission. Mobile notice text/action stack using existing
Button/tokens, with no controller, cache or provider change.

The executable deduplicated [83-suite manifest](07-union-test-files.txt) covers
System stores/invariants/Supabase/native/health/projection, Version decisions,
workspace/location/reads, shared URL/crawl and V1/V2 website recovery. Its first
combined run had 979 passed, 5 failed, 12 skipped and 6 uncaught exceptions. All
five failures and exceptions were old Systems UI fixture destinations with
non-UUID workspace/System IDs or missing workspace scope. Fictional fixture IDs
were corrected; location guards were not weakened. Final broad result: **984
passed / 12 skipped / 83 files**, zero errors. This is a targeted combined manifest,
not the full repository suite. The 12 skips require `STRELVA_VERSIONS_PSQL`
(eleven Version PostgreSQL cases, one Library/Review-all case); no SQL claim is
made for them. After the final mobile-only layout change, the three mandatory
real-tool union files reran: **41 passed / 3 files / zero skips**. Independent
bounded review reran the 22 refresh cases and found no remaining recovery blocker.

Final documented browser replay: **31 peer cases + 10 union cases passed**, zero
skips. Real WorkspaceApp/tools, workspace and System entrances use closed
fictional transports with foreign network requests refused. Populated/loading/
empty/error/read-only/permission, desktop 1440px, mobile 390px and union 320px,
keyboard focus/Enter, retained tool node/notice during held retries and after 200,
current subsequent save,403 refusal and business Back/stale read were exercised.
Coarse-pointer Retry measures at least 44px in both dimensions; its rectangle is
inside the warning at 320/390. Croki primary inspection first observed V1 accepted
notice and identical tool after 500 at 390/320; the 320 button extended ~3px beyond
the alert border before stacking. Later Croki reported explicitly: “No preview
automation host is available … Do not retry … use a headless browser”. The
existing documented headless runner completed the replay. This is local rendered
proof, not Auth/provider/production qualification. The initial browser fixture
held a second StrictMode initial read and hung; hold now starts only after a
mutation, and assertions use baseline counts. Two preliminary runs were stopped;
other preliminary failures were ambiguous alert selection/busy chooser fixture
assumptions, not runtime defects. All initial/final logs are retained locally.

Actual PostgreSQL 18 conditioned lifetime-kind script passes on this combined
source, including core/inverse/reapply/populated rollback refusal and current
native source/schedule/website/offer writers. Its local shim temporarily removes
named-role default table/function grants before the existing 1751 ACL precondition,
then restores them immediately afterward. This conditions a disposable fixture;
it does not qualify hosted ACL/Auth or PostgreSQL 17. Required workspace SQL still
fails at frozen `20261022175100_legacy_google_operation_authority.sql:24`,
`legacy_google_creation_authority_invalid`; required upgrade still fails at
`tests/money-effect-admission-schema.sql:78`, omitted non-null booking `created_at`.
Retain both failures and peer historical native fixture failure records. No guards,
frozen migration bytes or required wrappers changed here. SQL companion repair
is separate, subject to root review. No agency/provider authority expansion.

Typecheck, boundaries, ontology and full lint passed on merged source with the
initial recovery correction; final correction typecheck/focused lint and diff
checks are recorded below at freeze. Clean build waits for the coordinator's
serialized resource window. No full build/suite or production qualification is
claimed before execution. Disposable routes were removed and devserver stopped.
Draft [#623](https://github.com/Strelva/Strelva-OFFICIAL/pull/623) was published at
checkpoint `01dfae2` solely as the requested safe stack base, explicitly unfinished.

## Authorized adjacent inquiry-link plan

After original union proof: remove only the fabricated `inquiryWorkspaceId`
destination in `src/platform/offerings/definitions.ts`, returning `href:null`.
Update the existing emission test in `offering-installations.test.ts`, retaining
business resource validation, installation identity/revision and replay/history.
Add a real OfferingInstallation UI case using canonical surface resolution in
`workspace-offerings-ui.test.tsx`: connected installation remains visible, its
inquiry surface says Unavailable and emits no Open link. Preserve existing UI
fallback and native resources. Capture initial failing emission/UI assertions,
then run both affected suites, typecheck/boundaries/ontology/changed lint/diff.

A future exact destination requires an actor-authorized resource-to-tenant-slug
mapping that also verifies the selected business. No authoritative mapping is
exposed here; tenant/resource uniqueness alone can select another business.
Prepared future action: design that exact scoped resolver and failure cases,
then separately authorize its implementation. Do not alias resource UUID to
`tenantId`, substitute the aggregate inbox or add grants/migrations/API mapping.


Final proof-route teardown exposed two stale generated `.next/dev/types` imports
of removed disposable pages in typecheck. Retained that failed log, moved only
this worktree's generated dev type directory out, then regenerated route types
for source-only verification. No deployed route or bridge remains.


Recovery correction freeze: final `pnpm typecheck`, `pnpm check:boundaries`,
`pnpm check:ontology`, focused ESLint across every union correction TS/TSX file,
relative-link/manifest path validation and `git diff --check` pass. Full lint's
merged-source pass is retained; changed files were rechecked after all corrections.
The browser replay's 10 union cases reran with explicit coarse-pointer and
alert containment assertions and pass. No new runtime source changed afterward.


## Coordinator release-inventory registration

Root's offline inventory check found exactly one missing prepared packet file:
`20261022183000_lifetime_system_kind.sql`. The candidate reproduced that failure;
the release-safety suite also initially had 28 failed / 12 passed because inventory
coverage failed before staging. Added one `lifetime-system-kind` proposed/held entry
to `scripts/release-safety/batches.json`, preserving all preexisting objects/status
values and SQL bytes. Forward SHA256 is
`cb4634ccfa6dc84e701cc08b707e631ffa2cf813d88899e14dc6294e76aca417`;
inverse is `95978ca755b1d88c702c30410d438f6a33fad7c6b7f2900c9aa38c9fa3c6634d`.
The entry states conditioned local PostgreSQL 18 native/inverse proof, required
runner failures/current harness repair and held/unrun PostgreSQL 17, managed/
hosted ACL/Auth, historical-kind review, live preflight and application. It grants
no staging-order, deploy or migration-application authority.

Exact cheap checks:
`pnpm exec tsx -e 'import { verifyReleaseInventory } from "./scripts/release-safety/inventory"; verifyReleaseInventory(process.cwd());'`
passes; JSON parse and equality of every preexisting entry/status pass;
`pnpm exec vitest run src/__tests__/release-safety-tools.test.ts` passes **40 tests**;
`git diff --check` passes. Raw initial/final inventory and suite logs are retained.
Foundation F01 must preserve this registration during later source convergence.


## Adjacent inquiry-link result

The initial two affected suites failed exactly the new emission/UI assertions:
**2 failed / 21 passed**. Canonical surface resolution fabricated a resource-UUID
query that strict workspace location did not consume; the real installed offering
component rendered Open for it. Removed only that href construction, returning
`null`. Resource validation, active installation identity/revision, persisted read,
retirement and history code remain. Existing Unavailable fallback is reused.
Final affected suites pass **23 tests / 2 files**; no production/API mapping or
UUID-to-tenant alias was added. Runtime source is **2 additions / 5 deletions**.

A separate closed fictional fixture renders the actual OfferingInstallationView
and canonical definition at 1440/390: **2 browser cases pass**, with Unavailable,
no surface link or misleading Open, retained installation, keyboard focus and no
foreign/API request or page error. Both screenshots were inspected. Two existing
union recovery cases also reran only to retain final warning screenshots for
320px V1 and 390px V2; their scope/geometry/identity assertions pass and the final
stacked warning screenshots were inspected. These reruns are not additional unique
case counts. No fixture route remains after teardown; no real Auth was exercised.

Changed UI inventory entries describe the retry and withheld inquiry destination.
Canonical evidence delta proposed to the integration owner: source integration
now has combined local behavior, conditioned PostgreSQL 18 and inventory evidence;
required SQL runners, hosted ACL/Auth, historical-kind/live migration qualification
and exact inquiry routing remain separate obligations. PRODUCT_MODEL and shared
state remain untouched. No full-delivery/adoption/economic claim follows.


Adjacent repair freeze checks: `pnpm typecheck`, `pnpm check:boundaries`,
`pnpm check:ontology`, ESLint on changed definitions/tests/browser fixture files,
and `git diff --check` pass after fixture route teardown. No new dependency,
permission, SQL, provider/Auth or `/api/v1` contract changed. No custom-client or
agency permission runner is required by the href deletion. Full lint's merged
source result plus all changed-file checks are retained. Clean build remains held
for the coordinator's next resource window.


Registration wording correction: the first new entry described “guarded populated
inverse and reapply pass”, which overstated the proof. Root review corrected it:
conditioned PostgreSQL 18 **empty-schema** inverse/reapply restores exact
definitions and ACL; **populated inverse refuses**, preserving rows and forward
fingerprints. Only the new entry's rollbackStatus is corrected; every historical
entry and SQL hash/byte remains unchanged. Offline inventory/JSON/diff checks
pass after this metadata correction; the 40-test suite is not rerun for wording.


## Candidate source and proof handoff

Recovery commit: `77fc4ea49f61aecc901f92062d8646bd125f21ee`; coordinator registration:
`95424f72fa836bed1a32566aa48021c8cce7f903`; separate inquiry deletion:
`201c19874be9be5f3ea65128e06a00826607a781`. The final metadata/evidence commit
records corrected inverse wording and final source counts. All exact input heads
are listed above and remain ancestors; complete peer handoffs/inventory entries
and the projection synchronization caveat are retained. This worktree alone was
changed. No App/OpenedWork/SystemPage runtime source changed after the recovery
freeze. The [complete changed-file manifest](07-union-changed-files.txt) uses starting
base `6ddc03f4d0f854997ff3f54481d5066625bf62fe`; its reads stream was already included.

Independent final bounded source review found no concrete blocker in inquiry
identity/retention/Unavailable or held inventory registration. Both frozen SQL
hashes were independently verified. Review is source evidence, not a new suite or
migration application. Root's SQL companion repaired-source upgrade pass is
separate from this unrepaired candidate's required-runner failures. Do not project
that pass onto this source. Its exact helper release/review is a subsequent
integration action, outside this candidate's source authorization.

Exact local commands (environment cleared for app/browser/SQL/build):

```sh
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" STRELVA_LOCAL_TEST_WORKERS=4 \
  pnpm exec vitest run $(cat docs/architecture/deepening-2026-10-09/07-union-test-files.txt)
pnpm exec vitest run src/__tests__/architecture-union-document.test.tsx \
  src/__tests__/architecture-union-entrances.test.tsx src/__tests__/workspace-refresh.test.tsx
pnpm exec vitest run src/__tests__/offering-installations.test.ts \
  src/__tests__/workspace-offerings-ui.test.tsx
pnpm exec vitest run src/__tests__/release-safety-tools.test.ts
pnpm typecheck
pnpm check:boundaries
pnpm check:ontology
pnpm lint
# Full lint was run on merged source; every later changed TS/TSX file was checked again.
git diff --check

env -i PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH" HOME="$HOME" TMPDIR="$TMPDIR" \
  bash scripts/check-lifetime-system-kind.sh
env -i PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH" HOME="$HOME" TMPDIR="$TMPDIR" \
  pnpm check:workspace-sql
env -i PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH" HOME="$HOME" TMPDIR="$TMPDIR" \
  pnpm check:workspace-upgrade
```

For browser replay, copy each corresponding `tests/fixtures/*-page.tsx` into its
disposable `src/app/preview/strelva/` proof route: `opened-work-proof`,
`architecture-union-proof`, `architecture-union-inquiry-proof`. Start only the
fictional clean-environment app:

```sh
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" STRELVA_UI_PREVIEW=1 \
  NEXT_TELEMETRY_DISABLED=1 pnpm exec next dev --hostname 127.0.0.1 --port 3437
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" STRELVA_UI_PREVIEW=1 \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3437 PLAYWRIGHT_CHANNEL=chrome \
  pnpm exec playwright test tests/opened-work-composition.spec.ts \
  tests/release-workspace-navigation.spec.ts tests/architecture-union.spec.ts \
  tests/architecture-union-inquiry.spec.ts
```

Actual runs were serialized as 31 peer, 10 union and 2 inquiry cases; 43 unique cases
pass with zero skips. Two union cases were later rerun for inspected warning
screenshots, not counted again. Stop the devserver, remove all disposable route
copies and regenerate route types before source-only checks/build. An initial
teardown typecheck's generated imports failed; its retained log and final passing
regeneration are separate. Existing shared primitive/tokens were used throughout.


Raw local evidence is retained at `/tmp/strelva-architecture-union-20261009/`
(outside tracked source). Primary proof files:

- Initial/final recovery: `refresh-deferred-initial.log`, `union-gates-final.log`.
- Broad initial/final: `units-initial.log`, `units-final.log` (83-file manifest).
- Browser: `browser-peer-final.log`, `browser-touch-final.log`,
  `inquiry-browser-final.log`; retained final warning/installation images in
  `browser-artifacts/retry-v1-320.png`, `retry-v2-390.png`,
  `inquiry-desktop.png`, `inquiry-mobile.png`.
- SQL: `kind-sql.log`, `workspace-sql.log`, `workspace-upgrade.log`.
- Final checks: `typecheck-final.log`, `boundaries-final.log`, `ontology-final.log`,
  merged `lint.log` plus `lint-correction-final.log`, `inquiry-lint-final.log` and
  `lint-visual-capture-final.log`.
- Adjacent/registration: `inquiry-initial.log`, `inquiry-final.log`,
  `release-inventory-initial.log`, `release-inventory-wording.log`,
  `release-tools-initial.log`, `release-tools-final.log`.

Source-only candidate is ready for root review with the serialized clean build
receipt below. Canonical integration and production remain held. Exact next
action: root reviews draft #623's final head and independently reviews the SQL
companion helper's separate source; integrate only released exact heads, preserving
this packet entry, all peer records and the projection synchronization caveat.
Then rerun required runners on the combined reviewed helper source. Production
requires separately qualified historical kinds, hosted ACL/Auth, PostgreSQL 17/
managed feasibility, live preflight and explicit migration/rollout authorization.
The exact-resource inquiry resolver remains future prepared work, not part of
this source. No further App/OpenedWork/SystemPage source edit is planned.

## Final clean build and resource release

The coordinator explicitly released the serialized build window. The single run
completed **exit 0** on committed source `201c19874be9be5f3ea65128e06a00826607a781`
plus the reserved final docs/manifest, corrected registration wording and screenshot
capture. Compilation, TypeScript and all 260 generated static pages completed.
Exact changed-file hashes are retained in `build-source.json`; the final commit
changes only evidence/docs/metadata and preserves every tested runtime byte.

```sh
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" NEXT_TELEMETRY_DISABLED=1 pnpm build
```

Existing frozen-lockfile dependencies were used. The environment contains only
PATH, HOME, TMPDIR and the telemetry-disable flag; repository env files are only
`.env.example` and `.env.production.example`. Disposable routes/bridge/devserver
were removed before the build, and no build or native process remains. No fake
provider variables or real credentials were supplied. The local manifest precheck
initially misclassified `.env.production.example`; its shell continued to this
single authorized build. Corrected read-only validation and `build-precheck.txt`
retain that setup failure; no second build was started.

Retained warnings are two dynamic-filesystem tracing warnings in
`src/lib/google-review-content-retention.ts`, Sentry `disableLogger` deprecation
and Node `module.register` deprecation. No bundle-size/performance, provider/Auth
or production qualification follows. `build.log` and `build.exit` retain the
complete output and exit receipt. The broad slot was explicitly released to root
and foundation after teardown, with F01 Redis then O01 Lua next. No further broad
or native run was started here. The companion's later workspace retry failure
at missing `public.build_payments` in its minimal-parent cleanup fixture remains
separate source evidence; neither required runner is green on this candidate.


Measured source deltas (Git numstat; tests/docs/proof tooling counted separately):

| Baseline | Runtime TS/TSX +/− | New migration SQL +/− | Tests +/− | Docs +/− | Proof tooling +/− |
| --- | --- | --- | --- | --- | --- |
| Bound starting base `6ddc03f4` (reads already present) | 511/461 | 94/0 | 2120/64 | 2761/94 | 183/0 |
| Architecture source base `e9511b044` (all six streams) | 582/540 | 94/0 | 2355/67 | 3061/2 | 183/0 |

Runtime grows by 50 lines against the bound base, or 42 across all six; no shrink,
bundle, latency or economic benefit is claimed. The bounded retry adds 3 net runtime
lines and the inquiry deletion removes 3; no meaningful guard was removed.
Runtime SQL is only the 94 prepared forward/inverse lines; existing migration bytes
are unchanged. Test counts include fictional browser fixtures and SQL assertions;
proof tooling includes local runners, preflight SQL and held release metadata.

# Architecture union: scoped PRD and acceptance plan

Stream: `architecture-union`. Phase one, October 9, 2026: **source held**.
Branch: `integrate/architecture-depth-20261009`; clean starting HEAD
`6ddc03f4d0f854997ff3f54481d5066625bf62fe`. Reviewed reads head
`65ebfc723b25e8a6c891589103be1530636cd83a` is an ancestor. The
[rolling integration record](README.md) stays coordinator-owned.

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

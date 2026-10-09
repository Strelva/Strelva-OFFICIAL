# Workspace location — bounded PRD and plan

Source: reborn-1.0 e9511b044b217fc233bde6b174c12988eaa2e950. Stream: workspace-location.

## Person and job

A business owner moves among Systems and saved work, switches businesses, and returns through browser history or sign-in. An agency opens a client's work and returns to its own workspace. Each destination must reopen consistently without carrying another destination's detail or implying access.

## Before and after

Observed: App and Layout maintain different clear-lists. App omits system/search; switching business deletes view but retains system, which the sign-in return validator refuses. Client-work opening and workspace switching replace the entry being left. Tracker/document/plan repeat start/save choreography and choose push for saves while horizontal saves replace.

After: the existing platform location owner reads compatible navigation hints, encodes complete destinations, and writes history. Frame and loaded-work selection use its same normalized hints. Opens/switches push; acknowledged saves replace the unsaved entry. All destination-specific detail is dropped on moves, including system/search. Load-time replacement preserves valid current detail within the same workspace. Unknown local preview context stays outside the location contract. Strict sign-in return validation remains strict and preserves public URL spelling/order.

The October 5 proposal is evidence, not an implementation mandate. Offering→work→Back and work-kind mapping are already fixed; preserve those tests. Keep query URLs, ongoing/operations and access aliases, legacy work-only links, safe return targets, leaveWork and viewForWork. No new context provider, state framework, data/permission owner, pending-ask owner, or server-link migration.

## Ownership and deletion

Own location.ts, WorkspaceLayout navigation/read helpers, workspace-selection.ts, WorkspaceApp navigation/start/save/history functions, the four named focused tests, release-workspace-navigation.spec.ts and this handoff. Delete both clear-lists and repeated starts/saves/history writes. App imports and onNew/onWorkspace props are narrow unavoidable overlaps with opened-work composition; render dispatch remains untouched. No migration, authority, provider, /api/v1 or client contract changes.

## Failure cases and acceptance

System→switch business→reload/sign-in/Back/Forward contains no stale detail; Back restores the original System. Inquiry/product/standing transitions cannot retain offering/system/search. Missing/malformed IDs do not open unrelated details; missing saved work remains visibly unavailable. Agency client opening pushes and Back restores agency. Starts retain their own existing continuation, exit/read-only guards and scope resets. Saves reject callbacks from obsolete workspaces and replace the creation entry without mutating prior entries. History keeps custom state and strips Next router markers. Empty/error/loading/read-only UI remains truthful.

## Implementation and exact checks

1. Add failing rendered regression for System→workspace switch and retain its result.
2. Deepen pure location reads/encoding and one browser writer; consume from frame and selection.
3. Consolidate App starts/saves, switch and client openings. Preserve stale-response guards and public-save compatibility.
4. Run pnpm exec vitest run src/__tests__/workspace-location.test.ts src/__tests__/workspace-open-work.test.ts src/__tests__/workspace-history.test.tsx src/__tests__/workspace-selection.test.ts plus affected return/deep-link tests; pnpm typecheck; pnpm check:boundaries; pnpm check:ontology; targeted eslint; git diff --check.
5. Run tests/release-workspace-navigation.spec.ts on a disposable local dev server with fictional fixtures and no repository env. Observe Croki desktop/mobile, keyboard/focus and empty/error/loading/read-only. Record omissions separately; SQL/custom-client checks apply only if those contracts change.
6. Review final diff for identity, authority, acceptance versus verification, stale response, scope reset and compatibility. Commit only owned changes, push branch, draft PR against reborn-1.0, register it, queue exact coordinator handoff. Canonical PRODUCT_MODEL/strategic state remain untouched; return proposed evidence deltas.

## Handoff — implemented privately, October 9

The platform location owner now reads compatible hints, refuses unencodable
complete destinations, clears all owned destination detail on moves, and keeps
valid public-save hints and non-location preview context. Frame and App selection
consume those same reads. Strict return-target spelling and legacy aliases stay;
the already supported Needs you destination is now accepted through sign-in.
No URL, permission, membership or release hint grants authority.

App starts share one scope reset and destination write. Tracker/document/plan
and horizontal acknowledgements share one save transition. Starts, opens,
business switches and agency client openings push; saves replace creation.
Opening a resulting tracker from an experiment remains an open, preserving Back.
Stale callbacks must still belong to the current workspace and location. Public
save acknowledgements must identify the selected workspace before navigation.
Load-time reconciliation preserves valid same-work detail; malformed work stays
unavailable instead of quietly opening a different saved result.

### Retained evidence and limitations

Initial regression, at e9511b0 with the new test only: the System→workspace
switch assertion expected `searchParams.has("system")` to be false and received
true. Two existing offering regressions passed. Exact retained local log:
`/tmp/workspace-location-initial.log` (16:36:35, one failed/two passed).

Focused proof uses the real App/Layout with fictional request fixtures. Product
save tests replace product rendering with acknowledgement callbacks: they prove
App transition/history behavior, not product persistence. The agency test uses
a fictional queue response and the existing agency renderer. Sign-in proof
checks the encoded destination after a fictional 401; no Auth provider is used.

The final focused job covers the four required files, launch-return,
template-location, view-for-work, business-start, public-continuation and
workspace-exit-ui: 162 tests, including System switching, missing and
malformed links, all saved-kind mappings, product starts/saves, stale callbacks,
agency client openings, sign-in returns and foreign public-save acknowledgements.
Typecheck, targeted ESLint, product boundaries and ontology pass locally.
`git diff --check` and new relative Markdown links pass. The inventory’s unchanged
sibling marketing-audit link is unavailable from this isolated worktree.

The seven release-workspace-navigation browser cases pass with
`STRELVA_UI_PREVIEW=1 PLAYWRIGHT_BASE_URL=http://localhost:3187 PLAYWRIGHT_CHANNEL=chrome`.
The app was started with an empty inherited environment (`env -i`), only local
preview/telemetry/dist settings, and no repository env files. Browser proof
covers 1440px/390px System switching, reload, Back/Forward, empty/loading/error,
read-only and unavailable Systems; keyboard skip/focus and template Back; and
320px coarse-pointer navigation targets/reflow. Croki also inspected the actual
rendered desktop/mobile pages and retained screenshots. Browser fixtures never
qualify real Auth, providers, hosted delivery, persistence or production.

The first browser job could not launch the pinned Chromium shell (not installed).
The first Chrome job raced initial loading-shell replacement; ready-state waits
now precede focus and geometry assertions. A repeat showed that a visible
composer can still be disabled by the initial read; keyboard proof now waits
for the existing composer to be enabled before pressing Tab. A later state-case assertion matched
only exact text while the existing error includes a Retry control; it now checks
the visible error text. These were test setup/locator corrections; no geometry
or focus assertion was weakened. Logs remain in `/tmp/workspace-location-browser*.log`.
A concurrent dev/typegen job also produced a partial generated validator;
generated tsconfig additions were restored and clean typecheck passed.

SQL, custom-client compatibility, production build and hosted/browser Auth
proofs were not run: this stream changes no SQL, migration, /api/v1, provider or
permission contract. Required existing security/SQL checks are unchanged.

### Integration ownership and proposed evidence delta

Runtime source: +174 / −236 lines, net −62. Tests: +272 / −3.
Docs: +133 / −0. Owned files are location.ts, WorkspaceLayout.tsx,
workspace-selection.ts, WorkspaceApp.tsx, three focused test files,
release-workspace-navigation.spec.ts, this document and the relevant canonical
directory inventory paragraph. open-work.ts and its existing tests are retained.

WorkspaceApp overlap is narrowly the location import; load/restore;
navigation/start/save helpers; onNew/onWorkspace navigation props; experiment
onOpenTracker navigation callback; and history-state preservation in handoff
hash cleanup. Render dispatch and product composition are unchanged. The supplied
peer thread ID returned `thread_not_found`; the coordinator received the overlap.

Canonical PRODUCT_MODEL and shared strategic state were not edited. Proposed
behavior evidence: compatible location decoding/encoding prevents cross-place
System detail and keeps history/sign-in destinations coherent. This supports
prepared local reliability, not measured adoption or production readiness.
The current bet remains the selected Systems model; authority is unchanged.

Exact integration action: review/cherry-pick this stream commit into the isolated
integration branch; resolve the listed WorkspaceApp regions against opened-work
composition; rerun these ten focused test files, typecheck, boundaries, ontology
and the seven navigation browser cases on the combined source. Keep the two
existing popstate subscriptions (frame transient UI and App data reload) until
there is a measured reason to change them; their location rules are shared.
Existing offering `inquiryWorkspaceId` emission is outside this stream and still
needs its owner's semantic decision; strict returns continue to reject unknown
keys. No company/brand/pricing or authority decision is requested here.

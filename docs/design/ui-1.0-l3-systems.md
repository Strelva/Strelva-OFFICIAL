# L3 systems · UI 1.0 handoff

October 9, 2026 · isolated branch `ui/1.0-l3-systems` · no push, merge or deployment.

## Current objective and status

Recompose non-website Systems, Possibilities, Make real, Versions, Connections,
internal tools, spreadsheet imports, store reads and documents onto the paper kit.
The source is prepared and local code checks pass. All ten canon PNGs were opened
and inspected, but **no frame is visually complete**: browser access prevented
rendered comparison. Desktop, phone, dark, keyboard/focus and rendered state
verification remain unproven. The requested dev server was stopped. The changes are **not committed**: git
staging was denied by the filesystem sandbox before any index update.

The active product direction stays Systems, Connections, Possibilities and
Versions. Existing native commands, request transports, validation, permissions,
release flags, recovery and receipts remain the source of authority. New missing
capabilities are isolated fictional fixtures rather than invented production data.

## Frame coverage

Every row is **partial, unrendered**. The additional limits below are source limits,
independent of the missing screenshots.

| Frame | Source prepared / preview route | Remaining runtime gap |
| --- | --- | --- |
| `fhHa1` | Sessions calendar; `/preview/strelva/sessions` | Existing saved scheduling results use real windows/reservations. Canon visitor request/approval/connect presentation is fictional; native scheduling command forms retain their existing layout. |
| `f5ywBU` | Record list/detail/editor; `/preview/strelva/tool` | Real renderer keeps native permission and record commands. Canon matter content is fictional; no fabricated check result or Run check command. |
| `uKByO` | Live/candidate comparison, stale notice and safe visitor links; `/preview/strelva/possibility` | Full paired session pages are fictional. Real Systems show a recorded candidate if available and explicitly say when no live visitor preview is recorded. |
| `D3FVqz` | Recorded Make real progress uses `StSteps`; `/preview/strelva/making-real` | Five-step session delivery is fictional. Actual accepted outside effects and partial outcomes remain visible; no atomic provider promise. |
| `EJA7A` | Version comparison and per-Version improvement review; `/preview/strelva/versions` | Location comparison values are fictional. Real Version commands/reviews remain wired; the fixture exercises those UI contracts locally and keeps conflicts. |
| `Xysdf` | Connection contract/detail; `/preview/strelva/connection` | Actual recorded contract fields appear in non-website System disclosures. Actor/source/freshness/failure/recent evidence that is absent remains unavailable. Recent reads/writes in the canon are fictional. |
| `Z4ysc` | Signed Try shell/top bar and isolated submission; `/preview/strelva/try?state=sessions` | Canon calendar is fictional. Real signed token scope remains preview-only; Make real needs its separate approval link. |
| `irVxG` | Real CSV mapping/sample/fill counts; `/preview/strelva/import` | Skip columns, correcting three fictional dates and recipient choice are preview-only. Native CSV values remain text and every column is retained. No notification is sent. |
| `iBzca` | Read-only orders surface; `/preview/strelva/store` | Entire Square reader/order data is fixture-only. No authorized Square integration or new store data path was added; legacy Store was not changed. |
| `bAWa5` | Document editor/history/undo-last; `/preview/strelva/documents` | Real receipts and pagination remain wired. Who can open/opened is fictional or explicitly unavailable. Preview download is plain text; original DOCX download and restore of an arbitrary older revision are not provided. |

## Preview state entry points

Routes below are behind the existing `strelvaUiPreviewEnabled()` gate. Fictional
content lives under `src/experience/workspace/preview/`. The fixture shell labels
it fictional and keeps Ask Strelva local. Its missing workspace id avoids a real
brand-data read. No provider transport is introduced.

| Route | Query states supported in source |
| --- | --- |
| `/preview/strelva/sessions` | `state=ready,loading,empty,error,permission`; `mode=dark` |
| `/preview/strelva/tool` | `state=ready,loading,empty,error,denied,read-only`; `mode=dark` |
| `/preview/strelva/documents` | `state=ready,loading,empty,error,denied,read-only,history-loading,history-error`; `mode=dark` |
| `/preview/strelva/import` | `state=ready,loading,empty,error,denied,read-only`; `mode=dark` |
| `/preview/strelva/possibility` | `state=ready,stale,loading,empty,error,permission`; `mode=dark` |
| `/preview/strelva/making-real` | `state=ready,partly,loading,empty,error,permission`; `mode=dark` |
| `/preview/strelva/versions` | `state=ready,loading,empty,error,permission`; `mode=dark`; local per-location review |
| `/preview/strelva/connection` | `state=ready,loading,empty,error,permission`; `mode=dark` |
| `/preview/strelva/store` | `state=ready,loading,empty,error,permission`; `mode=dark` |
| `/preview/strelva/try` | `state=sessions,loading,ready,changed,expired` plus existing native page/booking/follow-up fixtures |
| `/try/[token]` | Existing changed/expired token states; new route loading and error/retry shells |
| Existing System page fixture | `/preview/strelva?makeReal=partly` keeps existing partial-outcome transport |

These states were source-inspected, not all rendered or individually exercised in
a browser. The signed Try token does not have owner approval permission. There is
no signed-Try permission mode that grants it.

## Shared changes

- [Kit.tsx](../../src/components/ui/strelva/Kit.tsx): nested `StPage` drops a second
  set of insets; `StSteps` gains `unverified` with “not yet confirmed” screen-reader
  copy. An accepted write with unavailable read-back must not be shown as failed
  or not started. CSS, [specimen](../../src/app/preview/strelva/kit/KitSpecimen.tsx)
  and [component inventory](component-system.md) were updated.
- [BoundedWorkExperience.tsx](../../src/experience/operations/BoundedWorkExperience.tsx):
  one import and one calendar render added to the existing schedule result.
- [SystemPanel.tsx](../../src/experience/systems/SystemPanel.tsx) and the context
  panels in [SystemPage.tsx](../../src/experience/systems/SystemPage.tsx) also serve
  website Systems. They now use kit sections/rows; the main website layout and
  website data paths remain intact. Existing website-panel tests pass, but its
  rendered effect needs coordination with L2.
- Public signed Try route loading/error files use the same presentation as the
  existing signed Try renderer. Token reading and approval routes were not edited.

## Local verification

`pnpm typecheck` completed with exit 0 after the final source changes:

```text
> next typegen && tsc --noEmit
✓ Types generated successfully
exit 0
```

The aggregate focused run covered System runtime/adapters/make-real, signed owner
links, website context panels, Version authority/conflicts, scheduling occupancy,
internal-tool edits, native CSV imports/changes/templates and document receipts:

```bash
pnpm vitest run \
  src/__tests__/systems-ui-1.0.test.tsx \
  src/__tests__/systems-experience.test.tsx \
  src/__tests__/systems-make-real-ui.test.tsx \
  src/__tests__/systems-runtime.test.tsx \
  src/__tests__/systems-stored-possibilities.test.ts \
  src/__tests__/systems-from-existing.test.ts \
  src/__tests__/make-real-owner-link.test.ts \
  src/__tests__/website-system-panels.test.tsx \
  src/__tests__/w6-version-management-ui.test.tsx \
  src/__tests__/w6-version-possibilities-ui.test.tsx \
  src/__tests__/l3-version-comparison-fixture.test.ts \
  src/__tests__/scheduling-calendar-display.test.ts \
  src/__tests__/bounded-scheduling.test.ts \
  src/__tests__/systems-canon-import-fixture.test.tsx \
  src/__tests__/document-history-experience.test.tsx \
  src/__tests__/internal-tool-use-edit-renderer.test.tsx \
  src/__tests__/tracker-import.test.ts \
  src/__tests__/tracker-engine.test.ts \
  src/__tests__/tracker-changes.test.ts \
  src/__tests__/workspace-document.test.ts \
  src/__tests__/tracker-templates.test.ts
```

```text
Test Files  21 passed (21)
     Tests  195 passed (195)
Duration  27.24s
```

After the final signed-Try loading/error addition:

```text
Test Files  1 passed (1)
     Tests  4 passed (4)
Duration  4.34s
```

Changed-file lint:

```text
ESLint exit 0 — 46 changed TS/TSX files
```

`git diff --check` is clean. No build, hosted browser test, provider delivery,
production permission or production behavior was proven.

### Retained failures and corrections

- An earlier aggregate run had 184 passing tests and one failing new assertion:
  “Done, not yet confirmed” was mapped to not started. The kit now has an explicit
  `unverified` step and the final aggregate passes.
- Intermediate typechecks failed while a parallel preview module was not yet
  present, and later on possibly undefined CSV fixture mapping values. Both were
  fixed before the final exit-0 run.
- Source review found the internal-tool presentation form disappeared after the
  first record, and invalid native imports hid the re-upload input. Both paths
  remain reachable now; focused regressions pass.
- The requested `CH=1 shoot.mjs` Chrome launch aborted before navigation
  (`SIGABRT`, cleanup `EPERM`). The computer-use fallback then rejected localhost
  access because the user declined permission. It explicitly forbade an alternate
  browser/CDP/indirect workaround; none was attempted.
- The local server logged Watchpack `EMFILE` and a `.next/dev` restart, then was
  stopped. No screenshot, HTTP/render success or pixel-match claim is made.

Browser evidence file (outside this repo, in the requested output directory):

```text
/Users/jacobrhinehart/Desktop/strelva/design/foundation/code-shots/L3-systems/browser-proof-blocked.txt
```

**Screenshot paths: none.**

Git staging also failed before changing the index:

```text
fatal: Unable to create '/Users/jacobrhinehart/Desktop/strelva/REB/.git/worktrees/REB-ui-L3-systems/index.lock': Operation not permitted
```

No commit was created and no alternate Git metadata path was used. A complete
tracked-and-new-file patch was saved for review. Its reverse check passes against
the current working tree; no patch was applied:

```text
/Users/jacobrhinehart/Desktop/strelva/design/foundation/code-shots/L3-systems/l3-systems.patch
```


## Spec conflicts and decisions

1. The D3FVqz “nothing half-live” aspiration conflicts with
   [systems-experience.md](../product/specs/systems-experience.md)'s explicit
   prohibition on claiming atomicity across providers. Actual partly-live effects,
   receipts and unavailable verification stay visible. An accepted outside change
   is not made retryable by a failed read-back. There is no fabricated rollback.
2. Z4ysc's Make it live control cannot be authorized by a preview-only signed Try
   token. It is disabled and names the separate approval link. The local fixture
   cannot widen the real token's authority.
3. irVxG proposes date coercion/skip/recipient choices that the real native CSV
   import does not implement. Those choices are fictional and local; real imported
   text and original source lineage are preserved.
4. iBzca depends on a Square reader not evidenced in this lane. The surface is
   fixture-only. No dependency, grant, secret, provider request or live store
   integration was added.
5. bAWa5 shows access/open events, original DOCX download and older-revision
   restore. Existing native document evidence does not support those claims. The
   real UI exposes unavailable access evidence and retains Undo last edit; fixture
   access/open history is labeled fictional.

## Exact next action

Restore write access to this worktree's Git metadata to stage only the file list
below and create the requested commit on `ui/1.0-l3-systems`. Suggested title:
`Recompose L3 Systems surfaces on the Strelva paper kit`. Do not apply the patch
to this already-modified worktree; it is a review/backup artifact.


Once localhost browser access is permitted, start the requested server only for
proof:

```bash
STRELVA_UI_PREVIEW=1 STRELVA_SYSTEMS_RELEASE=1 STRELVA_NEEDS_YOU_RELEASE=1 STRELVA_WORKSPACE_RELEASE=1 pnpm dev -p 3113
```

Run the user-provided `CH=1 shoot.mjs` command into
`design/foundation/code-shots/L3-systems/` for every route/state above at 1440 px
and `W=390 H=844`, plus dark where applicable. Inspect every screenshot against
its assigned canon PNG, fix composition differences, prove keyboard/focus and
empty/loading/error/permission behavior, then stop the server. Re-run relevant
checks for any resulting edits. Coordinate the shared kit/System panel effect
with L2. Keep fixture-only capabilities and the provider atomicity/token-scope
conflicts explicit. Do not merge or deploy this isolated work.

## Changed files

- [docs/design/component-system.md](../../docs/design/component-system.md)
- [src/__tests__/internal-tool-use-edit-renderer.test.tsx](../../src/__tests__/internal-tool-use-edit-renderer.test.tsx)
- [src/__tests__/l3-version-comparison-fixture.test.ts](../../src/__tests__/l3-version-comparison-fixture.test.ts)
- [src/__tests__/scheduling-calendar-display.test.ts](../../src/__tests__/scheduling-calendar-display.test.ts)
- [src/__tests__/systems-canon-import-fixture.test.tsx](../../src/__tests__/systems-canon-import-fixture.test.tsx)
- [src/__tests__/systems-ui-1.0.test.tsx](../../src/__tests__/systems-ui-1.0.test.tsx)
- [src/app/preview/strelva/connection/page.tsx](../../src/app/preview/strelva/connection/page.tsx)
- [src/app/preview/strelva/documents/page.tsx](../../src/app/preview/strelva/documents/page.tsx)
- [src/app/preview/strelva/import/page.tsx](../../src/app/preview/strelva/import/page.tsx)
- [src/app/preview/strelva/kit/KitSpecimen.tsx](../../src/app/preview/strelva/kit/KitSpecimen.tsx)
- [src/app/preview/strelva/making-real/page.tsx](../../src/app/preview/strelva/making-real/page.tsx)
- [src/app/preview/strelva/possibility/page.tsx](../../src/app/preview/strelva/possibility/page.tsx)
- [src/app/preview/strelva/sessions/page.tsx](../../src/app/preview/strelva/sessions/page.tsx)
- [src/app/preview/strelva/store/page.tsx](../../src/app/preview/strelva/store/page.tsx)
- [src/app/preview/strelva/tool/page.tsx](../../src/app/preview/strelva/tool/page.tsx)
- [src/app/preview/strelva/try/page.tsx](../../src/app/preview/strelva/try/page.tsx)
- [src/app/preview/strelva/versions/page.tsx](../../src/app/preview/strelva/versions/page.tsx)
- [src/app/try/[token]/error.tsx](../../src/app/try/[token]/error.tsx)
- [src/app/try/[token]/loading.tsx](../../src/app/try/[token]/loading.tsx)
- [src/components/ui/strelva/Kit.tsx](../../src/components/ui/strelva/Kit.tsx)
- [src/components/ui/strelva/kit.module.css](../../src/components/ui/strelva/kit.module.css)
- [src/experience/applications/ApplicationUseRenderer.tsx](../../src/experience/applications/ApplicationUseRenderer.tsx)
- [src/experience/applications/application-use.module.css](../../src/experience/applications/application-use.module.css)
- [src/experience/operations/BoundedWorkExperience.tsx](../../src/experience/operations/BoundedWorkExperience.tsx)
- [src/experience/scheduling/SchedulingCalendar.tsx](../../src/experience/scheduling/SchedulingCalendar.tsx)
- [src/experience/scheduling/calendar-display.ts](../../src/experience/scheduling/calendar-display.ts)
- [src/experience/scheduling/scheduling-calendar.module.css](../../src/experience/scheduling/scheduling-calendar.module.css)
- [src/experience/systems/ConnectionDetail.tsx](../../src/experience/systems/ConnectionDetail.tsx)
- [src/experience/systems/MakeRealProgress.tsx](../../src/experience/systems/MakeRealProgress.tsx)
- [src/experience/systems/PossibilityComparison.tsx](../../src/experience/systems/PossibilityComparison.tsx)
- [src/experience/systems/PossibilityTry.tsx](../../src/experience/systems/PossibilityTry.tsx)
- [src/experience/systems/StoreConnection.tsx](../../src/experience/systems/StoreConnection.tsx)
- [src/experience/systems/SystemPage.tsx](../../src/experience/systems/SystemPage.tsx)
- [src/experience/systems/SystemPanel.tsx](../../src/experience/systems/SystemPanel.tsx)
- [src/experience/systems/SystemVersionImprovements.tsx](../../src/experience/systems/SystemVersionImprovements.tsx)
- [src/experience/systems/SystemVersionManagement.tsx](../../src/experience/systems/SystemVersionManagement.tsx)
- [src/experience/systems/VersionComparison.tsx](../../src/experience/systems/VersionComparison.tsx)
- [src/experience/systems/connection-detail.module.css](../../src/experience/systems/connection-detail.module.css)
- [src/experience/systems/from-workspace.ts](../../src/experience/systems/from-workspace.ts)
- [src/experience/systems/model.ts](../../src/experience/systems/model.ts)
- [src/experience/systems/possibility.module.css](../../src/experience/systems/possibility.module.css)
- [src/experience/systems/store-connection.module.css](../../src/experience/systems/store-connection.module.css)
- [src/experience/systems/system-page.module.css](../../src/experience/systems/system-page.module.css)
- [src/experience/systems/try.module.css](../../src/experience/systems/try.module.css)
- [src/experience/systems/version-comparison.module.css](../../src/experience/systems/version-comparison.module.css)
- [src/experience/workspace/DocumentExperience.tsx](../../src/experience/workspace/DocumentExperience.tsx)
- [src/experience/workspace/TrackerExperience.tsx](../../src/experience/workspace/TrackerExperience.tsx)
- [src/experience/workspace/document-experience.module.css](../../src/experience/workspace/document-experience.module.css)
- [src/experience/workspace/preview/ApplicationUseFixture.tsx](../../src/experience/workspace/preview/ApplicationUseFixture.tsx)
- [src/experience/workspace/preview/DocumentHistoryFixture.tsx](../../src/experience/workspace/preview/DocumentHistoryFixture.tsx)
- [src/experience/workspace/preview/PossibilityCanonPreview.tsx](../../src/experience/workspace/preview/PossibilityCanonPreview.tsx)
- [src/experience/workspace/preview/SessionsCanonPreview.tsx](../../src/experience/workspace/preview/SessionsCanonPreview.tsx)
- [src/experience/workspace/preview/SystemsCanonShell.tsx](../../src/experience/workspace/preview/SystemsCanonShell.tsx)
- [src/experience/workspace/preview/SystemsDetailsPreview.tsx](../../src/experience/workspace/preview/SystemsDetailsPreview.tsx)
- [src/experience/workspace/preview/TrackerImportFixture.tsx](../../src/experience/workspace/preview/TrackerImportFixture.tsx)
- [src/experience/workspace/preview/possibility-canon.module.css](../../src/experience/workspace/preview/possibility-canon.module.css)
- [src/experience/workspace/preview/sessions-canon.module.css](../../src/experience/workspace/preview/sessions-canon.module.css)
- [src/experience/workspace/preview/system-details-fixture.ts](../../src/experience/workspace/preview/system-details-fixture.ts)
- [src/experience/workspace/preview/tracker-import-fixture.module.css](../../src/experience/workspace/preview/tracker-import-fixture.module.css)
- [src/experience/workspace/preview/version-comparison-fixture.ts](../../src/experience/workspace/preview/version-comparison-fixture.ts)
- [src/experience/workspace/tracker-experience.module.css](../../src/experience/workspace/tracker-experience.module.css)
- [docs/design/ui-1.0-l3-systems.md](ui-1.0-l3-systems.md) — this handoff

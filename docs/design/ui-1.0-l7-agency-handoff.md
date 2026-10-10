# L7 agency — implementation handoff

October 9, 2026. Isolated on `ui/1.0-l7-agency`, based on `ui/1.0-design`.
No push, merge, deployment, migration, provider write, email or commercial change.

## Current result and stop point

All 17 assigned canon renders were opened. Agency presentation is composed on
paper tokens and the shared kit. Existing transports, authorization, receipt
recovery and release checks remain. Clients retain scoped batched reads; a
failed client row shows its last good read from the current mounted visit,
explicitly stale. No previous read means Unknown, not zero. The cache does not
provide an automatic five-minute retry or durable history across navigation.

**No frame is visually accepted.** The mandated screenshot script failed before
navigation: Chrome exited with SIGABRT; process cleanup reported EPERM. Browser
Use then explicitly rejected access to `localhost:3117`, reporting that permission
had been declined and forbidding alternate browser workarounds. All further
browser attempts stopped. The development server was stopped. No 1440px, 390px,
keyboard/focus, overflow, dark-render or pixel-match claim is made.

## Frames and review entrances

All rows are partial until rendered comparison passes. Fictional preview data,
including all names, counts, dates and assumed results, is confined to the owned
`src/experience/workspace/preview` components and disclosed on each page.

| Frame | Surface and entrance | What is implemented; remaining limit |
| --- | --- | --- |
| H1 `xtlef` | `/preview/strelva/agency-portfolio?surface=home` | Kit overview fixture. Actual client reads are in AgencyHome; the current product uses Clients as the main entrance. |
| H2 `LTd5o` | `/preview/strelva/agency-canon?frame=client` | Fictional new-patient review; live managed and document website drafts now use kit. No real patient-intake build is claimed. |
| H3 `Nxtao` | `/preview/strelva/agency-canon?frame=requests` | Fictional across-client stages. Actual requests remain in the scoped Queue and existing service inbox; the stage board is preview-only. |
| H4 `nn4JU` | `/preview/strelva/agency-team?state=ready` | Real Team view on fictional transport; invitations, reach, roles, assignments, removal preserved. Actual roles differ from frame. |
| H5 `gAkfA` | `/preview/strelva/agency-verification?state=unverified` | Recorded per-effect verification and locked effects. No invented self-service verification procedure. |
| N4 `OuHYs` | `/preview/strelva/agency-canon?frame=approval` | Deliberate local owner approval rehearsal. Live website owner permission controls retain the existing owner-editor publication path. |
| AG1 `K5MHD` | `/preview/strelva/agency-portfolio?surface=clients` | Canon fixture includes Versions/minutes and Tuesday's last good read. Actual table uses existing summary fields and current-visit stale reads; no invented real portfolio numbers. |
| AG2 `wYXA0` | `/preview/strelva/agency-portfolio?surface=queue` | Canon grouped Queue fixture. Real Queue groups scoped existing kinds; delivery failures/bounces keep their existing paged read. Deadlines/reminder actions unavailable in current summary remain fixture-only. |
| AG3 `p3mZh` | `/preview/strelva/agency-library?surface=library` | Actual source revisions and Version status/conflicts use kit. Draft revision content remains fictional where current Library returns published revisions only. |
| AG4 `NGyFm` | `/preview/strelva/agency-library?surface=build` | Completed sentence-build result fixture. Actual Build retains executable funded WorkPlanExperience and authorized client selection. |
| AG5 `rOSFY` | `/preview/strelva/agency-library?surface=package` | Actual package action uses StHold and existing command receipt. Per-Version rehearsal/run-cost details are unavailable in current read and disclosed; complete rehearsal is fixture-only. |
| AG6 `L8mZA4` | `/preview/strelva/agency-library?surface=bulk` | Actual selected-ready offers use existing bulk API. Conflicts/missing accounts stay skipped with reasons; each owner decision stays separate. |
| AG7 `vivag` | `/preview/strelva/agency-library?surface=version` | Actual overrides, business accounts and releases use kit. Exact source-baseline values are not exposed by management read; full comparison is fictional. |
| AG8 `oPCqd` | `/preview/strelva/agency-canon?frame=minutes` | Fictional portfolio chart only; current agency-summary read exposes no per-client monthly-minute projection. No measured savings claim. |
| AG9 `eQWUh` | `/preview/strelva/agency-canon?frame=attribution` | Fictional source-use credit only; business-bringer attribution is a different contract. Rates/earnings remain placeholders. |
| AG10 `wuTH2` | `/preview/strelva/provider-change?role=agency&state=notified` | Existing notice/response controls on kit. Source/destination names, frozen Version, retained history and request handoff are fictional in preview; current read supplies notices/responses only. |
| PH4 `u6ziyu` | `/preview/strelva/agency-portfolio?surface=queue` at 390px | Responsive kit Queue composition prepared; actual phone render is unproven. |

Portfolio/library/canon previews support `state=loading|empty|error|permission`
and `mode=dark`. Team supports those state values plus `member`. Verification
also supports `partial|verified`. Provider change supports
`awaiting_policy|notified|loading|empty|error|permission` plus owner cancellation
with `role=owner`. Typed yes in every new composer records a preview request
only; it never approves, publishes or sends.

Actual integration entrance:
`/preview/strelva?scenario=agency&systems=on&agencyView=clients|queue|library|team|build|package`.
Existing `agency=loading|empty|error|delegated|library-empty|library-error|queue-permission`
fixtures remain. Systems off still suppresses the released agency places and commands.

## Kit and shared integration

`StTable` is the only new kit piece: native open table, row headers, optional
mono data columns, labeled records on phones, no boxed list. Specimen and
component inventory were updated. Shared shell/sidebar accept optional
`agencyNavigation`; WorkspaceLayout passes it only for agency members with
Systems released. Owner navigation remains the default. These three shared
files were changed minimally to connect the agency places and URL selection.

## Spec conflicts and unknowns

- Team frame says Builder/Viewer and Send invite. Runtime has Member/Admin and
  private invitation links; the runtime permission model wins. No email was enabled.
- Verification frame assumes a legal-name/domain/responsible-person procedure.
  Runtime records publish/Google/email/payments effect verification; criteria
  are not selected. UI reports recorded evidence and does not invent a submission.
- Queue frame headline says seven items but shows six. The canon portfolio
  fixture computes six from its rows. No invented seventh item was added.
- Canon's periodic stale-read retry is not a current API guarantee. The real
  view offers explicit Retry and retains a current-visit successful read only.
- Package and full baseline-comparison evidence are absent from the existing
  read contracts. Run cost stays a placeholder, not a price.
- Transfer fixture wording shows the intended future. Current provider-change
  response controls do not prove that the full transfer already operates.

## Verification

Local only, on this isolated lane:

```text
pnpm typecheck: exit 0
Test Files  22 passed (22)
Tests       166 passed (166)
ESLint:     38 TypeScript/TSX files, exit 0
git diff --check: exit 0
```

After the final permission-state/theme markup correction, the three affected
UI suites passed again: **3 files, 17 tests**; their targeted ESLint exited 0.

The Vitest command used `--maxWorkers=1 --testTimeout=30000` on the 22 affected
agency, provider Queue, shared-place/navigation, Version, package-recovery and
website permission suites. No API, SQL, provider or authenticated acceptance
claim is made. All permission boundaries exercised here are existing contracts;
no permission rule, API route contract, migration or release flag was changed.
The dev server reported EMFILE watcher failures while starting; that failure
is retained alongside the browser rejection, not counted as successful HTTP proof.
Earlier failures retained: client-list DOM assertion expected legacy list items
before adapting to native table rows; React ref lint caught rendering the stale
cache from a ref, corrected to scoped React state; typecheck caught passing the
string-bearing composer callback directly to a button, corrected to a click wrapper.
Focused tests cover batched reads and retry, stale-read preservation, selected-only
bulk preparation, duplicate submission, conflicts, native Version decisions,
package unknown-response recovery, scoped invitation roles/removal, effect locks,
provider-change gates, draft permissions and stale/revoked owner access.

## Commit blocker

Staging and the requested commit were attempted. Both failed before any index
change with:

```text
fatal: Unable to create '/Users/jacobrhinehart/Desktop/strelva/REB/.git/worktrees/REB-ui-L7-agency/index.lock': Operation not permitted
```

All 41 files remain unstaged on the correct branch. No commit was created.
The prepared commit message is `Recompose agency surfaces on the Strelva 1.0 kit`.
A read-only full patch, including new files, is retained at
`../design/foundation/code-shots/L7-agency/implementation.patch`.

## Next action

Render the routes above at 1440 and 390 when browser access is available,
including each state and keyboard/focus checks; compare every ready frame to
its opened canon render and fix differences. Capture to
`../design/foundation/code-shots/L7-agency/`. Then qualify the missing real read
projections before promoting their fictional structures into product behavior.
After visual correction and checks, stage the exact file inventory below and
commit when the worktree Git directory is writable. Do not merge or release
this lane as visually proven.

## Files changed

- [docs/design/component-system.md](../../docs/design/component-system.md)
- [src/__tests__/agency-canon-ui.test.tsx](../../src/__tests__/agency-canon-ui.test.tsx)
- [src/__tests__/agency-home-ui.test.tsx](../../src/__tests__/agency-home-ui.test.tsx)
- [src/__tests__/agency-library-selection-ui.test.tsx](../../src/__tests__/agency-library-selection-ui.test.tsx)
- [src/__tests__/agency-team-ui.test.tsx](../../src/__tests__/agency-team-ui.test.tsx)
- [src/__tests__/agency-verification-ui.test.tsx](../../src/__tests__/agency-verification-ui.test.tsx)
- [src/__tests__/strelva-agency-navigation.test.tsx](../../src/__tests__/strelva-agency-navigation.test.tsx)
- [src/app/preview/strelva/agency-canon/page.tsx](../../src/app/preview/strelva/agency-canon/page.tsx)
- [src/app/preview/strelva/agency-library/page.tsx](../../src/app/preview/strelva/agency-library/page.tsx)
- [src/app/preview/strelva/agency-portfolio/page.tsx](../../src/app/preview/strelva/agency-portfolio/page.tsx)
- [src/app/preview/strelva/agency-team/page.tsx](../../src/app/preview/strelva/agency-team/page.tsx)
- [src/app/preview/strelva/agency-verification/page.tsx](../../src/app/preview/strelva/agency-verification/page.tsx)
- [src/app/preview/strelva/kit/KitSpecimen.tsx](../../src/app/preview/strelva/kit/KitSpecimen.tsx)
- [src/app/preview/strelva/provider-change/page.tsx](../../src/app/preview/strelva/provider-change/page.tsx)
- [src/app/workspace/provider-change/ProviderChangeNotices.tsx](../../src/app/workspace/provider-change/ProviderChangeNotices.tsx)
- [src/app/workspace/provider-change/page.tsx](../../src/app/workspace/provider-change/page.tsx)
- [src/components/ui/strelva/Kit.tsx](../../src/components/ui/strelva/Kit.tsx)
- [src/components/ui/strelva/kit.module.css](../../src/components/ui/strelva/kit.module.css)
- [src/experience/agency-website/AgencyManagedWebsiteDraftExperience.tsx](../../src/experience/agency-website/AgencyManagedWebsiteDraftExperience.tsx)
- [src/experience/agency-website/AgencyWebsiteCustomerControls.tsx](../../src/experience/agency-website/AgencyWebsiteCustomerControls.tsx)
- [src/experience/agency-website/AgencyWebsiteDocumentDraftExperience.tsx](../../src/experience/agency-website/AgencyWebsiteDocumentDraftExperience.tsx)
- [src/experience/app-frame/StrelvaShell.tsx](../../src/experience/app-frame/StrelvaShell.tsx)
- [src/experience/app-frame/StrelvaSidebar.tsx](../../src/experience/app-frame/StrelvaSidebar.tsx)
- [src/experience/systems/SystemVersionImprovements.tsx](../../src/experience/systems/SystemVersionImprovements.tsx)
- [src/experience/systems/SystemVersionManagement.tsx](../../src/experience/systems/SystemVersionManagement.tsx)
- [src/experience/workspace/AgencyHome.tsx](../../src/experience/workspace/AgencyHome.tsx)
- [src/experience/workspace/WorkspaceLayout.tsx](../../src/experience/workspace/WorkspaceLayout.tsx)
- [src/experience/workspace/agency/AgencyAuthoring.tsx](../../src/experience/workspace/agency/AgencyAuthoring.tsx)
- [src/experience/workspace/agency/AgencyLibraryView.tsx](../../src/experience/workspace/agency/AgencyLibraryView.tsx)
- [src/experience/workspace/agency/AgencyOnboarding.tsx](../../src/experience/workspace/agency/AgencyOnboarding.tsx)
- [src/experience/workspace/agency/AgencyTeamView.tsx](../../src/experience/workspace/agency/AgencyTeamView.tsx)
- [src/experience/workspace/agency/AgencyVersionCreate.tsx](../../src/experience/workspace/agency/AgencyVersionCreate.tsx)
- [src/experience/workspace/agency/AgencyViews.tsx](../../src/experience/workspace/agency/AgencyViews.tsx)
- [src/experience/workspace/agency/ProviderClientQueue.tsx](../../src/experience/workspace/agency/ProviderClientQueue.tsx)
- [src/experience/workspace/agency/SourcePackageControls.tsx](../../src/experience/workspace/agency/SourcePackageControls.tsx)
- [src/experience/workspace/preview/AgencyCanonPreview.tsx](../../src/experience/workspace/preview/AgencyCanonPreview.tsx)
- [src/experience/workspace/preview/AgencyLibraryCanonPreview.tsx](../../src/experience/workspace/preview/AgencyLibraryCanonPreview.tsx)
- [src/experience/workspace/preview/AgencyPeoplePreview.tsx](../../src/experience/workspace/preview/AgencyPeoplePreview.tsx)
- [src/experience/workspace/preview/AgencyPortfolioPreview.tsx](../../src/experience/workspace/preview/AgencyPortfolioPreview.tsx)
- [src/experience/workspace/preview/agency-canon-fixture.ts](../../src/experience/workspace/preview/agency-canon-fixture.ts)

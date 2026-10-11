# L2 website integration · October 9, 2026

Branch: `ui/1.0-l2-website`, based on `ui/1.0-design`.
Objective: compose the website System and its owned controls on the paper kit,
while retaining existing API, routing, permission and uncertain-response contracts.

Source implementation is prepared and uncommitted. Git staging/commit was
attempted, but the filesystem sandbox refused creation of
`/Users/jacobrhinehart/Desktop/strelva/REB/.git/worktrees/REB-ui-L2-website/index.lock`.
The working changes remain unstaged; no commit was created. A complete prepared
patch is retained in `../design/foundation/code-shots/L2-website/prepared-source.patch`.

**No frame is visually accepted.** All fourteen
canon reference PNGs were opened; no implementation screenshot was produced.
The prescribed Chrome runner exited with SIGABRT before navigation. Computer-use
browser access then rejected localhost because permission was declined and explicitly
prohibited alternate surfaces or workarounds. All browser attempts stopped, and
the root-owned port3112 server was stopped. Desktop, phone and dark rendering,
actual keyboard use, reflow and comparison against canon remain unproven.

## Frames and boundaries

| Frames | Source prepared | Remaining gap |
| --- | --- | --- |
| eWqtI | Website-only System canvas with actual iframe, separate lifecycle/health, comparison and existing context; real rebuild review with one flagged fact at a time | SystemView lacks inline rebuild fact-review data; generic context remains. Rendered proof absent. |
| C6Scp, OiF5E, jnmS5 | Fictional Before/After page, ledger, held publish, staged read-back, receipt and Undo | Existing change-request receipts expose preview URLs and approval/deploy status, not a page line diff or these complete content-change receipts. Full composition remains fixture-only. |
| n5crO | Real retained drafts/history controls and fictional content-change history with preserved original receipt plus a new Undo receipt | Fixture's chronological content ledger is not a new durable production history contract. |
| DVwBO | Fictional Mediation sessions pause/resume with retained reservations | This frame concerns the booking System. A website pause stops Strelva changing the site; it does not take a custom-repo website offline. No new pause endpoint added. |
| jH56a | Fictional failing-check list and held rollback result | No new incident retry cadence or provider rollback implementation is claimed. |
| T00vYE | Real publication result uses page/source counts, read-back status and provider domain recommendations from saved records | Record cannot prove inquiry delivery or support “Undo everything”; those claims are omitted. |
| lNRUM | Existing PhotoLibrary uses kit loading, empty, error, upload and permission states; media API, Image and PhotoDetail retained | Full usage/description/PDF composition remains fictional. Current upload path accepts images. |
| NRUk3 | Existing settings panel uses kit and retains all blur-save settings keys | Existing settings are website voice/business details, not extracted fonts/colors. Full look frame remains fictional. |
| H0HBpJ | Existing collections use kit rows/editor and held publication; schemas, image picker, draft/edit/delete paths retained | Rich article/page/source-quote composition remains fictional. |
| KqcYl | Existing report and connected-site activity remain real consumers; full one-series chart/search/health composition prepared | Weekly visits and Search Console rows are not available to this System projection. Full frame remains fictional. |
| q6trU | Real connected-site installation, explicit verification and connected state use kit; readable public details and visitor-form controls retain recovery | Runtime requires meta plus script and explicit ownership verification. Canon's single line, first-visit listening and timed fallback are unsupported. |
| ydOpf | Read-only WebsiteDomainRecords accepts existing WebsiteDomainView and displays exact provider recommendations, domain verification and copy controls | Detailed standalone route is fixture-only. Per-record results, registrar, renewal date and visitor destination per hostname are unavailable. Mail records remain untouched. |

Every frame remains **partial** until visual proof completes. Unsupported data is
contained in explicitly fictional, gated `src/experience/workspace/preview` files.
No new provider, API, dependency, migration or production action was introduced.

## Local verification

The consolidated component run passed:

```text
Test Files  51 passed (51)
     Tests  526 passed (526)
```

After the final hold cancellation adjustment, affected consumers passed again:

```text
Test Files  4 passed (4)
     Tests  24 passed (24)
```

The final typed mock correction passed its two focused suites (9 tests).
Final local checks:

```text
pnpm typecheck: exit 0
✓ Types generated successfully
npx eslint: 49 changed TypeScript files, exit 0
git diff --check: exit 0
```

TypeScript emitted no compiler errors in the final run.

Retained failures: the broad first run had 517 passes and nine failures: eight
old capitalized History selectors and a lost retained-drafts status announcement.
Selectors now match sentence case and the status announcement is restored.
Type checking first observed concurrent/stale kit declarations, then corrupted
Next dev route types after the failed dev run, then an untyped new fetch mock.
The disposable `.next/dev/types` cache was removed with the server stopped and
regenerated; the mock now uses the fetch signature. No source authority test was
removed or relaxed. Hold tests now use the deliberate keyboard shortcut while
preserving exact command, uncertainty and current-access assertions.

## Shared files

The website-only branch of `SystemPage.tsx` changed; other System presentations
retain their existing branch. The existing website consumers `PhotoLibrary`,
`BrandKitPanel` and `CollectionsManager` changed with their paths and handlers
retained. Kit extensions preserve heading/button focus refs, external link
attributes and a stable hold accessible name. The hold uses the canon's 800ms,
checks current committed access/callbacks, cancels on focus loss/disabled access,
and cancels a simultaneous hold when the shortcut accepts. The specimen and
component inventory document those contracts.

## Exact next action

First, commit the prepared changes on `ui/1.0-l2-website` when the runtime permits
Git metadata writes. The intended message is “Recompose website Systems on the
Strelva 1.0 kit”; no Co-Authored-By trailer. Do not push or merge.

After browser access is authorized, run the specified four-flag dev command on
port3112 and the prescribed `shoot.mjs` runner. Inspect every 1440x900 and 390x844
image, including all loading/empty/error/permission states and review dark mode.
Fix differences, repeat affected tests/types/lint, and commit the visual corrections.
Do not promote this source as visually accepted or deploy it.

Preview entry points:

- `/preview/strelva/kit` and `?mode=dark`.
- `/preview/strelva/website-canon?view=review|published|history|pause|checks`;
  `state=ready|loading|empty|error|permission`, `mode=light|dark`.
- `/preview/strelva/website-panels?view=media|look|articles|results` with the same
  state/mode choices.
- `/preview/strelva/website-connect?state=install|empty|connected|permission|loading|error|unconfirmed|pending`;
  `visibility=1` selects readable details.
- `/preview/strelva/website-domain?state=ready|verified|empty|records-empty|loading|permission|error`.
- `/preview/strelva/rebuild?scenario=review|mooney|domain-pending|domain-error|read-only|loading|empty|failed|building`;
  add `mode=dark` for dark review.
- `/preview/strelva/workspace-site?kind=request&tab=request`; states include
  `ready|empty|error|permission|not_found`, roles include `owner|admin|member|operator`.
- `/preview/strelva/website-entry?entry=rebuild|connect` retains existing entry
  fixture options and adds paper light/dark mode.
- Actual System consumer:
  `/preview/strelva?scenario=mooney&systems=on&view=system&workspaceId=a0000000-0000-4000-8000-000000000001&system=5dc2b8ed-1e60-4e0d-9ad5-868afe4e4c6a`.
  Add `websiteDetail=loading|empty|error|permission`; `scenario=mooney-member`
  selects read-only.

Screenshot directory: `../design/foundation/code-shots/L2-website/`.
It contains the prepared patch and failure/status text, **no screenshot PNGs**. The root status file
is `browser-proof-status.txt`; launcher excerpts are `canon-proof-failures.txt`
and `connections-proof-failures.txt`.

Canonical product/model ownership remains with the main checkout's integration
owner. This isolated lane changes presentation and records preparation, not
production delivery, product promotion, economics or hosted acceptance.

## Changed files

- `docs/design/component-system.md`
- `docs/design/ui-1.0-l2-website.md`
- `src/__tests__/architecture-union-entrances.test.tsx`
- `src/__tests__/rebuild-postcommit-row-review.test.tsx`
- `src/__tests__/rebuild-recovery-independent.test.tsx`
- `src/__tests__/rebuild-uncertainty-recovery.test.tsx`
- `src/__tests__/strelva-website-kit.test.tsx`
- `src/__tests__/website-canon-preview.test.tsx`
- `src/__tests__/website-connection-composition.test.tsx`
- `src/__tests__/website-domain-records.test.tsx`
- `src/__tests__/website-entry-browser-fixture.test.tsx`
- `src/__tests__/website-library-kit.test.tsx`
- `src/__tests__/website-panels-preview.test.tsx`
- `src/__tests__/website-rebuild-experience.test.tsx`
- `src/__tests__/website-selector-uncertainty-peer.test.tsx`
- `src/__tests__/website-system-panels.test.tsx`
- `src/app/preview/strelva/kit/KitSpecimen.tsx`
- `src/app/preview/strelva/rebuild/page.tsx`
- `src/app/preview/strelva/website-canon/page.tsx`
- `src/app/preview/strelva/website-connect/page.tsx`
- `src/app/preview/strelva/website-domain/page.tsx`
- `src/app/preview/strelva/website-entry/page.tsx`
- `src/app/preview/strelva/website-panels/page.tsx`
- `src/app/preview/strelva/workspace-site/page.tsx`
- `src/components/dashboard/BrandKitPanel.tsx`
- `src/components/dashboard/CollectionsManager.tsx`
- `src/components/dashboard/PhotoLibrary.tsx`
- `src/components/dashboard/website-library.module.css`
- `src/components/ui/strelva/Kit.tsx`
- `src/experience/connected-sites/ConnectSiteExperience.tsx`
- `src/experience/connected-sites/ServerVisibility.tsx`
- `src/experience/connected-sites/connected-sites.module.css`
- `src/experience/systems/SystemPage.tsx`
- `src/experience/systems/WebsiteChangeAsk.tsx`
- `src/experience/systems/WebsiteSystemCanvas.tsx`
- `src/experience/systems/WebsiteSystemPanels.tsx`
- `src/experience/systems/website-panels.module.css`
- `src/experience/systems/website-system-canvas.module.css`
- `src/experience/websites/LegacyWebsiteRecoveryFixture.tsx`
- `src/experience/websites/RebuildExperience.tsx`
- `src/experience/websites/WebsiteArchivedVersions.tsx`
- `src/experience/websites/WebsiteChangeRequests.tsx`
- `src/experience/websites/WebsiteConnections.tsx`
- `src/experience/websites/WebsiteDomainRecords.tsx`
- `src/experience/websites/WebsiteEntry.tsx`
- `src/experience/websites/WebsiteExperience.tsx`
- `src/experience/websites/WebsiteFormsRecoveryFixture.tsx`
- `src/experience/websites/WebsiteRebuildReport.tsx`
- `src/experience/websites/WebsiteRebuildSharing.tsx`
- `src/experience/websites/WebsiteRoutingRecoveryFixture.tsx`
- `src/experience/websites/WorkspaceSiteFrame.tsx`
- `src/experience/websites/WorkspaceSitePreview.tsx`
- `src/experience/websites/rebuild-experience.module.css`
- `src/experience/websites/website-change-requests.module.css`
- `src/experience/websites/website-domain-records.module.css`
- `src/experience/websites/website-entry.module.css`
- `src/experience/websites/website-experience.module.css`
- `src/experience/websites/workspace-site.module.css`
- `src/experience/workspace/preview/WebsiteCanonPreview.tsx`
- `src/experience/workspace/preview/WebsiteConnectionPreview.tsx`
- `src/experience/workspace/preview/WebsitePanelsPreview.tsx`
- `src/experience/workspace/preview/website-canon.module.css`
- `src/experience/workspace/preview/website-panels-preview.module.css`

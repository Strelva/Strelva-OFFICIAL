# L13-rest · remaining Strelva 1.0 pages

October 9, 2026 · branch `ui/1.0-l13-rest` · local, uncommitted.

## Implemented in source

| Surface | Composition and preserved behavior | Nearest canon |
| --- | --- | --- |
| `/apps/[workId]` | System name/state, records first, kit entry/correction fields, open access/check rows; conflict drafts and revoke clearing retained | `fhHa1`, `f5ywBU` |
| `/custom-applications/[workId]` | Actual application iframe first, open artifact/access metadata, kit loading/refusal/error; sandbox, parent CSP and no-referrer retained | `fhHa1` |
| `/agency-applications/[workId]` | Working local draft preview first, kit field/view editor, open checks/review/history; exact grant, revision/check commands retained | `f5ywBU` |
| `/access-request` | StEntry, existing intake fields, selectable goals as open rows, sending/error/received states | `a0RLm` |
| `/workspace/claim/[token]` | StEntry, recipient/expiry/state words and marks, existing claim/sign-in continuation and ownership control | `WpFcd` |
| `/workspace/prospects` | Open responsive comparison table, source labels, real scores/dates, existing member reader and released add-client link | `K5MHD` |
| `/workspace/results` | Daily visit bars, open count/health rows, Search Console/sources, sampled answers and milestones; selected range/data/permissions retained | `KqcYl`, `AM2vD` |
| `/audit` | L10 public frame and entry/report composition, open checks, kit fields/states; scan, save and export handlers retained | `HOF2u`, `yJgHU` |
| `/home-finder/[bindingId]` | Existing search, listings, inquiry form and receipt on kit; entry renewal, listing token, consent, locked retry identity and receipt checks retained | Existing behavior only; no frame/spec invented |

No kit extension or dependency added. Redirect-only routes, dashboard and pay routes were not edited. No production/provider actions, commits, pushes, migrations or configuration changes.

## Partial or unproven

- **All rendered matching is unverified.** No desktop/390px screenshots, keyboard browser pass or measured contrast/reflow proof was obtained. Canon images were inspected; this does not establish a rendered match.
- **Standalone owner Ask is fixture-only.** The three application routes expose recipient/delegated grants, without an owner workspace identity or existing owner request path. UI changes did not infer membership or add that authority. The `role=owner` fictional preview supplies the floating scoped Ask bar; a typed yes produces no approval or native write. Resolve an owner-aware entry contract before adding it to the actual links.
- **The audit remains a website-health check.** Its backend does not sample Gemini answers. L10 composition is reused without inventing answer results; diagnostic copy is changed only when rendered, leaving API/export payloads intact.
- **Results use actual daily selected-window data.** The canon's illustrative twelve-week series and recap outcome counts are not fabricated. Booking-link/phone-link clicks remain distinct from confirmed bookings/calls. Search/visitor-source periods remain their existing last-four-week periods.
- Home Finder provider operation remains outside this UI proof. Mock delivery stays explicitly pending; no actual listing provider or inquiry destination was contacted.

## Reproducible fictional previews

All added routes require the existing `STRELVA_UI_PREVIEW` development/preview gate. Fictional values/transports live under `src/experience/workspace/preview/`.

| Route | Selectors |
| --- | --- |
| `/preview/strelva/l13-applications` | `kind=native\|custom\|agency`; `state=ready\|empty\|loading\|error\|denied\|read-only`; `mode=dark`; `role=owner` for fixture-only owner Ask |
| `/preview/strelva/l13-entry` | `view=access`: ready/loading/error/success; `view=claim`: ready/loading/submitting/success/expired/revoked/error/empty/permission |
| `/preview/strelva/l13-audit` | `state=entry\|result\|loading\|empty\|error\|permission` |
| `/preview/strelva/l13-results` | `state=loading\|empty\|error\|permission\|unavailable\|disconnected\|denied` or ready; `range=live\|week\|month`; `mode=dark` |
| `/preview/strelva/l13-remaining` | `surface=prospects`: ready/empty/loading/error/permission; `surface=home-finder`: entry/ready/empty/loading/error/permission; `mode=dark` |

Home Finder fixture URLs automatically run the fictional search except `state=entry`. Click **Ask about [Home address]** to inspect the inquiry and pending receipt. Submitting uses only the component's fictional transport. Other added fixtures retain or block their own existing actions; they do not provide alternate authentication.

## Verification

Combined targeted run (24 files):

```text
Test Files  24 passed (24)
     Tests  184 passed (184)
```

Final Home Finder subset after paper-shell imports: `Test Files 3 passed (3)`, `Tests 9 passed (9)`. Final standalone subset including owner Ask: `Test Files 1 passed (1)`, `Tests 10 passed (10)`.

Includes standalone/native renderer behavior, delegated revision/check permissions, application lifecycle, bounded handoff, intake/claim/export failure paths, existing audit/accessibility, owner results/range readers, prospects, Home Finder native/server/public boundaries and consent/retry behavior.

```text
pnpm typecheck: exit 0
ESLint: exit 0 (36 changed TypeScript files)
git diff --check: clean
```

Earlier typecheck runs found only undefined indexed mock-call accesses in the new tests. Those were fixed; the final full typecheck passes. Sentry deprecation and Node module-register/localStorage warnings are retained as warnings, not failures.

## Screenshot failure and next action

Output directory: `../design/foundation/code-shots/L13-rest/`. **No PNGs were created.** The requested `CH=1 node .../shoot.mjs` failed before navigation: Chrome exited `SIGABRT`. The dev server also reported Watchpack `EMFILE` warnings. Browser tool access then rejected opening localhost because permission was declined; no browser workaround was attempted. The lane's port-3123 dev server was stopped.

Jacob's next action: start the specified four-flag local server on port 3123, inspect `/preview/strelva/kit`, then capture each preview and applicable state at 1440 and 390, including dark where relevant. Compare the nearest canon references, fix visual differences, then commit the worktree. No visual acceptance or production readiness is implied by the checks above.

## Shared edits

- `src/experience/product/ProductShell.tsx`: one condition places `/audit` in the existing PublicFrame alongside the answer check.
- `src/experience/operations/BoundedWorkExperience.tsx`: optional `standaloneApplication` presentation branch, enabled only by the agency application route. Native write handlers and other presentation branches are retained.
- `ApplicationDraftPreview` and `ApplicationUseRenderer` are shared within the assigned applications area; previews now use kit geometry and soft submission controls.

## Files changed

- `docs/design/ui-1.0-l13-rest.md`
- `src/__tests__/l13-entry-public.test.tsx`
- `src/__tests__/l13-home-finder-ui.test.tsx`
- `src/__tests__/l13-remaining-presentation.test.tsx`
- `src/__tests__/l13-results-ui.test.tsx`
- `src/__tests__/public-audit-accessibility.test.tsx`
- `src/__tests__/standalone-applications-ui.test.tsx`
- `src/app/home-finder/[bindingId]/loading.tsx`
- `src/app/home-finder/[bindingId]/page.tsx`
- `src/app/preview/strelva/l13-applications/page.tsx`
- `src/app/preview/strelva/l13-audit/page.tsx`
- `src/app/preview/strelva/l13-entry/page.tsx`
- `src/app/preview/strelva/l13-remaining/page.tsx`
- `src/app/preview/strelva/l13-results/page.tsx`
- `src/app/workspace/prospects/loading.tsx`
- `src/app/workspace/prospects/page.tsx`
- `src/app/workspace/results/loading.tsx`
- `src/components/marketing/AccessRequestPage.tsx`
- `src/experience/applications/AgencyApplicationDraftExperience.tsx`
- `src/experience/applications/ApplicationDraftPreview.tsx`
- `src/experience/applications/ApplicationUseExperience.tsx`
- `src/experience/applications/ApplicationUseRenderer.tsx`
- `src/experience/applications/StandaloneApplicationShell.tsx`
- `src/experience/applications/application-use.module.css`
- `src/experience/applications/standalone-application.module.css`
- `src/experience/custom-applications/CustomApplicationUseExperience.tsx`
- `src/experience/enterprise/HomeFinderBuyer.tsx`
- `src/experience/enterprise/home-finder-buyer.module.css`
- `src/experience/operations/BoundedWorkExperience.tsx`
- `src/experience/places/ResultsRetry.tsx`
- `src/experience/places/WorkspaceResults.tsx`
- `src/experience/places/workspace-results.module.css`
- `src/experience/product/ProductShell.tsx`
- `src/experience/workspace/agency/AgencyProspectsView.tsx`
- `src/experience/workspace/agency/OwnerClaimAcceptance.tsx`
- `src/experience/workspace/preview/L13Applications.tsx`
- `src/experience/workspace/preview/L13AuditPreview.tsx`
- `src/experience/workspace/preview/L13EntryPreview.tsx`
- `src/experience/workspace/preview/L13RemainingPreview.tsx`
- `src/experience/workspace/preview/L13Results.tsx`
- `src/products/website-audit/WebsiteAuditPage.tsx`
- `src/products/website-audit/website-audit.module.css`

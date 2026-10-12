# L11 · merged UI repair and polish, October 9, 2026

Objective: make the reported merged-lane failures pass without losing behavior,
then complete the six requested polish items. Branch `ui/1.0-fix`; changes remain
uncommitted. The existing workspace-paper.css and strelva-sidebar.module.css
changes predate this work and were preserved. No dependencies or production
actions were introduced.

The selected 1.0 compositions remain intact. Sources of intent are the
[integration contract](./ui-1.0-integration.md), L1/L2/L3/L4/L6/L7/L10 handoffs,
and their product specs. The main checkout owns canonical PRODUCT_MODEL.md;
this worktree adds no competing model or change to product direction.

## Failure causes and repairs

| Reported failure | Cause | Repair |
| --- | --- | --- |
| agency-prospecting-copy: HTML/result agency branding | L10 replaced the generic sales paragraph with a focused fix CTA. | Assert exact Get this fixed link; retain agency credit/contact and unattributed-result isolation assertions. |
| agency-prospecting-copy: booking and uncertain coverage | L10 uses assistant, Available and Not verified; its heading lost the Strelva-only scope. | Restore through Strelva in heading, preserve singular/plural assistant grammar, assert explicit unchecked-other-provider coverage. |
| architecture-union-document: departed POST | L3 dropped the named document region and busy semantics; saved documents intentionally open for reading. | Restore named region and aria-busy. Retain all departure, receipt and navigation guards; verify reading mode and reopening the exact saved document for editing. |
| color-system: custom-property resolution | Test runtime contract omitted actual Next font variables; booking sessions referenced undefined --st-focus. | Register --font-workspace and --font-mono-st; use existing --st-accent focus role. |
| neutral-money-composition: physical ledger | Frozen historical354 was equated with current355 physical files. The lifetime-kind tail is separately registered and held. | Require exact historical354 plus the explicit tail, with forward/inverse hash pins and UNRUN/held status. Reject355 as historical qualification. No ledger or migration bytes changed. |
| owner-entry-homes-ui: permission/error/no-site | L4 intentionally changed membership guidance. | Assert exact membership invitation copy and workspace recovery link; retain error and no-site cases. |
| owner-entry-homes-ui: connected inquiries | StSection migration lost the original stable site heading ID; empty copy intentionally changed. | Restore sanitized anchor ID, retain reply link, assert exact new empty copy. |
| owner-journey-copy: retired onboarding | L6 moved invite-only title into StHead. | Assert exact StHead title and build-request link; retain retirement checks. |
| public-audit-accessibility: missing name | Kit supplies several aria-describedby IDs; test treated them as one. | Resolve every referenced node; assert linked alert and retained description, required/invalid state and no fetch. |
| public-audit-accessibility: invalid URL | Linked notice wraps its alert; test expected the wrapper itself to carry the role. | Assert exactly one associated alert, exact error, retained input and no fetch. |
| public-audit-accessibility: pending/server failure | L10 lost the live status announcement; canonical heading is now H1. | Restore role=status around steps; assert pending copy, H1 focus, restored form/input/focus and associated server alert. |
| systems-runtime: registry-only inquiry (true) | Same intentional L4 permission-copy change. | Assert exact invitation/recovery copy; retain release gate and endpoint checks. |
| systems-runtime: registry directory (undefined access) | Test opened view=work, now the separate Files view, and sought retired button labels. | Open view=apps; scope registry links and file buttons to their semantic sections. Retain identity, click and search checks. |
| systems-runtime: registry directory (delegated_read) | Same place/markup change. | Same precise directory assertions, with delegation retained. |
| systems-runtime: registry directory (provider_seat) | Same place/markup change. | Same precise directory assertions, with provider access retained. Add a separate Files-view regression. |
| workspace-history: agency client Back | L7 row button obtains its accessible name from rendered title/context, replacing aria-label. | Assert rendered title/client/request and retain all exact destination and Back checks. |
| workspace-read-only-copy: delegated business | L1 replaced Shared with you eyebrow with business H1 and delegation sentence. | Assert exact H1 and named delegating-business paragraph; retain read-only and release-off checks. |
| workspace-start: one request box | L1 changed page title and removed AI vocabulary. | Assert exact title/assistant wording, one textarea, concrete examples and absent proposal before submission. |

## Six polish items

1. Website System renders recorded agency attribution only; absent agency
   identity produces no owner warning.
2. Domain hostname stays mono and on one line. Status, authority and last-check
   date stack below, keeping the existing side column composition. A hostname
   longer than available width has bounded horizontal overflow within its row.
3. Real website System has StComposerDock + StComposerBar scoped to the System.
   It opens the existing Ask path, preserves entered words and disables on
   loading/read-only access. Typed yes files or approves nothing directly.
4. Live and preview Clients names use the existing ink 14/600 text-button tone;
   domain/detail remains muted.
5. Standalone Who decides renders one page title and one explanation. Embedded
   Business details retains the section title.
6. Admin-host entry uses saved business fontDisplay when present; Mooney preview
   uses Georgia/serif. Absent/failed theme read falls back without blocking entry
   or altering auth continuation. StEntry owns the optional brandFontFamily prop.

The [component inventory](./component-system.md) records changed contracts.

## Local proof

Reported failures plus website regressions:

```bash
pnpm test src/__tests__/agency-prospecting-copy.test.tsx src/__tests__/architecture-union-document.test.tsx src/__tests__/color-system.test.ts src/__tests__/neutral-money-composition.test.ts src/__tests__/owner-entry-homes-ui.test.tsx src/__tests__/owner-journey-copy.test.ts src/__tests__/public-audit-accessibility.test.tsx src/__tests__/systems-runtime.test.tsx src/__tests__/workspace-history.test.tsx src/__tests__/workspace-read-only-copy.test.tsx src/__tests__/workspace-start.test.ts src/__tests__/website-system-panels.test.tsx src/__tests__/website-system-ask.test.tsx
```

`Test Files 13 passed (13)` · `Tests 128 passed (128)`.

Related kit, Systems, documents, public and inquiry behavior:

```bash
pnpm test src/__tests__/strelva-kit-controls.test.tsx src/__tests__/strelva-website-kit.test.tsx src/__tests__/systems-ui-1.0.test.tsx src/__tests__/systems-experience.test.tsx src/__tests__/document-history-experience.test.tsx src/__tests__/answer-check-ui.test.tsx src/__tests__/inquiry-system-detail.test.tsx src/__tests__/inquiry-inbox-selection.test.tsx
```

`Test Files 8 passed (8)` · `Tests 62 passed (62)`.

Business/agency lane verification:

```bash
pnpm vitest run src/__tests__/workspace-history.test.tsx src/__tests__/workspace-read-only-copy.test.tsx src/__tests__/needs-you-policy-settings-ui.test.tsx src/__tests__/auth-access-pages.test.ts src/__tests__/authenticated-sign-in-continuation.test.ts src/__tests__/business-entry-ui.test.tsx --maxWorkers=1
pnpm vitest run src/__tests__/agency-home-ui.test.tsx src/__tests__/agency-home.test.ts src/__tests__/agency-canon-ui.test.tsx --maxWorkers=1
```

`6 files / 64 tests passed`; `3 files / 28 tests passed`.

`pnpm typecheck`: exit0; `Types generated successfully`; no compiler errors.
`npx eslint` on all30 changed TS/TSX files: exit0, no diagnostics.
`git diff --check`: exit0.

Full suite: `pnpm test` (output retained at `/tmp/strelva-l11-full-test.log`):

```text
Test Files  1153 passed | 4 skipped (1157)
     Tests  11104 passed | 50 skipped (11154)
  Duration  64.86s
```

Exit0. Existing skipped checks remain unexecuted; this result is local unit/
component/repository proof and grants no rendered or production qualification.

## Retained failure and exact next action

Rendered desktop/mobile verification remains **unproven**. The prescribed
Chrome screenshot runner exited with SIGABRT before navigation. The subsequent
browser tool rejected `http://localhost:3121` because permission was declined,
and explicitly prohibited alternate surfaces or workarounds. Browser attempts
stopped. No screenshot PNG was produced. Status is retained in
`../design/foundation/code-shots/L11-fix/browser-proof-status.txt`.
The dev server also reported EMFILE watcher failures and cache-restart warnings
during local checks; it was stopped. These are retained setup failures, not
evidence of a rendered page.

Next: after localhost browser access is allowed, render the website System at
1440 and390 (full/loading/empty/error/permission), the Clients table, Who decides
and admin-host entry. Check domain wrapping, dock placement, client type and
brand font, including keyboard/focus and mobile reflow. Also inspect restored
document region and public audit pending/error focus. These are local fixture
checks, not Auth/provider or production qualification. No commit, merge, push
or deployment is authorized by this handoff.

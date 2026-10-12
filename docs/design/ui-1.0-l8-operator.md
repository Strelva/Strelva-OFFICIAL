# L8 operator integration · October 9, 2026

Branch: `ui/1.0-l8-operator`. Objective: compose the five operations frames on
the paper kit while retaining all data paths, authorization, API contracts and
release gates. Local implementation only; no production actions authorized.

## Frame status

| Frame | Implementation | Remaining proof / limit |
| --- | --- | --- |
| `RpWy4` Queue | Real `QueueView`/`QueueBoard`, shared ink operator chrome; open rows, Now/waiting/closed groups, all existing source actions and counts retained | Desktop/390px rendered comparison blocked. Canon boxed list conflicts with the integration rule; open rows follow the contract. Existing mixed source authority remains legacy; this lane does not change it. |
| `pNg1m` Client | Real client detail puts release flags and owner invitation controls first; reason, exact four flag states, revisions, blockers, testers, History, trusted/second-operator invitation authority retained | Rendered comparison blocked. Older client controls remain in a disclosure. Local preview has fictional client content. Invitations remain behind their existing default-off release and never request email delivery. |
| `lRbrh` Convert | Fictional dry run, warnings, run again and hold-to-convert preview | Fixture-only. No admin conversion endpoint exists; product spec assigns conversion to authorized agency scope. No real records move. |
| `E8MFYs` Checks | Real every-site monitor, failures first then expiring/unknown/healthy, explicit unknown certificate/form measurements; scan endpoint retained | Rendered comparison blocked. Monitor measures site response and registry expiry, not certificate lifetime, form delivery or 30-day uptime. |
| `S706C` Ask on behalf | Fictional marked conversation, actor-named receipt and typed-yes refusal | Fixture-only. Real entry points to the ordinary business/agency workspace. Existing workspace Ask authority is retained; no privileged client-service route added. |

No frame is claimed visually complete. No dark canon was assigned to this lane;
the kit additions inherit light/dark roles but their rendered dark proof remains
unrun.

## Routes and states

- `/preview/strelva/operator-queue`: compact fictional canon specimen. `scenario=full`
  retains broad source fixture. Other scenarios: `empty`, `incomplete`, `loading`,
  `error`, `denied`.
- `/preview/strelva/operator-client`, `operator-convert`, `operator-checks`,
  `operator-ask`: ready, `scenario=empty|loading|error|denied`.
- All preview routes require development mode and `STRELVA_UI_PREVIEW=1`.
  New fictional data/transports and relocated queue fixture live under
  `src/experience/workspace/preview/`. Preview transports never call providers,
  storage or email. The old queue fixture import path remains a re-export.
- Real client detail and uptime routes have kit loading/error boundaries. Admin
  authentication and durable read admission stay in their existing owners.
- The global owner email display reads the existing pause state; it cannot change
  sending. During a pause, the older per-client controls cannot arm sending.

## Changed owners

- Admin frame: `layout.tsx`, `AdminRail.tsx`, `AdminMobileNav.tsx`;
  `experience/operations/OperatorFrame.tsx` and its two composition stylesheets.
- Queue: `QueueBoard.tsx`, `QueueView.tsx`, `QueueLoadState.tsx`.
- Client: detail page, loading/error boundaries, `ReleaseFlagsPanel.tsx`,
  `OwnerInvitationsPanel.tsx`, `OperatorControlsPanel.tsx`.
- Checks: `UptimeBoard.tsx`, loading/error boundaries; server reader unchanged.
- Preview: five operator routes and workspace preview fixture/components.
- Shared change, kept small: kit adds `StField`, `StToggle`, `StTable`/`StCell`
  and `StTextButton tone="text"`; specimen and component inventory updated.
- Focused UI tests: checks, release controls and queue composition. Existing
  owner invitation and queue/action/flag contract tests retained.

## Verification

Final focused operator suite:

```text
Test Files  12 passed (12)
Tests       156 passed (156)
```

Typecheck: `pnpm typecheck` exit 0 (`✓ Types generated successfully`, followed
by a successful `tsc --noEmit`). Changed-file ESLint exit 0. `git diff --check`
clean. Earlier checks caught and corrected a JSX parenthesis, fixture/test
undefined-value types and two unused imports; final checks passed.
Tests use synthetic inputs; no authenticated real-owner, provider, preview
deployment or production operation is proved.

Screenshots: none captured. Intended directory:
`../design/foundation/code-shots/L8-operator/`.
The prescribed `CH=1` screenshot runner aborted Chrome with SIGABRT before
opening a page; its installed Chromium fallback was absent. Browser fallback
reported **user declined permission** for local access. Further browser attempts
stopped. No rendered screenshot was viewed or compared; source canon renders
were inspected. Dev server on 3118 was stopped.

## Spec conflicts and next action

ADR 0013 / the operator spec amendment forbids platform operators selling to,
serving or converting clients. Conversion and on-behalf canon compositions are
therefore previews only. Real client work stays in ordinary agency/business
permissions. Existing queue/source authority is unchanged, with reconciliation
owned by its product/backend stream.

Next: allow local browser proof, start the prescribed isolated dev server on
3118, open `/preview/strelva/kit`, capture every frame/state at 1440 and 390,
inspect every screenshot against the assigned render, fix discrepancies, retain
keyboard/focus and interaction evidence, then update this handoff. No deploy,
merge, push, migration, env change or external send is part of that action.

## Commit stop point

Staging and commit were attempted after local checks passed. Git could not create
`/Users/jacobrhinehart/Desktop/strelva/REB/.git/worktrees/REB-ui-L8-operator/index.lock`
(`Operation not permitted`). No commit was created and no push was attempted.
Restore write access to this worktree's Git metadata, then stage the files below
and commit on `ui/1.0-l8-operator`. Do not merge or push.

## Exact changed files

- `docs/design/component-system.md`
- `docs/design/ui-1.0-l8-operator.md`
- `src/__tests__/operator-checks-ui.test.tsx`
- `src/__tests__/operator-queue-board-ui.test.tsx`
- `src/__tests__/operator-release-ui.test.tsx`
- `src/app/admin/AdminMobileNav.tsx`
- `src/app/admin/AdminRail.tsx`
- `src/app/admin/clients/[id]/OperatorControlsPanel.tsx`
- `src/app/admin/clients/[id]/OwnerInvitationsPanel.tsx`
- `src/app/admin/clients/[id]/ReleaseFlagsPanel.tsx`
- `src/app/admin/clients/[id]/error.tsx`
- `src/app/admin/clients/[id]/loading.tsx`
- `src/app/admin/clients/[id]/page.tsx`
- `src/app/admin/layout.tsx`
- `src/app/admin/queue/QueueBoard.tsx`
- `src/app/admin/queue/QueueLoadState.tsx`
- `src/app/admin/queue/QueueView.tsx`
- `src/app/admin/uptime/UptimeBoard.tsx`
- `src/app/admin/uptime/error.tsx`
- `src/app/admin/uptime/loading.tsx`
- `src/app/preview/strelva/kit/KitSpecimen.tsx`
- `src/app/preview/strelva/operator-ask/page.tsx`
- `src/app/preview/strelva/operator-checks/page.tsx`
- `src/app/preview/strelva/operator-client/page.tsx`
- `src/app/preview/strelva/operator-convert/page.tsx`
- `src/app/preview/strelva/operator-queue/fixture.ts`
- `src/app/preview/strelva/operator-queue/page.tsx`
- `src/components/ui/strelva/Kit.tsx`
- `src/components/ui/strelva/kit.module.css`
- `src/experience/operations/OperatorFrame.tsx`
- `src/experience/operations/operator-client.module.css`
- `src/experience/operations/operator-frame.module.css`
- `src/experience/workspace/preview/OperatorPreview.tsx`
- `src/experience/workspace/preview/operator-fixture.ts`
- `src/experience/workspace/preview/operator-queue-fixture.ts`

# L1 owner integration handoff · October 9, 2026

Objective: integrate the 23 owner canon frames on `ui/1.0-l1-owner`, preserving
current data, authority, flags and contracts. No deployment or merge is authorized.

The October 9 owner presentation uses the paper kit. Home shows Needs you,
Systems ordered by health group and name, the receipt feed, In progress, then
Files and results. **What changed** is the current receipt-place contract;
this October 11 text correction is not a new rendered proof. Ask uses the floating composer. Request detail uses retained dates for
its stage rail. Decisions keep their exact revision and authority checks and use
Hold controls. Search, business switching, Help, first run and phone navigation
use the existing routes and memberships.

## Frame ledger

**Rendered completion: none.** Every row below remains partial until actual
1440 px / 390 px comparison. Source canon renders were inspected by the root and
its three delegated lanes. Code and fixture preparation are distinct from that
missing rendered proof.

| Frame | Prepared surface | Remaining gap beyond rendered proof |
| --- | --- | --- |
| `V0rljZ` | BusinessHome A1 order, health/name sorting, dock | Header/sidebar remain the shared foundation; exact spacing unverified |
| `U4Va5` | Same Home with preview `mode=dark` and inherited paper tokens | Dark contrast and rendered matching unverified |
| `JI19w` | NeedsYouSection open rows, exact review lines and Hold | Decision data stays on existing needs-you API |
| `L4g0HR` | Real handled receipts + All receipts view; source-grouped fixture | Production projection has no source labels; real receipts remain a flat list |
| `aseNA` | Real DeliveryCommitmentPanel stage rail and scope; request fixture | Exclusions and conversation are fixture-only; no saved conversation API |
| `W0CoHN` | Real Running wrapper/picker; named-condition fixture | Canon maintenance freshness projection is fixture-only; detailed existing proof/editor bodies retained |
| `HQ5yA` | Real refusal routes to Needs you/Help; richer local alternatives | Rich refusal proposal and exact fees object are fixture-only |
| `M57QND` | Real Files and results directory with recorded dates | No creator identity in the current work payload; no invented attribution |
| `Y2Tn3F` | Actual Ask + fictional website receipt, ledger and Undo | Local fixture only; Before/After changes ledger, not embedded site source |
| `NGBdN` | Actual NeedsYouSection + proposed session form fixture | Session-form payload is fixture-only; no website/calendar write |
| `yBqc4` | Real Requests grouped by retained stage | Exact canon example content is fictional; not copied into product |
| `vwiLI` | Real Running wrapper/picker + named-condition fixture | Same live freshness gap as `W0CoHN` |
| `ABt1D` | Actual Ask + fictional sourced fact Edit/Remove/Confirm object | Fixture-only result object; production fact review stays in its existing area |
| `Q1IkY` | Actual scoped Ask + fictional session receipt/diff | Rich receipt payload fixture-only |
| `s7xyY` | Actual streaming working state + fictional steps/Stop | Native stream has a current label, not the full canon step projection |
| `E9H9d1` | Existing command search dialog on paper tokens + kit keys | Searches the existing item index; no additional receipt search backend |
| `LBP2f` | Membership-only switcher, recorded roles/access, settings links | Create-business API absent; truthful “Ask to add a business” goes to Help |
| `cvfYV` | WorkspaceStart centered first-run invitation and composer | Existing start entry retained; no new first-seen onboarding persistence |
| `T8pknG` | Actual Ask + fictional editable HR intake proposal/Hold | Fixture-only; no System or record saved |
| `YsBMM` | Real Help forms/providers/requests; fictional conversational Help | Invitation guidance/demo is fixture-only; no invitation or email sent |
| `luqhL` | Phone Home stacking, dock above four destinations | Touch, scroll, safe-area and screenshot matching unverified |
| `h171q` | Phone-capable proposed session decision fixture | Fixture-only form; Hold behavior code tested, touch rendering unverified |
| `M3TlL` | Phone-capable Ask, compact object layouts and navigation | Rich inline objects fixture-only; phone rendering unverified |

## Review routes and states

Run the exact local command from the lane brief only after local browser access
is approved:

```bash
STRELVA_UI_PREVIEW=1 STRELVA_SYSTEMS_RELEASE=1 STRELVA_NEEDS_YOU_RELEASE=1 STRELVA_WORKSPACE_RELEASE=1 pnpm dev -p 3111
```

- Home: `/preview/strelva?scenario=mooney&systems=on&needsYou=on&ask=on`.
  Add `mode=dark`, or `view=needs-you|requests|work|ask|help`.
- First run: `/preview/strelva?scenario=mooney-empty&systems=on&view=start`.
- Requests: `/preview/strelva/owner-request`; states
  `ready|proposed|asked|loading|empty|error|permission|readonly`, plus `mode=dark`.
- Running: `/preview/strelva/owner-running`; states
  `ready|loading|empty|error|permission`, plus `mode=dark`.
- Session decision: `/preview/strelva/owner-decision`; same five states,
  `mode=dark`, and `view=receipts` for source-grouped receipts.
- Rich conversation: `/preview/strelva/owner-conversation?frame=Y2Tn3F`.
  Frames `Y2Tn3F|Q1IkY|s7xyY|T8pknG|ABt1D|HQ5yA|YsBMM`; same five states,
  plus `mode=dark`. This route is development-only.
- Kit: `/preview/strelva/kit`, with `mode=dark` for dark.

New fixture transports terminate in memory. They never fall through to fetch.
Decision fixtures compose the real needs-you hook and UI; typed yes changes no
decision. Only the exact Hold control accepts locally. Account actions in the
new fixture pages are inert. The website iframe is sandboxed and uses an existing
fictional route.

## Local evidence and retained failures

All checks below are local, with the dev server stopped:

```text
pnpm typecheck                 exit 0
✓ Types generated successfully

Combined owner suite (including Running recovery):
 Test Files  25 passed (25)
      Tests  295 passed (295)

Final control retest after snapshot type correction:
 Test Files  1 passed (1)
      Tests  6 passed (6)

npx eslint <37 changed TS/TSX>  exit 0
git diff --check               exit 0
```

The owner suite includes the four new fixture/control files, real Home and
Needs you, draft continuity, Requests/delivery failures, Ask, Help, Start and
Systems behavior. Search matching/index reachability is covered by
`self-service-foundation.test.ts` (8 tests); dialog interaction itself still
needs the blocked browser pass. Running adds
`workspace-ongoing-recovery.test.tsx` and `inquiry-running.test.tsx`.
The suite emitted Node deprecation/localStorage warnings; the modified-link
preservation test also reached jsdom's unsupported native navigation. These
were warnings, not test failures.

The first local dev start produced EMFILE watch errors and restarts. Typecheck
while the dev server ran failed on generated `.next/dev/types/validator.ts`
route types and a missing test-only actor `localPreview` field. The actor was
fixed; the server was stopped; generated dev types were moved to
`/tmp/l1-owner-generated-dev-types-before-check`. Subsequent typechecks passed
before the final combined run. The added Home regression initially omitted
its required `systems`
release bit; typecheck caught it and the test snapshot was corrected. No source
route was removed to conceal these failures. The final check runs with the local dev server stopped.

Browser proof: IAB was unavailable. Chrome approval review rejected access to
`http://localhost:3111` because browser permission was declined, and prohibited
alternate browser/HTTP/CDP workarounds. An explicit local-screenshot permission
question remains unanswered. **No screenshots were captured or inspected.**
The server is stopped.

The pending [proof matrix](../../../design/foundation/code-shots/L1-owner/proof-matrix.json)
lists the 1440 × 900 / 390 × 844 URLs, state variants and interactions. It is a
plan, not screenshot evidence. After permission, run the lane’s specified
`shoot.mjs`, inspect every image beside its canon, fix differences, then update
this ledger with actual evidence. Keyboard, touch focus, loading/error/empty and
permission appearances still need that browser pass.

Final independent code review caught and corrected the unsent-draft stage,
retained scope display before acceptance, duplicated request-page padding,
fictional refusal navigation, phone Home receipt recovery, and an empty-progress
claim after a failed request read. The new Home regression test observes both
phone recovery and the failed-read state in the mounted component.

## Consequential choices and shared touches

- The Systems release flag still selects the new owner Home. Release-off Home
  keeps its earlier composition; authorization and release behavior remain.
- Lifecycle and health remain distinct. A proposed request is not agreed work;
  only recorded acceptance/start/result dates complete its stages.
- A1 follows the spec order; the alternative F1 map is not introduced.
- No new dependency, API contract, auth path, flag, migration, notification,
  production action or external message was added.
- Shared kit extensions are minimal: heading/button refs, contextual Hold label,
  blur cancellation, multiline composer/refs/bounds and modified-click row
  preservation. The specimen and component inventory are updated.
- Shared operations touches are confined to the owner request panel and the
  StandingResponsibilityPicker presentation. The delivery route wrapper loses
  redundant width/padding. Other native editors and proof bodies are retained.

## Commit stop and exact resumption

Staging and committing both failed with:

```text
fatal: Unable to create '/Users/jacobrhinehart/Desktop/strelva/REB/.git/worktrees/REB-ui-L1-owner/index.lock': Operation not permitted
```

The current branch is `ui/1.0-l1-owner`. The 52 changed files below remain
unstaged and uncommitted. The filesystem rejected the worktree Git write even
though that Git directory was listed as a writable root. Escalation is disabled
in this session. Do not change Git metadata or reset this worktree to get around
that restriction.

The original handoff named `/tmp/strelva-L1-owner.patch` for tracked edits and
new files. That temporary artifact is unavailable as of October 11; use the
original lane worktree and manifest below rather than a broken download link.
Do not apply the patch to that worktree again.
Once Git directory access is available, stage exactly the file manifest below,
run `git diff --cached --check`, then commit with:
`Recompose owner workspace with the Strelva paper kit`. No push, merge or deploy.
Separately, local browser permission is required for the pending render pass.

## Changed files

- `docs/design/component-system.md`
- `docs/design/ui-1.0-l1-owner.md`
- `src/__tests__/business-home.test.tsx`
- `src/__tests__/delivery-launch-ui.test.tsx`
- `src/__tests__/needs-you-home.test.tsx`
- `src/__tests__/owner-canon-preview.test.tsx`
- `src/__tests__/owner-conversation-preview.test.tsx`
- `src/__tests__/owner-decision-fixture.test.tsx`
- `src/__tests__/owner-paper-controls.test.tsx`
- `src/app/preview/strelva/kit/KitSpecimen.tsx`
- `src/app/preview/strelva/owner-conversation/page.tsx`
- `src/app/preview/strelva/owner-decision/page.tsx`
- `src/app/preview/strelva/owner-request/page.tsx`
- `src/app/preview/strelva/owner-running/page.tsx`
- `src/app/workspace/delivery/[requestId]/page.tsx`
- `src/components/ui/strelva/Kit.tsx`
- `src/components/ui/strelva/kit.module.css`
- `src/experience/ask/AskStrelva.tsx`
- `src/experience/ask/ask.module.css`
- `src/experience/operations/DeliveryCommitmentPanel.tsx`
- `src/experience/operations/ResponsibilityExperience.tsx`
- `src/experience/operations/delivery-panel.module.css`
- `src/experience/workspace/BusinessHome.tsx`
- `src/experience/workspace/NeedsYouSection.tsx`
- `src/experience/workspace/OwnerPhoneNavigation.tsx`
- `src/experience/workspace/WorkspaceBusinessSwitcher.tsx`
- `src/experience/workspace/WorkspaceComposer.tsx`
- `src/experience/workspace/WorkspaceHelp.tsx`
- `src/experience/workspace/WorkspaceHelpForm.tsx`
- `src/experience/workspace/WorkspaceLayout.tsx`
- `src/experience/workspace/WorkspaceOngoing.tsx`
- `src/experience/workspace/WorkspaceRequests.tsx`
- `src/experience/workspace/WorkspaceSearchDialog.tsx`
- `src/experience/workspace/WorkspaceStart.tsx`
- `src/experience/workspace/business-home.module.css`
- `src/experience/workspace/needs-you-section.module.css`
- `src/experience/workspace/owner-help.module.css`
- `src/experience/workspace/owner-phone-navigation.module.css`
- `src/experience/workspace/owner-start.module.css`
- `src/experience/workspace/preview/OwnerConversationPreview.tsx`
- `src/experience/workspace/preview/OwnerDecisionPreview.tsx`
- `src/experience/workspace/preview/OwnerRequestConversationPreview.tsx`
- `src/experience/workspace/preview/OwnerRequestPreview.tsx`
- `src/experience/workspace/preview/OwnerRunningPreview.tsx`
- `src/experience/workspace/preview/WorkspacePreview.tsx`
- `src/experience/workspace/preview/owner-conversation-fixture.ts`
- `src/experience/workspace/preview/owner-conversation.module.css`
- `src/experience/workspace/preview/owner-decision-fixture.ts`
- `src/experience/workspace/preview/owner-decision-preview.module.css`
- `src/experience/workspace/workspace-business-switcher.module.css`
- `src/experience/workspace/workspace-composer.module.css`
- `src/experience/workspace/workspace-search.module.css`

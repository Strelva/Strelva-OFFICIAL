# Website System stale workspace refresh — October 8, 2026

Stacked after `fix/journey-failures-501` at `f6e3e696`, in isolated branch
`fix/website-stale-refresh-501`. This is local implementation and verification;
no deployment, publication, new approval, provider change or production write.

## Observed defect and bounded repair

A signed workspace response can be computed against the old website System
revision, then arrive after a real website-detail request reconciles its
implementation into a newer revision. The page retained that old workspace
projection. The deterministic held-response regression failed before the repair:
`/tmp/website-stale-order-red.log`; the repaired request-order proof is
`/tmp/website-stale-order-green.log`.

Detail now reads the actor-scoped current System pointer after reconciliation.
The page compares it with the owning current workspace projection and requests
`GET /api/workspace?workspaceId=<business>&systemsReadOnly=1` on a difference.
This mode skips personal workspace creation and all writing possibility syncs.
It projects a moved saved baseline as Exploring with a re-review reason. It does
not change stored pins, status, candidate revision, history or decisions.

The refresh checks request generation, workspace, System, navigation, abort and
exact observed revision before accepting a response. Pending/error/unconfirmed
state blocks Make real. Switching workspace/System or unmounting aborts and
ignores old responses; retry reads current detail and current workspace again.
A saved-state read failure returns unavailable only in explicit read-only mode,
so derived Ready cannot replace unconfirmed saved pins. Ordinary owner/member
GET fallback remains compatible. Existing publication/owner gates remain.

## Proof matrix

| Evidence | Result | Limit |
| --- | --- | --- |
| Focused source and UI suite | 159/159 across eight files, `/tmp/website-stale-focused-final4.log` | Local unit/rendered DOM proof |
| Held old/new detail lifecycle guards | 11/11 cases, including foreign scope, failure/retry, stale response, switch and unmount | Mocked transport, actual WorkspaceApp |
| Read-only stored possibilities | No writer ports called, stored document and old pins unchanged; current view blocked | In-memory repository twin |
| Saved-state read failure | Explicit mode unavailable; ordinary owner/member fallback retained | Three service regression cases |
| Detail freshness | Pointer read after reconciliation, scoped actor/business/System; unavailable pointer omitted | Two loader cases |
| Authenticated browser subset | Owner1440/member390, 2/2 no retries in13.8s; `/tmp/website-stale-auth-proof2.log` | Receipt predates final fallback hardening and lower-panel screenshot adjustment; wrapper exit1 because broader profile deliberately excluded |
| Initial authenticated subset | 0/2, `/tmp/website-stale-auth-proof.log` | Owner first read Exploring before preparation recovery; member text expectation included an appended refresh claim. Failures retained, fixture explicitly qualifies genuine stored Ready before held response |
| Full14 flags-on run | Interrupted exit130 at first case, `/tmp/website-stale-full-final.log` | Disk reached36MiB; no final full-profile or flags-off claim for this stack |
| Typecheck | Passed `/tmp/website-stale-typecheck-final3.log` | Final source |
| Changed-file ESLint | Passed `/tmp/website-stale-eslint.log`, `/tmp/website-stale-eslint-final.log` | Changed source/test files |
| Product boundaries | Passed `/tmp/website-stale-boundaries.log` | Source/scripts including untracked files |
| Croki | Own tab opened real signed local workspace, held genuine old Ready response,1440resize | Host disconnected with `PreviewAutomationNoAvailableHostError` and explicit Do not retry before final inspection; no Croki screenshot claim |

Independent review found the persisted-state failure fallback and the mobile
capture below the visible panel; both are corrected. Final combined exact-SHA
browser qualification and retained lower-panel owner/member captures belong to
root integration. The original parent12/12 flags-on and8/8 flags-off proof stays
separate; original account-free approvals and generic unmapped Versions remain
unqualified as recorded in the parent handoff.

## Reproduction and next action

No dependencies added. Run declared source checks, then the isolated loopback
Auth/Postgres runner, with email disabled and provider credentials unset by its
bootstrap:

```bash
pnpm test src/__tests__/systems-readonly-failure.test.ts src/__tests__/website-workspace-refresh.test.tsx src/__tests__/systems-stored-possibilities.test.ts src/__tests__/website-system-panels.test.tsx src/__tests__/workspace-routes.test.ts src/__tests__/systems-projection.test.ts src/__tests__/website-system-detail.test.ts src/__tests__/systems-experience.test.tsx
pnpm typecheck
pnpm check:boundaries
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:journeys --keep-stack
```

The declared flags-on profile now includes the two new cases (14 tests total);
flags-off remains eight. For an intentionally limited reproduction:

```bash
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH JOURNEYS_PORT=3314 pnpm check:journeys --reuse <private-retained-stack-directory> --only on -- tests/website-stale-refresh-authenticated-local.spec.ts -g 'newer website detail'
```

That subset's wrapper exit1 reports the missing broader profile, even when both
new tests pass. Never print/source a live environment into this runner. The
retained environment file contains disposable keys and must remain private.

`tests/website-stale-refresh-authenticated-local.spec.ts` holds an unmodified
real signed Ready workspace response, performs newer actual detail
reconciliation before fulfilling it, then asserts one read-only refresh,
disabled Make real, no workspace mutations, unchanged saved candidate/pins and
no horizontal overflow. The screenshot explicitly scrolls the stale Possibility
into view at390px. Root should copy captures out of `test-results/journeys-on`
before a later runner clears that directory.

Next: root cherry-picks the isolated commit with Ask setup, applies the same
`canWrite && !readOnly` guard to its new sync call, runs14-on/8-off at the combined
SHA once capacity is free, and inspects both retained screenshots. A material
moved baseline still requires a separately reviewed current candidate; this
repair supplies no authority to repin, approve or publish it.

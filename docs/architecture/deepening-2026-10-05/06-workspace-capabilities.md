# Workspace permissions

Status: proposed · 2026-10-05 · candidate 6 of 9 · source: architecture review

## What it is

One answer to "what can this person do in the workspace they have open, and if
not, why not". Today seven files find the current workspace again
(`WorkspaceApp.tsx:241`, `WorkspaceLayout.tsx:126`, `BusinessHome.tsx:51`,
`AgencyHome.tsx:76`, `agency-home.ts:49`, `result.ts:261`,
`app/api/workspace/route.ts:192`). From kind, role, access and exit state they
each rebuild their own flags. `delegated_read` appears 23 times in 11 files
under `src/experience`. The module computes those facts once, on the server,
next to the code that already decides work access, and hands the browser the
answer.

**Renamed from "workspace capabilities".** "Capability" already means a product
capability (the inquiry capability, `src/server/capabilities.ts`). I rejected
"standing" because Ongoing uses it (`selectedStandingId`, `WorkspaceOngoing.tsx`).
"Authority" belongs to `WorkAuthorityPanel` and candidate #9, and "allowance"
belongs to `WorkspaceAllowanceSummary` (billing). "Permission" fits. The
tenant model already uses the word the same way (`requireTenantPermission`).

## Language

**Workspace kind**:
Whose workspace it is: one person's own (personal), an agency's, or a business's.
_Avoid_: client workspace, tenant, account, customer workspace (in UI copy; `customer` stays as the stored value)

**Business workspace**:
The workspace of one customer business. Its records stay separate from every other business.
_Avoid_: customer workspace, client, tenant, site

**Workspace role**:
The rank a direct member holds in a workspace: owner, admin or member.
_Avoid_: viewer, editor (those are legacy tenant roles), seat, permission level

**Membership**:
A person's direct place in a workspace, which always carries a workspace role.
_Avoid_: access, seat, join

**Delegated read**:
Read-only sight of a business workspace that the business grants to an agency. Every member of that agency gets it. It carries no role, and nobody gets to operate anything through it.
_Avoid_: shared access, agency access, read access, Assignment

**Work access**:
How the viewer relates to one piece of saved work: owned (in their personal workspace), member, delegated read, addressed (an incoming handoff), or public.
_Avoid_: access (without the qualifier), ownership, sharing

**Workspace permission**:
One named thing a person may do in the open workspace, such as creating work or managing who works on something.
_Avoid_: capability, ability, authority, standing, allowance, flag

**Stopped workspace**:
A workspace whose exit has completed. Its records stay readable, and no new work can start.
_Avoid_: closed, deleted, archived, frozen

**Unconfirmed exit**:
The state where Strelva could not check whether a workspace has stopped, so changes pause until it can.
_Avoid_: unknown, error state, stopped

**Read-only reason**:
The single most important reason this person cannot change the open workspace. It is one of four: delegated read, stopped, unconfirmed exit, or role.
_Avoid_: disabled reason, lock, error

Relationships. Delegated read is narrower than an **Assignment** (CONTEXT.md).
An Assignment lets someone operate specified work. Delegated read lets an
agency look and nothing else. That matches the ADR 0010 split: the business owns
the record, and the agency holds a provider seat only when work is assigned.
The deep-module review line holds here: "Handing over a copy differs from
granting read access." A handoff produces *owned/member* work in the
recipient's workspace. Delegated read produces *delegated_read* work in the
customer's workspace.

## Scenarios

| Scenario | Today (verified) | With the module |
| --- | --- | --- |
| Agency member opens a client business they were delegated, then tries to save a public scan result | `WorkspaceApp.tsx:601` passes `member`, not `delegated_read`. The server refuses earlier, because `usecase.ts:122` requires `access === "member"`, so the user gets the save error. The missing branch can't be reached. | `can.save_public_result` is false. The save button never shows and the reason reads "Read-only access granted by the customer". |
| Member of a business workspace runs an AI Visibility assessment | `WorkspaceApp.tsx:721` passes `owned`. The browser ignores it (`result.ts:228` returns early because the server already attached `assessment`). The server presented the work without access (`route.ts:289`), so it defaults to `owned` (`presentation.ts:77`). After a reload the same item says `member` (`route.ts:250`). The user sees nothing different, because `owned` and `member` produce the same action map (`assessment/contracts.ts:112`). | POST responses carry the server's work access. The item is `member` both before and after a reload. |
| Owner of their personal workspace | Work access is `owned`, via `kind === "personal"`. The rule is coded in three places (`route.ts:250`, `result.ts:263`, `WorkspaceApp.tsx:601`). | Derived once. `workAccess: "owned"`. |
| Business owner's workspace has stopped (exit completed) | `WorkspaceApp.tsx:105-106` and `WorkspaceLayout.tsx:127-129` compute it twice. `BusinessHome.tsx:52` ignores exit. That is safe only because `WorkspaceLayout.tsx:420` never renders BusinessHome when exit blocks changes. The Help/service request (`WorkspaceLayout.tsx:130`) also ignores exit and is hidden by the `stoppedHome` swap at `:449`. | `exit: "stopped"` and `readOnlyReason: "stopped"`. `can.request_service` is false on its own merits, so neither render guard is load-bearing. |
| Exit check fails for an owner | The route sets `unavailable` (`route.ts:203`), and both files fail closed. The copy at `WorkspaceLayout.tsx:403` says "temporarily unavailable". | `exit: "unconfirmed"` and `readOnlyReason: "exit_unconfirmed"`, with one copy table. |
| A business member with no admin role opens Home | `BusinessHome.tsx:95` tells read-only viewers "Only {name} owners can make changes". Admins and members can make changes too, so the label is wrong. Members also lose Ongoing (`WorkspaceApp.tsx:744`) and custom apps (`:753`) with no stated reason. | `readOnlyReason: "role"` for those two permissions. The copy says "Ask an owner or admin". |
| Delegated reader opens "Check a business" | `WorkspaceLayout.tsx:403/409/412` say "Switch to a workspace you own to create…". Any membership is enough, ownership isn't needed. That is the second wrong label. | Copy comes from `readOnlyReason: "delegated_read"`: "Switch to a workspace you're a member of". |
| Admin and owner manage work authority | `WorkspaceApp.tsx:579/757` repeat `owner \|\| admin`. The server repeats `["owner","admin"]` (`repository.ts:456,487,501`), as do 42 SQL gates in migrations. | `can.manage_work_authority` comes from the same role table that #9 uses on the server. |
| Switch from personal to an agency, then to a delegated business | Every surface recomputes from `snapshot.workspaceId`. AgencyHome guards `kind === "agency" && access !== "delegated_read"` (`AgencyHome.tsx:104,122,144`). That pair can't happen, because `repository.ts:206` only delegates business workspaces. | A new snapshot brings new permissions. Agency loads key on `can.view_agency_clients`. |

## Contradictions in the code

1. **Browser-side access options are dead for server work.** `normalizeWorkspaceWork` returns early when `work.assessment` exists (`result.ts:228`), and the server always attaches it. So `assessmentAccessForSnapshot` (`result.ts:260`) and both call sites in WorkspaceApp change nothing. The real gap is on the server: POST `assess`, `recover_assessment`, `save_website_audit` and `save_public_result` call `presentWorkspaceWork(work)` with no access (`route.ts:289-301`), which falls back to `owned`.
2. Two wrong user-facing labels: `BusinessHome.tsx:95` ("Only owners…") and `WorkspaceLayout.tsx:403,409,412` ("a workspace you own").
3. Undocumented render invariants. BusinessHome's `readOnly` (`:52`) and `canSaveServiceRequest` (`WorkspaceLayout.tsx:130`) both skip exit. They are correct only because of `WorkspaceLayout.tsx:420` and `:449`.
4. One concept travels two channels: Ongoing gets `readOnly` (role/delegation) and `newWorkBlocked` (exit) as separate props (`WorkspaceApp.tsx:744-745`).
5. `not_owner` is in the exit read-status type (`contracts.ts:126`, `workspace-exit-ui.ts:3`), but the GET route always overwrites it (`route.ts:195-212`), so the browser never receives it.
6. "access" means two things: workspace access (`member | delegated_read`, `contracts.ts:12`) and work access (`owned | member | delegated_read | addressed | public`). `owned` means "personal workspace", not "owner role". A business owner's work is `member`.
7. Workspace roles (owner/admin/member) and tenant roles (viewer < editor < admin < owner, `auth-tenancy-architecture.md:35`) share two names with different ranks.

## Interface

**A. Pure projection in the browser.** `workspacePermissions(snapshot)` is
called once in WorkspaceApp. It is small, but it copies the role rules again in
the browser and can't fix gap 1.

**B. Server-computed field on the snapshot (recommended).** `/api/workspace`
attaches `permissions` from the same pure function that chooses work access for
`presentWorkspaceWork`. POST responses use it too. The browser stops deriving
anything.

**C. Hook/context.** `useWorkspacePermissions()` wraps A or B. This is a
delivery choice, not a design. Add it later if prop-threading hurts.

```ts
// src/platform/workspaces/permissions.ts — pure, no I/O, imported by server and preview fixture
export type WorkspacePermission =
  | "create_work" | "run_assessment" | "save_public_result"
  | "manage_ongoing" | "manage_custom_apps" | "manage_work_authority"
  | "request_service" | "view_deliveries" | "manage_offerings"
  | "view_work_budget" | "recover_calendar" | "view_agency_clients";

export type ReadOnlyReason = "delegated_read" | "stopped" | "exit_unconfirmed" | "role";
export type WorkspaceExitPosture = "active" | "stopped" | "unconfirmed";

export interface WorkspacePermissions {
  workspaceId: string;
  kind: "personal" | "agency" | "customer";
  via: "membership" | "delegated_read";
  role: "owner" | "admin" | "member" | null;
  workAccess: "owned" | "member" | "delegated_read";
  exit: WorkspaceExitPosture;
  can: Readonly<Record<WorkspacePermission, boolean>>;
  /** Present for every permission that is false. */
  deniedBecause: Readonly<Partial<Record<WorkspacePermission, ReadOnlyReason>>>;
  /** Workspace-level headline reason; null when create_work is allowed. */
  readOnlyReason: ReadOnlyReason | null;
}

export function projectWorkspacePermissions(input: {
  workspace: { id: string; kind: WorkspacePermissions["kind"]; access: "member" | "delegated_read"; role?: WorkspacePermissions["role"] };
  exitReadStatus: "available" | "completed" | "unavailable";
  exitState?: { status: string } | null;
  localPreview: boolean;
}): WorkspacePermissions;

// WorkspaceSnapshot gains:  permissions: WorkspacePermissions
```

## Behind the seam

- One table, `ROLE_PERMISSIONS: Record<WorkspaceRole | "delegated_read", readonly WorkspacePermission[]>`. Candidate #9 reads the same table in `requireMember` → `requirePermission(actor, workspaceId, permission)`. The browser projection is that table, narrowed by kind (for example, `request_service` only for business workspaces) and by exit.
- Precedence for `readOnlyReason`: delegated_read > exit_unconfirmed > stopped > role. That way a delegated reader is never told about another business's exit.
- `workAccess` replaces the three inline ternaries (`route.ts:250`, `result.ts:263`, `WorkspaceApp.tsx:601`) and is passed to every `presentWorkspaceWork` call in the route.
- `exit` absorbs `workspace-exit-ui.ts`. The `not_owner` variant disappears.
- SQL stays the enforcement point. A SQL check asserts that the table and the role gates in migrations agree, so the projection can't drift from what Postgres enforces.

## Tests

- **Table test** over kind {personal, agency, customer} × via/role {owner, admin, member, delegated_read} × exit {active, stopped, unconfirmed}: 36 rows. The 6 impossible ones (personal or agency with delegated_read) must throw, and the other 30 are checked. Each row checks `can`, `workAccess`, and `readOnlyReason`.
- **Locally created = server-loaded**: run `assess` and `save_public_result` through the route as a business-workspace member, then GET the snapshot. Assert that the work's `assessment.access` is identical in both responses. This fails today (`owned` vs `member`).
- **Exit without guards**: render BusinessHome and Help with `exit: "stopped"` and no WorkspaceLayout. Assert there are no mutation controls, which proves invariants 3 and 4 no longer depend on the parent.
- **Copy**: one snapshot per `ReadOnlyReason`. None contains "you own" or "Only … owners".
- Extend `src/__tests__/workspace-presentation.test.ts` and `workspace-exit-ui.test.tsx`, and delete their assertions on the inline flags once the move lands.

## Migration steps

1. **Fix the two wrong labels** (copy only): `BusinessHome.tsx:95` becomes "Only members of {name} can make changes", and `WorkspaceLayout.tsx:403/409/412` become "a workspace you're a member of". Add one test per label.
2. Pass server work access to every POST `presentWorkspaceWork` call (`route.ts:289-301`). Delete the `access` arguments at `WorkspaceApp.tsx:601,721` and `assessmentAccessForSnapshot`, which are dead. Add the "locally created = server-loaded" test.
3. Add `projectWorkspacePermissions` and the table. Attach `permissions` to the GET snapshot and to the preview fixture.
4. Move consumers one file at a time: WorkspaceApp, then WorkspaceLayout, BusinessHome, AgencyHome/agency-home, WorkspaceBusinessSettings, WorkspaceAccess. Each step deletes that file's `delegated_read` and role checks.
5. Collapse Ongoing's `readOnly` and `newWorkBlocked` into `can.manage_ongoing` plus `deniedBecause`.
6. With #9, point `requireMember(…, roles)` at the same table and add the SQL agreement check.

## Decisions worth an ADR

**The server is the only source of workspace permissions; the browser never
derives them.** It is hard to reverse once every surface reads
`snapshot.permissions`. It is surprising, because the code comments call access
"presentation only". The trade-off is real: a round trip for every workspace
switch, and a contract field on `/api/workspace` to keep additive. In
exchange, permissions can no longer differ between the browser and the server.

## Open questions for Jacob

1. Should a business workspace **member** (not admin) be able to set up Ongoing work and custom apps? Today the browser says no (`WorkspaceApp.tsx:744,753`). I found no matching server check in `repository.ts`, so either the UI is too strict or the server is too loose.
2. Should delegated read stay all-or-nothing for every member of an agency (`repository.ts:198-209`)? Or should a business be able to delegate to named agency people, which would make it an Assignment?
3. When a business has stopped, should admins and members see why (the stop banner), or only that changes are paused? Today non-owners get only the completion bit (`route.ts:206`).

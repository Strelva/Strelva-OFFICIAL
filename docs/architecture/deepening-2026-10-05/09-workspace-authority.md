# Workspace authority

Status: proposed · 2026-10-05 · candidate 9 of 9 · source: architecture review

## What it is

One module answers "may this person do this in this workspace?" Today the
answer is written by hand in eight places, read from `workspace_memberships`
four different ways, and enforced a second time (or not at all) by SQL.

The review found something sharper than duplication. Most workspace writes are
gated twice: once in TypeScript and again inside a SECURITY DEFINER function.
Six write paths are gated only in TypeScript, and they reach Postgres through
the service-role client, which skips RLS. For those six, the app check is the
only gate (see SQL parity).

The module is one role-to-permission table, which candidate #6 projects into the
browser, plus one read of the actor's membership. A single SQL function mirrors
the table, and a parity test proves the two agree.

## Language

**Membership**:
A person's direct place in a workspace, which always carries a workspace role.
_Avoid_: access, seat, join

**Workspace role**:
The rank a direct member holds in a workspace: owner, admin or member.
_Avoid_: viewer, editor (legacy tenant roles), permission level

**Workspace permission**:
One named thing a role allows in a whole workspace, such as managing the calendar connection. It lasts as long as the membership and has no budget or expiry.
_Avoid_: capability, ability, scope, grant, Assignment

**Assignment**:
A person's or agent's explicit permission to operate specified work within agreed limits and time. A holder of the right permission gives it, and it never transfers ownership or a workspace role.
_Avoid_: permission, role, delegation, grant (unqualified)

**Delegated read**:
Read-only sight of a business workspace that the business grants to an agency. It carries no role and no permission to operate anything.
_Avoid_: shared access, agency access, Assignment

**Tenant membership**:
A person's place on a legacy managed-website tenant, ranked viewer, editor, admin or owner. It is separate from workspace membership, even for the same business.
_Avoid_: workspace membership, business membership

**Strelva staff**:
A person at Strelva who can open any tenant. In a workspace they hold nothing special and act only through membership or an Assignment.
_Avoid_: super admin (in workspace contexts), god mode, operator override

## SQL parity

"App check" is the TypeScript gate. "SQL check" is the rule enforced inside
Postgres on the same write. Every row runs on the service-role client
(`src/lib/db/client.ts:26`), so RLS never applies.

| Rule | Write | App check | SQL check | App-only? |
| --- | --- | --- | --- | --- |
| owner/admin manage shared context | `commit_work_auxiliary` (context) | `work-context/service.ts:36-38` | `20260912120000_work_context_participation.sql:57-58` | no |
| owner/admin manage work grants | `commit_work_auxiliary` (participation) | `work-participation/service.ts:49-51` | same file `:57`; grantee checks `:68-79` | no |
| owner/admin propose ongoing work | insert `standing_responsibilities` | `standing-repository.ts:149-155`, `:238` | trigger `20260914040000_standing_responsibilities.sql:163-170` | no |
| owner/admin change/admit ongoing work | `update_/admit_standing_responsibility` | none in app (relies on SQL) | same file `:287`, `:333` | no |
| owner/admin manage offerings (customer workspaces only) | `install_/activate_/update_/retire_offering`, `bind_/revoke_offering_website*` | `offerings/store.ts:225` (display only) | `offering_assert_actor`, `20260915010000_offering_installations.sql:63-73` | no |
| owner invites/revokes invitations | `create_/revoke_workspace_invitation` | `invitations.ts:132-137` (list only) | `20260918130000_workspace_invitations.sql:56-58`, `:218-220` | no |
| owner sponsors operational Assignments | `operational_assignments` RPCs | none | `20260915030000_operational_assignments.sql:96,127,184,205,228,254` | no |
| owner completes workspace exit | `complete_workspace_exit` | `app/api/workspace/route.ts:195` (display) | `20260920100000_workspace_exit.sql:388` | no |
| member edits tracker; assignee is a member | `update_tracker_work` | `tracker/server.ts:45,52` | `20260912190000_tracker_record_coordination.sql:14,48` | no |
| **owner/admin manage calendar connection** | upsert/update `workspace_calendar_connections` | `calendar/repository.ts:169-174` → `:278/283`, `:305`, `:318/319`, `:328/329` | **NONE** (`20260920070000_workspace_calendar_connections.sql:34` grants insert/update) | **yes** |
| **member saves calendar receipt** | upsert `workspace_calendar_event_receipts` | `calendar/repository.ts:341` → `:349` | **NONE** (`20260920070100_workspace_calendar_event_receipts.sql:45`) | **yes** |
| **owner/admin revoke delegation** | update `workspace_delegations` | `workspaces/repository.ts:501` → `:503` | **NONE** | **yes** |
| **owner/admin revoke handoff** | update `workspace_handoffs` | `workspaces/repository.ts:456` → `:458` | **NONE** | **yes** |
| **member creates handoff** | insert `workspace_handoffs` | `workspaces/repository.ts:362` → `:374` | cap only (`20260905190000_release_one_workspaces.sql:114-129`) | **yes** |
| **member saves work** | insert `saved_product_work` | `workspaces/repository.ts:318` → `:336` | cap/exit triggers only, no membership | **yes** |

All six app-only gates are correct today. The risk is the next caller that
writes to the same table without calling the guard, plus a check-then-write
window: the role read and the write are separate statements with no
`for share` lock, unlike every SQL-gated row.

## Scenarios

1. **A member tries to manage the calendar.** `assertWorkspaceCalendarManager`
   throws "A workspace owner or administrator must manage calendar connections."
   Nothing else stops it. A new route that calls `db().from("workspace_calendar_connections").upsert`
   directly would let any member replace the business's Google credentials.
   With the module: `authority.require(actor, ws, "manage_calendar")`, and after
   migration a `save_workspace_calendar_connection` RPC rechecks it.
2. **An admin removes the owner.** No code path removes a member or changes a
   role today. Invitation accept only raises a role, by an owner > admin > member
   rank written in SQL (`workspace_invitations.sql:186-193`). The tenant side has
   `LastOwnerError`; the workspace side has no equivalent. A member-management
   feature has to start as an RPC with a last-owner guard and `manage_members`
   (owner-only).
3. **An agency member with delegated read opens a business.** `listWorkspaces`
   returns it with `access: "delegated_read"` and no role. Every write path
   fails: `requireMember` finds no role, and `update_tracker_work` /
   `commit_work_auxiliary` find no membership. To act, the agency needs an
   Assignment (operational Assignment or a participation grant). That matches
   CONTEXT.md.
4. **A user is removed mid-session.** Membership is read on every request with
   no cache, so the next request fails. SQL-gated writes lock the membership row
   `for share`, which serializes removal against an in-flight write. The six
   app-only writes can still land once after removal. The window is narrow, but
   it's real.
5. **Strelva staff open a client workspace.** Nothing happens: workspace checks
   have no super-admin bypass. Super-admin appears only for product-learning
   (`product-learning/server.ts:14`) and as an extra condition on Strelva-assignee
   Assignments (`operations/assignments.ts:50`). That's consistent with "agency
   in the loop": staff act through Assignments. The tenant side does bypass
   (`auth.ts:353`).
6. **A tenant editor and a workspace owner work on the same business.** The
   inquiry workspace is gated by tenant role (`api/inquiry-workspace/route.ts:54,116`),
   while offerings for the same business are gated by workspace role inside SQL
   (`offering_assert_actor`). A workspace owner with no tenant membership can
   install offerings but gets 403 on inquiries. Offerings also require
   `kind = 'customer'` in SQL (`offering_installations.sql:67`), which no
   TypeScript type expresses. One business, two answers.
## Contradictions in the code

1. **Membership is read four ways at eight sites.** Direct row reads:
   `workspaces/repository.ts:167-172` (the owner), `standing-repository.ts:150`,
   `calendar/repository.ts:170`, `invitations.ts:133`, `customers/store.ts:287`.
   A global unfiltered read: `operations/inbox.ts:316`. Membership-of-someone-else
   lookups: `tracker/server.ts:52,75`. RPC snapshots: `read_offering_business_snapshot`
   (`offerings/store.ts:213-225`) and `read_work_auxiliary` (`work-context/repository.ts:30-32`).
   Six non-owner files read the table directly, which confirms the count.
2. **There are three role tiers, not two.** Owner-or-admin is hand-written 7
   times in TypeScript. Owner-only appears in invitations, exit, operational
   Assignments and provider delivery (`20260918010000_provider_delivery.sql:40,67`).
   Any-member covers the rest. `createHandoff`'s `["owner","admin","member"].includes(role)`
   (`repository.ts:365`) is a no-op written as if it were a rule.
3. **The inbox reads global tables.** `listAuthorizedOperationalInbox`
   (`inbox.ts:312-318`) loads the first 500 rows of `workspace_memberships`,
   `saved_product_work` and `operational_assignments` across all workspaces, in
   no particular order, then filters in memory. Past 500 rows, real Assignments
   silently disappear. It fails closed, but it's still wrong, and it pulls
   other businesses' rows into process memory.
4. **Inquiries derives permissions twice.** Verified. `inquiryPermissionForAction`
   (`inquiries/server.ts:576-581`) maps actions to permissions, and
   `surfacePermissions` (`:592-600`) re-implements `hasTenantPermission`
   (`auth.ts:348-356`), super-admin shortcut included, to build UI flags. The two
   tables agree today only by hand. This is tenant authority, not workspace
   authority. It belongs to the tenant module, and it is scenario 6's seam.
5. **The docs cover tenants only.** `docs/architecture/auth-tenancy.md:79-93`
   says "application guards are the live tenant-isolation boundary" and never
   mentions workspaces. On the workspace side, SQL is the real gate for most
   writes, and the app is the only gate for six.

## Interface

**A. A workspace permission table plus a `require` module (recommended).**
Pure table plus one injected membership read. It shares the table with #6.
**B. Merge into `src/lib/auth.ts`.** One `Permission` union for both models. I
rejected it: the role ladders differ (four tenant ranks, three workspace ranks,
and `admin` sits at a different rank in each). Merging would tie new workspace
code to the legacy tenant model the product is leaving. Keep the shape
identical instead (`roleHasPermission`, `require*`) so a later merge is
mechanical.
**C. SQL-first.** One `workspace_require()` in Postgres, every write moved
into an RPC that calls it, and the app keeps only a display mirror. This is the
strongest guarantee, but it means about six migrations before any TypeScript
improves, and the UI still needs the table. Take C's end state as step 4 of A.

```ts
// src/platform/workspaces/permissions.ts — pure; shared with #6's browser projection
export type WorkspaceRole = "owner" | "admin" | "member";
export type WorkspacePermission =
  // #6 (UI)                                   // #9 (server-only additions)
  | "create_work" | "manage_ongoing" | "manage_custom_apps"
  | "manage_work_authority" | "manage_offerings" | "request_service"
  | "manage_calendar" | "create_handoff" | "invite_members"
  | "sponsor_assignment" | "exit_workspace" | "manage_members";
export const ROLE_PERMISSIONS: Readonly<Record<WorkspaceRole, readonly WorkspacePermission[]>>;
export function roleAllows(role: WorkspaceRole | null | undefined, p: WorkspacePermission): boolean;

// src/platform/workspaces/authority.ts — server-only
export interface WorkspaceAccess {
  workspaceId: string;
  kind: WorkspaceKind;
  via: "membership" | "delegated_read" | "none";
  role: WorkspaceRole | null;
  can(p: WorkspacePermission): boolean;          // role table, narrowed by kind
}
export interface WorkspaceAuthority {
  /** One membership read. Never throws for "no access"; returns via: "none". */
  access(actor: WorkspaceActor, workspaceId: string): Promise<WorkspaceAccess>;
  /** Throws WorkspaceAccessError naming the first missing permission. */
  require(actor: WorkspaceActor, workspaceId: string, ...p: WorkspacePermission[]): Promise<WorkspaceAccess>;
  /** Current members of a workspace the actor belongs to (tracker assignee picker/validation). */
  members(actor: WorkspaceActor, workspaceId: string): Promise<Array<{ userId: string; email: string; role: WorkspaceRole }>>;
}
export function createWorkspaceAuthority(read: MembershipRead): WorkspaceAuthority;   // Supabase adapter
export function fakeWorkspaceAuthority(rows: Array<{ workspaceId: string; userId: string; role: WorkspaceRole; kind?: WorkspaceKind }>): WorkspaceAuthority;
```

Invariants: no super-admin bypass. Delegated read never satisfies any
permission. `WorkAuthoritySnapshot.role` and the offering snapshot's role go
through `roleAllows`, so callers stop comparing role strings. A permission
answers "may this role act on the workspace"; it never stands in for an
Assignment on specific work.

## Tests

- **Role × permission table.** Exhaustive 3 × 12 snapshot test in
  `permissions.test.ts`, plus a kind narrowing case (`manage_offerings` false
  outside customer workspaces). This is the contract #6 imports.
- **Callers against the fake.** `createContextService`, the participation
  service, standing, calendar, invitations and repository writes take a
  `WorkspaceAuthority`. Tests seed `fakeWorkspaceAuthority([...])` instead of
  mocking `from("workspace_memberships")` chains. Each surface needs one denial
  test per tier (member denied a manage action, admin denied an owner-only one,
  delegated read denied every write).
- **SQL parity.** Add `tests/workspace-authority-schema.sql`, run by
  `scripts/check-workspace-sql.sh` (`PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql`).
  It seeds owner, admin, member, delegated-agency and outsider users. For every
  SQL-gated RPC in the parity table it asserts allow or deny per role. It also
  asserts `workspace_role_allows(role, permission)` equals a fixture generated
  from `ROLE_PERMISSIONS`, and a Vitest test fails if that fixture drifts from
  the TS table. Not run here.

## Migration steps

1. Add `permissions.ts` and `authority.ts`, with the Supabase adapter over the
   existing `directRole` query, plus the table and fake tests. No SQL.
2. Replace the hand-written checks: `work-context/service.ts:36-38`,
   `work-participation/service.ts:49-51`, `standing-repository.ts:149-155`,
   `calendar/repository.ts:169-174`, `invitations.ts:132-137`,
   `repository.ts:181-185` (roles arrays become permissions), `offerings/store.ts:225`,
   `route.ts:195,227`. Route tracker's `:52,75` through `members()`.
3. Fix the inbox. Scope its reads to the actor (`assignee_user_id = actor`,
   memberships for the actor's workspaces and the sponsors' rows only)
   instead of global `limit(500)`. This is a TS-only change.
4. **Jacob's yes (migration):** add `workspace_role_allows()` and
   `workspace_require()` with the parity test.
5. **Jacob's yes (migration, one per table):** close the six app-only gates.
   Calendar connection and receipt writes become RPCs. Delegation revoke and
   handoff create/revoke become RPCs. A `saved_product_work` insert trigger
   requires `created_by` to be a member. Then revoke direct insert/update from
   `service_role` on those tables, the way `offering_installations` already does
   (`20260915010000_offering_installations.sql:43`).
6. Add a workspace section to `docs/architecture/auth-tenancy.md`, and add the
   Language terms to CONTEXT.md once Jacob agrees.
7. Scenario 6 (inquiries tenant-gated vs workspace-gated) waits on Jacob.

## Decisions worth an ADR

**Workspaces have no Strelva-staff bypass. Staff act through membership or an
Assignment.** It's hard to reverse: once ops tooling depends on a bypass, every
receipt and audit trail assumes it. It's surprising, because the tenant model
grants super-admin everything (`auth.ts:353`) and a reader would "fix" the
asymmetry. And it's a real trade-off: support speed against "the business owns
the record" (ADR 0010) and a clean audit of who acted. The code already behaves
this way; the ADR records that it's deliberate.

## Open questions for Jacob

1. During migration, which membership governs a business's capabilities: tenant
   role or workspace role? Inquiries uses one, offerings the other (scenario 6).
2. Confirm no Strelva-staff bypass in workspaces (the ADR above). If support
   needs to look inside, is a time-boxed read Assignment the answer?
3. Should admins be able to invite and manage members, or stay owner-only as in
   SQL today?
4. Can step 5 (revoking `service_role` table writes on five tables) ship in the
   next release, given that no client site touches these tables?

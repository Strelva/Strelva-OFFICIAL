# #261 · Agency Team management

October 7, 2026. Implementation branch: `a1/agency-team`, based on
`origin/integrate/reborn-1.0` with batch 7A. PR: [#554](https://github.com/Strelva/Strelva-OFFICIAL/pull/554). Objective: an agency owner/admin can
invite staff, set agency roles, remove them, assign specific clients and bulk
assign, then see the resulting assignments. All proof here is local.

## Implemented behavior

Team reads the agency's complete active provider-seat list rather than the
manager's loaded Clients page. Same-agency members can read assignments;
only owners/admins can manage. Pending invitations are private to managers.
Invitation links use the existing service, hashing, expiry and acceptance.
Agency admins may sponsor Member/Admin invitations; customer and owner
invitation rules remain owner-only. Acceptance rechecks current sponsor
authority, including demotion/removal. No email is sent by this action.

Member/Admin role updates and membership removal protect every owner and the
current actor. Removing membership invokes the existing 7A trigger to end all
staff rows. Rejoining restores none. Individual and bulk assignment call
`set_agency_client_staff` through one transactional SQL wrapper, with sorted
client locks, deduplication and a 200-assignment limit. Failure rolls back the
whole selection. No provider-seat/staff table privileges are added.

Agency role and client role are separate. The current 7A policy resolves staffed
members to client operator (`admin`) access; this change adds no bespoke
per-client role or customer membership. Existing direct memberships and narrow
work grants retain their own authority. #241 remains an open production policy
decision. Clients need not sign in for existing work to keep running.

UI states: loading, empty seat list, read failure/retry, member permission,
pending invitations, confirmed actions, removal confirmation, unconfirmed write
and confirmed-write/failed-refresh. Unconfirmed changes require reload before
another mutation. Workspace and Systems flags guard reads and writes, including
the per-workspace Systems gate. Team mounts only when its tab is opened.

## Evidence

- `pnpm install --frozen-lockfile`: passed, no dependencies added.
- `pnpm typecheck`, `pnpm lint`, `pnpm check:boundaries`: passed.
- `pnpm exec vitest run --maxWorkers=2 src/__tests__/agency-team.test.ts
  src/__tests__/agency-team-ui.test.tsx src/__tests__/agency-home-ui.test.tsx
  src/__tests__/agency-versions-server.test.ts
  src/__tests__/workspace-invitations.test.ts`: 45 passed, 1 skipped (the existing
  optional PostgreSQL Versions contract). The SQL suite runs that real contract
  with its local database harness.
- `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql`:
  passed, including real Team permissions, atomic failure, cleanup, invitation
  acceptance/demoted sponsor, rollback and reapply.
- `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade`:
  passed, full retained tenant schema, Team rollback/reapply and fixtures.
- `pnpm build`: one attempt; optimized compilation passed, then TypeScript
  found a nullable closure reference in the preview fixture. It was fixed;
  subsequent `pnpm typecheck` passed. A full build was not rerun, respecting the
  one-build limit. Complete production-build proof remains outstanding.
- The first SQL run found a fixture token-hash collision with an earlier test.
  Dedicated hashed fixture tokens fixed it; both full SQL runs above passed.
- Initial `pnpm test -- <paths>` stalled without reporting results and was
  stopped. Explicit `pnpm exec vitest run --maxWorkers=2 <paths>` completed.
- Browser: Croki preview, local dev on port 3216. Integrated
  `/preview/strelva?scenario=agency-systems&systems=on`, Team selected, at
  1280×800 and 390×844. Dedicated `/preview/strelva/agency-team` states:
  ready/member/empty/error/loading/action-error. Browser fixture invitation, role,
  bulk assignment and confirmed removal exercised; individual assignment is
  also covered by UI tests. Mobile layout
  measured `scrollWidth=390`; keyboard focus produced a visible solid outline.
  A failed write disabled management until reload. No browser console errors
  were observed in the inspected states.

Integration update: merged the newer integration branch in `88edda40`; the
only manual conflict was the SQL check script tail. Both Team and agency
prospecting checks were preserved. Typecheck, targeted tests (45 passed,
1 skipped), boundaries and both full SQL suites passed again. The integrated
Team tab was rechecked at 1280px and 390px with no horizontal overflow.

## Remaining limits and handoff

Browser actions use isolated fictional transport; this does not prove an
authenticated production session, real staff adoption, email delivery or a
deployment. No production data, provider, billing or DNS action was taken.
Rollback restores prior invitation functions and removes new Team commands;
it keeps accepted membership and staff history. No pinned migrations changed.

Next: review the PR against `integrate/reborn-1.0`, integrate its new migration
after 7A, and reconcile this local capability into the coordinator's canonical
model/vault state. Production migration/exposure and #241 require Jacob's
explicit authorization. The implementation agent did not edit strategic state.

Shared files: `AgencyHome.tsx`, `preview/agency-fixture.ts`, both workspace SQL
check scripts, `CONTEXT.md`, component inventory, and agency assignment help.
The migration replaces existing invitation functions; coordinate any parallel
invitation change. No signup/onboarding, Needs you server/contracts, or
release-flags resolver files were edited.

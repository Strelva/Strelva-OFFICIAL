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
current actor. Removing membership extends the 7A trigger to end all staff rows and revoke
offered/accepted work assignments for that person and agency. The Team command
records the removing owner/admin in `ended_by` and `revoked_by` with one timestamp.
Rejoining restores neither. Direct administrative deletes also revoke assignments;
without an identified actor they retain null attribution rather than guessing. Individual and bulk assignment call
`set_agency_client_staff` through one transactional SQL wrapper, with sorted
client locks, deduplication and a 200-assignment limit. Failure rolls back the
whole selection. No provider-seat/staff table privileges are added.

Agency role and client role are separate. The current 7A policy resolves staffed
members to client operator (`admin`) access; this change adds no bespoke
per-client role or customer membership. Existing direct memberships and non-agency work grants retain their own authority. #241 remains an open production policy
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

## Removal/rejoin review follow-up, October 7, 2026

The review found accepted agency work could restore client write access after
removal and invitation acceptance. Before changing the migration, the new exact
scenario failed in `tests/agency-team-schema.sql:113`: `expected
business_record_access_denied but succeeded`; `check:workspace-sql` exited 3.
Raw output is in the local `.scratch/agency-team/rejoin-fix/sql-red.log`.

The unreleased `20261011160000_agency_team.sql` now replaces the membership cleanup
function, retaining its existing trigger and privileges. The rollback restores
its exact 7A definition. No pinned migration changed; no table or dependency was
added, so no readiness sentinel is needed. Assignment revocation uses its
existing `revoked_by`/`revoked_at` audit fields; delivery history stays intact.
Tests cover accepted and offered revocation, immediate denial, invitation
acceptance/rejoin denial, same actor/time for staff and assignment cleanup,
unchanged other-agency/direct staff work, direct deletion and actor isolation,
and forced revocation failure rolling back the membership and staff cleanup.

Integration advanced to `21b03157`; merged with commit `ef80166a` without conflicts.
Final local checks on that merge:

- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0 (existing large generated-type Babel notice).
- `pnpm check:boundaries`: exit 0.
- `pnpm exec vitest run --maxWorkers=2 src/__tests__/agency-team.test.ts src/__tests__/agency-team-ui.test.tsx src/__tests__/agency-home-ui.test.tsx src/__tests__/agency-versions-server.test.ts src/__tests__/workspace-invitations.test.ts src/__tests__/version-actor-provider-seat.test.ts`:
  exit 0, 6 files, 47 passed and 1 optional PostgreSQL test skipped. The SQL suite
  separately exercised that PostgreSQL contract successfully.
- `LC_ALL=en_US.UTF-8 PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql`:
  exit 0, including exact public-catalog fingerprint restoration after Team
  rollback, reapply, and both passes of the rejoin regression.
- `LC_ALL=en_US.UTF-8 PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade`:
  exit 0, full retained tenant schema, exact Team rollback fingerprint and reapply.
- `git diff --check`: exit 0. Logs: `.scratch/agency-team/rejoin-fix/`.

The coordinator reports a later build passed (exit 0); this follow-up did not
rerun it. The older failed build above is historical evidence. No new UI change
was made; prior desktop/mobile fixture evidence remains applicable.

#261 remains referenced: arbitrary per-client role selection from its MK-4
acceptance is not verified/implemented; staffing currently resolves to 7A's fixed
operator role. #241 remains Jacob's production policy decision. Admins can demote
or remove other admins; owners and self remain protected. Finding: peer-admin
management is allowed. Implication: an admin can remove another manager.
Recommendation: retain the requested behavior for this patch. Decision required:
Jacob should confirm whether admin management requires owner-only authority.
Affected issue: #261.

Next: coordinator reviews this follow-up and chooses integration; do not merge or
deploy from this stream. Reconcile the cleanup capability and remaining role
questions into the existing canonical model/vault; this delegated agent only
updates this handoff. Shared files changed by this follow-up: both SQL check
scripts, Team migration/rollback/test, CONTEXT, assignment help and this handoff.

# Agency client availability (#256)

Prepared privately October 8, 2026. The additive `20261021093000` migration is
unapplied by this work. There are no seeded ceilings or verification criteria.

An active, staffed provider agency may choose Off, Operators and named testers,
or On for a client's capability only after a platform operator records an
explicit permission naming that business, flag, agency, System, verification
effect and maximum state. The verification effect is an operator selection
from the existing four effects; this mechanism invents no verification policy.
Staff authority still passes through the existing `system_actor_scope` and
`system_load` contracts. Live channel flags bind to their named System kind;
website rebuild and connected sites bind to websites; newsletter contacts bind
to a newsletter. Other flags require an explicitly named System too.

The agency's Clients list exposes **Client capability availability** for
provider clients. It reads only current permissions for that agency and shows
unavailable verification, the actual ceiling, platform pause and absent
permission. A reason and both the flag and ceiling revision are required to
save. Refresh reads current authority again. The workspace switch and each
flag's environment switch remain absolute; no environment value is changed.

These are availability controls. They do not grant business data, publish a
System, send mail, grant a mandate or approve a provider write. Existing owner
approvals, native release eligibility and outside-effect authority still apply.
`agent_channel`, `publishing_record_google_policy`, `make_real_owner_link` and
`owner_decision_links` remain operator-owned: this agency mechanism never
creates owner consent or changes those consent/decision policies.

## Operator API

The existing tenant operator flag setter stays on the approved, identity-bound
path. Its Off or Unset also withdraws any recorded agency permission, including
an Off no-op on the flag itself. Turning a flag On does not create agency
permission. The bare-email setter and its predecessor remain internal; only
`set_workspace_release_flag_approved` is a service-role command.

`GET /api/admin/workspaces/<business-id>/agency-release-flags?agencyWorkspaceId=<agency-id>`
reads current permission revisions and the latest 200 immutable ceiling history
rows. `POST` records an explicit ceiling. Example request body (identifiers
must name real, currently owned local fixture records):

```json
{
  "workspaceId": "25600000-0000-4000-8000-000000000010",
  "agencyWorkspaceId": "25600000-0000-4000-8000-000000000020",
  "flag": "systems",
  "systemId": "25600000-0000-4000-8000-000000000040",
  "verificationEffect": "publish",
  "maxState": "operators",
  "expectedRevision": 0,
  "reason": "Named client and System qualified for private testing"
}
```

The operator must be a current verified super admin, rechecked and locked by
the database. The API derives the actor from the session. Changing a ceiling
increments its revision and appends the before/after record. Lowering it clamps
an existing flag atomically; assigning it to a different agency closes current
exposure. A higher ceiling never itself activates a flag.

## Agency API and proof

`GET /api/workspace/agency-release-flags` takes `workspaceId` and
`agencyWorkspaceId`. `POST` adds `flag`, `state`, `reason`, `expectedRevision`
and `ceilingRevision`. A missing permission, another agency, departed member,
ended staff/seat, unverified actor/agency, stale revision or above-ceiling state
fails closed. The database serializes these changes with the operator setter
and holds current identity, membership, staff, seat, System and verification
through the write. There is no Unset agency action that could expose env fallback.

Run `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-agency-release-flags-sql.sh`.
This uses a disposable local cluster, the complete ordered migrations, native
RPCs, READ ONLY readers, two-session races, exact empty rollback definition/ACL
comparison, and populated rollback refusal. Rollback requires preservation once
permissions/history exist. Historical migration bytes are unchanged.

The fictional UI fixture at `/preview/strelva/agency-release-flags` requires
both development mode and `STRELVA_UI_PREVIEW=1`. It is interface proof and
grants no authentication or provider access. Local tests and renders do not
prove production operation, live verification or customer adoption.

# Wave 6 website implementation

Branch: `w6/website`, worktree `REB-w6-website`. Local only; no production,
client-repository, provider-write, notification, dependency, push or PR work.

## Current objective and continuation

Resume the two checkpoint commits (`a336805f`, `86a1d03d`) and finish the
Website System launch requirements: live site, domains, health, native and
repo change delivery, immutable History, linked rebuild Make real, domain
owner decisions, undo, connected sites and switchable rebuild entry.

The existing active bet is unchanged: managed owners ask and approve;
Strelva operates the site. Connected sites and paste-URL rebuild remain
independent release choices. Implementation is local evidence, never
deployment, adoption or economic proof.

## Prepared changes

- Website release reconciliation into `system_revisions`, from native
  content, snapshots, hosted publications and repo receipts; identity survives
  implementation changes, and repeated reconciliation deduplicates receipts.
- Real public content read-back after accepted tenant publishing; failed
  observations cannot retry the write. Shared pinned HTTP health transport.
- Owner-request/history navigation; editing remains operator-only in the
  workspace. Connected-site and rebuild entry paths have separate gates.
- Linked-site Make real uses the published tenant, exposes per-step results,
  and preserves the old implementation for fallback.
- Durable domain proposals with exact DNS records, expiry, content hash and
  Needs you approval; read-only verification checks routing and records a
  receipt. New domain mail has its own off-by-default switch and the existing
  global/customer/per-tenant gates.
- Cutover undo requires explicit domain-restored and fallback-verified
  attestations; it restores the saved delivery model and writes an immutable
  release. It never moves DNS or touches a client project.

## Flags and migrations

Existing flags: `STRELVA_WORKSPACE_RELEASE`, `STRELVA_SYSTEMS_RELEASE`,
`STRELVA_CONNECTED_SITES_RELEASE`, `STRELVA_WEBSITE_REBUILD_RELEASE`,
`STRELVA_MAKE_REAL_LIVE` and its per-channel release rows; all off by default.
New send opt-in: `STRELVA_WEBSITE_DOMAIN_EMAIL_ENABLED=1`, default off, also
requires `EMAIL_SENDING_ENABLED`, `CUSTOMER_EMAIL_ENABLED` and a non-off
`reb:client-email` override.

Additive migrations, each with `lock_timeout` and rollback SQL:

- `20261010110000_website_cutover_undo.sql`
- `20261010113000_website_system_releases.sql`
- `20261010114000_website_domain_requests.sql`

Existing crons reused: `website-health`, `website-domain-verification`,
`connected-sites-purge`. No new cron registration at this checkpoint.

## Verification so far

- `pnpm typecheck`: passed after resumption.
- `pnpm check:boundaries`: passed; 204 workspace → src/lib imports in
  93 files, 44 older boundary imports.
- Targeted tests: first run 105 passed / 2 failed (107 total). Both failures
  were stale mocks after read-back moved to the shared `site-health` module;
  repaired mock, rerun pending.
- SQL suite running in a throwaway local Postgres cluster.
- Full lint, test, custom-repo compatibility and production build pending.

## Remaining uncertainty and exact next action

Audit uncovered gaps against all three website specs; verify checkpoint
failure paths and flags-off behavior, repair any local gaps, inspect desktop
and mobile fixture journeys, then run the mandated full checks once. Update
this handoff and the website spec Status sections with exact results.

Production remains unproven: all prerequisite and new migrations, real
provider/model/media credentials, owner authority, actual hosted publish
read-back/domain routing/undo on tenant zero, real builder installation,
silent converted-client parity and sustained cron operation. Owner invites
and notifications remain deferred. No pricing, measured rebuild cost, speed,
Lighthouse performance or fallback hosting cost is claimed.

Project-model source deltas are limited to this handoff and owned specs.
Coordinator reviews of capability-overhang/vault are deferred to integration:
reconcile the verified local capability evidence into the canonical model
without promoting production, demand or commercial claims.

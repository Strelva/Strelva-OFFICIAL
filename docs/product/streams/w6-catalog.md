# Wave 6 catalog handoff

Branch: `w6/catalog`. Worktree: `REB-w6-catalog`. Integration base: `integrate/reborn-1.0` @ `864474fe`. Round 5 continues the interrupted rounds 1–4 as a standalone thread. Local work only; no production reads/writes, delivered mail, pushes, PRs, merges or dependencies.

## Objective, result and active bet

Build the launch catalog in [systems-catalog](../specs/systems-catalog.md): sentence-built internal tools; store/rewards/wellness projection without storefront changes; workspace analytics/recaps; private documents with full history; the 200-edit regression. Owners file Requests. Strelva and actively delegated agencies make Systems.

The launch implementation is built and locally tested; final results are recorded below. Production activation and business demand remain unproven. The active bet is a managed tool that a business can use without its owner learning to build; the illustrative bookkeeping intake is a fixture, not a customer commitment.

| Launch area | Implementation and proof |
| --- | --- |
| Internal tools | `make_systems` parity and SQL create/change checks; operator membership and active agency delegation; sentence planning and accepted funding in the right workspace; Draft rehearsal without live records; Live/Paused projection and release history. Contact/person fields resolve inside atomic member/use-grant submit and edit RPCs. Contact conflicts and notice failures reach the operator queue. |
| Owners and failed plans | Owner direct planning/create is denied. The standalone planner shows a Request path without preparation/budget controls and retains its sentence. Eligible failed maker planning files one idempotent `requested` service Request, with pending provider acceptance, no notification and no scope/deadline commitment. Storage failure is reported honestly; revoked authority, funding and replay failures do not file it. |
| Store/rewards/newsletter | Store is a website Connection with no checkout authority. Tenant order/rewards behavior stays frozen. Newsletter mirroring adds `newsletter` contact source after conversion; subscribe/duplicate bodies remain exact for gldf and rohlax, on/off; unsubscribe never creates a subscription through a contact. Backfill defaults to dry run. |
| Wellness | Bookings shows schedule/roster views; existing tenant routes/data remain; no new wellness member store or surface. |
| Analytics/recaps | Website health reads traffic and Search Console, with unavailable/stale distinct from zero. Read Connection describes service-account authority and daily freshness. Weekly/monthly/hosted reports share recipient resolution; catalog receipt instrumentation records acceptance, suppression or failure, with operator recovery. Running shows a monthly recap line. Postgres analytics config/report state has Redis fallback and monotonic last-sent behavior. |
| Documents/histories | Documents stay private files outside Home Systems. Full append-only revisions, 20 recent document receipts and paginated history. Engine + SQL regressions save 1,000 document edits and latest Undo; onboarding saves 600 changes; application release/candidate histories exceed the old 100 limit and still roll back to release 1. |
| Checks/merges | Tracker projects as an internal tool; saved checks project into each watched System's health with last-checked/stale evidence; documents/onboarding/checks stay out of Home Systems. Agency website drafts remain website Possibilities. |

Earlier integration already contains the history migrations, maker permission, tenant surface projection and typed analytics/report persistence. Round 5 completed recovery gaps, atomic linked member submission, flags-off planner prompt compatibility, readable grant-scoped links and the real isolated Auth journey. The gated tool rehearsal and correction-focus fix support repeatable UI verification without depending on Docker.

## Commits

The branch history retains checkpoints from killed sessions; the final verification proves their combined tree:

```text
9b4a8cd1 WIP w6/catalog: checkpoint after session interruption (unverified)
e798a62b WIP w6/catalog: checkpoint 2 after second interruption (unverified)
e313f241 WIP w6/catalog: checkpoint 3 after third interruption (unverified)
0b311f4c Allow grant holders to correct linked internal-tool records atomically
43092f07 Prove catalog cron compatibility and register migration readiness
e5c6f098 Record catalog verification progress and stabilize SQL race holds
a39e2d16 WIP w6/catalog: checkpoint 4 after fourth interruption (unverified)
afd06f3e Make linked tool submissions atomic and file failed plans as Requests
27cfd660 Route owners to Requests and prove the catalog with isolated Auth
0c93676e Show contact and staff labels within application use grants
8d740fa7 Rehearse linked tool records and focus recipient corrections
```

## Flags, migrations and crons

All new behavior defaults off. `internal_tool_notices`, `catalog_reports`, `newsletter_contacts` use existing release-row resolution with their matching `STRELVA_*_RELEASE` envs. Systems/workspace release must also be on for the relevant workspace behavior. Planning requires `STRELVA_PLANNING_ENABLED`; full document-history reading additionally requires `STRELVA_DOCUMENT_HISTORY_RELEASE=1`. These gates remain distinct from authorization. The tool/document UI rehearsals also require `STRELVA_UI_PREVIEW=1` in development or an explicitly enabled preview deployment; they are disabled in production.

Every new notice obeys `EMAIL_SENDING_ENABLED=true`, `CUSTOMER_EMAIL_ENABLED=true`, and the existing `reb:client-email` gate for a tenant-linked business. Enabling the notice release never bypasses those gates. Known provider failures retry within three attempts; uncertain provider acceptance remains an operator reconciliation item and is never blindly resent. Provider acceptance ends the write even if read-back fails.

Assigned additive migrations, each with its rollback under `supabase/migrations/`:

| Timestamp | Change | Rollback |
| --- | --- | --- |
| `20261010150000` | Linked contact/person submit and notice receipts | `rollback-w6-internal-tool-submit-notices.sql` |
| `20261010150100` | Use-grant linked submit | `rollback-w6-internal-tool-use-links.sql` |
| `20261010150200` | Notice delivery leases and bounded retries | `rollback-w6-internal-tool-notice-delivery.sql` |
| `20261010150300` | Contact conflicts and tool evidence | `rollback-w6-catalog-tool-evidence.sql` |
| `20261010150400` | Use-grant linked corrections | `rollback-w6-internal-tool-use-edits.sql` |
| `20261010152000` | Report receipts and Search Console reachability | `rollback-catalog-report-receipts.sql` |
| `20261010153000` | Newsletter contacts and dry-run backfill | `rollback-newsletter-contacts.sql` |
| `20261010154000` | Maker-only work plans and funding authority | `rollback-w6-system-work-plan-authority.sql` |
| `20261010155000` | Failed maker plan → pending Request | `rollback-w6-failed-system-plan-request.sql` |
| `20261010155100` | Atomic linked member submission | `rollback-w6-internal-tool-member-submit.sql` |
| `20261010155200` | Grant-scoped readable contact/staff labels | `rollback-w6-internal-tool-use-link-labels.sql` |

Inherited integration migrations include `20261007190000` document revisions, `20261007190100` onboarding revisions, `20261007190200` application version history, `20261007192000` maker authority, `20261007192100` record link types and `20261007194000` typed analytics/report persistence. None was applied to production by this stream.

No new cron. The existing `workspace-work` cron drives notice retries behind their release/gates. Weekly, monthly, Search Console and order-review schedules remain unchanged. No dependency added.

## Local verification

Final local results on the combined branch:

```text
pnpm test --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000
  Test Files 698 passed | 1 skipped (699)
  Tests 6352 passed | 37 skipped (6389); duration 124.04s (final tree)
pnpm typecheck: Types generated successfully; exit 0 (final retry after stopping dev)
pnpm lint: exit 0 (generated database.types.ts Babel size note)
pnpm check:boundaries: passed; 204 workspace -> src/lib imports in 93 files, 46 older imports
pnpm check:custom-repos: 196/196 checks passed
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql
  Workspace SQL checks passed; customer mapping and inquiry SQL checks passed; exit 0
NODE_ENV=production pnpm build: exit 0
Isolated real Auth + catalog fixture browser tests: 2 passed (5.0s)
```

Whole-test output: `/tmp/w6-catalog-round5-test-final-2.log`. SQL output: `/tmp/w6-catalog-round5-sql-complete.log`. Final build: `/tmp/w6-catalog-round5-build-final.log`. Typecheck: `/tmp/w6-catalog-round5-typecheck-recovered.log`; lint: `/tmp/w6-catalog-round5-lint-final-3.log`; boundaries: `/tmp/w6-catalog-round5-boundaries-final-4.log`; compatibility: `/tmp/w6-catalog-round5-custom-repos-2.log`. Auth journey: `/tmp/w6-catalog-auth-journey-6.log`. Full fresh-cluster SQL exercised migrations, authority/revocation races and failure paths on throwaway Postgres; it never connected to production.

Real disposable local Supabase Auth plus loopback app/API/database: maker sentence → validated plan → Draft → rehearsal (no live records) → publish → staff grant → submit at 1280 and 360px → contact upsert → captured assigned-person email → persisted accepted-send receipt. A separate 360px test saves an owner's Request and forces provider failure, verifying a pending maker Request, preserved words and no duplicate filing action. The provider preloader allows only loopback, a static plan response and the existing local email sink. It proves application transport/authorization/persistence, not real model quality or mail delivery.

Rendered documents on local port 3016: 1280px populated editable file; 360px read-only and history error/retry; 320px loading/empty/flag-off/denied. Pagination grows 20 to 40 rows without losing recent edits. Read-only/denied states have no editing controls, error retains recent rows, and checked widths have no horizontal overflow. Croki screenshots: `browser-screenshot-localhost-muy8ff1w-45cd68a2.png`, `browser-screenshot-localhost-muy8gpxp-8bdc7ae6.png`, `browser-screenshot-localhost-muy951s9-b86b337a.png`, `browser-screenshot-localhost-muy9ea80-e3238744.png` under `/Users/jacobrhinehart/.t3/dev/browser-artifacts/`.

Auth screenshots under ignored `test-results/`: `catalog-staff-1280.png`, `catalog-staff-360.png`, `catalog-owner-request-360.png`, `catalog-failed-plan-request-360.png`. The rendered staff list revealed raw link UUIDs; readable use-grant labels now join only contacts/staff referenced by the current recipient’s visible records/fields, rechecking grant/release/identity. SQL tests cover own/all/none scope, hidden fields, foreign links, revocation and expiry; rollback/reapply passed. Croki rendered the real recipient component through the gated, network-free `/preview/strelva/tool` rehearsal: 360px labeled records and a saved correction; 1280px read-only without edit/submit controls; 320px empty. Labels fit without overflow, IDs stay in the correction draft, email validation accepts an unchanged person link, and keyboard focus moves into the correction then tabs through fields. Screenshots under the same browser-artifacts directory: `browser-screenshot-localhost-muyangsm-2092f1af.png`, `browser-screenshot-localhost-muyao7al-d65a5628.png`, `browser-screenshot-localhost-muyaokwc-064a2d5c.png`, `browser-screenshot-localhost-muyaol0a-4936fa8b.png`.

Historical limitation, superseded for Auth verification by the #472 rerun below: the real Auth journey passed before the additive display-label lookup. Docker then became unresponsive and the owned loopback Auth database stopped accepting connections, so that Auth journey was not repeated after labels. Labels were proven separately in the real SQL boundary, service projection tests and browser renderer. No Docker daemon restart or unrelated-stack action was attempted. The owned dev servers were stopped. Auth stack cleanup was attempted with a bounded stop of only `/tmp/strelva-auth.Qt8VdE`; Docker did not respond, so that older stack's cleanup was not confirmed. Its original cleanup instruction remains `supabase stop --workdir /tmp/strelva-auth.Qt8VdE --no-backup`, with private local env `/tmp/w6-catalog-auth.env` and cleanup log `/tmp/w6-catalog-auth-cleanup.log`. This rerun does not certify cleanup of an older agent's stack.

Failures retained and resolved:

- Round 4's unrestricted test run found a missing tool-evidence readiness sentinel and 5-second contention timeouts; it was interrupted (130). Sentinel fixed; bounded-worker full run passes. SQL embedded tests use the existing one-worker/30-second harness convention. Cron fixture Promises were corrected; no assertion was weakened.
- Round 5 fresh SQL uncovered invalid fictional fixtures: missing super-admin row, generated `phone_key` insertion, missing seen timestamps and unsupported `manual` source. Fixed to valid operator-backed contacts. SQL also exposed a missing error helper and an ambiguous workspace `id` in the linked-edit RPC; both fixed. Full fresh SQL subsequently passed.
- First build inherited `NODE_ENV=development` and failed prerender; `NODE_ENV=production` succeeds.
- A later typecheck collided with dev-generated `.next-catalog-auth` types and reported malformed generated files. Stopped the owned dev server and removed only its automatic tsconfig include before the final typecheck.
- The final boundary check caught a route importing a product-internal file; exported the helper through the product index, and the boundary check passes.
- Initial Auth fixture tried direct service-role access to protected business tables (42501); changed setup to the guarded loopback cluster administrator. Subsequent test fixtures matched Next's hidden alert and queried an obsolete `stage` column; corrected the locator/query. Actual Request/UI assertions pass.

No stream diff touches `src/app/api/v1`, `custom-repo-starter`, `src/lib/scaffold-contracts.ts` or `release-manifest.json`. Newsletter byte bodies and flags-off cron paths are tested; deployed 60/60 storefront comparison remains a separately authorized production step.

## Production steps and remaining uncertainty

Nothing has been activated. The integration/release owner must first reconcile the branch and its readiness sentinels, run the combined checks, then prepare these actions for Jacob's authorization:

1. Check current production workspace/history counts and store/rewards/wellness state; review and apply the assigned and required inherited migrations in timestamp order, with the rollback files available.
2. Run the report-recipient dry run; review every difference before changing recipients. Backfill typed analytics config and monotonic report state, retaining the frozen Redis fallback. Run newsletter-contact backfill per converted tenant as a dry run before any apply.
3. Set reviewed release rows/env only through the existing release process; env changes require a new production deploy. Keep rollout silent and email gates off. Owner invites remain deferred.
4. Capture/compare deployed storefront responses around migration/deploy (60/60 method) and run the release checklist. Local 196/196 compatibility is not a live parity claim.
5. After separate permission, authorize real Google reads/model credentials and one Strelva-owned test-business tool submit, delivered notice and recap with receipts. Do not infer mailbox delivery from provider acceptance.

Not proven: live converted-client parity; actual provider access/reliability/delivery; production row counts/backfills; adoption or willingness to pay. The remaining release actions require production evidence and Jacob's authorization. The fixture bookkeeping business is not evidence of demand.

Canonical project-model/capability/vault reconciliation belongs to the integration agent in the main checkout. This stream leaves shared company state untouched and supplies code/spec/handoff evidence.

Exact next action: the integration agent reviews the #472 verification PR and resolves the inherited business-policies readiness sentinel before claiming combined release checks pass. The isolated Auth rerun is recorded below; the silent production steps above remain a separate decision.

## October 7 integrated Auth rerun — #472

Worktree `REB-a1-catalog-auth-journey`, branch `a1/catalog-auth-journey`, based on
integrated revision `2af92d58bd8c94b5cdf0200eac5a8c54570861cc`. This closes the
post-label Auth evidence gap, without changing catalog runtime code, migrations,
release gates or dependencies.

The unchanged journey first passed with real disposable Supabase Auth and all
integrated migrations: **2 passed (15.5s)**. The expanded regression also checks
atomic member submission, pre-grant denial, readable contact/staff labels in the
recipient API and rendered records at 1280/360px, preservation of link IDs during
a mobile correction, keyboard focus, own-record isolation, three accepted notice
receipts, their sign-in destinations, and revocation denial. The owner Request
and failed-maker Request recovery test remains intact. Three submissions produce
three captured notices; the correction produces no extra notice.

The local provider preloader answers model/mail calls with the existing synthetic
fixtures and blocks other external fetches. Auth, application requests, permission
checks and database writes are real loopback services. Model quality, mailbox
delivery, live Google reads and production activation remain unproven. Monthly
recap recipient resolution, suppression/failure behavior and receipt projection
are covered by the targeted tests below; this Auth journey does not send a real
monthly recap.

Additional checks on this integrated tree:

```text
pnpm install --frozen-lockfile: exit 0
pnpm exec playwright test tests/catalog-authenticated-local.spec.ts --workers=1 --retries=0 --reporter=line
  Expanded dev-server journey: 2 passed (24.0s)
NODE_ENV=production pnpm build: exit 0
NODE_ENV=production pnpm exec next start --hostname localhost --port 3147
pnpm exec playwright test tests/catalog-authenticated-local.spec.ts --workers=1 --retries=0 --reporter=line
  Local optimized production-build journey: 2 passed (11.6s), no retries
pnpm typecheck: exit 0
pnpm lint: exit 0 (generated database.types.ts Babel size note)
pnpm exec eslint tests/catalog-authenticated-local.spec.ts: exit 0
pnpm check:boundaries: exit 0; 204 workspace -> src/lib imports in 93 files, 44 older imports
pnpm check:custom-repos: exit 0; 196/196 checks passed
LC_ALL=en_US.UTF-8 PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql
  Workspace, customer mapping and inquiry SQL checks passed; exit 0
```

The targeted command was:

```bash
pnpm test src/__tests__/internal-tool-links.test.ts src/__tests__/internal-tool-use-labels.test.ts src/__tests__/internal-tool-use-edits.test.ts src/__tests__/internal-tool-use-edit-renderer.test.tsx src/__tests__/internal-tool-notice-delivery.test.ts src/__tests__/catalog-crons.test.ts src/__tests__/catalog-reports.test.ts src/__tests__/catalog-health.test.ts src/__tests__/workspace-recaps.test.tsx src/__tests__/systems-catalog-projection.test.ts --maxWorkers=2
```

Result: **10 files, 100 tests passed (2.82s)**. Full commands also accompany the
#472 PR. Local evidence logs use `/tmp/a1-472-*`; screenshots remain under ignored
`test-results/` as `catalog-staff-1280.png`, `catalog-staff-360.png`,
`catalog-owner-request-360.png` and `catalog-failed-plan-request-360.png`.
Desktop and mobile screenshots were inspected; readable labels wrap within the
record cards, and both widths pass the horizontal-overflow assertion.

Both app runs use `STRELVA_LOCAL_AUTH_PROOF=1`,
`STRELVA_LOCAL_CATALOG_PROOF=1`, the catalog provider preload, local Auth keys
from `scripts/prepare-launch-auth-stack.sh`, and workspace/Systems/planning/
internal-tool-notice release flags on. The model and Resend keys are dummy
fixture values; both dev access bypasses are off. The optimized server additionally
uses disposable Unix-socket Redis through the existing `startLocalRedis` and
`startUpstashBridge` exports in `scripts/scrubbed-copy/redis.ts`, with
`TENANTS_SOURCE=postgres`, `CONTENT_SOURCE=postgres` and `DATA_SOURCE=postgres`.
This exercises the production rate-limit guard through the real Redis client.

The owned app servers, Redis process/REST bridge and Supabase stack
`/tmp/strelva-auth.sBaiDd` are stopped. `supabase stop --no-backup` succeeded;
no containers remain for its project ID `strelva-proof-a1-catalog-472-1`.
The three stopped SQL clusters, Auth directory/private env, Redis directory/
private env, temporary Redis launcher and generated `.next` directories were
removed. Unrelated stacks were left alone. Cleanup evidence is in
`/tmp/a1-472-auth-cleanup.log` and `/tmp/a1-472-redis.log`.

Failures preserved:

- The first expanded run reached revocation with passing submit/label/correction
  assertions, then failed because the new test read `grant.id` instead of
  `grant.grant.id` and sent no JSON body/header. Corrected the fixture request;
  the app's JSON guard was working as intended.
- The first optimized-server attempt omitted Redis and failed both planning
  checks with generic 503s, before the catalog journey could proceed. Production
  rate limiting requires Redis and deliberately fails closed. Added disposable
  local Redis through the existing bridge; the journey then passed. That run's
  log also exposed a missing `TENANTS_SOURCE=postgres` setting in the test server.
  Set the local data-source flags to Postgres and repeated the journey: **2
  passed (11.6s)**, with no production-guard errors in the final app log. No app
  guard was bypassed or weakened. Initial logs are
  `/tmp/a1-472-production-journey-no-redis.log` and
  `/tmp/a1-472-production-app-no-tenant-source.log`.
- `pnpm test -- <paths>` forwarded a literal `--` to Vitest and started a broad
  run. Interrupted it and used `pnpm test <paths> --maxWorkers=2` for the actual
  targeted result: **10 files, 100 tests passed**. The targeted files cover
  internal-tool links, use labels, edits, edit renderer, notice delivery, catalog
  crons/reports/health, workspace recaps and Systems catalog projection.
- The broad attempt found an inherited readiness failure and a booking timeout.
  A bounded rerun of `production-readiness-snapshot.test.ts` and
  `booking-one-store.test.ts` with one worker/30-second timeouts produced
  **46 passed, 1 skipped, 1 failed**. The sole failure is
  `20261011120000_business_policies.sql needs a sentinel` at
  `src/__tests__/production-readiness-snapshot.test.ts:341`. The booking file
  passes. This branch leaves the unrelated readiness mapping to its owning
  stream; it does not claim the complete suite passes.

Canonical project-model/capability/vault reconciliation remains with the
integration coordinator. Proposed evidence delta: the catalog's post-label
isolated Auth limitation is resolved locally; production/provider/commercial
claims are unchanged. Review the verification PR, register the business-policies
sentinel through its owner, then resume the separately authorized release work.

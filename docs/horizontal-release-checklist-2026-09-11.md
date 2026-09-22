# Horizontal release checklist

This checklist covers the [September 12 horizontal implementation](./strelvav2-horizontal-acceptance.md),
which extends the [selected first scope](./horizontal-first-scope-2026-09-11.md).
It does not authorize a production action. Synthetic browser, real local
Auth/Postgres, hosted staging and production evidence remain separate.

## Website launch decision

The [September 21 release direction](./strelvav2.md#september-21-release-direction)
supersedes the September 20 self-service emphasis. Agency website delivery and
independently usable native apps/onboarding belong to the same business.
Request intake does not start the 24-hour commitment. Existing customer
obligations and the selected first customer case below remain. Use the dated
evidence and the preparation sequence below rather than treating old unchecked
feature lists as current missing implementations.

## September 21 production preparation

**Status: prepared sequence; production execution blocked. No client site may
go down.** The [dated evidence](./strelvav2-horizontal-acceptance.md#september-21-production-preparation-evidence)
owns observed values and test results. [AGENTS.md](../AGENTS.md#consequential-actions-and-trust-boundaries)
owns live-action authorization. No production deploy, schema change, environment
write, DNS change, billing action or provider message is authorized by this plan.

### Pinned release and evidence

- App candidate: `9d5e877af89853fb6197db85235889a8eb0733ee` (merged PR #192).
- Marketing candidate: `029525e9130a368aefd83d9f3ce2971751622599` (merged PR #11).
- Shared version: `0.2.0`, still unreleased. Follow [VERSIONING.md](../VERSIONING.md)
  for final release headings and tags; do not rename storefront compatibility symbols.
- The offline migration-checker repair prepared after the app merge is not in
  that candidate. Review/commit it separately; if included in a new release SHA,
  record the new SHA and its applicable checks rather than inheriting CI results.
- Use clean isolated release checkouts. The working REB checkout contains
  unrelated `tsconfig.json` changes and untracked work; marketing also has local
  untracked files. Neither is a deploy source.

The [authorized recovery and compatibility follow-through](./strelvav2-horizontal-acceptance.md#september-21-recovery-coverage-and-compatibility-follow-through)
records the later Redis restore, storage inventory, deployed-source comparison
and schema compatibility results. The user's subsequent explicit release
authorization is recorded there; remaining safety gates still apply.

### Gate 1: establish every affected client dependency

1. Refresh Vercel project/deployment IDs, aliases, source metadata, database and
   Redis mappings. Inventory all active tenants and storefront consumers after
   read-only database access is available. The 19-project Vercel list is a
   discovery inventory, not proof that every project is a paid client or that
   all customer systems are on this team.
2. Preserve all client repository deployments, DNS records, domains, compatibility
   secrets and tenant identities. No client migration is proposed. The current
   control plane directly serves GLDF/Rohlax admin domains and the Rohlax `www`
   alias, in addition to shared `/api/v1/*` services.
3. Resolve the independently discovered Rohlax `www` DNS defect through a
   separately reviewed, explicitly authorized repair. Do not combine it with
   this release or treat its current failure as an acceptable new baseline.
4. Record each site's critical read journey, expected redirects and latency/error
   baseline. Include content, assets, navigation, catalog where used, signed-out
   owner entry, and the read paths behind forms/bookings. An HTTP 200 on a login
   page or generic fallback is not a successful customer journey.
5. Compare candidate contracts against both manifest-pinned client revisions
   and the actual deployed client revisions. Local structural checks do not
   replace authenticated browser or real provider proof.

### Gate 2: inspect and rehearse the exact database delta

The configured project origin is `https://zthifbnrtsirdekzzlxs.supabase.co`.
Do not execute SQL until the authorized connection is independently matched
to the running app. Supabase CLI access was subsequently provided. Read-only catalog inspection
found 62 unapplied candidate migrations and the production-only
`20260802120000_report_snapshots` entry. The dated evidence records the exact
comparison, backup metadata and schema observations.

Use [workspace-target-snapshot.sql](../scripts/workspace-target-snapshot.sql)
with an approved read-only connection. It opens a read-only transaction and
limits statement time. Keep connection credentials out of command output and
tracked files. The comparison was executed against captured metadata and returned blocked;
refresh its inputs before any future decision:

```sh
pnpm check:workspace-target --catalog /private/path/catalog.json \
  --deployment /private/path/deployment.json \
  --expected-project-ref zthifbnrtsirdekzzlxs \
  --expected-source-sha 7507748ba56c28663325a95b5551749e2a96c576
```

The deployment JSON requires `observedAt`, `deploymentId`, `sourceSha`,
`supabaseOrigin` and `catalogProjectRef`. Refresh both snapshots within one
hour; the expected source SHA is the observed live deployment's metadata,
not the candidate commit. The live deployment reports `gitDirty=1`, so that
SHA does not reconstruct its exact artifact. Preserve its immutable deployment.
The checker verifies metadata only and always returns `releaseApproved: false`.

1. Reconcile the captured `report_snapshots` migration without dropping its
   existing table or blindly repairing migration history. Preserve its observed
   SQL as evidence until restored to a reviewed source owner. Compare full
   migration history, names, SQL definitions, RPC signatures/grants,
   extensions, triggers, RLS, relevant indexes and data invariants. Classify drift
   before selecting the pending ordered subset; do not run all 82 candidate files.
2. Review each pending statement for table locks, rewrites, constraint validation,
   index creation and changed function behavior. Choose finite lock and statement
   limits from a representative rehearsal; no unlimited lock wait, destructive
   downgrade, wholesale replay or blind automatic retry is acceptable. In
   particular, `20260920060000_content_version_request_id.sql` alters the live
   `content_versions` table and creates a non-concurrent index. Prepare and
   rehearse a compatible bounded/online execution strategy before approving it;
   its small current size is not permission to block client writes.
3. Verify a recoverable backup/PITR point and rehearse restoration to a separate
   isolated target. Include Postgres, Auth configuration, required storage and
   Redis-authoritative operational state per [persistence boundaries](./persistence-boundaries.md).
   Record backup identifiers, retention, restore time and acceptable recovery loss
   with the operator. Current API evidence reports PITR disabled and no listed
   backups; a usable recovery point is therefore unverified. A backup existing
   is not a successful recovery rehearsal.
4. Run the current production behavior against the upgraded isolated schema,
   then the candidate against that same schema. Include concurrent legacy reads/
   writes and representative client requests while migration statements execute.
   The existing full-upgrade test proves ordering/invariants, not this compatibility
   or production lock behavior.
5. If any pending step requires customer downtime or cannot preserve old-app
   behavior, stop and redesign/split it. A frontend rollback cannot repair an
   incompatible shared database change. Do not silently choose a new production
   database or dual authority as a workaround.

### Gate 3: prepare a configuration delta, not a replacement environment

| Boundary | Required preparation |
| --- | --- |
| Data and crypto | Verify running app and next deployment use the intended Supabase/Redis; preserve existing encryption and HMAC keys. Confirm Postgres source flags and current governed-work authority rather than flipping them from an example file. |
| Auth and continuation | Verify Supabase site URL/redirect allowlist, email provider/templates, ordinary verified identities, invitation claiming and expired/wrong-account recovery. Check `PUBLIC_CONTINUATION_SECRET` or its existing `INTERNAL_API_SECRET` fallback. |
| Exposure | Explicitly select `STRELVA_WORKSPACE_RELEASE`; keep inquiries, customer topology and background work at their existing state unless separately qualified. `REB_DEV_UNGATED_ACCESS` and fixture preview must not expose production. |
| Email | Review the four independent switches in [email-enabled.ts](../src/lib/email-enabled.ts). Client mail defaults off; operator/prospect mail default on; customer mail defaults off. One switch is not a global send stop. Supabase Auth mail needs separate verification. |
| Billing | Preserve current live Stripe configuration, webhook verification and `gldf`/`rohlax` exemptions. A present variable with a redacted value is not a verified setting. No new price, subscription, entitlement or charge is prepared for activation. |
| Providers and crons | Inventory enabled existing jobs and credentials. Keep new background effects off until separately accepted. Do not disable existing customer jobs to make the new release appear quiet. |
| Marketing | Verify canonical app origin and both public entry journeys against the qualified app. Publish only after app acceptance; no client domain move is involved. |

Record each proposed variable's current presence, verified effective behavior,
proposed value/reference, affected scope and reason. Preserve secret values in
the provider's secret store. Project settings apply to a new deployment and do
not prove an older artifact's environment; see [Vercel environment scope](https://vercel.com/docs/environment-variables).
Environment changes require a fresh authorized production deployment, not
rebuilding an old artifact by assumption.

### Gate 4: prepare hosted acceptance and separate approval packets

The packet is not ready for execution until it contains exact project IDs,
database identity, migration filenames/digests, verified recovery points,
configuration delta, candidate artifact IDs, affected aliases and named operator.
Prepare these as separate actions so one approval cannot imply another:

1. **Isolated hosted qualification:** selected private target with isolated
   Auth/Postgres/Redis and outbound effects controlled. No preview may share live
   stores or operational schedules by accident. Record any hosting cost before approval.
2. **Additive schema operation:** exact reviewed pending subset, transaction and
   timeout strategy, old-app compatibility proof, lock observations and recovery.
3. **App release:** new immutable artifact from a clean candidate, approved
   environment, pre-promotion acceptance and precise alias/promotion operation.
4. **Bounded live acceptance:** approved test account/business, recipient/calendar
   where relevant, allowed writes, maximum cost, operator and cleanup. Never run
   synthetic browser fixtures or authenticated cron routes against customers.
5. **Marketing release:** exact artifact, app acceptance receipt and public checks.
6. **Rohlax DNS repair:** its own exact record change and verification, separately
   from the app/schema release.

Minimum acceptance: ordinary signup/email/callback recovery; native app creation,
publication, record retention and revocation; private onboarding version review;
agency request left unaccepted until mutual scope agreement; actual repository/
commit binding; delivery review; wrong-business denial; legacy client owner access;
storefront reads and governed preview/revalidation; preserved billing agreements.
Use desktop and phone, including denied, unavailable and retry states.
The Mooney Outlook/ADR case retains its [separate customer contract](#first-customer-release-case).

### Stop conditions and recovery

- Do not start on an unresolved client availability failure, unknown target,
  unverified backup, unexplained schema drift or missing old-app compatibility.
- During any authorized release, stop promotion on a critical client journey
  failure, changed tenant routing, unexpected authorization/billing denial,
  database lock contention, elevated errors or duplicate external effect.
  Recheck from an independent request before classifying a transient probe;
  do not wait for multiple customer reports.
- Pin the observed app and marketing deployments as recovery candidates, and
  verify that they remain usable before executing. The current app is a dirty
  build: rebuilding its recorded SHA is not an equivalent rollback.
- Restore the known artifact/routing only under the reviewed operation; retain
  additive schema and customer records if old-app compatibility is proven.
  Never restore the entire production database over newly accepted customer work
  as an automatic rollback. Recover evidence/accounting without repeating a
  successful email, booking or payment.
- Preserve existing customer services while stopping only newly introduced
  effects. Reverify client journeys, backlog/cron health, provider receipts and
  ordinary authentication after recovery.
- Human acceptance, a named on-call operator, alert destinations, observation
  duration and concrete baseline-relative thresholds must be recorded before
  public activation. These remain open; HTTP probes alone do not close them.

## Current completion evaluation

The September 20 completion wave uses Jacob's requested Luna agents at maximum
reasoning effort and TDD. The [current completion plan](../todo.md#september-19-completion-plan)
and [dated acceptance record](./strelvav2-horizontal-acceptance.md#september-20-completion-execution)
own the full backlog and proof; earlier evaluation records retain their dates.
UI/UX polish remains deferred; usable existing controls, accessibility, honest
states and recoverable journeys are required now. The eight
[PRDs](../../.scratch/strelvav2-experience/spec.md) and existing definition of done
remain the scope; the tracks below are the first implementation wave, not a
replacement for the full acceptance inventory.

| Track | Required observable evaluation | Independent acceptance |
| --- | --- | --- |
| Application continuity | Setup/retry opens the actual correct-business app; owner and employee use, exact candidate review, publication, record-preserving rollback and revocation work | Verify rendered destination and durable authenticated behavior; URL-only and separate mocks cannot close the handoff |
| Account continuity | Supported context survives authentication and return; wrong-account/business access fails; expired callback recovers; repeat continuation does not duplicate work | Inspect public and authenticated boundaries, privacy in URLs/analytics, and actual retained result |
| Economics | Payer cap controls admission; concurrent attempts and replay cannot double-charge; trusted known cost reconciles once; unknown cost remains explicit | Exercise denied access, failed receipt/settlement and recovery without repeating an accepted provider effect |
| Operations | Accepted assignments execute within scope; expired/revoked authority fails before effect; pause/cancel stops future work; lost receipt recovers once | Use isolated real Auth/Postgres, distinguishing simulated external providers from connected provider evidence |
| Release integration | Focused regressions, typecheck, lint, tests, build, boundaries, ontology, compatibility, version parity and schema/upgrade checks pass | Inspect aggregate failures and source changes; independently evaluate uncovered PRD and learning-loop cases |

Each agent reports changed files, exact command/environment, observed result,
remaining failures and fixture/provider limits. Skips and unavailable prerequisites
are open cases, not passes. A test must fail on the consequential incorrect
outcome it claims to guard. Builders cannot accept their own track solely from
their test count; the independent evaluation and integration review remain gates.
Use isolated data, existing browser/authenticated command/API/SQL boundaries and
separate output directories. Do not weaken acceptance to obtain green checks.

The initial independent evaluation is recorded under
`output/production-completion/evaluation.md`. The acceptance ledger remains the
owner of completed proof. Production deployment, migration and provider actions
must be prepared as exact reviewable operations before crossing their live
boundary; no local run establishes customer adoption or commercial value.

## First customer release case

Jacob selected The Mooney Firm at attymooney.com and its native Outlook / ADR
Notable handoff. [PRD 08](../../.scratch/strelvav2-experience/issues/08-acceptance-release-and-customer-value.md#selected-first-case-the-mooney-firm)
owns that acceptance contract. Strelva retains minimum execution metadata; it
does not introduce a second firm case or inquiry-status system. Generic inquiry
and staff-app passes remain broader-product evidence, not proof of this handoff.

The current client source is `/Users/jacobrhinehart/Desktop/mooney-firm-site`.
Local hardening is isolated in `/Users/jacobrhinehart/Desktop/mooney-native-handoff`
from recorded release commit `b831abc`, preserving the canonical checkout's
uncommitted client work. Production data/configuration, mailbox receipt and the
firm's ADR template/permissions must be verified at the authorized live boundary.

## Scope to review

- Inquiry work inside the existing shared workspace, using the same tenant
  authorization, canonical commands, receipts, rehearsal and publication path.
- CSV import into a saved tracker, with original source, row references, field
  mapping, editable cells, filtering, revision conflicts and attributable history.
- Internal experiment records tied to a tracker revision, including reported
  time, outcome, evidence and known provider cost. They do not publish an offering.
- Website setup suggestions and corrections, scoped business attention, and
  copying an inquiry setup into a fresh draft for another authorized business.
- Private fixed-part applications, scheduling, recurring record comparisons,
  owner-approved work with runtime budgets, scoped contributions and source context.
- Internal evidence and learning work, restricted to active Strelva administrators.
- Record assignments and links, with source-workspace coordination removed on handoff.

CSV is the supported import format. Excel workbooks, spreadsheet formulas,
arbitrary generated applications and third-party agent execution are outside this
slice. Provider connection entries describe current access; an entry in the list
is not an implemented integration or a tenant grant.

## Local gates

Run the focused behavior and failure tests for the changed boundaries, then:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:ontology
pnpm check:boundaries
CUSTOM_REPO_VERIFY_PINS=1 pnpm check:custom-repos
pnpm version:check
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade
```

Use isolated, clean client checkouts at the manifest's exact compatible commits
for the strict custom-repository gate. Follow the [test environment contract](./testing-and-ci.md)
to select `CUSTOM_REPO_CHECKOUTS_ROOT`. A development run that skips missing repositories
does not satisfy this release gate.

Inspect desktop and mobile inquiry, tracker and sharing journeys, including
loading, empty, unavailable, read-only and stale-edit states. Use unique
Playwright output directories for parallel runs. Synthetic browser API responses
prove interaction behavior; they do not prove an authenticated deployed database.

## Candidate migration dependency

The September 20 candidate adds workspace, calendar, billing, exit and export
contracts. Rehearse the complete ordered tail with `pnpm check:workspace-upgrade`,
then compare hosted migration history before selecting the pending subset.
Apply the authorized additive schema before deploying code that calls it. In
particular, inquiry capture and delivery now resolve installed resources through
`read_inquiry_workspace_exit`; an unavailable authority stops a new submission or
send instead of bypassing a recorded exit. A workspace release flag does not
remove this existing-client dependency. Keep production deployment disabled
until schema order, current client compatibility and rollback are reviewed.

## Authenticated staging proof

Use an isolated Supabase Auth/Postgres and Redis environment with synthetic
businesses and users. Do not point a local fixture at production stores.

1. Verify applied migration history. Apply only pending migrations in order,
   including the workspace prerequisites, inquiry workspace migration
   `20260911100000_inquiry_capability_workspace.sql`, and tracker update migration
   `20260911150000_tracker_work_updates.sql`.
2. Use two unrelated users and a scoped reviewer. Test login, saved-work reload,
   lost membership, revoked delegation, wrong-recipient handoff, stale edits and
   unavailable stores through the real request adapters.
3. Exercise request, shape, edit, rehearsal, exact-version publication, intake,
   receipt and Undo. Confirm that Undo preserves already received inquiries.
4. Interrupt delivery at the claim, provider-acceptance and evidence-write
   boundaries. Retry and restart. Confirm one accepted external action and
   repairable evidence. Check pause, changed version, budget, bounce, reply,
   disconnection and missing-evidence gates.
5. Import two structurally different synthetic CSV files. Save, reload, edit,
   filter, share within the supported scope and revoke access. Attempt a stale
   experiment submission and confirm that it cannot describe a newer revision.

## Repeat the isolated local adapter checks

The optional browser files are `tests/tracker-authenticated-local.spec.ts`,
`tests/tracker-handoff-authenticated-local.spec.ts`, and
`tests/inquiry-authenticated-local.spec.ts`,
`tests/horizontal-operations-authenticated-local.spec.ts`,
`tests/work-authority-authenticated-local.spec.ts`, and
`tests/tracker-coordination-authenticated-local.spec.ts`, and
`tests/work-plan-application-authenticated-local.spec.ts`. They require loopback application
and Supabase URLs and use actual local Auth sessions. They skip unless
`STRELVA_LOCAL_AUTH_PROOF=1` is set. The September 12
[local verification note](./work-authority-local-verification-2026-09-12.md)
records the actual isolated run and its limits. Background responsibility and
investigation dispatch additionally requires `STRELVA_BACKGROUND_WORK_RELEASE=1`;
that gate remains off in production.

Create a separate local Supabase project with the forward numeric migrations,
and keep its keys outside tracked files and logs. Run the app with the matching
local Supabase URL, anonymous key and service-role key, the workspace/inquiry
release flags enabled, `TENANTS_SOURCE=postgres`, and
`REB_DEV_UNGATED_ACCESS=0`. Clear production provider and storage credentials
from the app process. Match the exact app hostname in `PLAYWRIGHT_BASE_URL` so
the same-origin check remains active.

For inquiry delivery, use a separate Redis store through its local REST adapter.
The Node preload `tests/support/local-provider.mjs` answers the supported Resend
fetches with synthetic results and blocks other non-loopback fetches. Load it
only into the isolated test app with `NODE_OPTIONS=--import=<absolute-path>`,
`STRELVA_LOCAL_PROVIDER_PROOF=1`, and a private
`STRELVA_LOCAL_PROVIDER_LOG` path. The test process needs those proof flags and
local Redis settings too. Use a fake Resend key, the explicit customer-mail
switches, a synthetic reply domain, and locally generated publication/cron
secrets. This fixture proves application behavior around a provider response;
it does not prove Resend configuration or delivery to a mailbox.

Run the browser files with separate output directories. Run the production
build and the full unit suite separately on this workstation so compilation
does not starve the tests' existing timeouts. Never substitute production keys
or real recipients for the local fixture prerequisites.

## External test and production authority

Before any external write, prepare the exact environment, tenant, recipient,
provider operation, cost limit and rollback, then obtain explicit authority.
No sending switch, webhook registration, DNS change, migration or deployment is
implied by local testing.

The relevant exposure flags are `STRELVA_WORKSPACE_RELEASE` and
`STRELVA_INQUIRIES_RELEASE`. Inquiry publication additionally needs a securely
generated `INQUIRY_PUBLICATION_CLAIM_SECRET`. Reply tracking uses an explicitly
configured `INQUIRY_REPLY_TO_DOMAIN`; signed callbacks use `RESEND_WEBHOOK_SECRET`.
Mail-provider configuration, verified sender/receiving setup and tenant email consent
must be checked independently of those flags. Existing audience switches and
responsibility policy remain authoritative for every send.

Install the shared inquiry form in a representative client repository and verify
its versioned storefront contract before enabling that client's capability.
A preview receipt is not evidence that a real client website changed.

## Reply evidence scope

Receiving checks cover replies delivered to the inquiry's configured tracking
address. They do not observe a staff member's unrelated mailbox or a phone call.
When staff answer elsewhere, they must mark the inquiry handled in Strelva.
Unavailable or incomplete receiving evidence blocks automatic follow-up.

The implementation uses [Resend's receiving list](https://resend.com/docs/api-reference/emails/list-received-emails)
and its documented [newer-to-older cursor pagination](https://resend.com/docs/api-reference/pagination#forward-pagination).
A sweep reads at most three pages of 100 message references. It requires a
complete window through the inquiry's received time; malformed data, inconsistent
ordering or an incomplete window cannot establish that no reply exists. No
inbound message body is copied into the inquiry workspace.

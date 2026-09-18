# Strelva migration acceptance and evidence audit

Audit date: 2026-09-18. Scope: the strelvav2 definition of done, horizontal
acceptance ledger, local verification notes, release checklist, current source,
tests, and migration evidence. This is read-only. I did not use provider keys,
production stores, or a live external service.

## Verdict and score

The repository contains substantial local evidence for bounded native work,
including real local Auth/Postgres journeys recorded in the dated verification
notes. The horizontal migration is not ready to call accepted. The strongest
missing evidence is reproducibility of the claimed test coverage, model-planning
cost control, scheduled research execution, human product acceptance, and a
staging or representative-client migration run.

Overall acceptance-evidence confidence: **4.6/10**, confidence in this score:
**high (about 0.85)**. This is an audit confidence score, not a completion
percentage.

| Dimension | Score | Reason |
| --- | ---: | --- |
| Contract clarity and coherence | 1.4/2 | The three finish lines and evidence rules are unusually explicit, but the build-order language is stale in two owners. |
| Source-to-test traceability and reproducibility | 1.0/2 | Most rows link to source and tests, but the required browser proofs are opt-in, not in the normal gate, and there is no run manifest tied to a revision. |
| Critical behavior and failure evidence | 1.2/2 | Local Auth, SQL, concurrency, revocation, rollback and duplicate-effect cases are strong for bounded paths. Planning spend, provider operation and scheduled dispatch remain open. |
| Product experience and human acceptance | 0.5/2 | Fixture browser coverage is broad, but the required goal-based unfamiliar-user and restricted-member sessions have not been accepted by Jacob. |
| Migration, staging and operation readiness | 0.5/2 | SQL is isolated local evidence. No current staging migration history, hosted authenticated run, representative client installation, or production operation is proven. |

The documentation is honest about most boundaries. I would score boundary
honesty **8/10**. That should not be confused with acceptance of the product.

## Top five findings

### 1. The current proof set is not reproducible from the normal repository gate

Observed evidence:

- `package.json:13-18` defines `pnpm test` as Vitest and puts Playwright in a
  separate smoke command. The authenticated journeys are not part of that
  default command.
- `tests/application-request-authenticated-local.spec.ts:6` skips unless
  `STRELVA_LOCAL_AUTH_PROOF=1` is set. The full application-use journey also
  needs `STRELVA_APPLICATION_USE_JOURNEY=1` at
  `tests/application-use-authenticated-local.spec.ts:5-8`, and inquiry proof
  additionally needs `STRELVA_LOCAL_PROVIDER_PROOF=1` at
  `tests/inquiry-authenticated-local.spec.ts:8-11`.
- The September 15 ledger explicitly says its browser proofs use fictional
  request adapters and did not run against real local Auth/Postgres
  (`docs/strelvav2-horizontal-acceptance.md:41-48`). It then reports 2,736
  Vitest tests and fixture screenshots (`:55-59`).
- The same ledger says local Auth/Postgres proof exists broadly while Jacob's
  review is still pending (`docs/strelvav2-horizontal-acceptance.md:144-160`).
  The statements are individually qualified, but a reader cannot reconstruct
  which exact rows the dated runs cover.
- At audit time the worktree has modified acceptance documents and many
  untracked source and migration files. The pass counts are not tied to a
  commit hash, migration checksum, environment record, or artifact manifest.

Implication: a green default suite can coexist with every high-value
authenticated browser journey being skipped. The dated notes are useful
evidence, but they are not yet a durable acceptance record that a second person
can reproduce against the same revision.

Required proof, in priority order:

1. Freeze a revision and write an evidence manifest with commit SHA, migration
   list/checksum, app URL, flags, exact commands, pass/skip counts, and artifact
   paths. Keep fixture, real-local, staging, provider, and customer-result
   evidence as separate classes.
2. Add one explicit local-auth command that fails when a required test skips.
   The command should run the application request/use, tracker, handoff,
   inquiry, operations, assignment, and plan-output journeys against the
   declared isolated stack.
3. Link each acceptance row to the manifest entry and its remaining boundary.

### 2. Planning generation is outside the budget and usage receipt boundary

The product promise and acceptance row require plans to expose limits and costs
(`docs/strelvav2-horizontal-acceptance.md:120-125`). The implementation makes a
different boundary:

- The plan contract hard-codes `estimatedCost: null`
  (`src/products/work-plans/contracts.ts:154-165`).
- `createWorkPlan` admits membership and storage, gathers context, calls the
  model, normalizes the result, and saves it (`src/products/work-plans/server.ts:637-702`).
  It does not call the budgeted executor around the model request.
- The model call has a 20-second deadline, 1,800 output-token ceiling and zero
  SDK retries (`src/products/work-plans/server.ts:158-187`). A token ceiling is
  not a dollar cap or provider usage receipt.
- The repository's own acceptance note records the gap: no dollar-budget
  enforcement or usage receipt, no provider credential, and no generation run
  (`docs/strelvav2-horizontal-acceptance.md:84-90`).
- `src/platform/work-economics/runtime.ts:67-124` does provide reservation,
  recheck, finish, unknown-effect and replay handling for a native execution.
  That proves execution admission, not the cost of preparing a plan.

Implication: a user can ask for a model-backed plan before any trusted planning
cost is admitted or recorded. This is a material partial migration because
"planning" and "execution" are presented as one connected product loop while
their economic controls differ.

Required decision and proof:

- Either mark model planning as `cost unknown / provider-unverified` and keep it
  outside the accepted-cost promise, or route it through a separate model
  budget reservation and receipt. The latter needs tests for cap denial,
  timeout, provider acceptance followed by lost response, fallback behavior,
  duplicate retry, and reconciliation.
- Keep native execution-budget tests separate so a passing document or app
  execution cannot be cited as planning-cost evidence.

### 3. Recurring research and background operation have a code path, not an
accepted scheduled run

R1 requires the next scheduled run to process new material, detect changed or
withdrawn sources, record cost, expose outages, and deduplicate observations
(`docs/strelvav2-definition-of-done.md:122-139`). The engine and service contain
useful state transitions for withdrawal, changed evidence, duplicate events,
budget limits, and outages. Unit tests cover several of those transitions in
`src/__tests__/product-learning.test.ts:15-65` and source access failure is
represented in `src/products/product-learning/service.ts:62-98`.

The scheduled boundary remains unproven:

- Vercel declares `/api/cron/workspace-work` every five minutes
  (`vercel.json:102-104`), but the route returns `{"status":"disabled"}` unless
  both release flags are enabled (`src/app/api/cron/workspace-work/route.ts:7-20`).
- `STRELVA_BACKGROUND_WORK_RELEASE=0` is the checked-in example, and the
  release checklist states this gate remains off in production
  (`.env.example:189`; `docs/horizontal-release-checklist-2026-09-11.md:71-85`).
- The sweep unit test uses mocked stores and proves a restart path for a
  standing job (`src/__tests__/standing-run-recovery.test.ts:64-68`). I found no
  recorded run of the cron route with a due product-learning row, heartbeat,
  source outage, and retry against the isolated Auth/Postgres stack.
- The ledger describes scheduled registered-source collection as implemented,
  while also saying live research and customer outcomes remain evidence gates
  (`docs/strelvav2-horizontal-acceptance.md:139`); the distinction should be
  made explicit in the row state.

Implication: the learning state machine is locally plausible, but R1 is
implemented/unverified rather than accepted. The same distinction applies to
ongoing customer operation while the background flag is off.

Required proof: create a due internal learning record in the isolated stack,
invoke the real cron handler with the background flag on, capture the heartbeat
and persisted revision, then exercise duplicate, changed, withdrawn, outage,
budget-exhausted, pause, restart, and failed-store cases. Leave the state
unverified if the flag is intentionally kept off.

### 4. Product experience evidence is scripted fixture evidence; human acceptance
is still absent

The R8 contract asks for goal-based browser/computer sessions that retain the
objective, role, conditions, actions, dead ends, completion, and observed
friction. It specifically calls for an unfamiliar-user objective and a
restricted-member recovery objective without button scripts, and says agent
hesitation is not human usability evidence
(`docs/strelvav2-definition-of-done.md:136-139`). The ledger correctly records
Jacob's human review as pending (`docs/strelvav2-horizontal-acceptance.md:146-155`).

Current UI tests do not meet that evidence class:

- `tests/illustrated-home.spec.ts:3-15` runs a `/preview/strelva` fixture and
  drives named buttons such as `Open Harbor Dental`.
- `tests/workspace-release.spec.ts:4-10` says every workspace API response is
  intercepted and that the checks do not exercise auth, database, providers, or
  live AI assessment.
- The application request journey is stronger persistence evidence, but its
  planning request is intentionally intercepted (`tests/application-request-authenticated-local.spec.ts:23-36`).

Implication from a product-experience perspective: the controls can be
functionally reachable while the first-time user still cannot tell what to
start, what will happen, what authority is being requested, or how to recover.
The current evidence does not measure discovery, explanation, confidence,
correction effort, or permission comprehension.

Required proof: run two goal-based sessions on the frozen build. First, an
unfamiliar owner starts from a plain business goal and reaches a reviewable
proposal. Second, a restricted employee recovers from a failed submission or
revoked access without seeing owner controls. Include 320/390 and desktop
widths, keyboard, empty, large, unavailable, and stale states where relevant.
Record the objective, role, actions, dead ends, completion, time, assistance,
and observed friction. Jacob should accept or reject the journey explicitly.

### 5. Migration and release evidence stops at isolated local SQL

The latest ledger says no migration was applied to a live database and that the
new browser proof did not run against real local Auth/Postgres
(`docs/strelvav2-horizontal-acceptance.md:41-48`). The release checklist asks for
an isolated authenticated staging environment with applied migration history,
two unrelated users, revoked membership, stale edits, delivery interruption,
and recovery (`docs/horizontal-release-checklist-2026-09-11.md:49-69`). It also
requires a representative client repository installation and versioned
storefront contract check before enabling a client capability
(`docs/horizontal-release-checklist-2026-09-11.md:111-128`).

The current verification record repeatedly draws the same boundary: local
Auth/Postgres and synthetic provider fixtures passed, while deployed operation,
real mail, representative client installation, and production activation remain
unproven (`docs/horizontal-local-verification-2026-09-11.md:84-116`, `:223-239`).

Implication: the migration is a local implementation branch, not a release
candidate. SQL assertions show schema behavior in an isolated cluster; they do
not establish applied history, hosted configuration, rollback rehearsal,
operator visibility, or compatibility with a real client repository.

Required proof: prepare a clean staging run with migration history and checksums,
apply the full forward chain in order, run the required real-auth failure paths,
rehearse the documented rollback limits, install the shared capability in one
representative client repository, and capture release flags, monitoring,
rollback, and owner sign-off. Production remains a separately authorized step.

## Coherence issue: stale sequencing language

This is a documentation conflict, not an engineering failure. The September 15
product brief says the new direction supersedes the September 14 restriction on
opening horizontal work; the staff application remains a regression and
acceptance journey (`docs/horizontal-product-brief-2026-09-11.md:133-137`). It
also says later topology work should proceed while preserving that journey
(`:166-185`). The September 14 audit still says to complete one staff request
application before starting later delivery paths (`docs/horizontal-audit-and-plan-2026-09-11.md:99-106`),
and the definition of done repeats that sequencing language
(`docs/strelvav2-definition-of-done.md:231-241`).

Canonical wording should be: broader topology implementation is authorized in
parallel; the staff application remains a mandatory regression and acceptance
journey; its completion does not block implementation of later paths, and it
does not certify them. Put that sentence in the three owner documents and link
to one source of truth.

## Trace summary

| Promise | Source and evidence | Current state |
| --- | --- | --- |
| Request to application, employee use, review, publish, recovery | `docs/strelvav2-horizontal-acceptance.md:61-82`; `tests/application-request-authenticated-local.spec.ts:9-36`; later actions use local Auth/Postgres | **Implemented locally, planning provider unverified.** |
| Plans expose costs and limits | `docs/strelvav2-horizontal-acceptance.md:120-125`; `src/products/work-plans/contracts.ts:154-165`; `src/products/work-plans/server.ts:158-187` | **Partial.** Native execution has budget accounting; planning cost is unknown and unreceipted. |
| Recurring research and ongoing work | `docs/strelvav2-definition-of-done.md:128-139`; `src/products/operations/sweep.ts:7-32`; cron route and flag above | **Implemented state machine, scheduled run unverified.** |
| Shared product experience across roles | `docs/strelvav2-horizontal-acceptance.md:120-142`; preview and intercepted browser suites | **Fixture verified; human acceptance pending.** |
| Safe migration and release | `docs/horizontal-release-checklist-2026-09-11.md:49-128`; local verification limits above | **Isolated local only; staging/client/production gates open.** |

## Priority evidence plan

1. **Freeze the evidence baseline.** Tie the current source, acceptance docs,
   migration list, flags, commands, and artifacts to one commit and manifest.
2. **Run the declared real-local journeys.** Fail on skipped required tests and
   record exact Auth/Postgres/Redis/provider-fixture boundaries.
3. **Resolve planning economics.** Either accept unknown planning cost as an
   explicit limit or implement and test model reservation, receipt, and
   reconciliation.
4. **Exercise the real scheduler locally.** Prove one due learning run,
   heartbeat, source change/withdrawal, outage, duplicate, budget, pause, and
   restart path.
5. **Conduct human goal-based UX review.** Capture owner and restricted-member
   sessions with friction and explicit acceptance.
6. **Run staging migration and client compatibility proof.** Keep production
   activation separate and authorized.

Until steps 1 through 5 are complete, report the migration as **local
implementation with bounded evidence**, not as a horizontally accepted product
or an operated offering.

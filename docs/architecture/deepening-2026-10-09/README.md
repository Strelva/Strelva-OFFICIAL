# Architecture deepening: integration record

Objective: remove duplicated domain and interaction rules before Strelva 1.0,
while preserving identity, current authority, admitted requests and live-client
contracts. Jacob selected all six review candidates and authorized separate
PRD streams. The implementation base is `reborn-1.0` at
`e9511b044b217fc233bde6b174c12988eaa2e950`.

## Reviewed source

The reads stream, [PR #617](https://github.com/Strelva/Strelva-OFFICIAL/pull/617),
is integrated by fast-forward at the complete head
`65ebfc723b25e8a6c891589103be1530636cd83a`. Its
[PRD](05-read-performance.md) and [handoff](05-read-performance-handoff.md)
own the implementation, initial failures, exact commands and scoped limits.
Runtime source shrinks by eight lines: 71 additions and 79 deletions. Tests
and documentation are counted separately; this is no latency measurement.

The coordinator independently reran the ten recorded suites on that exact
head in the stream's isolated worktree: **140 passed, 12 skipped**. Typecheck,
product boundaries, ontology, focused ESLint and the complete diff check pass.
The integrated runtime and tests are identical to that tested source. The skips are eleven
PostgreSQL Version-store cases and one Library/Review-all case;
`STRELVA_VERSIONS_PSQL` was unset. No native SQL, Auth, browser, provider,
production or measured economic proof is added by this run.

Independent read-only review found no integration blocker in chooser
qualification, workspace selection, provider-seat visibility, required errors
or snapshot JSON. Current actor and source checks remain in their adapters.
The chooser bypasses client comparisons and inquiry hydration; full Library
behavior stays covered separately.

### Projection synchronization caveat

`readWorkspaceSystems` also synchronizes stored Possibilities for writable
viewers. It now overlaps customer-delegation reads. A different required read
can fail while an already-started synchronization continues; a failed snapshot
does not promise that no prepared Possibility was saved. The previous GET also
allowed synchronization before later required authority/brand/assessment reads
failed. The delegation read is not source-write admission.

Each Possibility create/save still invokes current actor-scoped SQL, with
identity, membership, grant, exit, revision and pin checks. These are unchanged
source guards, not newly exercised SQL proof. New route tests mock the Systems
adapter and do not reproduce its synchronization racing with delegation
failure. This is retained uncertainty, not an observed permission bypass.

## Released source in the isolated union candidate

All six exact source heads are released and combined in
`integrate/architecture-depth-20261009`. The merge checkpoint is
`01dfae2e2`, before the union's additional recovery repair and regression
fixtures. This is an isolated candidate: draft PR preparation is underway,
while the coordinator holds canonical `reborn-1.0` integration for independent
candidate review. `main`, production and shared migration application remain
outside this work.

- Reads [PR #617](https://github.com/Strelva/Strelva-OFFICIAL/pull/617):
  `65ebfc723b25e8a6c891589103be1530636cd83a`, already in the union's base;
  [PRD](05-read-performance.md), [handoff](05-read-performance-handoff.md).
- Domain/Version [PR #618](https://github.com/Strelva/Strelva-OFFICIAL/pull/618):
  `4543251842d0546258e392fdf368635b1deaf6c3`;
  [PRD and handoff](01-domain-version.md). Runtime commit
  `1b70821155f51699d3c1398978ab15bc5517b264` precedes its proof-doc correction.
- Location [PR #619](https://github.com/Strelva/Strelva-OFFICIAL/pull/619):
  corrected `3de2cedc580025a0921533bb5efe9b22597c40e2`;
  [PRD and handoff](workspace-location.md). This includes both the original
  location work and the independently cleared remount/departed-callback repair.
- Website [PR #620](https://github.com/Strelva/Strelva-OFFICIAL/pull/620):
  corrected final `5beb3829def795887dc11c822c693bc625c0cc32`;
  [PRD and handoff](02-website-settlement.md),
  [test manifest](02-website-test-files.txt). Runtime `683c6efe5` precedes the
  explicit test/doc followup. Final independent audit cleared this exact head.
- Opened-work composition
  [PR #621](https://github.com/Strelva/Strelva-OFFICIAL/pull/621):
  docs-final `3b898fe5f5c338a02ee28f5258223a6850a34ca3`;
  [PRD and handoff](opened-work-composition.md). Runtime remains
  `e7fe129a5ee706de91d4c071edd69c0e2b888ff3`, independently reviewed.
- Lifetime System kind
  [PR #622](https://github.com/Strelva/Strelva-OFFICIAL/pull/622):
  `bfb5ab065d934c03cdb6665229022e8e935ccbc0`;
  [PRD, frozen hashes and handoff](06-lifetime-system-kind.md). Its distinct
  release supersedes the earlier hold. Independent review verified predecessor
  migration/helper bytes and the new frozen forward/inverse hashes.

Full peer histories and handoffs are retained. Git reconciled the narrow
WorkspaceApp import/render and navigation/save adjacency, plus the component
inventory additions; combined tests still own behavioral qualification. The
reads chooser remains in `agency/version-server.ts`. No peer worktree was edited.

## Domain and authority preserved

One Version-owned determination supplies working definition, latest release,
release-needed verdict, next number and changed paths to projection,
generic/native preparation and release. The first release describes its full
definition; reordered object keys do not create preparation. Array order still
matters. Native exact-revision reads and retained receipts precede the
unchanged-work exit; release qualification, approval and locked-field guards
remain. The coordinator's source-specific rerun was **113 passed, 12
SQL-dependent skips**, with typecheck, boundaries, ontology, focused ESLint and
diff whitespace passing. Those counts overlap other stream suites and are not
unique union coverage.

Domain #618 does not change kind meaning. Jacob separately selected lifetime
`System.kind`: a proposal can gain onboarding through content, purpose and
behavior while retaining its kind. #622 removes the mutable application contract
and prepares forward SQL enforcement. Historical rows and all predecessor
migration bytes remain unchanged. Source admission is not permission to apply
that migration to shared/production data, reinterpret historical kinds or roll
out enforcement.

Composition keeps current permissions with each caller. Website admission now
rejects deterministic invalid fresh URL input before retaining a command; an
actually uncertain write retains the exact original command ID/body. Shared URL
normalization preserves crawler error compatibility, while server DNS,
redirect validation and pinned fetching stay separate. Supplemental History or
domain failure cannot undo a confirmed mutation. Frozen public props, session
keys and client-site contracts stay intact.

## Union behavior and evidence in progress

The [union PRD and proof record](07-architecture-union.md) owns the current
objective, exact commands, retained failures, final totals and continuation.
Its [combined test manifest](07-union-test-files.txt) deduplicates peer suites.
The original preflight sections in that document are historical; the source
release supersedes their runtime hold and pending-kind disposition.

The real V1/V2 refresh regressions exposed an additional recovery defect: an
acknowledged save survived a temporary snapshot failure, but App callback
authority stayed invalid and the owner had no preserving retry path. Initial
union evidence retained ten failed deferred recovery cases. The candidate adds
**Retry workspace refresh**, retaining the same work/tool through repeated
failure. Only a successful current-workspace GET restores callback authority;
401/403/404 still remove access, and navigation rejects stale reads. Dismiss is
omitted for this required retry so the owner cannot hide the recovery action.
This repair does not turn retained requested scope into authority.

A recorded union gate run passes **41 tests in three files**, covering real
WorkspaceApp/tools and both workspace/System entrances: accepted-save deferred
refresh, V1/V2 recovery and subsequent usability, Home/Back departed creation,
valid foreign identity envelopes, revision regression, role/authority epochs,
and supplemental History/domain failures. Fictional closed transports prove
these local interaction rules, not genuine Auth, provider acceptance or hosted
delivery. The final local browser replay separately passes **31 peer cases plus
10 union cases**, including coarse-pointer geometry, keyboard and deferred recovery
at 1440/390/320px. Its fixture and unavailable Croki host limits are retained in
the [union handoff](07-architecture-union.md).

The first broader manifest run retained **979 passed, five failed, 12 skipped,
and six unhandled errors across 83 files**. The failures came from old runtime
fixtures using invalid workspace/System identifiers and missing workspace scope now rejected by the strict
location contract. Only fictional fixture IDs were corrected; guards were not
weakened. The affected two-file rerun passes **42 tests**. The deduplicated
[83-file manifest](07-union-test-files.txt) now passes **984 tests / 12 skips**,
with zero unhandled errors. The skips are eleven PostgreSQL Version-store cases
and one Library/Review-all case requiring `STRELVA_VERSIONS_PSQL`. This is a
targeted combined run, not the full repository suite.

Typecheck, product boundaries and ontology pass after the recovery correction;
full lint passed on merged source and final correction files pass focused lint.
The three mandatory union files reran after the mobile-only layout change:
**41 passed / zero skips**. Clean build remains deferred for the serialized SQL
companion resource window. Runtime TypeScript/TSX, runtime SQL, tests and docs will be counted
separately in the union handoff. No subtraction, bundle, latency, adoption or
economic claim is inferred from prior stream counts.

## Disposable SQL qualification and retained blockers

The actual combined-source
`PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-lifetime-system-kind.sh`
passes its fully ordered disposable local contract: kind-change refusal,
legacy no-op, ordinary updates, authority/history, current native writers,
preflight and inverse/reapply. This is explicitly conditioned local proof.
Immediately before unchanged migration 1751, the runner temporarily revokes
only the local Supabase shim's anon/authenticated table defaults and
anon/authenticated/service-role function defaults, then restores them
immediately after. The lifetime tail runs with those restored hostile defaults.
No migration guard is skipped and no frozen migration byte is rewritten.

The required combined runners remain failures:

- `pnpm check:workspace-sql` stops at
  `20261022175100_legacy_google_operation_authority.sql:24` with
  `legacy_google_creation_authority_invalid`.
- `pnpm check:workspace-upgrade` stops at
  `tests/money-effect-admission-schema.sql:78` because the historical booking
  fixture omits required `business_bookings.created_at`.

Neither required runner reaches the new lifetime tail. The focused conditioned
pass does not qualify either required runner. Historical native fixture failures
remain in the [kind handoff](06-lifetime-system-kind.md): an unqualified source
revision, missing current package/private source grant, unpersisted content
pointer and omitted historical content author. Current-writer proof does not
mark those historical suites passed. Hosted ACL/Auth, historical-kind review,
live preflight and migration application remain separate release obligations.
No agency-workflow/provider authority expansion or shared database action was
performed.

## Candidate freeze and exact next action

The recovery correction is frozen at
`77fc4ea49f61aecc901f92062d8646bd125f21ee`, ordinary-published for separately
held foundation preparation. Registration `95424f72fa836bed1a32566aa48021c8cce7f903`
adds one proposed lifetime-kind packet entry with frozen hashes; later metadata
correctly says empty-schema inverse/reapply restores definitions/ACL while
populated inverse refuses and preserves rows/forward fingerprints. Offline
inventory and 40 release-safety tests pass; all historical entries stay unchanged.

The separately authorized inquiry deletion is frozen at
`201c19874be9be5f3ea65128e06a00826607a781`: only fabricated href construction is
removed, with the existing Unavailable fallback and resource/installation/history
retained. Two initial emission/UI regressions fail, then 23 tests and two actual
installation browser cases pass. No exact mapping, grants or UUID-to-tenant alias
is introduced. An actor-authorized resource/tenant/business mapping remains future
prepared work. Final changed-file checks pass; the single clean-environment build
passes exit 0 with retained tracing/deprecation warnings and the broad slot released.
See the [union handoff](07-architecture-union.md)
and [changed-file manifest](07-union-changed-files.txt) for final evidence/counts.

Draft [#623](https://github.com/Strelva/Strelva-OFFICIAL/pull/623) targets
`reborn-1.0`. Root must independently review its final candidate head and the SQL
companion's separately repaired harness before canonical integration. The companion's
passing conditioned PG18 upgrade is separate evidence; this candidate's required
runners retain their observed failures until a reviewed helper release is combined.
No PG17, hosted ACL/Auth, historical-kind, live preflight or migration application
qualification follows. Canonical integration remains held. F01 must preserve the
new held release inventory entry during later convergence.

Canonical `PRODUCT_MODEL.md` and shared strategic state remain with their existing
integration owner. Return bounded evidence deltas without creating a competing
model or claiming a commercial change.

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

## Reviewed, awaiting convergence

[Domain/Version PR #618](https://github.com/Strelva/Strelva-OFFICIAL/pull/618)
is reviewed at `4543251842d0546258e392fdf368635b1deaf6c3` and remains isolated
until the remaining streams converge. The coordinator reran its fifteen suites:
**113 passed, 12 SQL-dependent skips**. Typecheck, boundaries, ontology, focused
ESLint and diff whitespace pass. These totals overlap other streams' suites;
do not add them as unique combined coverage.

Independent source review found no blocker. One Version-owned determination
now supplies working definition, latest release, release-needed verdict, next
number and changed paths to projection, generic/native preparation and release.
The first release describes its full definition; reordered object keys do not
create preparation. Array order still matters. Native exact-revision reads and
retained receipts precede the unchanged-work exit; release qualification,
approval and locked-field guards remain. Supported release/restore and current
SQL wrapper paths keep current/latest aligned. Runtime source adds seven lines
while removing consumer-local decisions; no new module or dependency is added.

Caller tests use fictional transports, including generic runtime eligibility
that is deliberately substituted. They do not prove native eligibility, SQL,
Auth, provider publication or production. The stream's fictional preview proof
also substitutes responses; it does not execute the refactored server helper.

The founder glossary requires lifetime System kind, while older contracts,
stores, tests and SQL permit kind updates. No application update caller was
found beyond stores/tests, but the service-role RPC still exists. Kind affects
health and native eligibility, so renaming it a description does not reconcile
the discrepancy. This PR changes neither meaning nor enforcement. Jacob selected
lifetime `System.kind` on October 9: a proposal can gain onboarding through
content, purpose and behavior while keeping its kind. A separate implementation
stream will remove the mutable contract and prepare forward SQL enforcement,
preserving existing rows and migration history. Local disposable proof is
authorized; applying migrations to shared/production data or rolling out the
change still requires the existing separate authorization.

## Remaining streams and integration order

Opened-work composition [PR #621](https://github.com/Strelva/Strelva-OFFICIAL/pull/621)
is independently reviewed at `3b898fe5f5c338a02ee28f5258223a6850a34ca3`.
Its runtime is unchanged from `e7fe129a5ee706de91d4c071edd69c0e2b888ff3`;
the later commit clarifies the combined acceptance gate. Inspection found no
introduced dispatch, callback or permission blocker. The website peer's
unconditional scope/revision guard closes an inherited initial-read gap in the
intended union. This inspection is not combined execution proof.

Two other reviewed heads need correction before integration:

- Website [PR #620](https://github.com/Strelva/Strelva-OFFICIAL/pull/620), original
  head `8ff3578f485f4b207fbbf5be5af2a78d13faa70c`: malformed initial input can
  become an immutable unknown attempt before any service claim exists. Reject
  deterministic input errors before admission; retain exact replay for uncertain
  writes. The owning stream is preparing a corrected head.
- Location [PR #619](https://github.com/Strelva/Strelva-OFFICIAL/pull/619), original
  head `ebbeda6e2ea0402220461c0a050c6f36c4cd70ba`: same-work save refresh clears
  selected work before awaiting the snapshot, remounting Website and losing its
  settled notice. A callback from a departed creation instance can also be
  admitted after Home then Back restores the same URL. The owning stream is
  preparing refresh preservation and instance-generation regressions.

Mandatory union cases use the real WorkspaceApp and tools: defer the same-work
snapshot after an acknowledged save and preserve work, attempt and notice while
pending, after success and after refresh failure; depart and return before an old
save settles and refuse its callback; reject a successful wrong-work/workspace
website envelope through both entrances; and retain revision 2 against a delayed
revision 1. Fast batched fixture runs do not substitute for deferred settlement.
Preserve permission epochs, workspace/work keys and optional History/domain
unavailability without treating those reads as unknown writes.

- Domain and Version changes: reviewed and held at the head above; retain the
  separate System-kind decision when integrating.
- Website acceptance/recovery: retain submitted payloads and stable public
  props and workspace/work session keys; supplemental reads cannot undo an
  accepted mutation.
- Workspace location: own navigation/start/save/history changes, preserving
  URL and Back contracts.
- Opened-work composition: own shared rendering and imports, preserving
  distinct action permissions and mounted request identity.
- Lifetime System kind: enforce the selected glossary contract in an isolated
  follow-up; inventory native/health consumers and existing SQL writers, prepare
  forward enforcement, and prove changed-kind refusal plus ordinary updates.

Review each exact completed head and its proof before integration. Reconcile
`agency/version-server.ts` without losing the reads stream's chooser hunk.
Reconcile WorkspaceApp navigation and composition against both behavioral
contracts. Then run the affected tests and rendered desktop/mobile scenarios
on the combined source; isolated passes do not prove the union.

Keep the next-release source in `reborn-1.0`; `main` and production remain
outside this work. Canonical `PRODUCT_MODEL.md` and shared strategic state stay
with their existing integration owner. Hand off bounded evidence deltas rather
than creating a competing model or claiming a commercial change.

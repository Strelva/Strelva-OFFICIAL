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

## Remaining streams and integration order

- Domain and Version changes: finish the common change verdict; return the
  traced System-kind ambiguity without silently reversing runtime meaning.
- Website acceptance/recovery: retain submitted payloads and stable public
  props and workspace/work session keys; supplemental reads cannot undo an
  accepted mutation.
- Workspace location: own navigation/start/save/history changes, preserving
  URL and Back contracts.
- Opened-work composition: own shared rendering and imports, preserving
  distinct action permissions and mounted request identity.

Review each exact completed head and its proof before integration. Reconcile
`agency/version-server.ts` without losing the reads stream's chooser hunk.
Reconcile WorkspaceApp navigation and composition against both behavioral
contracts. Then run the affected tests and rendered desktop/mobile scenarios
on the combined source; isolated passes do not prove the union.

Keep the next-release source in `reborn-1.0`; `main` and production remain
outside this work. Canonical `PRODUCT_MODEL.md` and shared strategic state stay
with their existing integration owner. Hand off bounded evidence deltas rather
than creating a competing model or claiming a commercial change.

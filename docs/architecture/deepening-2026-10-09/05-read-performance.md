# Reads: scoped PRD and implementation plan

Source: `reborn-1.0` at `e9511b044b217fc233bde6b174c12988eaa2e950`.
Stream: `reads`; isolated branch `arch/workspace-read-depth-20261009`.

## Person and job

An agency chooses a qualified source System to adapt for a client. A verified
person opens their selected workspace to see authorized work, Systems and the
current restrictions on changes. Neither job needs unrelated reads to finish
before its own independent data can start loading.

## Before and after

- Create Version currently hydrates the entire agency Library, including each
  client's Version comparisons and optional inquiry portfolio, discards that
  hydration, then reads qualified source revisions. Reuse the existing validated
  `read_workspace_version_sources` discovery seam and read only the revisions
  creation uses. Keep the Library's full behavior.
- Authenticated workspace GET currently serializes exit, managed presence, work,
  agency projections, delegation and release/authority reads. Keep selection
  first; express independent reads and their actual dependencies in the existing
  snapshot GET module. No generic fetch framework or cache.
- What changed first authorizes through `store.handled`. Only afterward overlap
  linked-tenant events, report receipts and notice receipts. Required-source
  failures reject; retain only the existing optional tenant fallbacks.

## Existing rules and failure cases

Agency authoring precedes source discovery. Discovery validates exact workspace
identity; current verified actor and store qualification remain mandatory. A
denied author, malformed source response, revoked actor or revision read failure
must not return a usable chooser. Hidden sources keep their current behavior.

Workspace creation precedes listing. Selected-workspace membership/seat/delegation
is established before private snapshot reads. Provider seats gain no inquiry,
Ask, pending-assessment or member-delegation permission. Product-learning work
remains operator-only. Exit read failures retain the explicit unavailable status
that disables mutations. Managed/provided-client failures retain their bounded
fallbacks; required reads fail the snapshot. Delegations depend on visible work;
Systems depend on visible work, managed domains and the Systems release. All
promises must have rejection handlers while outstanding; no new writes.

## Owned files and deletion targets

Runtime: `src/experience/workspace/agency-server.ts` source discovery;
`src/experience/workspace/agency/version-server.ts` creation choices only;
`src/app/api/workspace/route.ts` authenticated GET snapshot;
`src/platform/needs-you/server.ts` handled reader only.
Tests: direct creation-choice proof, `workspace-routes.test.ts`,
`strelva-handled-decisions.test.ts`; existing listed regression suites unchanged
unless their mock contract needs a directly related correction.
Docs: this PRD and its final handoff. No UI/component, Version comparison,
preparation, bundle lifecycle, SQL or strategic-state edits.

Delete chooser→Library→client comparison/inquiry call chain, unnecessary awaits,
and duplicate operator lookup. Keep meaningful guards and error distinctions.

## Acceptance and exact checks

1. Write direct tests through `readVersionCreationChoices` using the actual
   discovery, authoring and Supabase store adapters over a fictional RPC adapter:
   qualified revisions only, denial, exact actor/scope, malformed/revoked reads,
   and zero client-comparison/inquiry calls. Keep Library regression proof.
2. Deferred-promise workspace tests prove concurrent starts after selection,
   no reads before authorization, dependent Systems/delegation timing, optional
   fallbacks and required failure behavior. Preserve failing regression output.
3. Handled tests prove authorization first, concurrent independent sources,
   required receipt failure and existing deduplication/fallback behavior.
4. Run `pnpm exec vitest run src/__tests__/version-creation-choices-server.test.ts
   src/__tests__/workspace-routes.test.ts
   src/__tests__/release-flags-per-workspace-routes.test.ts
   src/__tests__/connected-sites-workspace-route.test.ts
   src/__tests__/server-visibility-workspace-route.test.ts
   src/__tests__/w6-version-management-route.test.ts
   src/__tests__/inquiry-library-server.test.ts
   src/__tests__/strelva-handled-decisions.test.ts`.
5. Run `pnpm typecheck`, `pnpm check:boundaries`, `pnpm check:ontology`,
   `git diff --check`, and focused ESLint. No permission or SQL contract changes
   are planned; disclose gated SQL skips, and add required SQL/client proof if
   scope changes. No local proof implies hosted/provider/Auth/production proof.
6. Review identity, authority, qualification, stale response, scope and compatibility;
   report runtime additions/deletions separately from tests/docs. Commit, push
   only this branch, open/register a draft PR against `reborn-1.0`, then queue the
   coordinator handoff. Canonical model/state deltas stay proposals for its owner.

No latency or economic improvement claim without measurements. Remaining serial
dependencies and actual checks will be recorded in the handoff.

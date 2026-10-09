# Reads: implementation and integration handoff

Objective: complete both bounded read improvements in the [scoped PRD](05-read-performance.md),
without changing identity, authority, qualification, output shape or required failure behavior.
Status: locally implemented and verified; prepared for integration, not deployed.

- Branch: `arch/workspace-read-depth-20261009`.
- Base: `reborn-1.0`, `e9511b044b217fc233bde6b174c12988eaa2e950`.
- Implementation commit: `fd1752b828a1347ddb44e431fa7f504ee3e69723`.
- [Draft PR #617](https://github.com/Strelva/Strelva-OFFICIAL/pull/617), against
  `reborn-1.0`. The documentation follow-up on this branch carries this handoff;
  integrate the complete PR head. Croki thread registration succeeded.

## What changed

Create Version reuses the existing validated `read_workspace_version_sources`
discovery through `readAgencyVersionSources`. It no longer invokes
`readAgencyLibrary`, its client Version/three-way comparison reads, inquiry
release checks, linked-site discovery or inquiry portfolio. It reads its actor
once, then qualified revisions for each source. Source discovery still returns
its existing revision/Version metadata; it does not include the qualification
evidence needed by creation, so the scoped revision reads remain necessary.
The full Library and bulk review use the same discovery function and retain
their existing behavior.

The authenticated snapshot starts independent reads after verified identity and
selected-workspace access. One route-level operator lookup supplies both work
visibility and release targeting. The graph stays inside the existing GET;
no framework, cache, shared mutable state or new dependency was added.

What changed keeps `store.handled` first: its existing actor-scoped SQL reads
establish permission before unscoped linked-tenant discovery. After that,
tenant events, report receipts and tool notices overlap. Report/notice adapters
keep their own release/access checks and failure semantics. Required receipt
errors still reject; existing optional tenant link/event fallbacks stay unchanged.

## Owned files and size

Runtime source: **71 additions / 79 deletions, net −8**:

- `src/experience/workspace/agency-server.ts`: discovery export and three uses;
  no Library/comparison/bulk-review behavior change.
- `src/experience/workspace/agency/version-server.ts`: creation-choice import
  and discovery only. Comparison/preparation functions are untouched.
- `src/app/api/workspace/route.ts`: authenticated GET read graph only.
- `src/platform/needs-you/server.ts`: `readStrelvaHandled` only.

Tests: **235 additions / 3 deletions**, across
`version-creation-choices-server.test.ts`, `workspace-routes.test.ts` and
`strelva-handled-decisions.test.ts`. PRD: 88 added lines; this handoff is separate
documentation. No migrations, lockfile, dependency, component inventory, UI or
canonical strategic-state files changed.

Potential integration overlap: `agency/version-server.ts` is also the domain
stream's file; preserve all comparison/preparation and bundle-lifecycle changes
when reconciling our creation-choice hunk. Snapshot consumers in the interaction
streams see the same JSON contract. No other worker's worktree was edited.

## Retained failing evidence

Tests were written and run before source edits. Initial local output:

```text
version-creation-choices-server + workspace-routes:
  3 failed / 71 passed
  qualified-source case: unexpected read_system_version and second read_version_actor
  pending-exit case: listWork never started before exit resolved
  pending-managed-domain case: listWork never started before managed presence resolved

strelva-handled-decisions:
  1 failed / 17 passed
  pending-tenant-discovery case: reports/notices did not start
```

Raw local logs remain in `/tmp/strelva-reads-initial.log` and
`/tmp/strelva-reads-handled-initial.log`; the excerpts above retain the findings
in Git. An intermediate typecheck exposed the empty-array union's `.includes`
parameter as `never`; the same ID equality now uses `.some`. Final typecheck passes.

## Final local proof

```bash
pnpm exec vitest run \
  src/__tests__/version-creation-choices-server.test.ts \
  src/__tests__/workspace-routes.test.ts \
  src/__tests__/release-flags-per-workspace-routes.test.ts \
  src/__tests__/connected-sites-workspace-route.test.ts \
  src/__tests__/server-visibility-workspace-route.test.ts \
  src/__tests__/w6-version-management-route.test.ts \
  src/__tests__/inquiry-library-server.test.ts \
  src/__tests__/strelva-handled-decisions.test.ts \
  src/__tests__/agency-versions-server.test.ts \
  src/__tests__/system-versions-store-contract.test.ts
# 10 files passed; 140 tests passed; 12 SQL-gated cases skipped.
pnpm typecheck
pnpm check:boundaries
pnpm check:ontology
pnpm exec eslint \
  src/experience/workspace/agency-server.ts \
  src/experience/workspace/agency/version-server.ts \
  src/app/api/workspace/route.ts src/platform/needs-you/server.ts \
  src/__tests__/version-creation-choices-server.test.ts \
  src/__tests__/workspace-routes.test.ts \
  src/__tests__/strelva-handled-decisions.test.ts
git diff --check
# All pass. Commit's staged gitleaks scan and pre-push typecheck also pass.
```

Direct implementation proof uses actual discovery, authoring, qualification,
Version service and Supabase adapters over fictional RPC responses. It proves
qualified revisions only, author denial before discovery, mismatched identity,
revoked actor/revision access and zero chooser comparison/inquiry calls. The
full Library independently still returns ready/conflicted client improvements
and hydrates inquiry Versions. Deferred promises prove concurrent starts,
selection ordering, real dependencies and required errors while other reads
remain pending; Vitest reports no unhandled rejections. Existing provider-seat,
exit-failure, optional-source, release, visibility and API tests remain green.

The 12 skips are 11 PostgreSQL Version-store cases and one Library/Review-all
case: `STRELVA_VERSIONS_PSQL` is unset. No permission, SQL or `/api/v1` contract
changed, so no new native SQL, agency Auth/browser or custom-repo proof was
required or claimed. This stream has no UI edits: rendered desktop/mobile,
keyboard/loading/empty/error state proof is not newly claimed. No repository
env was loaded, local app started, provider invoked, customer data read or
production touched. Measured latency and economics remain unknown.

## Remaining serial dependencies and review

- Creation: agency authoring → validated source discovery → current Version
  actor → qualified revision reads (parallel across sources).
- Snapshot: verified actor → ensure personal workspace → list workspaces →
  validate/find selection. Work and operator lookup start together; operator
  status gates visibility and release targeting. Delegations need visible work.
  Systems need visible work, managed domains and Systems release. Connected-site
  release and maker authority need Systems release. Independent reads still
  must finish before a complete snapshot is returned.
- What changed: authorized handled/history rows → independent sources; tenant
  links → tenant events. Adapter-internal security/release dependencies remain.

Final diff review found no identity/authority/qualification expansion, write,
acceptance-to-verification conflation, stale cache, scope-reset or compatibility
change. Exit unavailable/completed status remains explicit and blocks controls
through the existing consumer. Provider-seat inquiry/Ask/decision grants remain
off. A required read may reject before another concurrent read finishes; those
reads have attached handlers and cannot return a partial success snapshot.

No new semantic decision is needed. Human/hosted integration review is pending;
permission contracts and reserved production decisions remain with their owners.

## Proposed canonical evidence delta and next action

For the integration owner only: append local behavior evidence that creation
does not hydrate unrelated client/inquiry state and independent authorized
snapshot/receipt reads overlap. Attach the exact tests and skip boundaries
above to the existing reading capabilities. This changes implementation
evidence, not the offer, domain meaning, active commercial bet, pricing,
production readiness or measured delivery cost. `PRODUCT_MODEL.md`, both vaults
and shared strategic state were left with their existing owner.

Exact integration action: review and integrate the complete head of draft
PR #617 into `reborn-1.0`, retaining neighboring streams' owned changes outside
these functions. Run the commands above on the combined source; retain SQL skip
disclosures or run its existing disposable SQL qualification separately. Do not
merge `main` or deploy from this handoff. The coordinator message carries the
final branch-head SHA and PR URL.

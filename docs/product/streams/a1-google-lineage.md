# #467 Google location lineage handoff

2026-10-07. Branch `a1/google-lineage`, based on `integrate/reborn-1.0`
through `2af92d58`. Local implementation and proof; no production action.

## Outcome

#467 is done locally for location lineage and shared hours/posts. Existing
Google listing identities are explicitly attached as location Versions of a
source. Shared changes use the existing compare/adopt engine, then prepare a
frozen approval event per location. The existing publishing executor owns owner
approval, Google acceptance, receipt, read-back and undo. Source definitions
copy no targets, credentials, records or policy.

[API, authority and limits](../../capabilities/publishing/google-location-versions.md).
The source and Version rows are persisted in the existing tables; no migration,
rollback or dependency was added. Existing per-workspace Systems and Publishing
flags gate the new paths. Generic Version release history remains distinct
from publishing outputs and their Google receipts.

## Evidence on the rebased branch

All commands exited 0:

- `pnpm install --frozen-lockfile`.
- `pnpm typecheck` (`next typegen` + `tsc --noEmit`).
- `pnpm lint` (existing large database-types Babel notice only).
- `pnpm check:boundaries`: passed, unchanged baseline (204 legacy imports in
  93 files, 44 older boundary imports).
- `pnpm exec vitest run --maxWorkers=2` with `google-location-versions`,
  `google-location-versions-route`, `publishing-google-execution`,
  `publishing-authority`, `system-versions-lineage`, `system-versions-twin-trees`,
  `publishing-record-changes`, `publishing-projection`, `publishing-experience`:
  **9 files, 68 tests passed**. Google clients and preparation stores are fakes.
- `LC_ALL=en_US.UTF-8 PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql`:
  aggregate workspace, customer and inquiry gates passed on isolated clusters.
  Includes the new real-store Google lineage suite: **2 tests passed**, one
  business/two businesses, with fake preparation and no Google dispatch.
- `git diff --check`: clean.

Failures corrected before these runs: a static draft/lineage import cycle;
agency source validation wrongly using a customer System read; adoption needing
an initial spine revision before Live. The Postgres suite caught the agency
boundary mismatch and now runs automatically after account-binding migrations.

## Remaining evidence and decisions

- Twin Trees #242 is still the owner's one-business/two-business decision.
  Both layouts were tested; no customer was converted or grouped.
- Reply voice remains tenant-scoped; no voice inheritance or reply-mode change
  is included. Google accounts without a linked tenant still need the
  workspace-owned target described in Wave 6.
- This adds an API workflow and reuses existing lineage/approval display. It
  adds no bulk authoring UI, live OAuth proof, Google write proof or email
  delivery proof. No economics or customer-adoption claim.
- The project coordinator owns canonical model/vault updates. Proposed delta:
  Google location lineage and per-location shared hours/post preparation are
  locally prepared capabilities under two existing release gates; provider
  operation and owner-link delivery remain unproven. Reevaluate the affected
  multi-location capability/vault entries when integrating; do not promote a
  live capability from this proof.

## Integration

No changes to Needs you server/contracts or `release-flags/resolve.ts`.
Potential shared-file overlap: Google listing server/workspace,
publishing server/projection/spec, `scripts/check-workspace-sql.sh`, and
`src/__tests__/support/versions-postgres.ts`. The rebase resolved one additive
publishing-server export conflict, preserving the newsletter sender export.

Next action: review the PR, integrate through the coordinator, and keep flags
off pending authorized provider and owner-link release proof. No merge or
production action is authorized by this handoff.

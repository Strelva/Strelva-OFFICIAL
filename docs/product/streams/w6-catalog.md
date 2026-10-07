# Wave 6 catalog handoff

Branch: `w6/catalog`. Worktree: `REB-w6-catalog`. Local work only; no production calls, sends, pushes, PRs or merges authorized.

## Current objective and continuation

Resume the two saved checkpoints (`32ea36bd`, `c1fb3632`) against the catalog launch requirements. Those commits contain internal-tool use/contact links and gated notices, builder-only sentence plans, newsletter contact mirroring, report receipts and Search Console evidence, and document history pagination/UI. Earlier integration already contains bounded document/onboarding/application histories, store/wellness projection and tracker/saved-check merges. Do not rebuild these without inspecting their tests.

The active bet is an agency/Strelva builder path with owners filing Requests; tenant storefronts, frozen commerce/rewards and report crons remain compatible while release flags are off. No adoption, delivered mail, provider access or production operation is established by this stream.

Next action: run focused catalog tests and typecheck; audit flags-off paths and the spec's failure requirements; finish missing code/tests, then run all required checks once near completion. Inspect document history desktop/mobile locally. Update this handoff with actual outputs and commit each passing piece.

## Flags and migrations already in checkpoints

- `internal_tool_notices` / `STRELVA_INTERNAL_TOOL_NOTICES_RELEASE`: off by default, also requires Systems and workspace release, global email gates and tenant `reb:client-email` gate.
- `catalog_reports` / `STRELVA_CATALOG_REPORTS_RELEASE`: off by default; receipt instrumentation and Search Console status.
- `newsletter_contacts` / `STRELVA_NEWSLETTER_CONTACTS_RELEASE`: off by default; additive mirror, original subscribe response retained.
- Existing `STRELVA_SYSTEMS_RELEASE` gates System projection and builder restrictions; planning also needs `STRELVA_PLANNING_ENABLED`.
- Assigned migrations: `20261010150000` submit notices; `20261010150100` grant-use links; `20261010152000` catalog report receipts; `20261010153000` newsletter contacts; `20261010154000` work-plan authority. Each has rollback SQL. Not applied to production.
- No new cron or dependencies in the checkpoints. Existing weekly/monthly/Search Console schedules remain unchanged.

## Verification

Pending. No A claim until the required checks and relevant failure paths pass. Preserve failures here alongside successful evidence.

## Production steps and unknowns

Separate authorization is required for applying migrations, checking live counts and recipients, newsletter backfill, setting release rows/env, and any delivered notice/report or provider read. Keep rollout silent. Owner invites remain deferred. Real converted-client parity, Google access and the Strelva-owned test-business notice/recap remain unproven.

Any material capability delta can be reconciled into the canonical main-checkout model by the integration agent; this stream writes only its worktree and leaves shared company state untouched.

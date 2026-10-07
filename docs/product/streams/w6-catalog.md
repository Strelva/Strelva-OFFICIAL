# Wave 6 catalog handoff

Branch: `w6/catalog`. Worktree: `REB-w6-catalog`. Local work only; no production calls, sends, pushes, PRs or merges authorized.

## Current objective and continuation

Round 4 resumed all three saved checkpoints and rebased them onto `integrate/reborn-1.0` @ `864474fe`, retaining its missing-table readiness fix. The checkpoints contain internal-tool use/contact links and gated notices, builder-only sentence plans, newsletter contact mirroring, report receipts and Search Console evidence, and document history pagination/UI. Earlier integration already contains bounded document/onboarding/application histories, store/wellness projection and tracker/saved-check merges.

The active bet is an agency/Strelva builder path with owners filing Requests; tenant storefronts, frozen commerce/rewards and report crons remain compatible while release flags are off. No adoption, delivered mail, provider access or production operation is established by this stream.

Round 4 review fixed linked recipient corrections: an existing assigned-person UUID no longer fails browser email validation, and typed contact/person replacements resolve inside one grant/revision-checked database transaction. Flags off retain the original edit RPC and do no additional reads. Migration `20261010150400` and rollback are added. Cron compatibility/failure tests and the missing `20261010150300` readiness sentinel are added.

Next action: finish the running full test, SQL and typecheck checks; run build after stopping this worktree's local dev server; update final verification/spec status and commit. Current code is local only.

## Flags and migrations already in checkpoints

- `internal_tool_notices` / `STRELVA_INTERNAL_TOOL_NOTICES_RELEASE`: off by default, also requires Systems and workspace release, global email gates and tenant `reb:client-email` gate.
- `catalog_reports` / `STRELVA_CATALOG_REPORTS_RELEASE`: off by default; receipt instrumentation and Search Console status.
- `newsletter_contacts` / `STRELVA_NEWSLETTER_CONTACTS_RELEASE`: off by default; additive mirror, original subscribe response retained.
- Existing `STRELVA_SYSTEMS_RELEASE` gates System projection and builder restrictions; planning also needs `STRELVA_PLANNING_ENABLED`.
- Assigned migrations: `20261010150000` submit notices; `20261010150100` grant-use links; `20261010152000` catalog report receipts; `20261010153000` newsletter contacts; `20261010154000` work-plan authority. Each has rollback SQL. Not applied to production.
- No new cron or dependencies in the checkpoints. Existing weekly/monthly/Search Console schedules remain unchanged.

## Verification

Round 4 checks so far (local):

```text
Focused catalog: Test Files 11 passed (11); Tests 124 passed (124).
Extended product regressions: Test Files 22 passed (22); Tests 156 passed (156).
Linked edit/use regressions: Test Files 4 passed (4); Tests 18 passed (18).
Cron + readiness regressions: Test Files 2 passed (2); Tests 25 passed (25).
pnpm typecheck (initial): Types generated successfully; exit 0.
pnpm lint (initial): exit 0; generated database.types.ts Babel size note.
pnpm check:boundaries: Product boundaries passed; 204 workspace -> src/lib imports in 93 files, 46 older boundary imports.
pnpm check:custom-repos: Custom repo workspace check passed: 196/196 checks passed.
```

Failures retained: the first unrestricted `pnpm test` encountered the missing catalog tool-conflict migration sentinel plus several 5-second timeouts and was interrupted (exit 130). The sentinel is fixed; a two-worker run with 30-second limits is running. The first SQL check completed SQL assertions but failed two embedded `possibility-repository` tests at 5 seconds under contention. Embedded cluster tests now use the script's existing one-worker/30-second convention; SQL rerun is in progress. The first new cron test run failed two monthly cases because the heartbeat/Redis test doubles returned no Promise; corrected doubles pass all 25 cron/readiness tests. No application assertion was weakened.

Rendered shared-document rehearsal on local port 3016: 1280px populated editable file, 360px read-only and history error/retry, 320px loading/empty/flag-off. Pagination grew 20 to 40 rows while preserving recent edits; read-only had no save or undo controls; errors preserved all 20 recent rows. Checked widths had no horizontal overflow. Browser transport interruption prevented capturing the denied state; denied access is covered by the component and route tests. Screenshots: `/Users/jacobrhinehart/.t3/dev/browser-artifacts/browser-screenshot-localhost-muy8ff1w-45cd68a2.png` and `/Users/jacobrhinehart/.t3/dev/browser-artifacts/browser-screenshot-localhost-muy8gpxp-8bdc7ae6.png`. Fixtures prove rendered behavior, not provider authentication or production delivery.

## Production steps and unknowns

Separate authorization is required for applying migrations, checking live counts and recipients, newsletter backfill, setting release rows/env, and any delivered notice/report or provider read. Keep rollout silent. Owner invites remain deferred. Real converted-client parity, Google access and the Strelva-owned test-business notice/recap remain unproven.

Any material capability delta can be reconciled into the canonical main-checkout model by the integration agent; this stream writes only its worktree and leaves shared company state untouched.

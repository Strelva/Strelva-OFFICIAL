# PR #521 — server visibility, round 2

Objective: complete the requested engineering round on `a1/server-visibility`.
Owning worktree: `/Users/jacobrhinehart/Desktop/strelva/REB-a1-server-visibility`.
PR: https://github.com/Strelva/Strelva-OFFICIAL/pull/521

## Implemented

- Atomic `20261012110000_business_pages.sql`, executable rollback, empty-schema
  rollback/reapply checks and refusal after saved-page adoption.
- One `business_confirmed_public_facts` reader feeds business pages, static blocks
  and connect.js. Ordinary facts/services require verification or owner source;
  unverified operator/agency facts are excluded. No new confirmation authority.
- Policy facts carry server-side provenance through the real RPC adapters and
  `selectPublishedBusinessPolicies`; only verified owner/operator terms publish.
  Private IDs are removed. Page, llms.txt, JSON-LD and drift hashes include terms.
- Readiness includes the page migration and #518's missing policy sentinel.
- Policy contract points to the actual `/biz/{handle}` route.

## Evidence (local only)

- Final base: `e3573fbf` (includes #518, #519, #526); rebased without conflicts.
- Typecheck, lint, boundaries, build: exit 0 on this final base.
- Full suite: 761 files passed, 2 skipped; 6,987 tests passed, 41 skipped
  (`pnpm test --maxWorkers=2 --testTimeout=15000`).
- Focused connected-sites/policy/page/readiness suites: 11 files, 118 tests passed.
- Separate readiness/release safety/booking/page rerun: 6 files, 115 passed,
  1 skipped. First full run had a booking 5-second timeout and a cached export
  captured during edits; both failures pass the clean focused rerun.
- Custom-repo compatibility: 196/196 passed.
- Workspace SQL and full-schema upgrade: exit 0 with PostgreSQL 18 and
  `LC_ALL=en_US.UTF-8`. Rollback/reapply and adopted-page preservation passed.
- Actual server component rendered with fictional policies and built CSS:
  Croki inspection at 1280px and 390px; no horizontal overflow. Visual fixture
  and check logs remain local in this directory and are ignored by Git.

## Unproven / reserved

No production changes or provider writes. Pages remain default-off. Real-database
page end-to-end and live builder installation remain unproven. #309's hosted-site
SEO/ReserveAction and MCP/robots scope, #502's WordPress/Wix integrations, and
release-packet scheduling remain outside this round.

Jacob's agency-confirmation rule is still pending. Existing owner/operator
verification stays authoritative. Proposed model delta for the coordinating
agent: server visibility now includes confirmed policy terms and connect.js uses
its strict fact reader; evidence is implementation/local behavior only.

## Shared files

`scripts/check-workspace-sql.sh`, `scripts/check-workspace-upgrade.sh`,
`scripts/readiness-snapshot.ts`, connected-sites `contracts.ts`, `server.ts`,
`store.ts`, policy architecture and connected-sites capability docs.

## Continuation

Round 2 is complete locally. Push uses an explicit lease against the prior
remote head `8186f26cc583d295c6c5924dc104b0c4b27bf20b`; #521 receives the final
body and round-2 comment. Next: coordinating agent reviews #521 for integration
and assigns release-packet scheduling. Keep the business-page flag off until
that release is explicitly authorized. Never merge or perform production actions.
The fixture server (PID 94046, port 43121) was stopped. Temporary local cluster
paths are recorded in the ignored SQL/upgrade logs; none were deleted.

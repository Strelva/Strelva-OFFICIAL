# T001 Product Scout

## Repo Facts

- Stack and commands are in `package.json`: Next 16, React 19, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:launch`, `pnpm check:release`, and Playwright smoke.
- Existing launch docs say launch readiness is largely complete: `docs/launch-blockers.md` has no current blockers, and `docs/completion-audit.md` says the production readiness gate is complete.
- Dashboard root redirects to `/dashboard/chat`, so the first owner moment is AI-first.
- Main owner dashboard nav currently exposes `Ask AI`, `Approvals`, `Site`, and `Connections` in `HistorySidebar.tsx` and `MobileNav.tsx`.
- Weekly proof is partially built:
  - `src/lib/weekly-brief.ts` generates and stores `WeeklyBrief` records.
  - `src/components/dashboard/WeeklyBriefClient.tsx` renders the customer-facing "Your weekly report" / "What's working" experience.
  - `src/app/api/weekly-brief/route.ts` exposes the latest brief.
  - Admin readiness checks whether tenants have a weekly brief.
- Product gap: `src/app/dashboard/reports/page.tsx` redirects to `/dashboard`, and the nav does not link to reports. The existing weekly proof UI is therefore not reachable as a first-class dashboard surface.
- Older `ReportsClient.tsx` also exists under `src/app/dashboard/reports`, but no route renders it.

## Product Diagnosis

Stage: V1.5 moving toward V2 product.

Primary bottleneck: product completion / activation proof.

Secondary bottleneck: retention loop visibility.

The codebase has strong operational/launch hardening, but the core promise "See what's working. Tell the AI what to change." is incomplete when the "see what's working" surface is hidden behind a redirect. The first product-completion move should expose the weekly report/proof loop in the dashboard rather than adding new platform machinery.

## Candidate Worker Slices

1. Make `/dashboard/reports` render `WeeklyBriefClient`, fetch latest/history via `getWeeklyBrief` and `getWeeklyBriefs`, and add `Reports` to desktop/mobile dashboard nav.
2. Add a "What changed / what is waiting" overview panel in chat using existing brief, pending queue, and activity data.
3. Tighten AI chat result receipts and approvals into a single post-action proof path.
4. Add browser smoke coverage for the reports route once rendered.

## Recommended First Slice

Expose the weekly report surface.

Why: it directly completes the "See what's working" half of the product, uses existing implemented primitives, is bounded, and can be verified with a focused source-level test plus typecheck.

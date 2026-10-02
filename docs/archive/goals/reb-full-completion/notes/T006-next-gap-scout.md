# T006 Next Product Gap Scout

## Repo Facts

- `/dashboard/reports` now renders `WeeklyBriefClient` and the primary dashboard nav exposes `Reports`.
- `WeeklyBriefClient` supports both empty first-run proof copy and historical reports through its `history` prop.
- `src/app/api/cron/weekly-report/route.ts` still builds weekly report email CTAs with `getTenantDashboardUrl(report.tenant, "/dashboard")`.
- `/dashboard/page.tsx` redirects to `/dashboard/chat`, so an emailed weekly report link currently lands the owner in chat rather than the report/proof surface.
- `src/__tests__/owner-journey-copy.test.ts` currently guards the old generic dashboard destination.

## Product Diagnosis

The first slice made reports reachable from in-app navigation. The next product-completion gap is the distribution/retention entry point: the weekly report email should open the weekly report surface directly. Otherwise the "weekly report" habit loop is visible in the product but weak from the email that creates the recurring behavior.

## Recommended Worker Slice

Update the weekly report email CTA to use `/dashboard/reports` and owner-facing copy like "View your weekly report", then align owner-journey coverage.

## Verification

- `pnpm test src/__tests__/owner-journey-copy.test.ts`
- `pnpm typecheck`

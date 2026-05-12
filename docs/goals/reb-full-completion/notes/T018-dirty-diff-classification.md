# T018 Dirty Diff Classification

## GoalBuddy-Owned Changes

These files are part of the verified product-completion tranche:

- `package.json`
- `src/__tests__/agent-results.test.ts`
- `src/__tests__/auth-permissions.test.ts`
- `src/__tests__/owner-journey-copy.test.ts`
- `src/app/api/cron/weekly-report/route.ts`
- `src/app/dashboard/reports/page.tsx`
- `src/components/dashboard/HistorySidebar.tsx`
- `src/components/dashboard/MobileNav.tsx`
- `src/lib/agent-results.ts`
- `src/lib/auth.ts`
- `tests/admin-operator.spec.ts`
- `tests/dashboard-owner.spec.ts`
- `docs/goals/reb-full-completion/**`

These correspond to completed slices:

- expose weekly reports in dashboard;
- route weekly report email CTAs to reports;
- restore AI receipt proof copy;
- add customer dashboard smoke;
- add operator/admin smoke;
- enable local dev access for admin verification.

## Unrelated Dirty Files

These were already dirty before or are not owned by this GoalBuddy tranche:

- `src/app/(marketing)/home/page.tsx`
- `src/app/(marketing)/layout.tsx`
- `src/app/(public)/layout.tsx`
- `src/app/admin/CreateTenantForm.tsx`
- `src/app/dashboard/settings/page.tsx`
- `src/components/dashboard/DesignMode.tsx`
- `src/components/dashboard/LayoutPanel.tsx`
- `src/components/dashboard/design/DesignPropertiesPanel.tsx`
- `src/components/public/Footer.tsx`
- `src/components/public/Header.tsx`
- `src/components/public/Hero.tsx`
- `src/components/public/Services.tsx`

These appear to be broader marketing/public-site/design-system work, including large homepage changes, configurable public navigation/footer support, dashboard settings utilities, and design editor hook dependency fixes. They are not reverted or modified by the GoalBuddy tranche.

## Risk Decision

The unrelated dirty files are not blockers for the GoalBuddy product-completion tranche because broad verification (`lint`, full unit tests, `build`, and production-start smoke) passed with them present. They remain residual release-review risk for whoever owns those edits.

## Completion Recommendation

The current GoalBuddy tranche can be considered complete if completion means:

- improve and verify the core customer proof loop;
- improve and verify the customer dashboard journey;
- improve and verify the operator/admin journey;
- leave unrelated dirty work untouched and explicitly classified.

It should not be represented as a clean release branch or a final PR-ready diff until the unrelated files are either accepted, committed separately, or reviewed by their owner.

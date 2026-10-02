# T011 Customer Dashboard Journey Scout

## Evidence

Existing Playwright coverage is strongest for public pages and signed-out auth/access:

- `tests/customer-frontend.spec.ts` covers marketing, tenant public pages, mobile overflow, preview framing, signed-out dashboard/account/no-access, sign-in/sign-up invite context, and Clerk CSP.
- `tests/smoke.spec.ts` covers health, public v1 APIs, cron protection, and signup copy.
- `tests/control-plane-smoke.spec.ts` covers health, marketing surface, and invalid public API tenant slugs.

The local browser sweep under the existing dev-access server rendered:

- `/dashboard/chat`: AI-first empty state, quick action chips, prompt input, dashboard nav.
- `/dashboard/reports`: weekly report empty state and report CTA surface.
- `/dashboard/review`: approvals empty state.
- `/dashboard/site`: editor shell with content/layout/AI Chat tabs and publish controls.
- `/dashboard/sources`: source setup and AI context catalog.
- `/dashboard/settings`: business/settings/ownership/domains/billing tabs.
- `/dashboard/assets`: photo library upload surface.

## Gap

There is no automated signed-in-style owner dashboard journey test. This leaves product completion dependent on manual browser checks even though the core customer product is the dashboard.

## Recommended Worker Slice

Add a dedicated Playwright owner-dashboard smoke test that runs with `REB_DEV_UNGATED_ACCESS=1` and `REB_DEV_TENANT=gldf`, verifying the core dashboard surfaces render and remain connected through the primary nav.

This should be separate from release smoke, which intentionally forces `REB_DEV_UNGATED_ACCESS=0` to protect signed-out access checks.

## Verification

- `REB_DEV_UNGATED_ACCESS=1 REB_DEV_TENANT=gldf pnpm exec playwright test tests/dashboard-owner.spec.ts --project=desktop`
- `REB_DEV_UNGATED_ACCESS=0 pnpm exec playwright test tests/smoke.spec.ts --project=desktop`

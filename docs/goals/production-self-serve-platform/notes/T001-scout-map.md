# T001 Scout Map

## Repo Facts

- Current branch is `main` with an already dirty worktree. Existing modifications are broad and should be preserved.
- `codex/free-site-signup-copy` exists locally and remotely but currently has no diff from `main`.
- `origin/codex/self-serve-b2c-product` exists and contains the heavier self-serve slice:
  - `src/lib/self-serve.ts`
  - `src/lib/billing.ts`
  - `src/app/api/self-serve/tenant/route.ts`
  - `src/app/api/self-serve/checkout/route.ts`
  - `src/__tests__/self-serve.test.ts`
  - `src/__tests__/self-serve-routes.test.ts`
  - larger changes to `/onboard`, `/sign-up`, dashboard settings, marketing home, and Playwright specs.
- Current `src/app/onboard/page.tsx` redirects to `/access-request`.
- Current `/access-request` is email-first free-site intake. It stores a lead, creates/reuses a delivery-status token, emails the link, and notifies Slack.
- Current `/sign-up` only supports invited dashboard access. Without an invite, it says dashboard signup is paused and sends users to `/access-request`.
- Current tenant creation primitives exist in `src/lib/tenants.ts`: `createTenant`, `updateTenant`, `getAllTenants`. `createTenant` persists to Sanity or `dev-tenants.json`, invalidates cache, and tries to auto-assign an existing Clerk user by owner email.
- Current auth primitives support tenant assignment and permissions: `assignUserToTenant`, `requireTenantPermission`, `hasTenantAccess`.
- Current dashboard already has owner proof surfaces:
  - `/dashboard` shows "People found you", "Customer actions", "Needs you", next action, and recent AI/site activity.
  - `/dashboard/reports` fetches `getWeeklyBrief` and `getWeeklyBriefs` and renders `WeeklyBriefClient`.
  - Weekly brief generation saves measured or demo fixture proof, uses click counts, events, activity, search data, suggestions, stale sections, and fallback summaries.
  - Weekly report cron sends HTML/text email with tenant dashboard URLs.
- Current retention/churn-specific automation is not obvious in repo evidence. There is rate-limit usage for agent calls, activity logs, events, and weekly brief/reporting, but no "no AI usage in 14 days" re-engagement sequence found.
- Current rollback primitives exist but are section-level:
  - `src/lib/storage/version-store.ts` appends versions and restores a content section.
  - `src/app/api/content/[section]/versions/route.ts` exposes version listing and restore.
  - `src/components/dashboard/VersionHistory.tsx` displays and restores versions in the editor.
  - `src/lib/storage/audit-store.ts` stores admin audit logs; `activity-store.ts` stores owner-visible content activity snapshots.
- Full-site snapshots, daily automated backups, owner-facing full audit log, and one-click "last good site" revert are not proven by current evidence.

## Branch Evidence

`origin/codex/self-serve-b2c-product` has a coherent backend/API implementation for self-serve tenant creation:

- Normalizes and validates requested subdomains.
- Infers template from industry.
- Builds starter content from defaults for all core content sections.
- Creates a tenant with site URL, revalidation URL/secret, booking URL, owner metadata, `autoPublish: false`, and features.
- Assigns the current Clerk user as tenant owner.
- Seeds content and page config.
- Logs `self_serve.tenant_created`.
- Can start Stripe subscription checkout in the same call.
- Adds route tests and self-serve unit tests.

Branch risks:

- The branch predates current email-first `/access-request` and invite-guarded `/sign-up` copy, so wholesale checkout would regress current work.
- The branch introduces a `src/lib/billing.ts` helper that overlaps with current admin-only create-subscription logic, which now has stricter body parsing and audit logging.
- The branch `/onboard` UI is useful but would replace the current intentional redirect to `/access-request`; this should be an explicit product decision, not a blind merge.

## Gaps By Requested Track

Self-serve/onboarding:

- Current main is still founder-heavy: request free site -> delivery status -> Jacob/admin handles handoff.
- Missing current main API for authenticated owner to create an instant tenant/subdomain/starter site from business details.
- Missing guided first-time owner flow that can create the site after signup.
- Missing "AI pre-fills content" as an explicit owner-facing promise, although branch starter content uses deterministic defaults from business context.
- Missing welcome quick-win sequence for hours, Google sync, first blog post.

Analytics/retention:

- Owner dashboard proof metrics and weekly report surfaces exist.
- Weekly email brief exists and is actionable enough to build on.
- Missing churn predictor/re-engagement loop using inactivity/no AI usage windows.
- Missing explicit product analytics provider wiring such as PostHog/Vercel Analytics, though custom `/api/track` click events exist.

Rollback/safety:

- Per-section version restore exists.
- AI and admin changes log activity/events.
- Missing full-site snapshot/restore and daily backup.
- Owner-visible audit is scattered across activity/history/version surfaces rather than a dedicated "AI changed X on date Y" diff log.

## Verification Commands

- `pnpm test src/__tests__/self-serve.test.ts src/__tests__/self-serve-routes.test.ts` after integrating branch tests.
- `pnpm test src/__tests__/owner-journey-copy.test.ts src/__tests__/weekly-proof.test.ts` to guard owner language/report proof.
- `pnpm test src/__tests__/route-handlers.test.ts src/__tests__/production-readiness-rules.test.ts` for API and launch-rule regressions if billing/content/versioning are touched.
- `pnpm typecheck`.
- `git diff --check`.

## Candidate Worker Slices

1. Integrate backend self-serve tenant provisioning from `origin/codex/self-serve-b2c-product` into current main, preserving current access-request and invite signup posture.
2. Replace `/onboard` redirect with a guided owner onboarding page that signs in/signs up then calls the self-serve tenant API.
3. Add welcome quick-win tasks after tenant creation: update hours, connect Google Business/source, draft first blog post.
4. Add retention signal computation and re-engagement candidate generation from activity/chat/report data.
5. Add full-site snapshot and one-click last-good restore using existing per-section/version primitives.

## Scout Recommendation

The first Worker should integrate the self-serve backend/API/test slice, not the full branch UI. That creates the missing platform primitive while minimizing risk to current free-site request copy and dashboard surfaces. Once the API is verified, `/onboard` can become a guided first-run UI in the next slice.

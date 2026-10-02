# Product work migration: 2026-09-06

## Decision and scope

This migration records a broader company/product model and one bounded
implementation of it. The model is **Products -> Work -> specific thing**: a
person chooses a concrete product, creates or resumes bounded Work, and keeps
the business, site, customer, or record that Work concerns explicit. It does
not claim that every possible product or whole-business capability is shipped.

Release one adds an account-owned workspace for private AI Visibility Work. The
same change updates the separately deployed `strelva-marketing/` application so
its public company entry starts with a usable AI Visibility result and points
paid managed-website terms to their own pages. The nested marketing application
is a separate repository/deployment; it is not a tenant public-site route and
does not move tenant records, dashboard authorization, or billing into the
workspace.

The control-plane release does not rename the existing managed-client
dashboard, copy tenant records into workspace storage, or make the product
catalog an entitlement system.

The boundaries are:

- `saved_product_work` is private to an authorized workspace. The selected
  workspace is resolved by the server, and the browser receives only the
  product payloads that have an explicit presentation contract.
- Existing managed websites remain tenant entities. `/api/workspace` may return
  a small `managedWork` link projection only after the server resolves the
  signed-in person's tenant memberships. A link is not a cloned workspace
  record and does not grant dashboard access.
- The product catalog describes products, resources, operations, release gates,
  and distribution. Executing routes still enforce identity, tenant
  membership, scoped delegation, approval, billing, and provider policy.
- Homefinder remains an explicit `not_enabled` product state. Domain Monitoring
  remains operator-only and must not appear in customer product discovery.

## Route and surface compatibility map

This is the migration map for every affected product surface. A shell change is
compatible only when the route, data authority, and permission boundary in this
table remain intact.

| Existing or new surface | Authority and behavior | Migration rule | Current evidence / remaining gate |
| --- | --- | --- | --- |
| Public marketing deployment (`strelva-marketing/`) and control-plane acquisition routes | Public company/product entry and acquisition | The primary public `Try Strelva` CTA intentionally points to `https://app.strelva.com/ai-visibility`. Private workspace entry and `Save a copy` are control-plane concerns; `Save a copy` is gated by `STRELVA_WORKSPACE_RELEASE` in the control plane. The nested marketing app does not need that flag or carry workspace/managed-tenant data. Tenant public-site routes remain separate. | Nested source changes and entry assertions are local-only; external target behavior and production rendering are not re-certified here |
| `/ai-visibility` | Public AI Visibility assessment entry | Preserve as the public first-use path; do not require a workspace | Existing route/unit coverage; provider and production checks remain separate |
| `/ai-visibility/:id` | Public retained assessment result | Preserve public result links; private saved work has no public bearer URL | Existing route/unit coverage; no private payload is added |
| `/account` | Existing authenticated managed-website chooser and invite handoff | Preserve existing tenant selection and redirects. When the workspace gate is open, the no-tenant state may route to `/workspace`; managed tenants still route to their existing dashboard fallback | Existing account-page tests; live auth/tenant resolution is not proven here |
| `/workspace` | New authenticated person/workspace shell; private work is loaded through `/api/workspace` | Opt-in release only. Keep My work and Shared with me selected-workspace scoped. Preserve recipient-bound handoff fragments in the URL hash/session storage | Fixture-backed browser checks and local source tests; migration/live Supabase route still unverified |
| `/workspace/account` | New read-only authenticated identity and workspace-access page | Read the verified server session directly; never use the local/dev dashboard bypass; show managed websites as the existing account flow, not as workspace ownership | Mocked unit tests cover signed-out, confirmed, unconfirmed, and store-failure states; live auth is unverified |
| `/api/workspace` `GET` | New private snapshot route | Require a confirmed session, authorize the selected workspace, return `Cache-Control: private, no-store`, and add only browser-safe `managedWork` pointers plus a bounded unavailable signal | Route tests cover auth, isolation, headers, managed projection, and failure redaction; migration/database is unapplied |
| `/api/workspace` `POST` | New private assessment, agency handoff, delegation, and revocation operations | Keep same-origin, JSON, bounded-body, schema, workspace-access, rate-limit, and server-scored-result checks. Never accept a browser-supplied product payload or return a public share URL | Route tests cover rejection and authorization ordering; provider/database integration is unverified |
| `/api/ai-visibility*` | Existing public assessment/result/monitor endpoints | Do not make private workspace work reachable through the public result API | Existing route tests; production behavior not asserted by this migration note |
| `/dashboard` | Existing managed-client Today surface | Keep tenant layout guards and route; shared `AppFrame` is layout composition only | Existing owner surface smoke plus new frame spec under synthetic local access |
| `/dashboard/chat` | Existing managed-client Ask Strelva conversation | Remains the one canonical full conversation route. Do not mount the contextual discussion rail here | Existing owner navigation checks plus `shared-frame.spec.ts` |
| `/dashboard/site` | Existing managed Website preview/editor entry | Keep existing editor, draft, publish, and tenant authorization behavior; only add the shared frame and optional discussion rail | Existing dashboard owner checks plus new frame spec; no publish is performed by frame checks |
| `/dashboard/content` | Existing Website content surface | Preserve route and current editor/data authorities | Route file remains; broad surface check is pending authorized run |
| `/dashboard/assets` | Existing Website asset surface | Preserve route and tenant-scoped storage access | Route file remains; broad surface check is pending authorized run |
| `/dashboard/brand-kit` | Existing Website brand-kit surface | Preserve route and existing tenant data | Existing navigation assertions; broad rendered check pending authorized run |
| `/dashboard/collections` | Existing Website collections surface | Preserve route and collection APIs | Route file remains; broad surface check is pending authorized run |
| `/dashboard/store` | Existing Website store sub-surface | Preserve route and commerce/tenant feature gate | Existing owner feature-gate checks; no migration entitlement is added |
| `/dashboard/history` | Existing Website history/safety surface | Preserve route and governed-work history | Existing owner surface checks; broad rendered check pending authorized run |
| `/dashboard/google` | Existing Google Business presence surface | Preserve route and connection/write approval checks | Existing owner surface checks; no new product permission is inferred |
| `/dashboard/reviews` | Existing review-reputation surface | Preserve route and governed review operations | Existing owner surface checks; broad rendered check pending authorized run |
| `/dashboard/analytics` | Existing analytics surface | Preserve route and reporting-window behavior | Existing owner interaction checks; broad rendered check pending authorized run |
| `/dashboard/reports` | Existing report/recap surface | Preserve route and weekly/monthly view behavior | Existing owner interaction checks; broad rendered check pending authorized run |
| `/dashboard/health` | Existing tenant site-health surface | Preserve route and tenant-scoped health data | Existing owner surface checks; no operator monitoring is exposed through this route |
| `/dashboard/integrations` | Existing integration settings surface | Preserve tenant membership and connection authorization | Route file remains; broad rendered check pending authorized run |
| `/dashboard/leads` | Existing tenant leads surface | Preserve tenant-scoped lead access | Route file remains; broad rendered check pending authorized run |
| `/dashboard/members` | Existing tenant member management | Preserve membership/admin authorization | Route file remains; broad rendered check pending authorized run |
| `/dashboard/ownership` | Existing tenant ownership surface | Preserve ownership/transfer policy | Route file remains; broad rendered check pending authorized run |
| `/dashboard/roster` | Existing tenant roster surface | Preserve route and tenant data authority | Route file remains; broad rendered check pending authorized run |
| `/dashboard/schedule` | Existing conditional scheduling surface | Preserve the existing feature gate and not-found behavior when unavailable | Existing owner feature-gate check; no workspace product access is inferred |
| `/dashboard/sources` and `/dashboard/sources/:id` | Existing tenant source-management surfaces | Preserve route and source permissions | Route files remain; broad rendered check pending authorized run |
| `/dashboard/settings` | Existing tenant business/account/domains/plan settings | Preserve route, billing, domain, and account authorities | Existing owner interaction checks; no personal workspace billing is substituted |
| `/dashboard/[...notFound]`, loading, error, and not-found states | Existing dashboard route infrastructure | Preserve fallback behavior and avoid treating shell adoption as route creation | Source remains; broad route smoke pending authorized run |
| `/client/:tenant/dashboard/*` | Existing custom-host/fallback tenant dashboard root | Preserve `clientFallbackRoot` pathing and tenant layout guards for all dashboard routes above | Existing fallback editor checks; production host behavior remains separate |
| `/admin/*` | Operator command center, client inspection, and uptime/monitoring | Keep operator surfaces separate from person workspaces. Domain Monitoring remains here | Existing admin/operator tests; no operator impersonation or activation is performed here |
| `/api/admin/*` and `/api/cron/*` | Operator and scheduled infrastructure | Preserve their existing authorization and secret checks; do not route them through workspace discovery | Existing route/unit coverage; no live cron run in this migration |
| `/api/v1/*` | Existing public/tenant integration API | Preserve versioned paths and tenant-keyed authority | Existing route tests; no migration payload is added |

The dashboard list above is intentionally explicit: a visual rename to
“Managed Websites” does not make `/dashboard/*` a generic personal workspace,
and adding `/workspace` does not remove or alias any existing managed route.

## Acceptance coverage

The acceptance tests use separate evidence classes so local fixtures cannot be
mistaken for deployed product proof.

| Check | What it proves | What it does not prove |
| --- | --- | --- |
| `tests/workspace-release.spec.ts` | Real `/workspace` rendering, loading/error recovery, private assessment result states, read-only shared work, handoff consent/revocation, product discovery, and workspace context switching against intercepted snapshots | Supabase session validity, PostgreSQL migration state, provider calls, live AI scoring, or deployed behavior |
| `tests/shared-frame.spec.ts` | Existing managed navigation remains reachable; `/dashboard/chat` remains the sole full conversation; non-chat discussion rail focus/escape/mobile behavior; collapsed navigation and screenshots | Production tenant authorization, real thread history, publish safety, or external managed-site data |
| `src/__tests__/workspace-routes.test.ts` | API gate, confirmed-session requirement, selected-workspace isolation, private headers, browser-safe managed-work projection, bounded failure behavior, mutation validation and authorization ordering | Live database, migration application, auth provider, rate-limit service, or AI provider |
| `src/__tests__/workspace-account-page.test.ts` | `/workspace/account` signed-out redirect, confirmed identity rendering, read-only workspace labels, unconfirmed-email privacy, and store-failure redaction | A real authenticated browser session or production workspace records |
| Existing product/catalog and managed-presence unit tests | Catalog compatibility metadata, consumer filtering, tenant-membership projection, and managed terminology | Rendered adoption, real entitlement, or production release |
| Existing dashboard owner/fallback/admin smoke specs | Route and surface continuity under the existing synthetic local tenant/operator harness | A deployment, production auth, or any irreversible write |

The nested `strelva-marketing/` application has its own `package.json`,
Playwright configuration, deployment, and source of truth for public company
pages. Its primary `Try Strelva` CTA intentionally hands a visitor to
`https://app.strelva.com/ai-visibility`. The private workspace is an opt-in
control-plane destination: sign-in and the server-gated `Save a copy` handoff
own that boundary, with `STRELVA_WORKSPACE_RELEASE` enforced by the control
plane. The nested marketing package does not need to read that flag. The
nested app does not authenticate a person, create a workspace, or
represent managed-tenant access. The root app's `(marketing)` routes and
`/client/:tenant` public-site fallbacks remain separate surfaces.

The browser fixtures deliberately use named synthetic businesses and route
intercepts. Screenshots are visual regression artifacts for the local rendered
composition only; they are not screenshots of a real customer, account, or
backend response.

### Local validation receipt

This is a local receipt for the current working tree, not a deployment claim.
The root checks completed sequentially during this validation pass were:

- `pnpm lint`: exit 0, 0 errors, and one existing warning for the unused
  `noBorders` value in `client-intake/sheri-mooney/build_recommendation.mjs:36`.
- Refreshed `pnpm typecheck` after the single-toggle fix: exit 0 with no
  diagnostics.
- `pnpm test` (full Vitest): exit 0, `264` test files, `2,138` tests passed,
  and `1` skipped.
- `pnpm check:boundaries`: passed, including the untracked product-boundary
  source and scripts; `git diff --check` also passed.
- The isolated synthetic workspace PostgreSQL check passed against its test
  fixture. It is separate from the live database and does not prove that the
  migration is applied or that production RLS is active.

An earlier UI-owner receipt reports `15` workspace-release tests passed and `4`
shared-frame tests passed against the local `gldf` configuration on port 3114.
The shared-frame checks use that local `gldf` configuration, not an all-fictional
harness; the workspace fixtures are fictional Harbor Dental. They do not prove
a confirmed Supabase session, live customer state, or deployed behavior.

The production-mode workspace browser run passed all `15` workspace-release
tests in `13.7s` against the built root preview on port 3113 with
`STRELVA_WORKSPACE_RELEASE=1` and `REB_DEV_UNGATED_ACCESS=0`. Its API was
intercepted; this does not prove real authentication or live database behavior.

The earlier independent Chrome-channel shared-frame validation on port 3114
produced `1 passed` and `3 failed`: the discussion rail remained hidden and
the collapse state remained `false` while the dev server was compiling. The
server then logged `ENOSPC` while writing `.next-validation-final`. The
hydration issue was confirmed: an Ask Strelva click occurred at `44,268ms`
before React at `46,852ms` and HMR at `48,567ms`. The controls are now SSR
disabled until client `useHydrationReady`, implemented with
`useSyncExternalStore` in `AppFrame` and `ConversationShell`. Three unit
regressions passed and focused lint passed. The final four managed browser
checks remain blocked by the missing local `TENANTS_SOURCE=postgres`
configuration; these source checks are not a browser-pass claim. A no-channel
attempt failed before app launch because the bundled Playwright headless shell
is not installed. These are recorded as
environment/runtime receipts, not as weakened assertions.

The earlier nested marketing focused lint and nested typecheck passed with a
temporary approximately `22 MiB` dependency overlay at
`strelva-marketing/.codex-marketing-validation-deps/` and missing-package
symlinks under `strelva-marketing/node_modules/`. That check was non-hermetic.
The scratch overlay was removed after validating that no symlink references
remained. At the earlier receipt checkpoint, both production builds were not
run: cleaning task caches left approximately `741 MiB`, and the dev server had
already demonstrated an `ENOSPC` write. Since then, the refreshed root
production build passed after the single-toggle fix: `pnpm build` exit 0 with
`224/224` pages and a `506 MiB` `.next` output. Existing Sentry `disableLogger` deprecation and
`clientTraceMetadata` warnings remain. The previous normal nested install/build
remains valid:
`npm ci --ignore-scripts --no-audit --no-fund` exit 0 with `402` packages,
followed by `npm run build` exit 0 with `133/133` pages, `144 MiB` of Next
16.3 output, and TypeScript passing. The nested build produced no build
warnings. Its normal `node_modules` is `557 MiB`; `package.json` and lockfile
hashes are unchanged, and Stripe remains at `21.0.1`. The nested marketing
build is now locked to the normal install, not the non-hermetic overlay. The
existing npm deprecation warning for `whatwg-encoding` remains. Disk headroom
is approximately `3.0 GiB` and is not the current blocker. The built previews
returned 200 at the [root `/workspace` preview](http://127.0.0.1:3113/workspace)
and [marketing preview](http://127.0.0.1:3115/). The built managed public demo
returned 500 at [the managed demo preview](http://127.0.0.1:3113/client/demo/dashboard/site)
because of the existing `[PRODUCTION] TENANTS_SOURCE must be postgres —
refusing dev-file fallback` guard. No release flag, database source, or auth
weakening was changed. The final receipt records `15` workspace tests passed;
the four managed browser checks remain blocked by the missing local
`TENANTS_SOURCE=postgres` configuration. The final screenshots were captured
with browser animations suppressed, so they do not prove unmodified animation
behavior. The passing managed-frame screenshot is
preserved outside Playwright's clearing directory at
[`shared-frame-chat-desktop.png`](../.validation-artifacts/product-work-migration-2026-09-06/shared-frame-chat-desktop.png).
Preserved workspace captures include
[`workspace-home-desktop.png`](../.validation-artifacts/product-work-migration-2026-09-06/workspace-home-desktop.png),
[`workspace-desktop.png`](../.validation-artifacts/product-work-migration-2026-09-06/workspace-desktop.png),
[`workspace-mobile.png`](../.validation-artifacts/product-work-migration-2026-09-06/workspace-mobile.png),
[`workspace-products-desktop.png`](../.validation-artifacts/product-work-migration-2026-09-06/workspace-products-desktop.png),
[`workspace-home-mobile.png`](../.validation-artifacts/product-work-migration-2026-09-06/workspace-home-mobile.png),
[`workspace-discussion-desktop.png`](../.validation-artifacts/product-work-migration-2026-09-06/workspace-discussion-desktop.png),
and [`workspace-my-work-restored.png`](../.validation-artifacts/product-work-migration-2026-09-06/workspace-my-work-restored.png).
No commit, push, deployment, or live database migration was performed. No
local receipt here represents a production deployment, live authenticated
session, or external target rendering.

## Relationship and commercial boundary

The relationship model is implemented as a browser-safe projection in
`src/platform/relationships/index.ts` and covered by
`src/__tests__/relationships.test.ts`. It resolves `User`, `Paid User`,
`Client`, and `Enterprise` from two independent facts: paid standing and
service relationship. It does not read a session, membership, product
installation, or entitlement and cannot grant access.

The current paid-standing evidence is managed-tenant-only. The dashboard layout
maps a resolved non-demo tenant through the managed-presence adapter and passes
the tenant's billing fields into the relationship projection. Recurring status
is written by the Stripe billing webhook and read through
`getEffectiveSubscriptionStatus`; tenant routes still enforce their own
membership and subscription gates. Billing-off and local dev-bypass modes
intentionally keep existing managed routes available, so their `active` result
is not evidence of a customer payment.

No account-level Paid User payer, entitlement, or checkout is shipped in this
migration. There is no account-level paid-standing store or workspace product
entitlement. Managed-tenant billing remains unchanged:
`/api/billing/start-subscription` is a tenant-scoped managed-service route, and
the public pricing pages describe managed website terms only. The public `Try
Strelva` AI Visibility result is a free trial path; it must not imply a paid
plan. A real Paid User release needs an authoritative payer/account record,
webhook reconciliation, entitlement policy, and an authenticated journey
before the relationship label can be presented as commercial availability.

## Confidence assessment

This uses the evidence rubric from the design-system review practice: `0`
absent, `1` ad hoc, `2` emerging, `3` coherent, `4` enforced/evolving. A score
is confidence in the inspected evidence, not a claim that the product has been
validated with customers.

| Dimension | Grade | Evidence and limitation |
| --- | ---: | --- |
| Foundations / contracts | 2 | Product, workspace, managed-link, privacy, and relationship contracts exist; SQL migration and live schema are not verified, and no account-level paid-standing contract exists |
| Shared primitives | 3 | `AppFrame` is a slot-based composition primitive with responsive rail, collapse, focus return, and reduced-motion-friendly transitions; rendered checks are local only |
| Product compositions | 2 | Workspace product discovery and managed compatibility projection exist, and the current `WorkspaceApp` pass-through is covered by the browser fixture; product adoption and live authorization remain unverified |
| State coverage | 3 | Browser fixtures cover loading, signed-out, unavailable, empty, measured, partial, not-measured, delegated-read, handoff, and stale-response states |
| Responsive behavior | 3 | Desktop/mobile screenshot assertions and overflow/focus checks ran; workspace captures are preserved in the ignored artifact directory; no device matrix or deployed browser run |
| Accessibility / interaction | 2 | Role/name, keyboard, focus-return, modal-rail, and skip-link contracts are asserted; no automated axe audit is included here |
| Adoption / repeat use | 1 | No live users or repeat-use evidence; the workspace release remains opt-in |
| Drift resistance | 2 | Compatibility map, boundary check, lint, typecheck, and full root Vitest are green; browser focus/cache and build gates remain |
| Release verification | 2 | Source and focused test contracts are emerging evidence; production auth, migration application, deployment, live route checks, and the commercial Paid User path remain open |

## Copy, retry, and concurrency boundary

The isolated SQL fixture proves that a sequential retry by the same verified
recipient returns the original customer workspace, work copy, and delegation
IDs. That is retry-idempotent evidence, not proof of concurrent-copy safety or
live database uniqueness. Browser handoff checks also issue one request at a
time. After the migration is applied, run a separate transaction/concurrency
check against the intended database and record its constraints, locking, and
results before calling duplicate acceptance closed.

## Open release gates

1. Apply and verify `supabase/migrations/20260905190000_release_one_workspaces.sql`
   against the intended database. Source-level SQL checks do not prove that the
   migration is applied or that RLS behaves correctly in production.
2. Complete the final managed shared-frame browser receipt after the confirmed
   hydration fix. The production-mode workspace browser run passed all `15`
   workspace-release tests in `13.7s` against the built root preview on port
   3113 with `STRELVA_WORKSPACE_RELEASE=1` and
   `REB_DEV_UNGATED_ACCESS=0`; its API was intercepted, so real auth and live
   database behavior remain unproven. The four managed browser checks remain
   blocked by the missing local `TENANTS_SOURCE=postgres` configuration after
   the fix; the three unit regressions and focused lint are not a browser-pass
   claim. The earlier independent Chrome-channel attempt was
   `1 passed / 3 failed` before an `ENOSPC` server write. Root lint, refreshed
   typecheck, full Vitest, boundary, diff, and both production builds have a
   local receipt above. The built root `/workspace` and marketing previews
   returned 200; the managed public demo returned 500 on the existing
   production database-source guard. Disk headroom is approximately `3.0 GiB`
   and is not the current blocker.
3. Verify an actual confirmed Supabase session can open `/workspace` and
   `/workspace/account`, while an unconfirmed or unrelated account receives the
   documented boundary response.
4. Verify the selected-workspace query is authorized in the live store and that
   a delegated customer view cannot mutate or reveal agency-only data.
5. Verify every `managedWork` href is generated by the server-side tenant URL
   authority and that a failed tenant read exposes only the bounded unavailable
   state.
6. Keep `/dashboard/*`, custom-host fallback routes, operator routes, public
   AI Visibility routes, and versioned APIs behaviorally compatible after any
   shell rollout. A local fixture screenshot cannot close this gate.
7. Confirm no production activation, billing migration, operator impersonation,
   consent change, or external Homefinder inventory connection is implied by the
   catalog or workspace discovery UI.
8. If Strelva opens a Paid User product, add an authoritative account-level
   payer/standing and entitlement path first. Do not derive it from a tenant
   membership, a relationship label, a catalog entry, a local bypass, or a
   managed website plan.
9. Verify the nested marketing entry check keeps the primary public `Try
   Strelva` CTA on `https://app.strelva.com/ai-visibility` and does not fabricate
   paid pricing or managed access. Separately verify the control-plane opt-in
   `/workspace` and `Save a copy` journeys under server-side auth and the
   `STRELVA_WORKSPACE_RELEASE` gate; the nested marketing package does not need
   to read that flag.

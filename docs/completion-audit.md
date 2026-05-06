# REB Launch Completion Audit

Last audited: May 6, 2026.

## Objective

Make REB / Scaffold Web fully launch-ready with a complete design kit and 2026-ready design direction.

## Success Criteria

1. A complete design kit exists and is tied to launch governance.
2. The app is aligned with current platform expectations for 2026-era Next.js, accessibility, responsive behavior, and performance.
3. Tenant storefront launch surfaces render real launch content and do not expose obvious placeholder, invalid-media, or mobile-overflow issues.
4. The launch checklist is executable and blocks release when required production dependencies are missing.
5. Local source verification is green.
6. Production deployment, env vars, domains, webhooks, cron auth, preview framing, and tenant revalidation are verified.

## Prompt-To-Artifact Checklist

| Requirement | Evidence | Status |
| --- | --- | --- |
| Complete design kit | `docs/design-kit.md` covers brand system, tokens, typography, components, motion, accessibility, Core Web Vitals, template rules, and launch acceptance. | Complete |
| 2026-ready design direction | `docs/design-kit.md` positions Scaffold Web as a calm SMB operating system, documents AI transparency patterns, mobile-first tenant storefront expectations, WCAG 2.2 AA, and Core Web Vitals targets. | Complete |
| Design kit is part of launch governance | `docs/production-readiness.md` requires design-kit review; `scripts/production-checklist.ts` checks required design-kit sections. | Complete |
| Launch blockers are enforced | `docs/launch-blockers.md` tracks unresolved non-code blockers; `scripts/production-checklist.ts` fails when unwaived blockers remain. | Complete |
| Production env owner handoff exists | `.env.production.example` lists live-shaped production placeholders and required Vercel Production values; `docs/production-readiness.md` points owners to it; `scripts/production-checklist.ts` verifies the template exists and includes launch-critical placeholders. | Complete |
| Production key-shape rules are enforced | `src/lib/production-readiness-rules.ts` rejects test-mode Clerk/Stripe keys, non-HTTPS service URLs, localhost production URLs, and active tenants without launch domains/revalidation; `src/__tests__/production-readiness-rules.test.ts` covers these cases. | Complete |
| Current Next.js convention | `src/proxy.ts` replaces `src/middleware.ts`; tests import `../proxy`; `pnpm build` no longer emits the Next 16 middleware deprecation warning. | Complete |
| Mobile accessibility | `src/app/layout.tsx` no longer locks zoom with `maximumScale`. | Complete |
| Dev-origin readiness | `next.config.ts` sets `allowedDevOrigins: ["127.0.0.1"]`. | Complete |
| GLDF launch content | `scripts/seed-tenant.ts` includes `gldf` defaults; Sanity was seeded with GLDF-specific Apple Snaps copy and product content. | Complete |
| Food-brand invalid media protection | Food-brand product/story/cart/modal components render placeholders when image fields are empty; food-brand contact hides empty email links. | Complete |
| Mobile overflow protection | `src/app/globals.css`, `Story.tsx`, `TypographicBreak.tsx`, and `tests/customer-frontend.spec.ts` cover mobile viewport fit; manual Playwright check showed `scrollWidth === clientWidth` for GLDF at 390px. | Complete |
| Local verification | Latest verified runs: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm smoke` passed. | Complete |
| Public reachability | `https://scaffoldweb.com/home` returned `200`; `https://greatlakesdriedfruit.com/` redirected to `www` and returned `200`; `https://admin.greatlakesdriedfruit.com/` redirected to `/dashboard` then `/sign-in`. | Partially complete |
| Production env and dependency verification | `pnpm check:prod` fails on required env vars and unresolved blockers. Vercel connector cannot access linked project/team. | Blocked |
| Tenant domain/revalidation verification | `gldf` and `rohlax` pass domain/revalidation checks; duplicate tenant `rohlax-wellness` is inactive and no longer a hard launch blocker. | Complete |
| Manual authenticated dashboard verification | Requires authorized owner access in production or preview environment. | Blocked |
| Webhook and cron live verification | Requires production env secrets and external service access. | Blocked |

## Latest Command Evidence

Passing local gates:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

Latest full local evidence:

- `pnpm test` passed: 21 files, 192 tests.
- `pnpm build` passed on Next 16.1.0.
- No repo source or visible shell environment entry references `--localstorage-file`; the build warning appears to come from external tooling and is not currently a failing gate.

Known failing gate:

```bash
pnpm check:prod
```

Current failures:

- `docs/launch-blockers.md` contains unresolved blockers.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set to a test key, not a live production key.
- `CLERK_SECRET_KEY` is set to a test key, not a live production key.
- `CLERK_WEBHOOK_SECRET` is missing.
- `SANITY_WEBHOOK_SECRET` is missing.
- `UPSTASH_REDIS_REST_URL` is missing.
- `UPSTASH_REDIS_REST_TOKEN` is missing.
- `STRIPE_SECRET_KEY` is missing.
- `STRIPE_SCAFFOLD_PRICE_ID` is missing.
- `STRIPE_WEBHOOK_SECRET` is missing.
- `RESEND_API_KEY` is missing.
- `RESEND_DOMAIN` is missing.
- `CRON_SECRET` is missing.
- `INTERNAL_API_SECRET` is missing.
- `SENTRY_DSN` is missing.
- `NEXT_PUBLIC_SITE_URL` is missing.

## Completion Decision

Not complete.

The codebase and local launch gates are in a launch-ready shape, but the objective says fully launch-ready. That requires production env, Vercel access, external webhook/cron verification, and tenant domain/revalidation decisions. Those remain blocked outside the local codebase and are tracked in `docs/launch-blockers.md`.

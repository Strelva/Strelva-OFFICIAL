# REB Production Readiness

## Branch And Release Model

- Primary branch: `main`.
- GLDF primary branch: `master` until intentionally renamed.
- Tag control-plane releases as `reb-vYYYY.MM.DD.N`.
- Record compatible storefront tags or commit SHAs in each REB release note.

## API Contract

- `src/lib/reb-contracts.ts` is the source of truth for route builders, tenant constants, revalidation payloads, and HMAC signing in this repo.
- GLDF vendors the same contract helpers so both repos build independently without a sibling package dependency.
- Versioned public storefront endpoints:
  - `GET /api/v1/content/:tenant/:section`
  - `GET /api/v1/page-config/:tenant`
- Legacy public aliases currently exist under `/api/public/*`; new storefronts should use `/api/v1/*`.
- Storefront revalidation targets should prefer `/api/v1/revalidate`.

## Tenant Deployment Checklist

- Provision tenant with a unique `revalidationSecret`.
- Set the storefront `REVALIDATE_SECRET` to the same value.
- Set tenant `revalidateUrl` to the storefront `/api/v1/revalidate` endpoint.
- Confirm custom domain mapping resolves tenant from host or use `/api/v1/*` public routes.
- Run `pnpm check`.
- Run `pnpm check:prod` against production env values.
- Run `PLAYWRIGHT_BASE_URL=<deployment-url> pnpm smoke`.

## Content Schema Rollback Plan

- Keep new content fields optional in REB for one storefront release.
- Deploy storefront rendering support before requiring a new field in REB.
- If content breaks a storefront, restore the previous content version from REB version history.
- If code breaks a storefront, redeploy the previous Vercel deployment or release tag.
- For incompatible schema changes, publish a new API version and keep `/api/v1/*` stable until all storefronts migrate.

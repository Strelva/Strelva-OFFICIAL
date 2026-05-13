# Scaffold Custom Repo Starter

Use this folder as the contract scaffold for every paid-client custom site repo.
Scaffold Web remains the control plane; the custom repo is the public website runtime.

## Required Environment

```bash
TENANT_ID=client-slug
REB_API_URL=https://scaffoldweb.com
REVALIDATION_SECRET=shared-secret-from-reb-tenant
```

## Required Contract

- Fetch editable content from `GET /api/v1/content/{tenant}/{section}`.
- Fetch page structure from `GET /api/v1/page-config/{tenant}`.
- Fetch the site's capability manifest from `GET /api/v1/site-capabilities/{tenant}`.
- Expose `POST /api/revalidate` and verify `x-reb-timestamp` + `x-reb-signature`.
- Keep local defaults so the site renders when Scaffold Web is unavailable.
- Document supported sections, variants, design tokens, custom-only features, deploy target, checks, and rollback path.

## Ship Checklist

- `npm run build` passes.
- Primary CTA works.
- Scaffold Web content fallback works without `REB_API_URL`.
- `?preview=true` fetches draft content/page config without caching when draft preview is supported.
- The local capability manifest matches the sections, variants, design tokens, and custom components the repo actually renders.
- Signed revalidation rejects invalid signatures.
- Signed revalidation accepts a valid request for this `TENANT_ID`.
- Scaffold Web tenant metadata includes repo name, production URL, contract version, and revalidation URL.

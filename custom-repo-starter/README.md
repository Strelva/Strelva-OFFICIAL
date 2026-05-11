# Scaffold Custom Repo Starter

Use this folder as the contract scaffold for every paid-client custom site repo.
REB remains the control plane; the custom repo is the public website runtime.

## Required Environment

```bash
TENANT_ID=client-slug
REB_API_URL=https://scaffoldweb.com
REVALIDATION_SECRET=shared-secret-from-reb-tenant
```

## Required Contract

- Fetch editable content from `GET /api/v1/content/{tenant}/{section}`.
- Fetch page structure from `GET /api/v1/page-config/{tenant}`.
- Expose `POST /api/revalidate` and verify `x-reb-timestamp` + `x-reb-signature`.
- Keep local defaults so the site renders when REB is unavailable.
- Document supported sections, custom-only features, deploy target, checks, and rollback path.

## Ship Checklist

- `npm run build` passes.
- Primary CTA works.
- REB content fallback works without `REB_API_URL`.
- Signed revalidation rejects invalid signatures.
- Signed revalidation accepts a valid request for this `TENANT_ID`.
- REB tenant metadata includes repo name, production URL, contract version, and revalidation URL.

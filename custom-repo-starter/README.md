# Scaffold Custom Repo Starter

Use this folder as the contract scaffold for every paid-client custom site repo.
Scaffold Web remains the control plane; the custom repo is the public website runtime.

## Required Environment

```bash
TENANT_ID=client-slug
SCAFFOLD_API_URL=https://scaffoldweb.com
REVALIDATION_SECRET=shared-secret-from-scaffold-tenant
```

`scaffold-client.ts` also accepts the legacy `REB_API_URL` env var. New repos
should set `SCAFFOLD_API_URL`; existing repos can migrate without breakage by
setting both during cutover.

## Required Contract

- Drop in `scaffold-client.ts` (this folder) and use `fetchScaffoldContent`,
  `fetchScaffoldPageConfig`, and `fetchScaffoldSiteCapabilities` to read tenant
  data from Scaffold Web.
- Fetch editable content from `GET /api/v1/content/{tenant}/{section}`.
- Fetch page structure from `GET /api/v1/page-config/{tenant}`.
- Fetch the site's capability manifest from `GET /api/v1/site-capabilities/{tenant}`.
- Expose `POST /api/revalidate` and verify `x-reb-timestamp` + `x-reb-signature`
  headers. The header names are intentionally retained from v1 of the contract
  so deployed repos do not break when Scaffold Web is renamed; a future v2 may
  switch to `x-scaffold-*`.
- Keep local defaults so the site renders when Scaffold Web is unavailable.
- Document supported sections, variants, design tokens, custom-only features, deploy target, checks, and rollback path.

## Ship Checklist

- `npm run build` passes.
- Primary CTA works.
- Scaffold Web content fallback works without `SCAFFOLD_API_URL`.
- `?preview=true` fetches draft content/page config without caching when draft preview is supported.
- The local capability manifest matches the sections, variants, design tokens, and custom components the repo actually renders.
- Signed revalidation rejects invalid signatures.
- Signed revalidation accepts a valid request for this `TENANT_ID`.
- Scaffold Web tenant metadata includes repo name, production URL, contract version, and revalidation URL.

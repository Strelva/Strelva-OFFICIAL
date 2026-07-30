# Future Codebase Integration Guide

This guide defines how future client codebases should be built so they plug into Strelva cleanly, stay operable from the dashboard, and scale as the platform adds more tenants.

Strelva is the control plane. Future client codebases are storefronts or service sites that render custom public experiences while consuming Strelva-owned content, page configuration, capabilities, operational state, and change workflows.

## Core Principle

Build every future codebase as a Strelva-compatible product surface, not as a standalone website with a later integration pass.

That means each repo must:

- Fetch editable content from Strelva using the versioned public API.
- Publish a capability manifest so Strelva knows what the site can safely expose.
- Support signed revalidation so dashboard changes reach the public site quickly.
- Keep local defaults so the public site degrades gracefully during Strelva outages.
- Document commands, env vars, dependencies, rollback, and compatibility.
- Treat tenant identity and contract version as first-class constants.

## Current Strelva Contracts

The current integration contract is `v1`.

Source of truth inside Strelva:

- Contract helpers: `src/lib/scaffold-contracts.ts` (versioned route helpers + HMAC signing/verification; legacy `REB_*` aliases exported for back-compat)
- Public content API: `src/app/api/v1/content/[tenant]/[section]/route.ts`
- Public page config API: `src/app/api/v1/page-config/[tenant]/route.ts`
- Public capability API: `src/app/api/v1/site-capabilities/[tenant]/route.ts`
- Capability builder: `src/lib/site-capabilities.ts`
- Tenant metadata: `src/lib/types.ts`, `src/lib/tenants.ts`
- Custom repo metadata helpers: `src/lib/custom-repos.ts`
- Revalidation client: `src/lib/revalidate-client.ts`
- Workspace verifier: `scripts/custom-repo-workspace-check.ts`
- Compatibility manifest: `release-manifest.json`

Future repos should not invent new integration surfaces until the Strelva contract is intentionally versioned.

## Required Repository Shape

Each custom repo should include:

```text
AGENTS.md
README.md
.env.example
package.json
release-manifest.json
src/lib/reb-contracts.ts   # client-repo contract constants (TENANT_ID, REB_CONTRACT_VERSION)
src/lib/storage.ts or src/lib/reb.ts  # Strelva fetch helpers
src/app/api/reb-capabilities/route.ts
src/app/api/v1/revalidate/route.ts
scripts/production-checklist.ts or scripts/scaffold-web-check.mjs
```

Note: `src/lib/reb-contracts.ts` lives inside the **custom repo** (not in the `strelva-platform` control plane). The control-plane contract helpers live in `src/lib/scaffold-contracts.ts`. The legacy `reb-contracts.ts` filename is kept in custom repos for back-compat with the `release-manifest.json` baseline check.

The exact app structure can vary by product, but those files are the minimum operational surface Strelva expects for a custom repo.

Required package scripts:

- `dev`
- `build`
- `typecheck`
- `test`
- `check`
- A production or scaffold-specific checker such as `check:prod` or `check:scaffold`

For client repos with custom ecommerce, rewards, admin proxying, or other special flows, add targeted scripts and endpoints, but keep the base Strelva contract unchanged.

## Required Environment Variables

Every future custom repo should define these in `.env.example`:

```bash
TENANT_ID=
REB_API_URL=
REB_DASHBOARD_URL=
REVALIDATION_SECRET=
REVALIDATE_SECRET=
```

`REVALIDATION_SECRET` is the preferred name. `REVALIDATE_SECRET` exists for legacy compatibility and should remain supported while current repos still use it.

Add feature-specific env vars only when the repo owns that feature. Examples:

- Commerce: `STRIPE_SECRET_KEY`, product price IDs, webhook secrets.
- Rewards or account data: database URL, service role key, proxy secret.
- Custom request ingress: `REB_CUSTOM_REQUEST_SECRET`.
- Storage: Blob or object-storage credentials.
- Scheduled jobs: job-specific secrets such as reconcile or sync secrets.

Do not put cross-tenant secrets or Strelva dashboard secrets into client repos unless the repo directly needs them.

## Tenant Identity

Tenant IDs must be stable, lowercase, URL-safe identifiers matching Strelva validation:

```text
^[a-z0-9-]+$
```

Each custom repo should expose the tenant ID as a code constant:

```ts
export const REB_CONTRACT_VERSION = "v1" as const;
export const TENANT_ID = "tenant-id" as const;
```

Avoid deriving tenant identity from request host inside client repos unless the repo is intentionally multi-tenant. Most future client repos should be single-tenant and explicit.

## Content Fetching

Future repos must consume content through:

```text
GET /api/v1/content/{tenant}/{section}
```

Strelva validates:

- Tenant format.
- Tenant existence and active status.
- Section existence in Strelva storage.
- Section support in the tenant capability manifest.

Repos should:

- Centralize all Strelva fetches in one module.
- Fetch by `TENANT_ID`.
- Use local defaults when Strelva is unavailable.
- Avoid direct reads from Strelva Redis, Sanity, or dev content files.
- Treat content as data, not layout authority.

Supported shared content sections currently include:

```text
hero
services
story
testimonials
events
providers
contact
settings
faq
shop
products
theme
rewardsConfig
navigation
footer
```

When a future repo needs new editable content, add the section first in Strelva types, schemas, defaults, editor UI, capability handling, and tests. Then consume it from the custom repo.

## Page Configuration

Future repos that support Strelva-managed pages must consume:

```text
GET /api/v1/page-config/{tenant}
```

Page config is for page-level composition:

- Section type.
- Visibility.
- Order.
- Variant.
- Layout props.
- Responsive overrides.
- SEO metadata.

Repos should use page config to decide which known components render and in what order. They should not allow arbitrary code, arbitrary component imports, or unbounded props from Strelva.

If a repo does not support page config, set `supportsPageConfig: false` in its manifest and tenant metadata.

## Capability Manifest

Every future repo must expose:

```text
GET /api/reb-capabilities
```

Strelva also exposes the merged manifest at:

```text
GET /api/v1/site-capabilities/{tenant}
```

The manifest tells Strelva what is safe to show in the dashboard and what should become a custom request instead.

Required manifest shape:

```ts
{
  contractVersion: "v1",
  sections: {
    [section: string]: {
      variants: string[],
      editableFields: string[],
      styleProps: string[],
      allowedActions?: ("read" | "draft" | "publish" | "request_custom")[]
    }
  },
  designTokens: ("colors" | "fonts" | "buttons" | "spacing" | "radius" | "motion" | "imagery")[],
  supportsPageConfig: boolean,
  supportsNavigationConfig: boolean,
  supportsFooterConfig: boolean,
  supportsDraftPreview: boolean,
  supportsInlineEditing: boolean,
  customOnlyFeatures: string[],
  customRequestEndpoint?: string,
  customComponents: CustomComponentCapability[]
}
```

Use the manifest to keep Strelva honest:

- Editable content sections get `draft` and `publish`.
- Bespoke design or code-heavy sections get `request_custom`.
- Unsupported sections are omitted.
- Admin-only components are listed as `customComponents` with `adminOnly: true`.
- Features that cannot safely be self-served go in `customOnlyFeatures`.

The dashboard should never have to guess what a custom repo supports.

## Signed Revalidation

Future repos must expose a signed revalidation endpoint:

```text
POST /api/v1/revalidate
```

Strelva sends:

- Raw JSON body.
- `x-reb-timestamp`.
- `x-reb-signature`.
- HMAC-SHA256 over `{timestamp}.{body}`.

Future repos must:

- Verify the timestamp is within five minutes.
- Verify the signature using a timing-safe comparison.
- Accept payloads shaped like `{ tenant, all }`, `{ tenant, paths }`, or `{ tenant, tags }`.
- Reject payloads where the tenant does not match the repo tenant.
- Revalidate only supported paths or tags.
- Return non-2xx on invalid auth, invalid tenant, or malformed payload.

Strelva records revalidation failures and can alert. Repos should also log revalidation failures locally because stale public pages break trust quickly.

## Draft Preview And Admin Handoff

Future repos should support draft preview when possible.

Baseline expectations:

- `?preview=true` or equivalent preview state fetches draft page config/content from Strelva.
- Admin preview requests preserve the handoff from Strelva dashboard to the custom repo.
- Preview mode cannot leak private dashboard data to public visitors.
- Preview headers or query params are validated where the repo supports admin-only flows.

If a repo cannot support draft preview, explicitly set:

```ts
supportsDraftPreview: false
supportsInlineEditing: false
```

and make Strelva route users toward custom requests instead of broken editing affordances.

## Data Ownership

Use this boundary for future repos:

| Data | Owner |
| --- | --- |
| Business content | Strelva |
| Page configuration | Strelva |
| Capability manifest | Custom repo, merged by Strelva |
| Public rendering | Custom repo |
| Tenant config and billing status | Strelva |
| AI conversations, queue, reports, activity | Strelva |
| Ecommerce catalog or checkout implementation | Custom repo unless promoted to Strelva |
| Rewards, accounts, or app-specific databases | Custom repo unless promoted to Strelva |
| Analytics summaries shown to owners | Strelva |
| External dependency status | Strelva tenant metadata plus repo docs |

If a feature becomes common across multiple client repos, promote the contract to Strelva instead of copy-pasting custom code indefinitely.

## Local Defaults And Failure Behavior

Future repos must remain usable when Strelva is temporarily unavailable.

Required behavior:

- Provide local content defaults for every rendered section.
- Provide a local capability manifest.
- Fail closed for admin-only or write actions.
- Fail open only for public read rendering when local defaults are safe.
- Log fetch failures with enough context to debug tenant, section, and endpoint.
- Do not render blank public pages because a content API call failed.

The customer should see a stable site. The operator should see an actionable failure.

## Tenant Metadata In Strelva

Each custom-repo tenant in Strelva should include:

```ts
{
  deliveryModel: "custom_repo",
  customRepo: {
    repoName,
    localPath,
    productionUrl,
    capabilityManifestUrl,
    supportsPageConfig,
    supportsDraftPreview,
    supportsInlineEditing,
    contractVersion,
    buildCommand,
    testCommand,
    rollbackPlan,
    externalDependencies
  },
  revalidateUrl,
  revalidationSecret
}
```

Keep `customRepo.externalDependencies` current for dependencies that can break public behavior, such as paused databases, expired API credentials, payment providers, or deployment blockers.

Critical, failing, or paused dependencies should block launch and appear in operator surfaces.

## Release And Compatibility

Every future repo should include a `release-manifest.json`.

Minimum fields:

```json
{
  "app": "tenant-site",
  "version": "tenant-vYYYY.MM.DD.N",
  "contractVersion": "v1",
  "compatibleReb": {
    "tag": "reb-vYYYY.MM.DD.N",
    "commit": "..."
  },
  "requiredEnv": [
    "TENANT_ID",
    "REB_API_URL",
    "REB_DASHBOARD_URL",
    "REVALIDATION_SECRET"
  ]
}
```

Strelva's root `release-manifest.json` should record compatible custom repo tags or commits for active flagship repos. This prevents silent drift between the dashboard contract and public sites.

## Testing And Verification

Each future custom repo should test:

- Contract constants match Strelva.
- Content fetch builds the correct `/api/v1/content/{tenant}/{section}` URL.
- Page config fetch builds the correct `/api/v1/page-config/{tenant}` URL.
- Capability endpoint returns schema-valid JSON.
- Revalidation verifies signed requests and rejects bad signatures.
- Revalidation rejects mismatched tenants.
- Local defaults render when Strelva fetches fail.
- Production checklist catches missing env vars and broken contract files.

Strelva should verify future repos through `pnpm check:custom-repos`. When a new repo is added, update:

- `scripts/custom-repo-workspace-check.ts`
- `release-manifest.json`
- `docs/custom-repo-delivery-model.md`
- This guide if the required contract changes.

For Strelva itself, continue using:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm check:custom-repos
pnpm check:prod
pnpm build
```

Use narrower commands while developing, but a release that changes the contract needs the full relevant gate.

## Scaling Rules

Use these rules as Strelva grows:

1. Version contracts before changing public integration behavior.
2. Add schema validation in Strelva before exposing new editable data to custom repos.
3. Put shared primitives in Strelva, not in one-off client repos.
4. Keep custom repos responsible for bespoke rendering and client-specific product logic.
5. Keep tenant state isolated by tenant ID in every API, cache key, and data store.
6. Prefer capability negotiation over hardcoded dashboard assumptions.
7. Treat every custom repo dependency as operational state, not tribal knowledge.
8. Make every public-site update observable through revalidation status, activity, queue, or alerts.
9. Promote repeated custom features only after at least two repos prove the same need.
10. Keep rollback paths documented before launch, not after an incident.

## New Repo Build Sequence

Use this sequence for each future client codebase:

1. Create tenant record in Strelva with `deliveryModel: "custom_repo"`.
2. Create the custom repo with the required file shape and scripts.
3. Add `TENANT_ID`, `REB_CONTRACT_VERSION`, signed revalidation helpers, and local defaults.
4. Implement centralized Strelva fetch helpers for content, page config, and capabilities.
5. Implement the public renderer using known components and bounded props.
6. Expose `/api/reb-capabilities`.
7. Expose `/api/v1/revalidate`.
8. Add `.env.example`, `README.md`, `AGENTS.md`, production checklist, and rollback notes.
9. Add `release-manifest.json`.
10. Add tenant `customRepo` metadata in Strelva.
11. Add the repo to `scripts/custom-repo-workspace-check.ts`.
12. Run repo-local `check`.
13. Run Strelva `pnpm check:custom-repos`.
14. Smoke preview, publish, and signed revalidation from the dashboard.
15. Record compatible commits or tags in release manifests.

Do not launch the public domain until the dashboard can prove content fetch, preview, publish, revalidation, and rollback.

## Promotion Criteria For Platform Features

Keep a feature custom when:

- It is unique to one client.
- It requires bespoke design or business logic.
- It has unclear repeat demand.
- It can be represented in Strelva as a custom request.

Promote a feature into Strelva when:

- Two or more repos need the same capability.
- The owner workflow is identical across tenants.
- The data model can be validated safely.
- The dashboard can expose it without code access.
- It improves activation, retention, weekly reports, or proof of value for the core ICP.

Promotion should add a Strelva contract, schema, editor surface, default data, tests, and migration notes before custom repos consume it.

## Done Definition For Future Codebases

A future codebase is Strelva-integrated only when all of this is true:

- Strelva can read its capability manifest.
- Strelva can serve valid content and page config for its tenant.
- The repo can render with Strelva data and with local fallbacks.
- The repo rejects invalid revalidation signatures.
- Strelva can trigger successful signed revalidation.
- The dashboard does not expose unsupported editing controls.
- External dependencies are documented and reflected in tenant metadata.
- Required env vars are documented.
- Build, typecheck, tests, and production checklist pass.
- `pnpm check:custom-repos` passes from Strelva.
- Release manifests record compatible contract versions and commits.
- Rollback is documented and practical.

If any item is missing, the repo may still be a good website, but it is not yet a scalable Strelva-integrated codebase.

## Known issues / TODO (as of 2026-07-30)

**[HIGH][tenant-isolation] v1 collections routes missing `Cache-Control: private`.**
`GET /api/v1/collections/[tenant]/[type]` and `.../[slug]` return no `Cache-Control` header on success. Other v1 routes (content, page-config, site-capabilities) already set `private, max-age=0, must-revalidate`. A shared or CDN cache could serve one tenant's collection data to another. Fix both routes to match the pattern.

**[MEDIUM][security] `SECRETS_ENC_KEY` and private `SUPABASE_URL` missing from production checklist.**
`SECRETS_ENC_KEY` (at-rest AES-256-GCM for provider secrets) is not in `scripts/production-checklist.ts` or `.env.production.example`. A removed key causes a full platform outage via an unguarded throw in `loadTenants` (`src/lib/tenants.ts:205`). The private server-only `SUPABASE_URL` (separate from `NEXT_PUBLIC_SUPABASE_URL`) is also missing from both files. Fix: add `checkEnvVar('SECRETS_ENC_KEY', true)` and `checkEnvVar('SUPABASE_URL', true)` to the checklist, and document both in `.env.production.example`.

**[MEDIUM][security] Orphaned Clerk and Sanity secrets in Vercel environment.**
Several secrets from the Clerk and Sanity teardowns (both complete as of mid-2026) remain set in the Vercel project environment. Remove them with `vercel env rm` across all environments. Also remove unused Turborepo vars (`NX_DAEMON`, `TURBO_*`) and `CORS_ORIGINS` (no code reference). See the audit for the full list.

**[CRITICAL][security] Next.js version has unpatched CVEs.**
Check `package.json` for the current Next.js version and run `pnpm audit`. Bump to the latest 16.x patch to clear known HIGH/MODERATE advisories. Run `pnpm install` and redeploy after the bump.

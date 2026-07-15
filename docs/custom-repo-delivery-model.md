# Custom Repo Delivery Model

Custom repos are the default paid-client delivery path. Strelva is the shared
control plane for dashboard access, AI requests, content, review, reports,
tenant settings, billing, and operational history.

For the full build standard future codebases should follow, see
`docs/future-codebase-integration.md`.

## Customer Promise

Clients own a custom site experience. Strelva manages the implementation,
deployment, quality, and major changes. Clients request work through Strelva; they
do not get direct repo or code-editor access by default.

## Responsibilities

- Strelva stores editable business content and site operations.
- Strelva queues AI review items and custom repo requests.
- Custom repos render the public site and own bespoke frontend behavior.
- Custom repos publish a capability manifest so Strelva only offers supported sections,
  variants, tokens, draft preview behavior, and admin-only custom components.
- Strelva triages custom repo requests within one business day.

## Required Custom Repo Contract

- Consume `GET /api/v1/content/{tenant}/{section}`.
- Consume `GET /api/v1/page-config/{tenant}` where the site supports page-level sections.
- Consume `GET /api/v1/site-capabilities/{tenant}` or keep an equivalent local
  manifest in sync with Strelva tenant metadata.
- Publish a capability manifest declaring the sections the LIVE site actually
  renders (see "Capability Manifest Publish Contract" below).
- Expose a signed `POST /api/revalidate` endpoint.
- Keep local defaults for Strelva outages.
- Document supported sections, variants, design tokens, custom features, env vars,
  build/test commands, deploy target, and rollback path.

## Capability Manifest Publish Contract

By default the AI edits the template's built-in section list. A custom repo whose
LIVE site renders sections beyond that template should PUBLISH its own capability
manifest so the AI edits what the site actually shows.

**How a repo publishes its manifest**

- Drop `custom-repo-starter/site-capabilities-route.ts` in at
  `app/api/capabilities/route.ts`. It builds the manifest from the repo's own
  `content-defaults` (so the section list stays honest to what the repo ships)
  via the new `buildSiteCapabilityManifest()` helper in
  `custom-repo-starter/scaffold-client.ts`, and serves it as static JSON.
- Declare commerce (cart/checkout), rewards, and any other repo-managed behavior
  in `customOnlyFeatures`. The AI **requests** changes to those (custom-request
  path) rather than editing them directly — they are not AI-editable content.

**How an operator points the tenant at it**

- Set the tenant's `customRepo.capabilityManifestUrl` to the manifest's public
  URL via `POST /api/admin/tenants/[id]/capability-manifest` (super-admin). This
  is now settable/updatable/clearable on EXISTING tenants — previously it could
  only be set at tenant-create, so pre-existing tenants (gldf, rohlax) predate
  the field. The URL must be a public https target that passes the same SSRF
  guard as the fetch path; the change merges into the `customRepo` blob (other
  fields untouched) and is audit-logged.
- The control plane then fetches + merges the manifest (`getSiteCapabilityManifest`
  in `src/lib/site-capabilities.ts`, SSRF-guarded + Zod-validated) and
  `resolveEditableSections` (`src/lib/agent-shared.ts`) ADDS the sections the
  remote manifest declares beyond the template. It is a no-op for tenants without
  a remote manifest.

## Current Precedents

- GLDF: ecommerce, cart, rewards, Stripe, Supabase, custom section renderer,
  Strelva content/page-config sync, signed revalidation.
- Rohlax Wellness: bespoke wellness pages, booking UX, motion system,
  Strelva content fetch, signed revalidation.

## Workspace Connections

The local Strelva workspace expects these sibling custom repos:

| Tenant | Local repo | Public site | Capability manifest | Signed revalidation |
| --- | --- | --- | --- | --- |
| `gldf` | `../greatlakesdriedfruits` | `https://greatlakesdriedfruit.com` | `/api/reb-capabilities` | `/api/v1/revalidate` |
| `rohlax` | `../rohlax-wellness` | `https://rohlaxwellness.com` | `/api/reb-capabilities` | `/api/v1/revalidate` |

Strelva release metadata records both storefronts in `release-manifest.json`. Run
`pnpm check:custom-repos` from the Strelva repo to verify that both sibling repos
still expose the v1 contract files, env templates, capability manifests,
admin-preview handoff, and signed revalidation endpoints expected by Strelva.

## Tenant Metadata Requirements

Each custom-repo tenant in Strelva should have:

- `deliveryModel: "custom_repo"`
- `customRepo.repoName`
- `customRepo.localPath`
- `customRepo.productionUrl`
- `customRepo.capabilityManifestUrl` (settable on existing tenants via
  `POST /api/admin/tenants/[id]/capability-manifest`; see the publish contract above)
- `customRepo.supportsPageConfig: true`
- `customRepo.supportsDraftPreview: true`
- `customRepo.supportsInlineEditing: true`
- `revalidateUrl` pointing at the storefront `/api/v1/revalidate`
- `revalidationSecret` matching the storefront `REVALIDATION_SECRET` or legacy
  `REVALIDATE_SECRET`

GLDF also requires `REB_CUSTOM_REQUEST_SECRET`, `REWARDS_PROXY_SECRET`,
`RECONCILE_SECRET`, Stripe, Supabase, and Blob env because it owns ecommerce,
rewards, uploads, and admin proxy endpoints. Rohlax currently requires only the
content, dashboard, site URL, and revalidation env for Strelva connectivity.

## Adding a client repo to the workspace inventory (2026-07-15)

The workspace inventory is **manifest-driven** — `release-manifest.json` → `customRepoWorkspace` is the single source of truth. Onboarding a new client repo is a manifest entry, **not** a code edit to `scripts/custom-repo-workspace-check.ts`.

**Every custom repo must meet the shared `baseline`** (see `customRepoWorkspace.baseline`):
- package scripts: `dev`, `build`, `typecheck`, `test`, `check`
- files: `README.md`, `.env.example`, `src/lib/reb-contracts.ts`, `src/lib/storage.ts`, `src/app/api/reb-capabilities/route.ts`, `src/app/api/v1/revalidate/route.ts`, `release-manifest.json`
- the repo's own `release-manifest.json` must set `"contractVersion": "v1"` and list env `REB_API_URL`

**To add client #N**, append to `customRepoWorkspace.repos`:
```json
{ "tenant": "<slug>", "localPath": "../<repo-dir>", "compatibleCommit": "<git sha the platform is verified against>" }
```
That's it — a starter-based repo inherits the whole baseline. Only add `packageScripts` / `requiredFiles` / `requiredEnv` to the entry if the repo has extras BEYOND the baseline (the legacy gldf/rohlax repos do; new starter repos shouldn't).

**Verify:** `pnpm check:custom-repos` (green when siblings aren't checked out — repos SKIP; run with the repos checked out next to `strelva-platform`, or set `CUSTOM_REPO_WORKSPACE_ROOT`, to run the structural checks). Merge logic is covered by `src/__tests__/custom-repo-workspace-inventory.test.ts`.

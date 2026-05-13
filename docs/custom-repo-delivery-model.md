# Custom Repo Delivery Model

Custom repos are the default paid-client delivery path. Scaffold Web is the shared
control plane for dashboard access, AI requests, content, review, reports,
tenant settings, billing, and operational history.

For the full build standard future codebases should follow, see
`docs/future-codebase-integration.md`.

## Customer Promise

Clients own a custom site experience. Scaffold manages the implementation,
deployment, quality, and major changes. Clients request work through Scaffold Web; they
do not get direct repo or code-editor access by default.

## Responsibilities

- Scaffold Web stores editable business content and site operations.
- Scaffold Web queues AI review items and custom repo requests.
- Custom repos render the public site and own bespoke frontend behavior.
- Custom repos publish a capability manifest so Scaffold Web only offers supported sections,
  variants, tokens, draft preview behavior, and admin-only custom components.
- Scaffold triages custom repo requests within one business day.

## Required Custom Repo Contract

- Consume `GET /api/v1/content/{tenant}/{section}`.
- Consume `GET /api/v1/page-config/{tenant}` where the site supports page-level sections.
- Consume `GET /api/v1/site-capabilities/{tenant}` or keep an equivalent local
  manifest in sync with Scaffold Web tenant metadata.
- Expose a signed `POST /api/revalidate` endpoint.
- Keep local defaults for Scaffold Web outages.
- Document supported sections, variants, design tokens, custom features, env vars,
  build/test commands, deploy target, and rollback path.

## Current Precedents

- GLDF: ecommerce, cart, rewards, Stripe, Supabase, custom section renderer,
  Scaffold Web content/page-config sync, signed revalidation.
- Rohlax Wellness: bespoke wellness pages, booking UX, motion system,
  Scaffold Web content fetch, signed revalidation.

## Workspace Connections

The local Scaffold Web workspace expects these sibling custom repos:

| Tenant | Local repo | Public site | Capability manifest | Signed revalidation |
| --- | --- | --- | --- | --- |
| `gldf` | `../gldf` | `https://greatlakesdriedfruit.com` | `/api/reb-capabilities` | `/api/v1/revalidate` |
| `rohlax` | `../rohlax-wellness` | `https://rohlaxwellness.com` | `/api/reb-capabilities` | `/api/v1/revalidate` |

Scaffold Web release metadata records both storefronts in `release-manifest.json`. Run
`pnpm check:custom-repos` from the Scaffold Web repo to verify that both sibling repos
still expose the v1 contract files, env templates, capability manifests,
admin-preview handoff, and signed revalidation endpoints expected by Scaffold Web.

## Tenant Metadata Requirements

Each custom-repo tenant in Scaffold Web should have:

- `deliveryModel: "custom_repo"`
- `customRepo.repoName`
- `customRepo.localPath`
- `customRepo.productionUrl`
- `customRepo.capabilityManifestUrl`
- `customRepo.supportsPageConfig: true`
- `customRepo.supportsDraftPreview: true`
- `customRepo.supportsInlineEditing: true`
- `revalidateUrl` pointing at the storefront `/api/v1/revalidate`
- `revalidationSecret` matching the storefront `REVALIDATION_SECRET` or legacy
  `REVALIDATE_SECRET`

GLDF also requires `REB_CUSTOM_REQUEST_SECRET`, `REWARDS_PROXY_SECRET`,
`RECONCILE_SECRET`, Stripe, Supabase, and Blob env because it owns ecommerce,
rewards, uploads, and admin proxy endpoints. Rohlax currently requires only the
content, dashboard, site URL, and revalidation env for Scaffold Web connectivity.

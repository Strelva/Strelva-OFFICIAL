# Custom Repo Delivery Model

Custom repos are the default paid-client delivery path. REB is the shared
control plane for dashboard access, AI requests, content, review, reports,
tenant settings, billing, and operational history.

## Customer Promise

Clients own a custom site experience. Scaffold manages the implementation,
deployment, quality, and major changes. Clients request work through REB; they
do not get direct repo or code-editor access by default.

## Responsibilities

- REB stores editable business content and site operations.
- REB queues AI review items and custom repo requests.
- Custom repos render the public site and own bespoke frontend behavior.
- Custom repos publish a capability manifest so REB only offers supported sections,
  variants, tokens, draft preview behavior, and admin-only custom components.
- Scaffold triages custom repo requests within one business day.

## Required Custom Repo Contract

- Consume `GET /api/v1/content/{tenant}/{section}`.
- Consume `GET /api/v1/page-config/{tenant}` where the site supports page-level sections.
- Consume `GET /api/v1/site-capabilities/{tenant}` or keep an equivalent local
  manifest in sync with REB tenant metadata.
- Expose a signed `POST /api/revalidate` endpoint.
- Keep local defaults for REB outages.
- Document supported sections, variants, design tokens, custom features, env vars,
  build/test commands, deploy target, and rollback path.

## Current Precedents

- GLDF: ecommerce, cart, rewards, Stripe, Supabase, custom section renderer,
  REB content/page-config sync, signed revalidation.
- Rohlax Wellness: bespoke wellness pages, booking UX, motion system,
  REB content fetch, signed revalidation.

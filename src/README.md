# Source ownership

Strelva is organized around **Products -> Work -> specific thing**. A person
chooses a concrete product or capability, creates or resumes bounded Work, and
keeps the business, site, customer, or record that Work concerns explicit. The
common workspace is result-first; conversation is an optional interaction, not
the product container.

The current migration adds an opt-in private workspace for account-owned AI
Visibility Work while preserving the existing managed-presence product. Public
AI Visibility remains a usable first-use path without a workspace. User, Paid
User, Client, and Enterprise labels describe independent relationship or service
facts; they are not entitlements or authorization.

## Product-to-work composition

- **Products** own repeatable value systems, supported operations, release state,
  and product-specific contracts. The catalog is descriptive and never replaces
  server-side authorization.
- **Work** owns a saved or active result in an explicit personal or organization
  context. Private Work is returned only through an authorized workspace and is
  never reconstructed from a browser-supplied product payload.
- The **specific thing** is the named subject of Work, such as a business, site,
  or customer-owned assessment. Context switching is explicit and stale
  responses must not replace the currently selected context.

Managed websites remain tenant entities and existing `/dashboard/*` routes. A
server-authorized managed link may point from workspace discovery to a tenant
dashboard, but it is not a cloned workspace record and does not grant dashboard
access. Preserve managed tenant, provider, approval, billing, and custom-site
contracts beneath the common composition.

## Boundaries

| Location | Owns | Must not own |
| --- | --- | --- |
| `app/` | Routing, request validation, session resolution, page composition | Duplicated product logic |
| `experience/` | Workspace/product presentation and shared interaction mechanics | Tenant permissions or product-specific delivery rules |
| `products/<product>/` | Product operations, types, storage adapters, focused UI | Route imports or assumptions that every user has a website |
| `platform/` | Shared relationship and infrastructure concepts | Product or presentation dependencies |
| `lib/` | Existing implementations awaiting deliberate extraction | A second copy of an extracted implementation |

New product consumers import `index`, `contracts`, `server`, or `client` entry
points. Keep browser-safe types and components separate from server operations.
Inside a product, local imports are allowed. Tests may inspect internals when
verifying product behavior. `pnpm check:boundaries` checks static imports,
re-exports, import types, and literal dynamic imports/require calls in source and
scripts, including new files not yet staged. Computed dynamic imports are not
resolved by this check. It is an architectural check, not an authorization layer.

## Status is not permission

User / Paid User describes the standard commercial relationship; Client / Enterprise describes an
agreed service relationship. Derive display status from those independent facts
within the selected account context. Existing managed clients remain Clients,
including clients with special billing arrangements. Enterprise requires an
explicit relationship; a large bill or a plan called Scale does not imply it.

Agency attribution and royalty agreements neither grant account membership nor
authorize product actions. Client status does not authorize arbitrary writes.
Each operation retains its server-side permission and entitlement checks.

## Migration discipline

The current migration map, acceptance evidence, confidence grades, and open
release gates are in
[`product-work-migration-2026-09-06.md`](../docs/product-work-migration-2026-09-06.md).
The release-one implementation/readiness record remains in
[`release-one-readiness-2026-09-05.md`](../docs/release-one-readiness-2026-09-05.md),
and the canonical nouns and data ownership are in
[`product-ontology.md`](../docs/product-ontology.md). These documents separate
implemented source, focused local evidence, deployed behavior, and demand proof.

Move one working capability and update its callers and tests together. Delete an
old implementation only when its owned behavior has moved and callers have been
accounted for. Record compatibility adapters with their remaining consumers.
Next.js routes, provider callbacks, scheduled jobs, and deployed `/api/v1`
contracts are entry points even when no source file imports them.

The nested `strelva-marketing/` and `client-prototypes/` applications have their
own configurations. They are excluded from this package's TypeScript root inputs
and ESLint traversal, not removed from the workspace. Direct imports still enter
the TypeScript dependency graph and must be reviewed.

The detailed transition and agency experiment are in
[`../docs/strategy/2026-09-05-product-structure-and-agency-experiment.md`](../docs/strategy/2026-09-05-product-structure-and-agency-experiment.md).

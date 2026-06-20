# Strelva CMS scope (v1: Collections)

**Status:** scoping. Decisions locked with Noah 2026-06-20. Builds on the Postgres content backbone (the migration that just shipped). Pairs with [post-cutover-runbook.md](./post-cutover-runbook.md) and [supabase-migration-plan.md](./supabase-migration-plan.md).

## What it is

A **Collections** layer: typed, repeating content entries (blog posts, videos, products) a tenant owns, stored in Postgres, served to the client repo over the `/api/v1/*` contract, authored by the AI agent + Jacob + a basic client editor.

This is distinct from the existing **content sections** system (`content` table: hero, services, contact). Sections are singletons per tenant ("the hero"). Collections are many-of-a-kind ("the 14 blog posts", "the 30 products"). That one structural difference (one-vs-many) is the whole reason it is a new subsystem rather than another section.

One-liner: "Repeating content the AI manages and the client can tweak, rendered by a theme on their site."

## Locked decisions (2026-06-20)

1. **Collections only.** No Framer-like block/visual page editor in v1. That is a separate, larger system and stays out of scope (still on the "Do NOT Build" list for now).
2. **Authoring = AI agent tools + a basic client-facing editor.** The agent is the primary author (consistent with "tell the AI what to change"); the basic editor is a minimal client surface for direct edits (this revises the old "client-facing editor: never" line, deliberately, kept minimal).
3. **Ecom = catalog as content.** Products/prices/images are a collection. Checkout stays in the client repo (Stripe, like RHM). The platform owns content, not payments. No cart/orders/checkout in the control plane.

## The three starter content types ("themes")

Each content type = a field schema + one or more rendering themes that live in the client repo.

| Type | Fields (schema) | Rendering theme (client repo) | Status today |
|---|---|---|---|
| **blog / text** | title, slug, excerpt, body, author, tags[], status, publishedAt | post list + post page | `BlogPost` type + `blog.ts` store already exist (Sanity-backed) + agent blog tools. Generalize, move to Postgres. |
| **video** | title, slug, description, videoUrl/embed, thumbnail, tags[], status, publishedAt | video grid + player page | new |
| **products (catalog)** | name, slug, description, price, images[], options, inStock, status | product grid + product page (checkout button -> client-repo Stripe) | `products`/`shop` are already `TenantFeature`s; no catalog collection yet |

`blog` is the wedge: it is the closest existing primitive, so it proves the whole pattern (schema + entries + API + agent tool + theme) before video/products follow.

## Architecture (reuse, do not reinvent)

- **Data:** one `collection_entries` table in Postgres (tenant_id, type, slug, status, data jsonb, timestamps), plus a lightweight `collection_types` registry (or a code-side registry keyed by type) defining the field schema per type. JSONB `data` keeps the schema flexible per type; typed Zod validators per type guard writes (mirror `src/lib/schemas.ts`). RLS via the standard tenant-scoped policy in `supabase/migrations/20260619140000_rls.sql`.
- **API contract:** extend the v1 contract the client repos already consume:
  - `GET /api/v1/collections/[tenant]/[type]` (list, filter by status, paginate)
  - `GET /api/v1/collections/[tenant]/[type]/[slug]` (single entry)
  - Mirrors the existing `/api/v1/content/[tenant]/[section]` shape. Versioned, additive.
- **Authoring:**
  - Agent tools (extend `src/lib/agent-executor.ts`, which already has blog tools): `create_entry`, `update_entry`, `list_entries`, `publish_entry` generalized over type. Governance via `src/lib/ai-governance.ts` (auto-approve factual, review new copy).
  - Basic client editor: a dashboard surface to list/create/edit entries of an enabled type. Form-driven off the type schema. No rich page-building, just structured fields. Drafts via the existing draft pattern.
- **Capability gating:** a tenant opts into a type via the existing `TenantFeature` flags (`blog`, `products`, plus a new `video`). `site-capabilities` already advertises features to the client repo; collections plug into it.
- **Rendering:** themes are components in `custom-repo-starter/` (the starter-first rule in `docs/operations.md`), pulling entries from the v1 collection endpoints. Promote a theme to the platform only once two repos need it.

## What v1 explicitly does NOT build

- Visual/block/drag-drop page editor (separate system, separate decision).
- Cart, checkout, orders, payments in the control plane (catalog only; checkout stays per-repo).
- A rich-text/page builder beyond structured fields + a body field.
- Multi-user concurrent live co-editing (future; the Postgres + RLS backbone does not preclude it).

## Sequence

1. **Foundation:** `collection_entries` table + RLS + Zod schemas + the type registry. Generalize `blog.ts` onto it (Postgres, behind the same `CONTENT_SOURCE` style flag), keep Sanity fallback during soak. Ship the v1 collection endpoints.
2. **Blog end-to-end:** agent tools generalized, basic client editor for blog, one rendering theme in the starter. This is the full vertical slice that proves the pattern.
3. **Video:** add the type schema + theme. Mostly config once the slice exists.
4. **Products (catalog):** add the type schema + grid/page theme; checkout button wires to the client repo's existing Stripe (RHM is the reference).

Each step is additive and flag-gated, same discipline as the migration.

## Open questions

- Type schema home: a DB `collection_types` table vs a code-side registry. Lean code-side registry first (simpler, versioned in git, no admin UI needed); move to DB only if non-engineers need to define types.
- Slug uniqueness + routing: unique per (tenant, type). Confirm the client-repo routing convention for collection pages.
- How much the "basic client editor" exposes vs leaves to the agent. Start minimal: list, create, edit fields, publish/unpublish. No reordering/layout.

## Relationship to reviews

Reviews are NOT a collection. They are synced from Google/Yelp via the existing poll crons (`poll-google-reviews`, `poll-yelp`) + the reviews API, cached in Postgres, surfaced read-mostly (with reply). Keep them on the sync path, separate from the authored CMS.

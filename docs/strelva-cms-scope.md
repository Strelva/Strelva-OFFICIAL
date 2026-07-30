# Strelva CMS scope (v1: Collections)

**Status:** SHIPPED. Foundation complete as of 2026-07 — `collection_entries` table live in Postgres, all three starter types implemented, v1 API routes live, agent tools wired, client editor built. Pairs with [post-cutover-runbook.md](./post-cutover-runbook.md) and [supabase-migration-plan.md](./supabase-migration-plan.md).

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
| **blog** | title, excerpt, body, author, tags[], status | post list + post page | SHIPPED. Postgres-backed via `collection_entries` (type=`blog`). Public read in `src/lib/cms/blog-public.ts`. Replaces the old Sanity `blog.ts` path entirely. |
| **video** | title, description, videoUrl, thumbnail, tags[], status | video grid + player page | SHIPPED. Schema in `src/lib/cms/collection-types.ts`. |
| **product (catalog)** | name, description, priceCents, currency, images[], inStock, checkoutUrl, status | product grid + product page (checkout button -> client-repo Stripe) | SHIPPED. Schema in `src/lib/cms/collection-types.ts`. `priceCents` is an integer (cents). |

All three types shipped in the same foundation step. The blog proved the pattern; video and products followed in the same pass.

## Architecture (reuse, do not reinvent)

- **Data:** `collection_entries` table in Postgres (tenant_id, type, slug, status, data jsonb, timestamps). Migration: `supabase/migrations/20260620120000_cms_collections_reviews_suggestions.sql`. Type registry is code-side in `src/lib/cms/collection-types.ts` (no DB table needed). Zod schema per type guards all writes. RLS applied via that same migration (standard tenant-scoped policy: member or super-admin; else nothing).
- **API contract** (LIVE):
  - `GET /api/v1/collections/[tenant]/[type]` — list published entries (source: `src/app/api/v1/collections/[tenant]/[type]/route.ts`)
  - `GET /api/v1/collections/[tenant]/[type]/[slug]` — single entry by slug (source: `src/app/api/v1/collections/[tenant]/[type]/[slug]/route.ts`)
  - Both support `?preview=true` with a signed `revalidationSecret` token for draft previews.
  - Both routes send `Cache-Control: private, max-age=0, must-revalidate` via the shared `TENANT_PRIVATE_CACHE` constant. Fixed 2026-07-30.
  - The slug URL parameter in the single-entry route is validated against `/^[a-z0-9-]+$/` before the DB call. Fixed 2026-07-30.
- **Authoring** (LIVE):
  - Agent tools in `src/app/api/agent/route.ts`: `list_entries` (list by type + optional status) and `save_entry` (create or update; always drafts, never auto-publishes). Agent-created entries are `status:"draft"` — the owner publishes from the client editor.
  - Client editor: `src/components/dashboard/CollectionsManager.tsx` at `/dashboard/collections`. Form-driven off the type schema. Drafts/publish controlled from the editor.
- **Capability gating:** `TenantFeature` flags `blog`, `products`, `video` in tenant config. `site-capabilities` advertises them to the client repo.
- **Rendering:** client repos pull entries from the v1 collection endpoints. Public blog read helper: `src/lib/cms/blog-public.ts` (`getBlogPostsForSite` / `getBlogPostForSite`). Themes live in `custom-repo-starter/` per the starter-first rule.

## What v1 explicitly does NOT build

- Visual/block/drag-drop page editor (separate system, separate decision).
- Cart, checkout, orders, payments in the control plane (catalog only; checkout stays per-repo).
- A rich-text/page builder beyond structured fields + a body field.
- Multi-user concurrent live co-editing (future; the Postgres + RLS backbone does not preclude it).

## What shipped (as of 2026-07)

All four planned sequence steps are done in one foundation pass:

1. **Foundation DONE:** `collection_entries` + RLS + code-side type registry + Zod validators per type.
2. **Blog end-to-end DONE:** `blog` type, `src/lib/cms/blog-public.ts` read helper, agent `list_entries`/`save_entry` tools, `CollectionsManager` client editor, v1 list + single-entry routes.
3. **Video DONE:** `video` schema shipped alongside blog in `collection-types.ts`.
4. **Products DONE:** `product` schema with `priceCents` (int cents), `images[]`, `checkoutUrl`; same endpoint contract.

Sanity fallback was not kept during soak — Sanity teardown is done (2026-07-10) and there is no Sanity read/write path in the CMS. `src/lib/cms/blog-public.ts` confirms: "Replaces the old `src/lib/blog.ts` Sanity path so there is one blog store end to end."

## Resolved questions

- **Type schema home:** code-side registry (`src/lib/cms/collection-types.ts`). Shipped. No DB `collection_types` table.
- **Slug uniqueness + routing:** unique per `(tenant_id, type)` enforced by the DB index `collection_entries_lookup_idx`. Client-repo convention: pull entries from `/api/v1/collections/[tenant]/[type]` and route by slug.
- **Client editor scope:** `CollectionsManager` ships list / create / edit fields / publish / unpublish. No drag-and-drop reordering.

## Known issues / TODO

All previously-tracked issues for this subsystem closed as of 2026-07-30:

- `Cache-Control: private` now set on both v1 collections routes. (DONE 2026-07-30)
- Slug parameter in single-entry route validated against `/^[a-z0-9-]+$/`. (DONE 2026-07-30)
- `database.types.ts` regenerated from live schema — `collection_entries` columns are accurate. (DONE 2026-07-30)

## Relationship to reviews

Reviews are NOT a collection. They are synced from Google/Yelp via the existing poll crons (`poll-google-reviews`, `poll-yelp`) + the reviews API, cached in Postgres, surfaced read-mostly (with reply). Keep them on the sync path, separate from the authored CMS.

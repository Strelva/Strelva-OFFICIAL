# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Naming**: Product is "Scaffold Web". Repo folder path is legacy lowercase `reb` (internal). Package name is `scaffold-web`.

## Commands

```bash
pnpm dev                          # Local dev server (localhost:3000)
pnpm build                        # Production build
pnpm lint                         # ESLint
pnpm test                         # Run all Vitest tests
pnpm test src/__tests__/core.test.ts  # Single test file
pnpm typecheck                    # tsc --noEmit
pnpm provision-tenant             # Create new tenant
pnpm check:prod                   # Production readiness checklist
pnpm check:custom-repos           # Verify sibling custom-repo workspaces
```

For subdomain testing: `gldf.localhost:3000` routes to tenant `gldf`. Custom domain routing is exercised via `CUSTOM_DOMAIN_MAP` in `.env`.

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind 4 + TypeScript
- Routing/middleware lives in **`src/proxy.ts`** (Next 16 renamed `middleware.ts` to `proxy.ts`)
- Clerk for auth (multi-host: tenant subdomains, custom client domains, admin-host fallback path)
- Sanity CMS is the **source of truth for tenant and content data in production**; the dev-file path (`dev-tenants.json`, `dev-content-{tenant}.json`) is the local-dev fallback
- **Upstash Redis sits in front of Sanity as a write-through cache** for `getContent` / `getPageConfig` and the tenant-config list. Operational data (events, bookings, chat, rate limits, rewards, jobs) lives directly in Redis.
- Vercel Blob for image uploads
- Vercel AI SDK v6 + Google Gemini for the agent
- Stripe for billing (currently optional — see "Pricing" below)
- Resend for email (weekly reports, invites)

## Multi-tenant architecture

Scaffold Web is the **control plane**. Each paid client site is a separate **custom repo** that pulls content/config from the control plane over a versioned API.

- Host → tenant resolution in `src/proxy.ts`: subdomain (`gldf.scaffoldweb.com`, `admin.gldf.scaffoldweb.com`), then `/client/{tenant}/...` path fallback, then custom-domain map (Redis/Sanity-backed via `/api/internal/domain-map`), then `?tenant=` query.
- The public storefront contract is **`/api/v1/*`** — owned directly (no `@/app/api/public/*` re-export layer). The v1 routes are the canonical wire shape consumed by client repos. Change them only by versioning (add a v2 sibling).
- Custom-repo wiring: `src/lib/custom-repos.ts`, `src/lib/revalidate-client.ts` (signed HMAC revalidation), `custom-repo-starter/` (drop-in scaffold), `scripts/custom-repo-workspace-check.ts`, `release-manifest.json`.
- `DEFAULT_DELIVERY_MODEL` is `"custom_repo"`. Every paid client is a separate hand-built repo. The `platform_template` value still exists in the type for legacy tenant records but should not be used for new tenants. Self-serve auto-provisioning is gated off (`SELF_SERVE_ENABLED=false` default) — leads come through `/access-request`, Jacob builds the repo.

## Content system

- Typed schemas in `src/lib/types.ts` (`HeroContent`, `ServicesContent`, …) and Zod validators in `src/lib/schemas.ts`.
- Authenticated CRUD via `/api/content/[section]` (PUT validates with Zod, writes versions + activity).
- Public reads via `/api/v1/content/[tenant]/[section]` — goes Redis cache first, falls through to Sanity (prod) or dev file (local). Writes are write-through: `setContent` updates the source of truth, then populates Redis.
- Templates in `src/components/templates/` define which sections each tenant type uses.

## AI agent

- `src/lib/agent-executor.ts` uses Vercel AI SDK + `gemini-2.5-flash`.
- Tools: `read_section`, `update_section`, `get_suggestions`, `create_suggestion`, `create_blog_post`, `list_blog_posts`.
- Governance: `src/lib/ai-governance.ts` decides publish vs review-queue vs block.
- The system prompt is cached per tenant keyed on section timestamps (`buildSystemPrompt` in `agent-executor.ts`) — prevents thundering-herd Redis reads on concurrent chat turns.
- Changes trigger Slack notifications and signed revalidation to the client site.

## Operational systems

- Event queue: `src/lib/events.ts` — `UnifiedEvent` in Redis sorted sets; powers the dashboard review queue, weekly brief, activity log.
- Crons in `src/app/api/cron/` (see `vercel.json`): maintenance, weekly-report, staleness, search-console, daily-summary, poll-yelp, poll-google-reviews, poll-instagram.
- Integrations registry: `src/lib/integration-registry.ts` (UI metadata) + `src/lib/connections.ts` (live API access).
- Weekly brief: `src/lib/weekly-brief.ts` + `src/lib/reports.ts`.

## Key lib files

- `src/lib/tenants.ts` — tenant config lookup (Sanity prod, dev-file local, Redis 60s cache)
- `src/lib/storage/content-cache.ts` — Redis read-through/write-through cache for the public content path
- `src/lib/storage/content-store.ts` — Sanity/dev-file source-of-truth implementation
- `src/lib/auth.ts` — Clerk + per-tenant roles + super-admin email allowlist
- `src/lib/site-capabilities.ts` — capability manifest builder (merged with optional remote manifest from the custom repo)
- `src/lib/reb-contracts.ts` — versioned route helpers + HMAC revalidation signing/verification

---

# Scaffold Web — AI Website Management Platform

## What This Is
A control plane for local-business websites. Owners see a dashboard with what's happening on their site (visitors, clicks, reviews) and chat with an AI that handles updates. The public website lives in a separate **custom repo** (a per-client Vercel project) that pulls content from Scaffold Web's `/api/v1/*` contract.

## One-Liner
"See what's working. Tell the AI what to change."

## The Model
- **Client sites are free for now.** They're the acquisition wedge — Jacob builds the site, the client gets a working public website at no cost.
- **The admin/dashboard side is what gets monetized.** Price is undecided. `STRIPE_SCAFFOLD_PRICE_ID` is intentionally unpinned; `check:prod` validates only the shape (recurring monthly USD) when set.
- **Subscription gating short-circuits while billing is off.** `isBillingEnabled()` in `src/lib/subscription.ts` returns false when no Stripe price is configured, and the gate treats every tenant as active.
- Agency channel (wholesale resell) is a future option, not built.

## Value Hypothesis
Local-business owners will pay for a dashboard that proves their website is working + an AI that handles updates — IF the dashboard shows clear value, the AI actually makes changes when asked, and the weekly report lands before the bill recurs.

## ICP
- Local businesses with 1–10 people who have a website problem they've stopped trying to solve.
- Has a bad website, uses LinkTree + booking platform, or just left an agency.
- Wants more clients, not a dashboard (but the dashboard proves value).
- Talks to the AI like texting a person: "add my new yoga class on Saturdays."
- Templates cover: wellness, food-brand, restaurant, trades, professional, fashion-stylist.

## What The Client Sees
1. **Custom website** built by Jacob, hosted in a separate per-client repo, served on the client's own domain.
2. **Business OS Dashboard** at `admin.{client-domain}` (dark monochrome).
   - Overview: "People who found you" / "Booking clicks" / "Site health"
   - AI Chat: "Update my hours" / "Write a blog post" / "How's my site doing?"
   - My Site: live preview iframe
   - Content: visual map of what's on the site
   - Reports: weekly plain-English performance summary
3. **AI Agent** that manages the site ongoing (updates, blog, social drafts).
4. **Weekly report** by email.

## What You See (Jacob)
- Slack notifications for every AI change
- Admin dashboard: all clients, draft queue, launch readiness, DNS health
- Override capability on any AI change
- Escalation system: auto-approve factual changes, review new copy, block structural/code changes (see `src/lib/ai-governance.ts`)

## Customer Language (USE THIS)
- "See what's working" NOT "analytics dashboard"
- "Tell the AI what to change" NOT "conversational CMS"
- "47 people found you this week" NOT "unique visitors: 47"
- "Your weekly report" NOT "automated insights"

## Do NOT Build
- Drag-and-drop visual editor (AI handles content; Jacob handles quality).
- Client-facing code editor (never).
- E-commerce / checkout (booking platforms handle this).
- Tiered pricing UI.
- A `/api/public/*` re-export shell of the v1 contract (v1 owns the contract directly now).

## Execution Rules
- NEVER add "Co-Authored-By" lines to commits.
- The user and project owner is Jacob Rhinehart. Address the user as Jacob when a name is needed.
- Promote a feature from "custom repo" to the platform only when at least two repos prove the same need (per `docs/future-codebase-integration.md`).

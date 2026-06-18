# AGENTS.md

Canonical repo guidance for all coding agents (Claude Code, Codex). `CLAUDE.md` imports this file so there is one source of truth.

**Naming**: Product is "Strelva". Repo folder path is legacy lowercase `reb` (internal). Package name is `scaffold-web`.

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
npx tsx scripts/ai-visibility.ts "<Business>" --site=x.com --category="HVAC" --city="Buffalo, NY" [--html]
                                  # AI-visibility scorecard (door-opener artifact; --html writes a sendable one-pager)
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
- Stripe for billing (currently off — see "The Model" below for the two-door offer and the billing-on cliff)
- Resend for email (weekly reports, invites)

> **Migration in progress (2026-06-18):** a move of the data + auth backbone to **Supabase Postgres** has begun — see `docs/supabase-migration-plan.md`. The schema is applied (`supabase/migrations/*`) but **the live app still runs on Clerk + Sanity + Redis as described above** (nothing is wired to Supabase yet). Don't assume Postgres in code until a subsystem is explicitly migrated. RLS + the auth decision (Supabase Auth vs keep Clerk) are still open.

## Multi-tenant architecture

Strelva is the **control plane**. Each paid client site is a separate **custom repo** that pulls content/config from the control plane over a versioned API.

**Naming note:** the project rename from "reb" → "scaffoldweb" is ongoing. New code uses `SCAFFOLD_*` env vars, `SCAFFOLD_CONTRACT_VERSION`, `scaffoldRoutes`, etc. Legacy `REB_*` names are kept as deprecated aliases so deployed custom repos (Rohlax, GLDF) keep working. HMAC headers (`x-reb-timestamp`/`x-reb-signature`) and Redis key prefixes (`reb:`) are intentionally **not** renamed — those are wire-level or persistent-data details that require coordinated rollout to change. The full `scaffoldweb.com` → `strelva.com` rebrand + split into two repos (`strelva-marketing` + `strelva-app`) is planned, not yet executed — see `docs/strelva-migration-plan.md`. **Production strelva.com marketing is already served from the separate `~/strelva-marketing` repo** — marketing-site copy/pricing changes go there, not here (this repo's `(marketing)` pages serve legacy/scaffoldweb hosts per `MARKETING_DOMAINS`).

- Host → tenant resolution in `src/proxy.ts`: subdomain (`gldf.strelva.com`, `admin.gldf.strelva.com`), then `/client/{tenant}/...` path fallback, then custom-domain map (Redis/Sanity-backed via `/api/internal/domain-map`), then `?tenant=` query.
- The public storefront contract is **`/api/v1/*`** — owned directly (no `@/app/api/public/*` re-export layer). The v1 routes are the canonical wire shape consumed by client repos. Change them only by versioning (add a v2 sibling).
- Custom-repo wiring: `src/lib/custom-repos.ts`, `src/lib/revalidate-client.ts` (signed HMAC revalidation), `custom-repo-starter/` (drop-in scaffold), `scripts/custom-repo-workspace-check.ts`, `release-manifest.json`.
- `DEFAULT_DELIVERY_MODEL` is `"custom_repo"`. Every paid client is a separate hand-built repo. The `platform_template` value still exists in the type for legacy tenant records but should not be used for new tenants. The self-serve backend was **deleted** (2026-06-10; `/onboard` redirects to `/access-request` preserving `?ref=`) — the only lead path is `/access-request`, Jacob builds the repo.
- **Client-site traffic tracking**: custom repos send page-view/booking-click beacons to `POST /api/v1/track/[tenant]` (additive v1 route; rate-limited, fail-silent tracker in `custom-repo-starter/ScaffoldTracker.tsx`, needs `NEXT_PUBLIC_SCAFFOLD_API_URL` + `NEXT_PUBLIC_TENANT_ID`). This feeds the weekly report's numbers — rollout steps for live repos in `docs/tracking-rollout.md`.

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

## Operating conventions

Repo map, the starter-first rule, client lifecycle, access policy, and the quarterly entropy pass live in **[docs/operations.md](./docs/operations.md)**. Two rules agents enforce in any change: (1) reusable client-site code goes to `custom-repo-starter` first, never patched into one client's repo; (2) every tenant-data read/write is scoped by a tenant id derived from auth or trusted config, never from request input.

## Operational systems

- Event queue: `src/lib/events.ts` — `UnifiedEvent` in Redis sorted sets; powers the dashboard review queue, weekly brief, activity log.
- Crons in `src/app/api/cron/` (see `vercel.json`): maintenance, weekly-report, staleness, search-console, daily-summary, poll-yelp, poll-google-reviews, poll-instagram.
- Integrations registry: `src/lib/integration-registry.ts` (UI metadata) + `src/lib/connections.ts` (live API access).
- Weekly brief: `src/lib/weekly-brief.ts` + `src/lib/reports.ts` (per-tenant error isolation; deterministic claims-safe fallback when Gemini fails; Resend errors are counted, not swallowed).
- Pay links: `src/lib/pay-links.ts` + `/pay/[slug]` + super-admin `POST/GET /api/admin/pay-links` — per-client payment-before-work links (Redis `reb:paylink:*`). Submitted amounts are **whole dollars** (number or string) on the public API. `/pay/rohlax` is a grandfathered one-off (her deal is one-time, "no monthly fees ever" — never use it as the template).
- Build payments: the Stripe webhook records every completed `mode:"payment"` session as a durable no-TTL `reb:build-payment:{sessionId}` record + Slack ping (tenant events alone prune at 90 days).
- One-active-request gate: `getOpenChangeRequest` in `src/lib/events.ts` — one open custom change request per tenant, enforced on both the dashboard route (409) and the agent's `request_custom_change` tool; offboarding handoff requests are excluded by `metadata.kind`.

## Key lib files

- `src/lib/tenants.ts` — tenant config lookup (Sanity prod, dev-file local, Redis 60s cache)
- `src/lib/storage/content-cache.ts` — Redis read-through/write-through cache for the public content path
- `src/lib/storage/content-store.ts` — Sanity/dev-file source-of-truth implementation
- `src/lib/auth.ts` — Clerk + per-tenant roles + super-admin email allowlist
- `src/lib/site-capabilities.ts` — capability manifest builder (merged with optional remote manifest from the custom repo)
- `src/lib/scaffold-contracts.ts` — versioned route helpers + HMAC revalidation signing/verification (legacy `REB_*` symbol aliases are still exported for back-compat)

---

# Strelva — AI Website Management Platform

## Brand structure (founder decision, 2026-06-01)
Strelva is **one brand with two divisions**, not a single product:
- **Websites** — the managed-website product described in this doc (paid custom build + AI-managed updates + weekly report). Well-defined; **this repo is its control plane.**
- **Custom Software** — workflow software / custom apps / automations built for businesses (the higher-ACV arm). Its definition, ICP, naming, offering, and proof model are **not finalized** (founder: "workflows, and we're gonna need to do research") — do **not** ship hard claims for this division.

Everything below describes the **Websites** division.

## What This Is
A control plane for local-business websites. Owners see a dashboard with what's happening on their site (visitors, clicks, reviews) and chat with an AI that handles updates. The public website lives in a separate **custom repo** (a per-client Vercel project) that pulls content from Strelva's `/api/v1/*` contract.

## One-Liner
"See what's working. Tell the AI what to change."

## The Model (founder decision, 2026-06-09 — cash-first)
- **Free sites are killed. Paid builds only**, sold as a two-door offer — full spec, scope walls, verified competitive claims, and objection table in `docs/strategy/website-offer-two-door.md` (final prices pending founder confirmation):
  - **Door 1 "Built for you"**: $1,500–2,500 one-time, includes first 3 months of management, then $99/mo. Lead with this.
  - **Door 2 "Managed"** (rescue close only): $499 start + $199/mo, 12-month minimum, client owns repo+files after month 12. Client agreement draft: `docs/strategy/client-agreement-draft.md` (lawyer pass before first Door 2 signature).
- **Ownership is the positioning spine**: domain in the client's name from day one, content export anytime, "you leave with everything" (see `docs/repo-transfer-runbook.md`, `docs/domain-setup.md`).
- **Billing is still OFF.** `isBillingEnabled()` in `src/lib/subscription.ts` returns false while `STRIPE_SCAFFOLD_PRICE_ID` is unset and treats every tenant as active. **Flipping it on is a cliff**: set `STRIPE_BILLING_GRANDFATHER_TENANTS` (e.g. `gldf,rohlax`) in the SAME deploy or existing tenants get 402'd — `check:prod` enforces this.
- **Rohlax is grandfathered**: one-time payment, ongoing management free, never pitch her recurring. The recurring-price test goes to the next client.
- Agency channel (wholesale resell) was researched and parked (2026-06-09); not built.

## Value Hypothesis
Local-business owners will pay for a dashboard that proves their website is working + an AI that handles updates — IF the dashboard shows clear value, the AI actually makes changes when asked, and the weekly report lands before the bill recurs.

## ICP
- Local businesses with 1–10 people who have a website problem they've stopped trying to solve.
- Has a bad website, uses LinkTree + booking platform, or just left an agency.
- Wants more clients, not a dashboard (but the dashboard proves value).
- Talks to the AI like texting a person: "add my new yoga class on Saturdays."
- Verticals served so far: wellness, food-brand, restaurant, trades, professional, fashion-stylist. (Sites are hand-built custom repos — don't anchor design work to `src/components/templates/`; that track is legacy.)
- Pitch order (ICP research, 2026-06-09): sell the **chat** ("tell it what to change") and the **weekly report** ("proof it's working") — the dashboard is supporting evidence, never the headline. For trades, open with money leaking ("customers are looking; you're not there"), never "your website." Never promise lead counts — we own the work and the proof, not a guaranteed result.

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
- Self-serve onboarding/provisioning (backend deleted 2026-06-10; don't resurrect without a founder decision).
- "Free site" offers or copy anywhere (the free thing is the scan/scorecard — zero marginal cost — never the build).

## Execution Rules
- NEVER add "Co-Authored-By" lines to commits.
- The user and project owner is Jacob Rhinehart. Address the user as Jacob when a name is needed.
- Promote a feature from "custom repo" to the platform only when at least two repos prove the same need (per `docs/future-codebase-integration.md`).

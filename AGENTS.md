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
npx tsx scripts/ai-visibility.ts "<Business>" --site=x.com --category="HVAC" --city="Buffalo, NY" [--html] [--out=<dir>]
                                  # AI-visibility scorecard (door-opener artifact; --html writes a sendable one-pager, --out=<dir> sets where)
```

For subdomain testing: `gldf.localhost:3000` routes to tenant `gldf`. Custom domain routing is exercised via `CUSTOM_DOMAIN_MAP` in `.env`.

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind 4 + TypeScript
- Routing/middleware lives in **`src/proxy.ts`** (Next 16 renamed `middleware.ts` to `proxy.ts`)
- **Supabase Auth** for auth (`auth.uid()`, Google OAuth + magic-link; see `src/lib/auth.ts`). The Clerk leaf code (webhook route + auth-UI branches + `ClerkProvider`) was **removed 2026-06-22 (#83)**; only `src/proxy.ts` + `src/lib/auth.ts` still import `@clerk`. Remaining teardown = collapse the `auth.ts` Clerk branches, unwrap `clerkMiddleware` in `proxy.ts` (last), and lock the Sanity dataset.
- **Supabase Postgres is the source of truth for tenant + content + operational data in production** (flipped 2026-06-20). Reads/writes go through `src/lib/db/repositories.ts` + the per-store dual-path, gated by `CONTENT_SOURCE`, `TENANTS_SOURCE`, `DATA_SOURCE` (= `postgres` in prod). No migrated store *reads* Sanity when the flags are on. **Content writes are Postgres-only — `setContent` does NOT dual-write Sanity** (only the operational stores still shadow-write), so a `CONTENT_SOURCE` flag-flip back to Sanity would serve content frozen at the 2026-06-20 cutover, losing every edit since. Content rollback is forward-only (restore from a Postgres backup), not a flag-flip; this is acceptable because Sanity is being decommissioned. **Tenant isolation is enforced at the APPLICATION layer** — every API route derives the tenant from trusted auth/headers and calls `requireTenantAccess`; the control plane talks to Postgres via a service-role client that BYPASSES row-level security. RLS policies exist (`supabase/migrations/*_rls.sql`) and are kept current as future defense-in-depth, but they are NOT the live enforcement boundary today. The dev-file path remains the local-dev fallback.
- **Upstash Redis** is still the write-through cache for `getContent`/`getPageConfig`/the tenant-config list, plus ephemeral state (rate limits, locks). Operational data also dual-writes to Postgres.
- Vercel Blob for image uploads
- Vercel AI SDK v6 + Google Gemini for the agent
- Stripe for billing (currently off — see "The Model" below for the two-door offer and the billing-on cliff)
- Resend for email (weekly reports, invites, lead/prospect/transactional). **All email renders through the shared design system `src/lib/email/layout.ts`** — `renderEmailHtml`/`renderEmailText`; callers pass content (heading, paragraphs, rows, button, footer), never markup. Light card, brand sage `#447a4f`, real hosted cairn logo (`EMAIL_LOGO_URL` → strelva.com/brand/logo-full-light.png). Do NOT hand-roll email HTML — extend the layout. **Global kill-switch: `emailSendingPaused()` (`src/lib/email-enabled.ts`) — NO customer/prospect email sends unless `EMAIL_SENDING_ENABLED=true`** (guards all send sites; currently paused in prod during the test-tenant phase). `RESEND_DOMAIN`=updates.strelva.com; operator lead notifications go to `LEAD_NOTIFY_EMAILS`. **Operator vs client email are two separate switches** — `operatorEmailsEnabled()` (same file) gates operator notifications (new-signup, lead intake, payment-failed) and **DEFAULTS ON**, silenced only by an explicit `OPERATOR_EMAILS_ENABLED="false"`, so operators keep getting alerted even while the client pause is on. Client lifecycle sends (`sendWelcomeEmail`/`sendSiteLiveEmail`/`sendReviewRequestEmail` in `delivery-email.ts`) stay behind the client `emailSendingPaused()` gate.

> **Migration FLIPPED + live (2026-06-20):** the data + auth backbone is on Supabase Postgres in prod — auth (Supabase), content (`CONTENT_SOURCE=postgres`), tenants (`TENANTS_SOURCE=postgres`), and the operational stores (`DATA_SOURCE=postgres`) all read/write Postgres, verified live. See `docs/supabase-migration-plan.md` + `docs/post-cutover-runbook.md`. **Remaining:** `core.ts` still touches Sanity (the content-store fallback); the full Sanity + Clerk *teardown* (remove reads, lock the Sanity dataset, unwrap `clerkMiddleware` in `proxy.ts`) is the deliberate destructive end-step, not yet done. (`blog.ts` is GONE as of 2026-06-22 — the blog read AND write now go through the Collections CMS / Postgres via `src/lib/cms/blog-public.ts` + the agent's collections-backed blog tools.) Rollback of the *operational + tenant* stores is a flag-flip + redeploy (those still shadow-write Sanity). **Content is the exception — Postgres-only, so its rollback is restore-from-backup, not a flag-flip** (see the content-store note above).

## Multi-tenant architecture

Strelva is the **control plane**. Each paid client site is a separate **custom repo** that pulls content/config from the control plane over a versioned API.

**Naming note:** the project rename from "reb" → "scaffoldweb" is ongoing. New code uses `SCAFFOLD_*` env vars, `SCAFFOLD_CONTRACT_VERSION`, `scaffoldRoutes`, etc. Legacy `REB_*` names are kept as deprecated aliases so deployed custom repos (Rohlax, GLDF) keep working. HMAC headers (`x-reb-timestamp`/`x-reb-signature`) and Redis key prefixes (`reb:`) are intentionally **not** renamed — those are wire-level or persistent-data details that require coordinated rollout to change. The full `scaffoldweb.com` → `strelva.com` rebrand + split into two repos (`strelva-marketing` + `strelva-app`) is planned, not yet executed — see `docs/strelva-migration-plan.md`. **Production strelva.com marketing is already served from the separate `~/strelva-marketing` repo** — marketing-site copy/pricing changes go there, not here (this repo's `(marketing)` pages serve legacy/scaffoldweb hosts per `MARKETING_DOMAINS`).

- Host → tenant resolution in `src/proxy.ts`: subdomain (`gldf.strelva.com`, `admin.gldf.strelva.com`), then `/client/{tenant}/...` path fallback, then custom-domain map (Redis/Sanity-backed via `/api/internal/domain-map`), then `?tenant=` query.
- The public storefront contract is **`/api/v1/*`** — owned directly (no `@/app/api/public/*` re-export layer). The v1 routes are the canonical wire shape consumed by client repos. Change them only by versioning (add a v2 sibling).
- Custom-repo wiring: `src/lib/custom-repos.ts`, `src/lib/revalidate-client.ts` (signed HMAC revalidation), `custom-repo-starter/` (drop-in scaffold), `scripts/custom-repo-workspace-check.ts`, `release-manifest.json`.
- `DEFAULT_DELIVERY_MODEL` is `"custom_repo"`. Every paid client is a separate hand-built repo. The `platform_template` value still exists in the type for legacy tenant records but should not be used for new tenants. The self-serve backend was **deleted** (2026-06-10; `/onboard` redirects to `/access-request` preserving `?ref=`) — the only lead path is `/access-request`, Jacob builds the repo.
- **Client-site traffic tracking**: custom repos send page-view/booking-click beacons to `POST /api/v1/track/[tenant]` (additive v1 route; rate-limited, fail-silent tracker in `custom-repo-starter/ScaffoldTracker.tsx`, needs `NEXT_PUBLIC_SCAFFOLD_API_URL` + `NEXT_PUBLIC_TENANT_ID`). This feeds the weekly report's numbers — rollout steps for live repos in `docs/tracking-rollout.md`.
- **Conversion capture (additive v1)**: the same beacon carries an `order` event (validated, idempotent on `externalId`) into `src/lib/orders.ts` — powers the Store pillar's revenue/orders/best-sellers. Native form submissions POST to `/api/v1/leads/[tenant]` (validated, deduped, rate-limited) into `src/lib/leads.ts` — surfaced as "Who reached out" on Today. Both stores set a dedup lock that is **released on a write failure** so a retried beacon is never silently swallowed. v1 stays additive-only; change by versioning.

## Content system

- Typed schemas in `src/lib/types.ts` (`HeroContent`, `ServicesContent`, …) and Zod validators in `src/lib/schemas.ts`.
- Authenticated CRUD via `/api/content/[section]` (PUT validates with Zod, writes versions + activity).
- Public reads via `/api/v1/content/[tenant]/[section]` — goes Redis cache first, falls through to Sanity (prod) or dev file (local). Writes are write-through: `setContent` updates the source of truth, then populates Redis.
- Templates in `src/components/templates/` define which sections each tenant type uses.

## AI agent

- `src/lib/agent-executor.ts` uses Vercel AI SDK + `gemini-2.5-flash`. The streaming
  chat endpoint is `src/app/api/agent/route.ts`; it emits `__TOOL__<label>` status,
  text deltas, `__RESULT__<json>`, and `__CARD__<json>` (rich inline tool cards) —
  ChatPanel + DesignPropertiesPanel both consume the same protocol.
- Content tools: `read_section`, `update_section`, `get_suggestions`, `create_suggestion`,
  `create_blog_post`, `list_blog_posts`, `draft_newsletter`. Inline-display tools return
  `{ __inlineTool, ... }` → streamed as `__CARD__` (e.g. `show_report`, `show_content`).
- Google Business tools (`create_gbp_post`, `update_business_hours`) NEVER write to Google
  directly — they queue a `status:"pending"` event (`metadata.kind` of `gbp_post_draft` /
  `gbp_hours_draft`); the real write happens on owner approval in `src/lib/event-actions.ts`,
  which leaves the event pending if the write fails. Review replies follow the same governed
  path (`review_reply_draft` → `publishReviewReply`). This is the safety invariant — do not
  add a tool that publishes to an external surface without queuing for approval first.
  - **Resolve on `success`, NOT on `verified`.** These external writes are NON-idempotent
    (a re-posted GBP update / review reply duplicates), so approval resolution gates on the
    write being *accepted* (`success`/`published`), not on the read-back confirmation
    (`verified`). When a write is accepted but the read-back can't confirm it, the write
    function emits a separate `change_verify_failed` event to surface the gap — keeping the
    approval pending instead would let a re-approval create a duplicate. Don't "fix" this to
    gate on `verified`.
- Governance: `src/lib/ai-governance.ts` decides publish vs review-queue vs block.
- The system prompt is cached per tenant keyed on section timestamps (`buildSystemPrompt` in `agent-executor.ts`) — prevents thundering-herd Redis reads on concurrent chat turns.
- Changes trigger Slack notifications and signed revalidation to the client site.

## Operating conventions

Repo map, the starter-first rule, client lifecycle, access policy, and the quarterly entropy pass live in **[docs/operations.md](./docs/operations.md)**. Two rules agents enforce in any change: (1) reusable client-site code goes to `custom-repo-starter` first, never patched into one client's repo; (2) every tenant-data read/write is scoped by a tenant id derived from auth or trusted config, never from request input.

## Operational systems

- Event queue: `src/lib/events.ts` — `UnifiedEvent` in Redis sorted sets; powers the dashboard review queue, weekly brief, activity log. `event:{id}` bodies carry a 90-day TTL; `addEvent` prunes the per-tenant index zset by score on every write so the index can't outgrow the record TTL (dangling members would otherwise dilute the recency window `getEvents`/`getOpenChangeRequest` scan).
- Crons in `src/app/api/cron/` (see `vercel.json`): maintenance, weekly-report, staleness, search-console, daily-summary, poll-yelp, poll-google-reviews, poll-instagram.
- Integrations registry: `src/lib/integration-registry.ts` (UI metadata) + `src/lib/connections.ts` (live API access).
- Weekly brief: `src/lib/weekly-brief.ts` + `src/lib/reports.ts` (per-tenant error isolation; deterministic claims-safe fallback when Gemini fails; Resend errors are counted, not swallowed). The win column pulls the positive `getClientReviewSummary` (new 5-star, praise themes) — admin-only review signal never enters the owner's report.
- Pay links: `src/lib/pay-links.ts` + `/pay/[slug]` + super-admin `POST/GET /api/admin/pay-links` — per-client payment-before-work links (Redis `reb:paylink:*`). Submitted amounts are **whole dollars** (number or string) on the public API. `/pay/rohlax` is a grandfathered one-off (her deal is one-time, "no monthly fees ever" — never use it as the template).
- Build payments: the Stripe webhook records every completed `mode:"payment"` session as a durable no-TTL `reb:build-payment:{sessionId}` record + Slack ping (tenant events alone prune at 90 days).
- One-active-request gate: `getOpenChangeRequest` in `src/lib/events.ts` — one open custom change request per tenant, enforced on both the dashboard route (409) and the agent's `request_custom_change` tool; offboarding handoff requests are excluded by `metadata.kind`.
- Operator command center: the whole operator surface lives under the `/admin` path and is served on the **bare admin host** `admin.strelva.com` (and `admin.localhost`) — `src/proxy.ts` (`isBareAdminHost`/`shouldRewriteBareAdminConsole`) rewrites the bare admin host root onto `/admin`, gated on super-admin (non-admins bounce to the app-host `/sign-in`). NOT to be confused with `admin.<tenant>.strelva.com`, which is a client's own admin dashboard. Surfaces: the **"Needs you" overview** (`src/app/admin/page.tsx` + `TodayFeed.tsx` — leads / approvals / at-risk / recent signups, led ahead of MRR), the **operator CRM** at `/admin/clients` (`ClientsCrm.tsx`), and **Search + Analytics** at `/admin/analytics`. Nav in `src/app/admin/NavLinks.tsx`. Full map: `docs/operator-command-center.md`.
- Operator CRM: `src/lib/tenant-crm.ts` — a lightweight per-tenant client record (pipeline `stage` = lead/building/live/at_risk/churned, `tags`, `notes`, `contacts`, `activity` timeline) as one JSON blob in Redis at `crm:{tenantId}` (same pattern as leads/pay-links; no DB migration — internal operator metadata for a handful of clients, read-modify-write, degrades to a default record without Redis). Super-admin CRUD via `GET/POST /api/admin/tenants/[id]/crm` (audit-logged); the `/admin/clients` page reads all records via `getAllTenantCrm`.
- At-risk / churn signal: `src/lib/churn.ts` — persists each tenant's daily owner agent-engagement count into a 7-day rolling Redis store (`reb:engagement:{tenantId}:{day}`, ~10-day TTL) written by the `daily-summary` cron via `recordDailyEngagement`, and composes it with inactivity (>21 days no owner activity) + subscription status into a single at-risk verdict (`getTenantAtRisk`/`getAtRiskTenants`) that the operator "Needs you" dashboard reads.
- Report cadence: `src/lib/report-cadence.ts` — decides WHEN the weekly-report cron emails a tenant (not what's in it). Per-tenant override in Redis (`reb:report-cadence:{tenant}`, default `monthly`; last-sent throttle at `reb:report-sent:{tenant}`); tiers aren't a code signal, so an operator flips a high-touch client to `weekly`. The `weekly-report` cron gates each send on `isReportDue`.
- Client lifecycle emails: `sendWelcomeEmail`/`sendSiteLiveEmail`/`sendReviewRequestEmail` in `src/lib/delivery-email.ts` (all behind the client `emailSendingPaused()` gate, fail-soft). NOTE: these send functions exist but are not yet wired to a live trigger surface (only tests call them today) — do not document an operator "send lifecycle email" route; none exists in `src/app`.
- Search Console + GA4 analytics: `src/lib/analytics.ts` — per-tenant analytics config (which GSC property + GA4 property to read) in Redis at `analytics:cfg:{tenantId}` (GSC default derived from the tenant's siteUrl); fail-soft reads that always return a status (`ok`/`unconfigured`/`unavailable`) and never throw. **Auth is OAuth-first, service-account-fallback** — each read tries the tenant's own Google connection when they granted the matching scope (`getGoogleScopeGrants`/`getGoogleAccessToken` in `src/lib/google-token.ts`), else falls back to the shared Strelva reporting service account (JWT signer reused from `search-console.ts`). Admin view at `src/app/admin/analytics/`; config write via `POST /api/admin/tenants/[id]/analytics-config` (super-admin, audit-logged).
- Site health / audit: `src/lib/scan.ts` (`scanTenant`/`scanAllTenants`) wraps the audit engine (`src/lib/audit/checks.ts` `runAudit`) and is the ONLY writer to `scan-store` (`src/lib/scan-store.ts`, Redis) — the single source of truth for per-tenant health + history. The daily `portfolio-scan` cron (`0 5 * * *`) populates every tenant; the client `/dashboard/health` and the admin overview grade/score/sparkline read the SAME store. **Do NOT add a parallel audit-history store or cron** — a duplicate was built and removed; all health work goes through `scan.ts`/`scan-store`. Public free tool at `/audit` (rate-limited); sendable one-pager via `src/lib/audit/html.ts` + `/api/audit/report`. The admin scan (`POST /api/admin/scan`) also returns `prioritizedIssues` (via `src/lib/audit/prioritize.ts`) — the ranked "fix first" list rendered admin-side in the tenant `SiteScan` view; the client only ever sees grade/score. Full: `docs/audit-page.md`.

## Key lib files

- `src/lib/tenants.ts` — tenant config lookup (Postgres `tenants` via `TENANTS_SOURCE`, Sanity fallback, Redis 60s cache); the `rowToTenant`/`tenantToRow` mapper is the 45-column spine
- `src/lib/storage/content-cache.ts` — Redis read-through/write-through cache for the public content path
- `src/lib/storage/content-store.ts` — Postgres `content` (via `CONTENT_SOURCE`) with Sanity/dev-file fallback; `src/lib/db/repositories.ts` + `src/lib/db/source-flags.ts` back the whole dual-path
- `src/lib/auth.ts` — Supabase Auth (`auth.uid()`) + per-tenant roles via the `memberships` table + super-admin via `super_admins`; Clerk path dead-pathed behind the flag
- `src/lib/site-capabilities.ts` — capability manifest builder (merged with optional remote manifest from the custom repo)
- `src/lib/scaffold-contracts.ts` — versioned route helpers + HMAC revalidation signing/verification (legacy `REB_*` symbol aliases are still exported for back-compat)
- `src/lib/audit/*` — the site-health audit engine: `checks.ts` (`runAudit`), `context.ts` (one-fetch `AuditContext`), `modules/*` (6 checks ported + fidelity-reviewed from the archived OWSH Systems product: ai-readability/seo-foundations/security/accessibility/trust/content), `impact.ts` ("what this costs you" + dollar-quantified narrative + `topFixes`), `prioritize.ts` (`prioritizeIssues` — ranks an `AuditResult`'s failing/warning checks into one admin-only "fix first" list; **pure transform, no store/cron**; ported/de-scoped from OWSH, revenue modeling intentionally omitted), `scoring.ts`. Always consumed via `src/lib/scan.ts` -> `src/lib/scan-store.ts` (see Operational systems).
- `src/lib/reviews/*` — dependency-free review intelligence (ported from the OWSH `sentiment-analyzer`): `sentiment.ts` (negation/intensifier-aware lexicon scoring + topic/keyword/urgency/emotion), `intelligence.ts` (the **admin-vs-client split** — `getClientReviewSummary` = positive owner-facing numbers only; `getAdminReviewIntelligence` = sentiment breakdown + urgent-first needs-a-reply queue + concerns + at-risk). Synchronous, no model call. Surfaces: client → `weekly-brief.ts` + `ReviewsPanel`; admin → the tenant page `ReviewIntelPanel` + `GET /api/admin/tenants/[id]/reviews-intel`. Product rule: issues are admin-side, the client sees good numbers as good numbers. Full: `docs/features/review-engine.md`.
- `src/lib/review-replies.ts` — filter-safe review-reply drafting (anti-boilerplate lint from the 12,752-reply rejection dataset, near-duplicate check, deterministic fallback, always queued for approval). Enriched with a sentiment/topic hint from `reviews/sentiment` so drafts name the reviewer's actual concern/praise.
- `src/lib/guides.ts` + `src/content/guides/batch-*.ts` — the `/guides` SEO blog (articles repurposed from the OWSH fix guides; each `fixesSlug` links an article to the audit category it addresses)

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

## The Model (founder decision, 2026-06-26 — 3-tier subscription, billing LIVE)
Pivoted 2026-06-26 from the two-door build-fee offer (`docs/strategy/website-offer-two-door.md`, now **superseded**) to a **pure monthly subscription, no upfront fee** — building is fast now, so the goal is low-friction sign-on. Three tiers, differentiated by **capability** (not page count):
- **Presence — $99/mo:** one-page lander (get found, click-to-call/booking, local-SEO foundations).
- **Growth — $199/mo:** full multi-page site + **transact** (online booking or basic ecom). The anchor/"most popular" tier; `STRIPE_SCAFFOLD_PRICE_ID` defaults to it.
- **Scale — $499/mo:** everything in Growth + the **content engine** (blog/SEO content the AI writes and we review), multi-location, integrations, priority done-with-you management.
- **Shared across all:** custom site (never a template), update-by-chat AI, weekly report, hosting; **you own your domain + content, leave anytime** (the wedge + the no-contract trust signal).
- **Tiers are packaging + build-scope, NOT code-enforced feature flags** — the platform serves whatever's built into the client's repo; the Stripe price just sets the charge. No engineering needed to "support tiers."
- **Ownership is the positioning spine**: domain in the client's name from day one, content export anytime (see `docs/repo-transfer-runbook.md`, `docs/domain-setup.md`).
- **Billing is LIVE (2026-06-26)** on the new standalone Strelva Stripe account (`acct_1Tmc5dA4gUnh4arE`). `isBillingEnabled()` (`src/lib/subscription.ts`) is true (`STRIPE_SCAFFOLD_PRICE_ID` = the Growth price). `STRIPE_BILLING_GRANDFATHER_TENANTS=gldf,rohlax` keeps existing clients active; `check:prod` enforces the grandfather-list-or-402 rule.
- ⚠️ **To change any Stripe/billing env var you MUST do a fresh `vercel deploy --prod --yes --scope scaffold-web`. `vercel redeploy` REUSES the target deployment's env snapshot and will NOT apply env changes.**
- **gldf + rohlax are grandfathered** (no subscription; protected via the list). New clients subscribe at a tier price.
- **Offer hook = "free to build" (founder decision, 2026-06-26):** no build fee, no upfront/setup cost. We **build first**, the client approves, and the **monthly subscription starts at go-live** ("pay when you're happy"). This is a deliberate low-friction growth hook — we accept the risk of an occasional unpaid build as the cost of frictionless sign-on. Marketing says "free to build / pay when happy" on purpose; do NOT "correct" it to a pay-first framing.
- Canonical pricing/Stripe-setup detail (account, live price IDs, branding): vault `1-projects/scaffold-web/pricing-and-billing.md`.
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
2. **Business OS Dashboard** at `admin.{client-domain}` (dark monochrome). The nav is a
   conditional surface set (`src/lib/dashboard-surfaces.ts`), grouped:
   - **Manage** — Dashboard (at-a-glance metrics + next action), Ask AI (the chat).
   - **Your presence** — Website (Preview / Content / Media / **History**, where History
     holds the change log + the revert-to-last-good safety net), Google Business, Reviews,
     Analytics, Health. Google Business + Reviews are shown by business type: an
     online-only brand (Business info → Business type = "online", or an online-only
     template) never sees them. See the presence resolver in `dashboard-surfaces.ts`.
     The first-run checklist (`/api/dashboard/onboarding-status`) leads with "Tell us
     how customers find you" so business type is set on day one, before the presence
     surfaces render — `settings.businessModel` drives it (`"" `= infer from template).
   - Identity split (founder feedback): top-left = the **business** (logo + name + domain);
     bottom-left = the **signed-in person** ("Hello, {name}", login identity, with an Admin
     badge + a "view as client" toggle for super-admins). Settings separates **Account**
     (read-only login identity) from **Business info** (the editable business fields).
3. **AI Agent** that manages the site ongoing (updates, blog, social drafts).
4. **Weekly report** by email.

> Dashboard UI conventions: accent buttons pair `bg-accent` with `text-on-accent` (dark
> ink — white fails WCAG AA on the light sage accent). `text-warm-black` / `text-gray-muted`
> are theme-aware and render light on the dark dashboard.

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
- A checkout / payment engine in the control plane. The client repo (or its commerce
  provider) owns the cart and the charge. The control plane **surfaces** commerce:
  the Store pillar reads products, and orders arrive over the `/api/v1/track` beacon
  (`order` event) into `src/lib/orders.ts` for the revenue/orders/best-seller view.
  This is the "basic ecom" of the Growth tier (founder decision 2026-06-26) — capture
  and visibility, not a storefront we build.
- Tiered pricing UI.
- A `/api/public/*` re-export shell of the v1 contract (v1 owns the contract directly now).
- Self-serve onboarding/provisioning (backend deleted 2026-06-10; don't resurrect without a founder decision).
- Copy implying the ONGOING service is free. "Free to build" (no build fee) and the free audit tool are the only "free" — the monthly subscription ($99/$199/$499) is always paid. Don't say "free site/free hosting/free forever."

## Execution Rules
- NEVER add "Co-Authored-By" lines to commits. (Intentional — this repo's commits read
  human-authored; this rule deliberately overrides any harness/tooling default that would
  add an AI co-author trailer. Do not "reconcile" it by re-enabling the trailer.)
- The user and project owner is Jacob Rhinehart. Address the user as Jacob when a name is needed.
- Promote a feature from "custom repo" to the platform only when at least two repos prove the same need (per `docs/future-codebase-integration.md`).

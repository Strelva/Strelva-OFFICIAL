# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev                          # Local dev server (localhost:3000)
pnpm build                        # Production build
pnpm lint                         # ESLint
pnpm test                         # Run all Vitest tests
pnpm test src/__tests__/core.test.ts  # Single test file
pnpm provision-tenant             # Create new tenant in Redis
```

For subdomain testing: `gldf.localhost:3000` routes to tenant "gldf".

## Architecture

**Multi-tenant SaaS**: Subdomain routing in `middleware.ts` extracts tenant from host (e.g., `gldf.scaffoldweb.com` → tenant `gldf`). Marketing site lives on root domain.

**Stack**: Next.js 15 + React 19 + Tailwind 4 + TypeScript. Clerk for auth. Redis (Upstash) for all tenant data. Vercel Blob for images.

**Content system**: Typed schemas in `src/lib/types.ts` (HeroContent, ServicesContent, etc.). CRUD via `/api/content/[section]`. Templates in `src/components/templates/` define which sections each tenant type uses.

**AI agent**: `src/lib/agent-executor.ts` uses Vercel AI SDK + Google model. Tools wrap content APIs. Changes trigger Slack notifications.

**Event queue**: `src/lib/events.ts` — UnifiedEvent system in Redis sorted sets. Powers dashboard queue, weekly brief generation.

**Key lib files**:
- `tenants.ts` — tenant config lookup
- `storage.ts` — Redis content storage
- `connections.ts` — third-party integrations (Google, Yelp, Calendly, Instagram)
- `weekly-brief.ts` — automated reports

---

# Scaffold Web — AI Website Management Platform

## What This Is
A dashboard that shows local businesses what's happening with their online presence — and an AI that handles the updates. Business owners see proof of value (visitors, clicks, reviews), chat with the AI to make changes, and get weekly reports.

**Pivoted from agency model to platform on 2026-04-03.**

## One-Liner
"See what's working. Tell the AI what to change."

## The Model
- **One plan**: $149/mo — everything included, no tiers, no upsells
- **Everything**: website + analytics + email + blog + reviews + social + weekly reports + proactive suggestions
- **Build**: Human-in-the-loop (AI generates 80%, human polishes 20%). $1,500-3,000 one-time for custom builds.
- **Agency channel**: wholesale for agencies to resell (future)
- **Gross margin**: 90-94%
- **Pricing anchor**: displaces $400-500/mo agency maintenance spend

## Value Hypothesis
Business owners will pay $149/mo for a dashboard that proves their website is working + an AI that handles updates — IF the dashboard shows clear value ("47 people found you"), the AI actually makes changes when asked, and the weekly report arrives before the first invoice recurs.

## ICP
- Local businesses with 1-10 people who have a website problem they've stopped trying to solve
- Has a bad website, or uses LinkTree + booking platform, or left an agency
- Wants more clients, not a dashboard (but the dashboard proves value)
- Will check the dashboard occasionally, but prefers weekly report summaries
- Talks to the AI like texting a person: "add my new yoga class on Saturdays"
- Templates cover: wellness, food-brand, restaurant, trades, professional

## What The Client Sees
1. **Custom website** built by Jacob — not a template, not AI-generated
2. **Business OS Dashboard** (dark monochrome, premium)
   - Overview: "People who found you" / "Booking clicks" / "Site health"
   - AI Chat: "Update my hours" "Write a blog post" "How's my site doing?"
   - My Site: live preview
   - Content: visual map of what's on the site
   - Reports: weekly plain-English performance summary
3. **AI Agent** that manages the site ongoing — updates, emails, blog, reviews, social
4. **Weekly report**: "47 people visited. 3 clicked Book Now. I updated your holiday hours."

## What You See (Jacob)
- Slack notifications for every AI change
- Admin dashboard: all clients, MRR, approve/reject queue
- Override capability on any change
- Escalation system: auto-approve factual changes, review new content, block code/layout

## Architecture (existing + new)
**Existing (Scaffold Web codebase):**
- Next.js 15, Tailwind, TypeScript
- 8 content sections with typed schemas (types.ts)
- REST API for content CRUD (/api/content/[section]) with validation
- JWT auth, image upload (Vercel Blob), Redis storage
- GSAP animations, smooth scroll, responsive

**To Build:**
- AI agent: Vercel AI SDK v6 streamText + tools wrapping existing API
- Client dashboard: Framer-quality business OS at /dashboard
- Chat interface: useChat with streaming, tool status, image drop
- Multi-tenant: subdomain routing + Redis namespace per tenant
- Notifications: Slack webhook on content updates
- Billing: Stripe ($3K + $199/mo)
- Analytics: PostHog or Vercel Analytics feeding dashboard + reports

## Customer Language (USE THIS)
- "See what's working" NOT "analytics dashboard"
- "Tell the AI what to change" NOT "conversational CMS"
- "47 people found you this week" NOT "unique visitors: 47"
- "Your weekly report" NOT "automated insights"

## Do NOT Build
- Drag-and-drop visual editor (AI handles content, Jacob handles quality)
- Client-facing code editor (never)
- E-commerce / checkout (booking platforms handle this)
- Tiered pricing UI (single plan at $149/mo — all capabilities included)

## Build Order
**Completed:** Phases 1-9 + all P0/P1/P2, dashboard redesign, single-plan pricing migration
**Remaining:** Deploy checklist, verification queue, growth features (deferred)

## Validation Signals
1. Does the first customer check the dashboard within 7 days?
2. Do customers use the chat agent without being prompted?
3. Does the weekly report get opened before the first invoice?
4. Would a customer refer a peer for the same service?

## Execution Rules
- NEVER add "Co-Authored-By" lines to commits

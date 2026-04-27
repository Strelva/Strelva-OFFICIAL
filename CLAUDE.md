# Scaffold Web — AI Website Management Platform

## What This Is
An AI agent that runs a business's online presence autonomously. Businesses talk to it via chat — it builds, updates, and manages their website. It reaches out proactively with weekly reports and suggestions. Dashboard shows proof of value.

**Pivoted from agency model to platform on 2026-04-03.** See `.claude/plans/todos.yml` for completed phase history and `.claude/plans/remaining.yml` for the 41-item TODO list to finish shipping.

## One-Liner
"Your business runs itself. Just text back yes."

## The Model
- **One plan**: $149/mo — everything included, no tiers, no upsells
- **Everything**: website + analytics + email + blog + reviews + social + weekly reports + proactive suggestions
- **Build**: Human-in-the-loop (AI generates 80%, human polishes 20%). $1,500-3,000 one-time for custom builds.
- **Agency channel**: wholesale for agencies to resell (future)
- **Gross margin**: 90-94%
- **Pricing anchor**: displaces $400-500/mo agency maintenance spend

## Value Hypothesis
Business owners will pay $149/mo for an AI that autonomously manages their online presence and proves its value weekly — IF the AI is proactive (reaches out with reports/suggestions, not just reactive), the onboarding delivers a live site quickly, and the weekly report shows "47 people found you this week" before the first invoice recurs.

## ICP
- Local businesses with 1-10 people who have a website problem they've stopped trying to solve
- Has a bad website, or uses LinkTree + booking platform, or left an agency
- Wants more clients, not a dashboard (but the dashboard proves value)
- Will never log into a traditional CMS after month 1
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
- "Your site works while you sleep" NOT "AI-powered platform"
- "More clients, less hassle" NOT "marketing intelligence"
- "Just tell the AI what you want" NOT "conversational CMS"
- "47 people found you this week" NOT "unique visitors: 47"

## Do NOT Build
- Drag-and-drop visual editor (AI handles content, Jacob handles quality)
- Client-facing code editor (never)
- E-commerce / checkout (booking platforms handle this)
- Tiered pricing UI (single plan at $149/mo — all capabilities included)

## Build Order
See `.claude/plans/todos.yml` for completed phases 1-9.
See `.claude/plans/remaining.yml` for remaining items.

**Completed:** Phases 1-9 + all P0/P1/P2, dashboard redesign, single-plan pricing migration
**Remaining:** Deploy checklist (7 items), verification queue (5 items), growth features (deferred)

## Validation Signals
1. Does the first customer use the chat agent without being prompted?
2. Do customers prefer chat over the form-based admin?
3. Would a customer refer a peer for the same service?
4. Does the second customer use the dashboard within 7 days?

## Execution Rules
- NEVER use the Agent tool or spawn subagents. Do all work directly in the main conversation.
- NEVER add "Co-Authored-By" lines to commits

# REB — AI Website Management Platform

## What This Is
An AI agent that runs a business's online presence autonomously. Businesses talk to it via chat — it builds, updates, and manages their website. It reaches out proactively with weekly reports and suggestions. Dashboard shows proof of value.

**Pivoted from agency model to platform on 2026-04-03.** See `.claude/plans/todos.yml` for completed phase history and `.claude/plans/remaining.yml` for the 41-item TODO list to finish shipping.

## One-Liner
"Your business runs itself. Just text back yes."

## The Model
- **Build**: Human-in-the-loop (AI generates 80%, human polishes 20%). $1,500-3,000 one-time.
- **Starter**: $49/mo — website + analytics capabilities
- **Growth**: $149/mo — + email + blog + reviews
- **Scale**: $399/mo — + everything + API + white-label
- **Agency channel**: $49/mo wholesale, agencies charge $199+
- **Gross margin**: 90-94%
- **Solo ceiling**: 50-60 clients before needing help on build side

## Value Hypothesis
Business owners will pay $49-149/mo for an AI that autonomously manages their website and proves its value weekly — IF the AI is proactive (reaches out with reports/suggestions, not just reactive), the onboarding delivers a live site in under 5 minutes, and the dashboard shows "47 people found you this week" within the first week.

## ICP: Chelsea (and her network)
- Wellness practitioners, trades, local service businesses
- Has a bad website or uses LinkTree + booking platform
- Wants more clients, not a dashboard (but the dashboard proves value)
- Will never log into a traditional CMS after month 1
- Talks to the AI like texting a person: "add my new yoga class on Saturdays"

## What The Client Sees
1. **Business OS Dashboard** (Framer-quality, dark mode, premium)
   - Overview: "People who found you" / "Booking clicks" / "Site health"
   - AI Chat: "Update my hours" "Write a blog post" "How's my site doing?"
   - My Site: live preview
   - Content: visual map of what's on the site
   - Reports: weekly plain-English performance summary
2. **AI Agent** that can modify every section of their site via chat
3. **Weekly report**: "47 people visited. 3 clicked Book Now. I updated your holiday hours."

## What You See (Laney)
- Slack notifications for every AI change
- Admin dashboard: all clients, MRR, approve/reject queue
- Override capability on any change
- Escalation system: auto-approve factual changes, review new content, block code/layout

## Architecture (existing + new)
**Existing (REB codebase):**
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
- Drag-and-drop visual editor (you build the sites, AI handles content)
- Client-facing code editor (never)
- Self-serve site generation (you are the quality control)
- Email marketing / newsletter — NOW IN SCOPE (Chelsea asked for it unprompted, hates Vagaro's email tool)
- E-commerce / checkout (booking platforms handle this)
- Social media management (out of scope)

## Build Order
See `.claude/plans/todos.yml` for completed phases 1-9.
See `.claude/plans/remaining.yml` for 41 items to finish shipping (P0-P4 + deploy + verification).

**Completed:** Phases 1-9 (generalize, tenants, billing, onboarding, templates, proactive AI, capabilities, deploy prep, marketing)
**Remaining:** 4 P0 ship blockers, 5 P1 trust killers, 7 P2 UX gaps, 6 P3 infra, 7 P4 growth, 7 deploy steps, 5 verifications

## Validation Signals
1. Does Chelsea use the chat agent without being prompted?
2. Does Chelsea prefer chat over the existing form-based admin?
3. Would Chelsea refer a provider for the same service?
4. Does the second client use the dashboard within 7 days?

## Git Rules
- NEVER add "Co-Authored-By" lines to commits

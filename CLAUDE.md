# REB — Productized AI Web Agency

## What This Is
You build custom sites. Clients get a Framer-quality business OS dashboard + AI agent that handles everything. The dashboard IS their business — they never touch a CMS, never email you for small changes. They talk to their AI, it updates the site, you get notified.

## One-Liner
"Your site works while you sleep."

## The Model
- **Build fee**: $3,000 one-time (custom Next.js site)
- **Monthly**: $199/mo (AI agent + dashboard + hosting + updates)
- **Gross margin**: 92-95% ($12 COGS per client)
- **Solo ceiling**: 40-60 clients with AI handling 80%
- **First pipeline**: Chelsea's 8 provider directory contacts

## Value Hypothesis
Local business owners will pay $199/mo for a custom site + AI agent that handles all content updates via chat — IF the dashboard shows visible proof of value (visitors, bookings) within the first week and the AI agent responds to requests instantly instead of the 24-48hr agency turnaround.

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
See `.claude/plans/todos.yml` for complete todo list.
Phase 1 (this week): AI agent + client dashboard + Chelsea test
Phase 2 (2 weeks): Multi-tenant + second client
Phase 3 (month 2): Billing + analytics + operations
Phase 4 (month 3+): Growth + distribution

## Validation Signals
1. Does Chelsea use the chat agent without being prompted?
2. Does Chelsea prefer chat over the existing form-based admin?
3. Would Chelsea refer a provider for the same service?
4. Does the second client use the dashboard within 7 days?

## Git Rules
- NEVER add "Co-Authored-By" lines to commits

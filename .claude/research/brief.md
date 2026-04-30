# Research Brief — Scaffold Web Strategy Ideation

Compiled from parallel research on competition, codebase reality, and why-now.
Demand + winners research running in parallel; this brief grounds the n=10 stochastic ideation regardless.

## Core findings

### 1. The unowned position (competition research)
- Direct competitors all frame around **moment of creation**: Durable, B12, GoDaddy Airo, Wix Aria, Squarespace Blueprint, 10Web, Hocoos, Mixo, Bookmark.
- Pricing tiers: AI builders $9–$45/mo. AI-builder-plus-tools $22–$199. GoHighLevel $97–$497 (agency channel only). Agency retainers $250–$1,500/mo for SMBs.
- **Nobody owns the proactive AI account manager position.** Nobody texts the owner first. Nobody sends weekly reports as the primary surface. None of them behave like an account manager.
- $149/mo sits cleanly between AI-tool ceiling ($45) and agency-retainer floor ($250).
- Funded direct adjacency: Durable ($20M, Spark, Dec 2023). GoHighLevel rebuilt AI 2025–2026.
- Threat: Wix bought Base44 for $80M (June 2025) and is moving on agentic. Has distribution.

### 2. The structural moat (why-now research)
- **Wix/Squarespace cannot ship proactive SMS/Slack outreach without undermining their own editor-engagement metric.** Their model requires the owner to stay in the editor. A standalone agent has no such constraint and can own the communication layer entirely. The owner never logs in.
- 2024–2026 capability unlocks: OSWorld 14.9% → 78% (5x in 18 months). Multi-agent reliability +12pp. Vercel AI SDK 6 ships agent primitives. MCP became universal. Token costs dropped ~80%.
- Token economics at $149 MRR: ~$0.43–$3.30/client/mo in API cost. 90%+ gross margin holds at any scale.
- SMB AI adoption: 77% (Salesforce 2025). Trust gap closing — but 53% prefer "mostly human-led", so human-in-the-loop approval IS the product, not a limitation to hide.

### 3. Codebase reality (audit)
- ~75% of platform thesis is real code, not vapor. 29.5K LoC, 229 TS files, last commit 2026-04-28.
- BUILT: AI agent (1022-LoC route, 19 typed tools), dashboard with chat, multi-tenant routing (subdomain + custom domain), Stripe billing end-to-end, weekly reports cron job (generates HTML, sends via Resend, scheduled in vercel.json), Slack notifications fire-and-forget, 5 cron jobs (weekly report, daily summary, SMS suggestions, search console sync, staleness checks), 8 typed content sections, REST API, Clerk auth, Vercel Blob.
- HALF-BUILT: reports dashboard page, lead persistence, tenant provisioning UI, connections panel state, PostHog analytics.
- 45-item ship-tasks list. 6 blockers (env vars, DNS, Stripe price, webhook secret, CRON_SECRET, custom-domain map prod).
- Marketing site is generic v0-style. "Your business runs itself" headline. No chat teaser on the homepage.

### 4. Best-evidence wedge
- Strongest unowned wedge from research: **proactive weekly performance signal that triggers a specific AI-suggested change, delivered by SMS or Slack** — not a dashboard login. Example: "47 people searched 'yoga Saturday' this week and you have no page for that. I drafted one — reply YES to publish." Owner never logs in. Agent closes the loop. Incumbents structurally cannot ship this.
- This re-frames the product from "AI website builder" to "AI account manager whose work happens to live on a website".

## Counter-thesis to pressure-test
1. Wix has distribution + Base44 acquisition. Can outpace any startup before category clarity.
2. SMB trust is sticky. One AI-published typo = churn event.
3. "AI manages your website" is not a category SMBs shop for. Cold-outreach script is unclear.
4. Solo/small-team SaaS at $149/mo is not a fundable shape unless it grows fast — agency channel may be the only path to scale.

## 5. Wedge analysis (winners research)
- Pattern across Calendly/Jobber/ServiceTitan/Toast/Mindbody: **average 4-5 years from v1 to platform claim**. None launched as a platform. All solved one painful daily workflow with a computer.
- Of candidate wedges considered: (a) auto-update hours, (b) weekly SMS report, (c) fix broken content, (d) AI rewrites for SEO — only (b) recurs and produces an artifact the owner already cares about. (d) is a project, not a wedge.
- **Strongest wedge proposed: (e) "AI texts you when your site has a problem and fixes it before you have to ask."** Combines weekly recurrence + one-loop dispatch (ServiceTitan model). Detect → text → owner replies "yes" → AI updates → confirms. <60 seconds, weekly, proof of value before month 2.

## 6. Distribution reality (channel research)
- Three channels with real founder evidence:
  1. **Direct founder outreach** into one vertical, one city. Jobber's 14th customer was met face-to-face in Edmonton. Toast cold-walked Boston restaurants. Universal first channel.
  2. **Vertical community word-of-mouth.** Toast: density in one Boston neighborhood → waitstaff/owners cross-pollinate. GHL: marketing agency Slack groups.
  3. **Agency reseller (GoHighLevel playbook)**: month 6–12 lever, not day 1. Agency needs ~40–60% gross margin. At $149 retail, wholesale ~$50–80/mo to agency.
- **Paid ads fail at $149 MRR**: SMB keyword CPC $15–40, conversion 1–3% from cold, CAC math breaks before LTV is proven.
- Solo-founder opening: pick ONE vertical, ONE city, 5–10 free trials, force them to talk to each other.

## 7. Pricing reality (demand research)
- Real numbers, not handwave: Agency retainer for SMB website maintenance $200–500/mo. DIY stack (Squarespace + Acuity + email) $50–100/mo. Freelancer retainer (Upwork) $250–500/mo for passive maintenance.
- $149/mo undercuts the freelancer retainer while overdelivering (proactive vs reactive). 1.5–2x the DIY stack but saves owner-hours.
- **Real competitor isn't Durable. It's owner inertia.** Bad site, paying $0, living with it. The pitch must overcome status quo, not "why us not Durable".
- The $1,500–3,000 build fee is the riskier conversation. Recurring $149 is defensible once the site is live and the first weekly report lands.

## 8. Failure patterns and the vertical/horizontal verdict (failures research)
- Dead AI-SMB plays: Builder.ai ($1.2B valuation, fake AI/manual coders, shut down 2025), Tune AI (no vertical moat, AWS commoditized), Air AI (FTC banned for deceptive SMB marketing 2026), NYC MyCity (hallucinated illegal advice — liability), Cydoc (no distribution moat, 7-year burnout).
- Common kill patterns: **fake AI / overpromised automation; no vertical moat; failed paid conversion; regulatory liability from autonomous outputs.**
- Vertical-vs-horizontal data is decisive: **every winner went vertical day 1.** Jobber (home services), Toast (restaurants), Mindbody (yoga/fitness), HoneyBook (wedding vendors). GoHighLevel is the only horizontal — and it's horizontal-product / vertical-distribution (agencies as buyer).
- "App for yoga studios" spreads at yoga conferences. "App for any small business" spreads nowhere.
- Strongest niche signals:
  1. **Home services (trades)** — Jobber-proven, budget, high website pain, Jobber doesn't touch sites/AI chat (gap). Trade associations + contractor Facebook groups for distribution.
  2. **Wellness studios** — Mindbody-proven, tight community, tech-averse but Instagram-present. Owners talk to each other intensely.
  3. Restaurants — too contested (Toast, Yelp, OpenTable).

## Open questions for ideation
- What's the SHAREABLE artifact (per STRATEGY.md, day-one session must produce something screenshot-worthy)
- Is the SMS/Slack thread the product and the dashboard just proof?
- How does the build fee get framed — entry ramp, or pure recurring with no build fee?
- What does the first launch *homepage* look like — not generic "AI runs your business" but specific surface that screenshots

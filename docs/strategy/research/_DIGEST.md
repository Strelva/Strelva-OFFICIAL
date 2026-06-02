# Strelva Strategy Research Digest

> Preserved reference for the divergent-approach exploration. Six research threads,
> cleaned and organized under their topic headers. The product direction is
> intentionally **undecided** — this digest is the evidence base the 12 approaches and
> the synthesis draw from. Ground every strategic claim here.

**Company context (do not contradict):** Strelva is a Buffalo, NY studio — two
founders, two divisions, **one brand**. Division 1 (Websites, run by Noah): managed
sites for local SMBs; the client site is free (acquisition wedge); the monetized layer
is an owner "Business OS" dashboard — a weekly plain-English "receipt" plus a governed
AI content agent (auto-approve factual / review new copy / block structural). ICP:
local businesses 1–10 people. Division 2 (Custom Software, run by Jacob): new; centered
on "workflows" — custom apps, automations, internal tools for ~5–20 person businesses
with repetitive processes and a spreadsheet ceiling. No track record yet → honest proof
only. GTM is **organic, minimal/no cold outbound**, with a Buffalo / Western NY local
advantage. Horizon: into Q4 2026 — exploit what becomes newly POSSIBLE. Competitors run
the same research, so every approach must be **non-consensus / asymmetric**.

**Existing technical assets (latent leverage):** a governed AI content agent; an
any-URL website AUDIT engine that scores 6 categories with 4 stubbed Phase-2 slots; a
versioned `/api/v1` contract + HMAC-signed revalidation + a repeatable custom-repo
delivery pipeline; a per-tenant event/data store collecting reviews/social/analytics;
integrations (Google, Yelp, Instagram, Search Console). Cross-tenant benchmark data is
collected but **un-mined**.

---

## 1. Newly-possible capabilities for Strelva by Q4 2026

Five capabilities are crossing from experiment to exploitable by Q4 2026, ranked by
leverage for a 2-person Buffalo studio with Strelva's specific assets.

**1. AEO/GEO as a productized delivery lever (highest leverage, immediate).** AI search
(ChatGPT, Perplexity, Google AI Overviews) now drives higher-intent leads than
traditional organic — 58% of marketers report AI-referred visitors convert faster
(HubSpot 2026 State of Marketing). Mechanism: JSON-LD schema + GBP entity consistency
determines whether a local business gets cited in AI answers. Sites with complete
structured data earn 2.5x more AI Overview appearances and 42% more AI citations. This
is NOW the primary visibility battleground — not SEO keyword density. Strelva's audit
engine + versioned delivery pipeline already sit on top of every client site.
Non-consensus move: bake AEO scoring + automated schema generation directly into the
pipeline so every site Noah ships is AI-answer-ready by default, and surface an AEO
citation score as a dashboard metric owners watch improve. Competitors charge for this
audit separately; Strelva can make it native and invisible.

**2. The MCP ecosystem as a distribution moat (high leverage, 6–12 month horizon).** MCP
crossed from spec to operational standard in H1 2026: 97M+ monthly SDK downloads, 41% of
software orgs in production, donated to the Linux Foundation with Anthropic/Google/
Microsoft/OpenAI backing. Less than 5% of ~10,000+ servers are monetized. Non-obvious
angle for Jacob's division: build client workflow automations as **MCP servers, not
bespoke apps** — (a) composable by any Claude/Cursor/Copilot the client already uses,
(b) resellable to any similar business at near-zero marginal cost, (c) a latent
distribution channel as AI agents increasingly search for and invoke MCP tools. Pattern:
"build once, sell industry-vertical many times." Strelva's existing agent + data store
are already MCP-compatible.

**3. Voice AI agents for local inbound (medium-high leverage, production-ready now).**
Retell AI ($0.07/min, ~600ms latency, SOC 2 Type II) and Bland AI ($0.09/min) are
production-grade. A voice agent handling inbound calls for a trades or wellness business
— booking, hours/pricing, lead capture — replaces $7–12/human call at $0.40/AI call
(Gartner). Demo-quality 12 months ago; billable infrastructure now. For Noah's division:
voice agent as an add-on to the managed website (same GBP/content data drives both)
creates a second revenue line on the same client relationship with minimal extra build.

**4. AI-assisted custom software delivery economics (high leverage for Jacob).** Small
teams (2–5 people) report 68% speed improvement with agentic coding tools vs. 31% for
larger orgs (Braiviq, 2026). 40% of new SaaS MVPs are primarily AI-assisted. This does
NOT mean cheap projects — it means a 2-person studio can credibly quote and deliver
workflow software that previously needed 5–10 people, priced on value not hours. Honest
risk: 45% of AI-generated code contains security vulnerabilities; professional rebuild
costs $5–30K. **The moat is governance** — Jacob's value prop to a 5–20 person business
is "we deliver the speed advantage AND own the quality bar," which commodity
vibe-coders cannot offer.

**5. Browser/computer-use agents as an automation primitive (emerging, 12+ months).**
Claude Computer Use, OpenAI Operator, Stagehand, and the browser-use library all reached
production-grade between Oct 2024 and May 2026. They let an AI agent interact with any
web UI without an API. For Strelva: unlocks automation for clients whose tools (legacy
booking systems, franchise portals, non-API platforms) have no programmatic access — a
common trades/wellness constraint. Not a Q3 2026 product; worth prototyping against one
real client pain now.

**Cross-cutting finding:** Strelva already collects cross-tenant data (reviews,
analytics, search console, integrations) that no individual client can see in aggregate.
This latent benchmark layer — "your yoga studio gets 2.1x the booking clicks of
comparable studios in your region" — is an unanswered-engine data asset. No competitor
at Strelva's market tier has this. Surface it in the weekly report first; it costs zero
to build and immediately differentiates the dashboard on proof-of-value.

---

## 2. Consensus Playbook vs. Asymmetric Divergences (SMB Websites + Workflow Automation 2026)

**CONSENSUS MAP — what every competitor running this research will conclude:**

*Websites:* AI generates a site in 30 seconds (Durable, GoDaddy Airo, Wix ADI). Every
builder adds SEO scoring, schema markup, social-post generation. Agencies white-label
platforms (Duda, 10Web) and bundle an SEO/update retainer at $300–700/month. The "AI
managed website" pitch is everywhere: set-and-forget, no drag-and-drop, AI does updates.
Market is moving toward "AI employee" framing. SMB churn 31–58% annually; consensus fix
is "show value faster" + "weekly analytics digest." Vertical SaaS (ServiceTitan et al.)
already has deep operational-lock-in moats in trades.

*Custom software:* Discovery-to-build-to-retainer is the productized standard (setup
$2–15K, retainer $2–5K/month). n8n/Make/Zapier orchestration + LLM decision logic is the
commodity stack. Everyone targets trades and professional services. "AI automation
agency" is already declared broken by practitioners — one-time projects, no recurring
revenue, maintenance burden, budget misalignment (50% of prospects offer under $2K).
Consensus fix: specialize by vertical, charge for discovery, productize delivery.

**ASYMMETRIES — what the consensus ignores:**

1. **The receipt framing is untapped.** Every competitor shows "analytics." Nobody sends
   a plain-English receipt: "47 people found you, 12 clicked your booking link, you need
   to update your hours." The weekly brief as a renewal anchor — not a dashboard — is
   non-consensus and the highest-leverage churn-prevention move (43% of SMB churn happens
   in the first 90 days; time-to-first-value under 7 days cuts churn 50%).

2. **Cross-tenant benchmark data is a latent moat nobody has built at the local level.**
   Strelva already collects reviews, search console, social, booking-click data across
   tenants. Consensus answer to "show value" is per-tenant analytics. Non-consensus:
   "your site gets 30% fewer booking clicks than comparable wellness businesses in
   Western NY" — benchmarks only a multi-tenant platform can produce. Vertical-SaaS data
   gravity: the hardest-to-copy moat is proprietary cross-customer intelligence.

3. **Audit engine as acquisition wedge.** Free audit tools (Insites, Birdeye, SEOptimer)
   exist for agencies; none are positioned as a trust-building door-opener to a managed
   service. Strelva's engine can score any URL, benchmark it against the tenant
   population, and produce "here's what's broken and here's the cost." A non-consensus
   cold-open that feels like proof, not a pitch.

4. **The custom-software gap is at the 5–20 person scale, below ServiceTitan.** Trades
   and professional services with repetitive workflows can't afford ServiceTitan's
   complexity or enterprise agencies. White space: "one real workflow removed" — a single
   automaton that eliminates the paper/spreadsheet ceiling for a specific job (job-cost
   tracking, estimate-to-invoice, intake routing). Discovery-to-one-workflow is more
   honest and closeable than "AI operating system."

5. **Buffalo/local is genuinely non-consensus.** Every competitor's playbook is
   geo-agnostic. Organic local GTM — where a referral from one HVAC shop to another is one
   phone call — is asymmetric in a market where everyone else runs LinkedIn ads and cold
   email. Buffalo's concentration of trades and professional-services firms in a tight
   geography makes density-within-vertical achievable at founder scale.

---

## 3. Organic / Low-Outbound GTM Motions (Studios + SMB Software, 2025–2026)

Seven motions, ranked by fit for a 2-person studio with Strelva's assets.

1. **Proof-led free audit / public scorecard (highest fit, fastest signal).** Embed a
   URL-based audit widget scoring any local site instantly, gated by email. Prospects
   raise their hand after seeing their own score; the rep becomes an advisor. Platforms
   (My Web Audit, Insites) report 4x lead volume over PDF magnets, ~80% close rates,
   $100K+ LTV; one user generated 500 qualified leads/month. Strelva already has the
   engine — deployment, not build. Time-to-first-signal: 1–2 weeks. Edge: score the
   prospect's existing site AND deliver a "what it would look like under Strelva" preview
   — that's a demo, not a scorecard.

2. **Agent-led / AEO distribution (highest leverage, longest horizon).** Resend went
   0 → 400K users without cold outbound: Claude Code picks it 63% of the time vs.
   SendGrid's 7% (minimal friction, clean docs). Supabase grew 1M → 4.5M developers in 12
   months the same way. Mechanic: become the answer AI assistants surface when an owner
   (or their consultant) asks "how do I manage my website?" Levers: structured AEO
   content (FAQ schemas, direct Q&A), an MCP server exposing the audit/content API,
   GEO-optimized copy AI engines can quote. AI referral traffic converts 14.2% vs. 2.8%
   for Google organic. Window is open but narrowing as paid placements arrive.
   Time-to-first-signal: 60–90 days for AEO citation traction.

3. **Cross-client benchmark data as moat (highest defensibility).** Strelva's most
   under-exploited latent asset. With even 5–10 clients, the per-tenant store becomes a
   proprietary benchmark dataset. GTM mechanic: lead with "we manage [N] local businesses
   in [vertical] in Buffalo. Median [metric] is [X]. Your setup delivers [Y]." Anchors
   against peer outcomes, not vendor claims. Publish anonymized vertical benchmarks
   publicly as AEO content — pulls prospects AND feeds AI citation.

4. **Weekly report / receipt as referral engine.** The receipt is not just retention —
   it's the referral trigger. Owners talk to each other; a tangible plain-language proof
   artifact gets forwarded. Make the brief designed to be shared (clean, branded, single
   CTA). Referred customers: 16% higher LTV, refer at 4x the rate.

5. **Founder-led content / build in public (Buffalo local advantage).** LinkedIn rewards
   personal accounts ~7x over company pages. "Here's what we built for a local yoga studio
   this week" with real before/after data creates local social proof digital-first
   competitors can't replicate. Trust strategy, not content strategy. First warm DM
   inbound in 2–4 weeks.

6. **Vertical partner channel (trades, professional services).** Partner with whoever
   already has trusted access to the ICP: business accountants, Chambers, trade
   associations, booking-platform reps. Referral-fee or co-marketing, not reseller. Close
   CRM grew partner-sourced revenue 4% → 10% in 12 months with one person. For a 2-person
   team: 2–3 relationship bets, not a channel program.

7. **Local density / own-a-vertical flywheel.** Dominate one vertical (e.g., Buffalo
   wellness) before expanding. Every client becomes social proof for the next
   same-vertical prospect; the scorecard, benchmark data, and founder content all compound
   when pointed at a single vertical. Time-to-density: 6–12 months.

*AEO note:* 51% of companies plan increased AEO investment in 2026 vs. 20% who have
started — a first-mover window now. Structured FAQ schemas + direct Q&A are the enabling
mechanic.

---

## 4. Buffalo / Western NY Local Advantage

**Three non-obvious structural advantages.**

1. **The construction boom is the wedge nobody is pitching to.** Erie County has 1,417
   construction/trades establishments — second-largest business category by count, behind
   only "Other Services" (1,476). Buffalo construction employment is at its highest in
   nearly 35 years (Bills stadium + regional investment). These owners are drowning in
   work, have no time for websites/marketing, and are hit by the same SEO-package
   agencies. Sharp ICP fit: budget (above-average wages, booked solid), pain (website
   ignored since 2018), word-of-mouth culture. A studio showing up at the Buffalo &
   Niagara Building Trades Council or ECIDA network with "we build your site and keep it
   current — here's what 10 homeowners saw on it last month" owns this vertical before any
   national agency notices.

2. **The referral graph is dense, structured, and has explicit on-ramps.** Key nodes:
   BNI WNY (multiple chapters, members report 20%+ revenue lift first year, one-seat-per-
   category rule — you want the one "web/AI" seat before someone else takes it; Upstate NY
   region reported $20M+ member-referred revenue in 2025). The Buffalo Niagara Partnership
   launched a FREE tier for businesses with ≤5 employees — a new on-ramp to 4,500+ annual
   attendees. Hertel Business Association ($150/year), Elmwood Village Association, and
   parallel neighborhood associations are low-cost entry points to dense 1–10 person ICP
   concentrations. "The Buffalo Networker" newsletter reaches 13,000+ professionals
   organically. None require cold outbound — they reward showing up, being local, proving
   results.

3. **"City of Good Neighbors" is a real product moat, not a tagline.** The phrase is used
   by the BNP, city government, and local media; it describes actual anti-transactional
   behavior. Implications: (a) a named local studio ("Strelva, Buffalo") starts with trust
   a Squarespace or remote agency cannot manufacture; (b) a weekly receipt delivered by
   visible community members compounds trust faster here; (c) bad referrals are culturally
   penalized, so when a client refers, they mean it. Asymmetric move: make Strelva's
   Buffalo identity explicit and visible as a social contract — "we are here, we know your
   market, we stand behind this."

**Flywheel implication:** Start with one trade/construction client, deliver the weekly
receipt, make it shareable. Let them bring it to their BNI chapter; take the open
"web/marketing" seat. One BNI chapter is 20–40 owners who each refer aggressively. Hertel
/ Elmwood associations are $150/year access to 50+ busy-corridor businesses. Buffalo
Rising (1.2M annual readers, 6M+ pageviews) and Buffalo Business First are earned-media
on-ramps — a genuinely novel product gets covered. Custom Software has a parallel on-ramp:
trades + professional-services firms with spreadsheet ceilings attend BNP and ECIDA
events; the same local-trust moat applies.

*Other nodes:* Healthcare is the #1 employment sector (78,884 workers); BNMC runs the IC
Success accelerator + a Kiva zero-interest loan partnership. 43North embeds 5 startups/
year in Seneca One. UB Center for Entrepreneurial Leadership runs the INcorporate podcast
+ Cultivator program. WNY Be In Business connects entrepreneurs across 35+ local orgs.
Buffalo News parent stabilized finances with a $50M investment (Dec 2025) — local press
is intact.

---

## 5. Jobs-To-Be-Done Landscape

**DIVISION 1 — Web presence.**

- *Core functional job:* "Get me customers without me having to think about the website."
  NOT "build me a website." The real hire is **abdication of the web problem**. 98.7% of
  SMB owners expect revenue from their site (Duda/2025), yet behave set-and-forget.
- *Struggling moment:* Not "I need a new website." It's (a) lead volume quietly drops
  ("30 leads/month in 2022 → 8 in 2025") and the owner doesn't know why; (b) a customer
  mentions the site looks broken on mobile; (c) a competitor shows up on Google that
  didn't exist 6 months ago. Loss aversion and embarrassment, not aspiration.
- *Emotional job:* Remove ambient anxiety that the site is silently failing. Owners don't
  check GA4 ("nobody looks at it"). The weekly report ("47 people found you, 6 called") is
  a **receipt** — proof of life, not insight.
- *Social job:* Look credible to new customers before first contact. For trades and
  professional services, the website is identity — a proxy for "real, established,
  trustworthy."
- *What they hire (and why it fails):* one-time agency build (fires when agency goes dark,
  site rots); DIY Squarespace/Wix (fires when they can't maintain it, tech anxiety wins);
  nothing (27% still have no website — non-consumption from perceived irrelevance + tech
  intimidation).
- *Non-obvious mis-served job:* Competitors sell the ARTIFACT (the website). The unmet job
  is ongoing EVIDENCE the artifact is performing. Nobody closes the "is it working?" loop
  weekly, in plain language, automatically. **The weekly brief IS the product — the
  website is the delivery vehicle.**

**DIVISION 2 — Custom software / workflows.**

- *Core functional job:* "Make my business run without me being the bottleneck." The hire
  is **operational autonomy** — the ability to leave for a week without the business
  seizing up. 80% of SMBs have founder-dependency as a critical operational failure; 95%
  of secondary pain is undocumented process (CamelAI, 2025).
- *Struggling moment:* a critical employee leaves with tribal knowledge; the owner misses
  something that lived only in their head/inbox; the spreadsheet that "runs" a process
  hits a data-integrity wall or breaks when a new hire touches it; a third of a meeting is
  spent hunting for info. "I almost lost a client / almost missed payroll" moments — not
  "I want to modernize."
- *Emotional job:* Feel like a real business, not a chaos manager. Dual social job: appear
  competent/in-control to staff and clients; build something with value beyond the founder
  (exit-ready, not a personality cult). SMBs spending $500–$2,000/month on disconnected
  SaaS feel waste-shame.
- *What they hire (and why it fails):* off-the-shelf SaaS stacks (ClickUp/Notion/Monday)
  handle 80% but the 20% where competitive advantage lives is always custom; spreadsheets
  (fire when the business outgrows them); fractional ops consultants (too slow, too
  abstract, no code output).
- *Non-obvious mis-served job:* Discovery shops sell "custom software." The unmet job is
  **documented operational certainty** — a business a stranger could walk into and run by
  following the system. The product isn't an app; it's organizational resilience.
  Competitors miss this because they pitch technology; the owner is buying peace of mind
  and personal freedom.

**Cross-division leverage:** Both jobs share one meta-job — **"make my business less
dependent on my personal attention."** Strelva's audit engine, benchmark data, and
managed-site model are latent proof assets that can anchor Division 2 credibility before a
single workflow ships. **Anxiety (not lack of desire) is the dominant blocking force** for
both buyers: "what if the AI breaks something?" (Div 1) and "I don't know what I'm buying"
(Div 2). GTM must reduce anxiety, not add features. The real competitor for both is
**inertia / non-consumption**, not a named rival.

---

## 6. Novel products from Strelva's own assets (composable opportunities for Q4 2026)

Strelva holds five interlocking primitives that almost no 2-person local-business team
runs simultaneously:

1. A live any-URL **audit engine** scoring 6 categories (Core Web Vitals, SEO, Mobile,
   Schema, SSL, A11y) with 4 stubbed Phase-2 slots (GBP completeness, NAP consistency,
   review presence, local SEO grid) — `/api/audit/scan`.
2. A **governed AI content agent** (auto-publish factual / review marketing copy / block
   structural) with Gemini 2.5 Flash, on live tenant data.
3. A versioned **`/api/v1` contract + HMAC-signed revalidation** pipeline connecting
   Strelva to n deployed client sites as a control plane.
4. A **per-tenant event+review+social+search-console data store** in Redis/Sanity
   aggregating Google, Yelp, Instagram, Search Console signals.
5. **Cross-tenant benchmark data** — collected but not yet mined or surfaced.

**Sharpest non-consensus product moves:**

*Websites division.*

- **A. GEO/AEO visibility layer on the audit engine.** 78% of local trades are invisible
  in AI search (2026); 88% have no strategy. The audit already fetches HTML and runs
  schema checks; the stubbed `stubGBPCompleteness()` + `stubNAPConsistency()` +
  `stubReviewPresence()` map precisely onto GEO/AEO factors. Adding an "AI Visibility"
  category creates a differentiated score competitors cannot replicate without also
  running the site — the only local tool producing a combined traditional + AI-search
  health score from the live production site.

- **B. Cross-tenant "businesses like yours" benchmark in the weekly report.** Strelva runs
  6+ tenants across wellness, food, trades, professional on identical schemas. Inserting
  anonymized vertical benchmarks ("Wellness clients average 340 sessions/week — yours is
  180, here's the one change that moved 3 others from that range") creates a retention moat
  no single-tenant tool can offer. No local-business dashboard competitor has productized
  this at this vertical depth.

- **C. Audit-as-acquisition flywheel.** The audit page already drives to
  `/access-request?ref=audit`. Gap: scan results aren't stored per-domain, so Strelva
  can't follow up ("your score dropped") or re-scan prospects. Storing results by domain +
  a lightweight follow-up email converts the audit from a one-shot lead form into a
  low-cost drip channel with zero cold outreach.

*Custom software division.*

- **D. Governed AI workflow agent for non-website processes.** Strelva's three-tier
  governance engine (auto / review / block) is the hardest part of agentic business
  automation to ship safely — and it's production-proven on live client data. The pattern
  applies to any repetitive workflow: intake, job-status, quote follow-ups, scheduling
  confirmations. Discovery → Build → Retainer starts by mapping the highest-volume
  repetitive process, then instantiating the governance framework against it. Rarest
  positioning: a studio already running a governed AI agent in production can make a
  credible proof claim no general n8n/Make reseller can match.

- **E. Cross-client performance intelligence as a paid add-on / report product.** The
  per-tenant store + integrations registry produce data answering questions like "what
  conversion rate do yoga studios in WNY see from Instagram vs Google?" — questions
  individual owners can't answer and market-research firms charge $5–25k for. Latent and
  un-mined. A quarterly vertical benchmark report (sold to trade associations, BIDs,
  Chambers) converts operational overhead into a distribution channel without cold
  outreach.

**Confidence notes:** GEO/AEO market growth is real and sourced (527% YoY AI-referred
sessions, $33.7B GEO market by 2034). Cross-tenant benchmarking ROI figures ($1.1B in one
cited case) are enterprise-scale — discount for SMB context. The audit Phase-2 stubs and
governance engine are confirmed in source code. The "AI Visibility" audit category has no
known direct local-business competitor as of June 2026 research.

**Confirmed code references:**
- Audit engine: `src/lib/audit/checks.ts`, `/api/audit/scan`, docs at `docs/audit-page.md`
- Governance engine: `src/lib/ai-governance.ts` (auto / review / block tiers)
- Integration registry: `src/lib/integration-registry.ts` (Google Search Console +
  Business, Yelp, Instagram, Calendly, Reviews, site activity)
- Versioned contract + signed revalidation: `src/lib/scaffold-contracts.ts`; delivery
  pipeline in `docs/future-codebase-integration.md`
- Weekly brief (per-tenant receipt, no cross-tenant layer yet): `src/lib/weekly-brief.ts`
- Agent executor + tools: `src/lib/agent-executor.ts`
- Site capability manifest: `src/lib/site-capabilities.ts`
- Event store: `src/lib/events.ts`

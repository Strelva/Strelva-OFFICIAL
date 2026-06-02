# Strelva — High-MRR Synthesis (Re-Optimized for Fast Growth)

> The founder reviewed the first synthesis — a focused, low-risk, organic, local Buffalo-trades
> moat that compounds slowly (Combination A) — and judged it **too small**. This document
> re-optimizes for the variables Combination A deliberately traded away: **MRR velocity, growth
> ceiling/TAM, software economics, and leverage from existing assets.** Organic / PLG / free-tool
> distribution is still preferred over cold outbound. But the bespoke / free-site / local /
> services constraints are now relaxed — productized, self-serve, national software shapes are
> in scope.
>
> It re-scores all 20 approaches (the 8 new high-MRR + the original 12) under the new objective,
> clusters them, names the 3-4 strongest high-MRR bets, states the honest pivot each requires,
> shows how the best combine into one fast-growth v1, and ends with a single fastest-path
> recommendation and a leading indicator. It contrasts explicitly with Combination A so the
> founder sees the tradeoff: **ceiling and speed vs. certainty and survivability.**
>
> Opinionated by design. Recommendation at the bottom; reasoning above it.

---

## The honest frame: Strelva today is a services business wearing a SaaS costume

Every research source converges on one fact, and it is the spine of this document:

**Services trade at 1x-3x revenue; SaaS trades at 3x-10x+. That multiple gap is the entire
reason to pivot.** Strelva today is structurally an agency — hand-built per-client repos
(`DEFAULT_DELIVERY_MODEL = "custom_repo"`, confirmed in `scripts/provision-tenant.ts:491`),
free client sites as the acquisition wedge, founder-hour-bound delivery, Buffalo-local focus,
and billing turned off (`isBillingEnabled()` gates on an intentionally-unpinned
`STRIPE_SCAFFOLD_PRICE_ID`, confirmed in `src/lib/subscription.ts:16-17`). That shape does not
compound. Every hour Jacob hand-builds a site is an hour not compounding the software layer, and
every new logo costs founder-hours, so the cost basis stays services even if the pricing says SaaS.

The fastest companies of 2024-2026 share one structural trait, and Strelva has the raw material
for it: **a free output artifact users compulsively share, attached to a broad horizontal TAM,
sold zero-touch self-serve.** Cursor ($0->$1B ARR in ~24 months, zero marketing, 36% freemium
conversion). Lovable ($0->$400M ARR in 14 months, 15 people, no paid ads). Every $400M+ ARR case
is horizontal or national-vertical, never one geography. AI-native companies grow 2-3x faster at
every stage. The audit engine (`src/lib/audit/` — six weighted categories, A-F grading, SSRF-safe,
rate-limited, four Phase-2 AEO stubs already in place) is the highest-leverage existing asset and
is the right PLG-wedge *shape* — but only if onboarding becomes zero-touch and the free **site**
wedge flips to a free **tool** wedge.

**The four automations that flip margins** (named identically across all three research sources)
are the gate every high-MRR approach must pass: (1) zero-touch tenant onboarding, (2) self-serve
content/site activation without a hand-built repo, (3) automated billing + metering, (4) in-product
first-value under 5 minutes. Strelva has none of these live today, and the audit *is* automation #4
already (instant score). The whole game is closing the other three.

---

## The axes that matter now (they changed)

Combination A scored on **TTFR, moat durability, organic distribution, and 2-person team-fit** —
the axes of a studio optimizing for safety. The new objective swaps two of them. The high-MRR axes:

1. **MRR velocity** — how fast to $10k -> $100k -> $1M MRR. Not "first paid dollar" (TTFR), but
   the *slope* of the curve. PLG conversion rate and self-serve activation drive this.
2. **Growth ceiling / TAM** — national+ horizontal or national-vertical, never one metro. This is
   where Combination A is fatally capped (Erie County's ~1,417 trades establishments).
3. **Scalability (software vs. services)** — does the marginal cost of customer N+1 approach an
   API call, or does it cost founder-hours? This is the binding pivot: every approach that keeps
   the hand-built repo on the paid path fails this axis.
4. **Organic distribution** — still required (cold outbound is dead in 2026, per every source),
   but now measured as a *product property* (output virality, free-grader SEO, programmatic pages,
   the "Powered by" badge), not a local-trust amplifier (BNI seats, City of Good Neighbors).
5. **Leverage from existing assets** — how much ships on the audit engine, governed agent,
   `/api/v1` contract, receipt, and cron backbone vs. how much is greenfield. This de-risks speed.

A gate, not an axis: **does it have a genuine "screenshot moment"?** Every fast-grower had an
artifact users compulsively showed others. The binding question for Strelva is never the channel —
it is whether the free output (an AI-visibility grade, an auto-built site preview) makes owners
share. That gate decides whether the loop ignites at all.

---

## Scorecard — all 20 approaches under the new objective

Scored 1 (weak) to 5 (strong). **Pivot cost** = how much of today's bespoke/free/local/services
model must be abandoned (H = total pivot, M = significant, L = minor). Higher pivot cost is *not*
disqualifying under the new objective — it is often the price of the ceiling.

### The 8 new high-MRR approaches

| # | Approach | MRR velocity | Ceiling/TAM | Scalability | Org. distribution | Asset leverage | Pivot cost |
| --- | --- | :---: | :---: | :---: | :---: | :---: | :---: |
| **H1** | AnswerRank — AI-visibility monitor (self-serve) | **5** | **5** | **5** | **5** | **5** | M |
| **H4** | Free-Tool PLG Engine (the scan is the ad) | **5** | **5** | **5** | **5** | **5** | M |
| H6 | The Index — national AI-visibility benchmark | 4 | 5 | 5 | 5 | 4 | M-H |
| H3 | The Governed Operator (agent + safety catch) | 4 | 5 | 4 | 4 | 4 | M-H |
| H5 | Vertical Command — national one-vertical OS (med-spa) | 3 | 4 | 4 | 4 | 4 | H |
| H2 | Workflow Catalog OS — self-serve SMB automations | 3 | 4 | 3 | 4 | 3 | H |
| H8 | Self-Serve site that builds & runs itself (Lovable-shape) | 2 | 5 | 3 | 4 | 4 | **H (max)** |
| H7 | Strelva Rails — "Powered-by" infra layer | 1 | 5 | 5 | 3 | 5 | **H (max)** |

### The original 12, re-scored under the high-MRR objective

Several that Combination A discarded as "premature / low-TTFR" rank materially higher now, because
the new objective *rewards* the high ceilings they were penalized for. Several that ranked high in
Combination A *fall*, because their advantage was local trust and within-vertical density — exactly
what the national-scale objective discards.

| # | Original approach | MRR velocity | Ceiling/TAM | Scalability | Org. distribution | Asset leverage | Verdict shift |
| --- | --- | :---: | :---: | :---: | :---: | :---: | --- |
| 04 | Proof Engine (audit-as-distribution) | 5 | 4 | 4 | 5 | 5 | **Holds — it IS the wedge** (now H4/H1) |
| 08 | Answer-Native Buffalo (AEO wedge) | 4 | 4 | 4 | 5 | 5 | **Rises if de-localized** (now H1) |
| 07 | Storefront Protocol | 1 | 5 | 5 | 3 | 5 | **Rises from "discard" -> H7** (still gated on adoption) |
| 06 | Operator-OS (license studio-in-a-box) | 1 | 4 | 4 | 2 | 4 | Rises slightly; H7 is the better infra bet |
| 12 | WNY Index (data company) | 2 | 5 | 5 | 4 | 4 | **Rises if national -> H6** (Buffalo frame dropped) |
| 09 | Buffalo Index (network) | 2 | 5 | 4 | 4 | 4 | Rises if national -> folds into H6 |
| 02 | Workflow Catalog | 3 | 4 | 3 | 3 | 3 | **Rises if self-serve+national -> H2** |
| 03 | Agent-Native Operations | 2 | 4 | 3 | 3 | 4 | Holds; informs H3's framing, still ahead of demand |
| 11 | Business OS Bundle | 2 | 4 | 3 | 3 | 4 | Falls as a lead bet; survives as expansion up-tier |
| 01 | Trades Monopoly | 3 | **1** | 2 | 4 | 4 | **Falls hardest — the local ceiling IS the problem** |
| 05 | Buffalo Operating System | 2 | 2 | 2 | 4 | 3 | Falls — geo-locked ceiling |
| 10 | Operator School | 1 | 2 | 2 | 3 | 2 | Stays a tactic, not a business |

**The single most important re-score:** Approach 01 (Trades Monopoly) was Combination A's *focusing
lens* — the bet that made everything else true faster. Under the high-MRR objective it scores a **1
on ceiling**, because its core mechanism (within-vertical local density, BNI category-seat
exclusivity, "vs. comparable Buffalo HVAC shops") is *intrinsically* capped at one metro. The thing
that made it the right answer for safety is exactly the thing that disqualifies it for velocity.
That inversion is the whole tradeoff the founder is choosing between.

---

## Clusters

The 20 collapse into five families under the new lens. The first family is the engine; the rest are
what you attach to it or how high you aim.

**Cluster I — The free-tool PLG wedge (the scan is the ad).** H1, H4, H6, plus originals 04 and 08.
All say: a free, instant, shareable AI-visibility grade is simultaneously the product demo, the
lead magnet, the SEO engine, and the referral loop. This is the **engine** — the lowest-CAC,
highest-velocity, best-asset-leverage shape on the board, and it is ~70% built today. H4 is the
pure distribution machine; H1 is the monitoring product it converts into; H6 is the data-network
maximization of the same scan. They are not three companies — they are one wedge at three ambition
levels.

**Cluster II — The governed operator / agent-as-product.** H3, plus originals 03 and 11. The bet
that the *governance engine* (`ai-governance.ts`: auto-publish factual / one-tap approve copy /
block structural) is the rarest asset and should be sold as the product — an AI that runs an SMB's
presence with a safety catch — acting on the owner's *existing* site, not a Strelva-built repo.
The differentiator no pure-monitoring tool has: detect the gap *and fix it*. This is the **depth
layer** that turns a monitor into an operator and lifts ACV.

**Cluster III — National vertical SaaS.** H5, plus the vertical-depth instinct of original 01
re-pointed from "one city, all trades" to "one vertical, all cities." The bet that picking ONE
national vertical (med-spas) makes self-serve onboarding *automatable at all* — one schema, one
integration set, one query set — and produces ACV ($299/mo) and a peer-dense viral graph that
horizontal can't match. The **highest-ACV, most-defensible** shape, at the cost of the hardest
build (a multi-tenant storefront) and a narrower TAM than horizontal.

**Cluster IV — Full self-serve site product (Lovable/Wix-shape).** H8 alone. Automate the *entire*
bespoke engagement — site gets built *and* run, self-serve, horizontal. Largest TAM (~33M US SMBs),
largest engineering lift (multi-tenant rendered storefront + AI site generation), and the only one
that requires abandoning "every paid site is hand-crafted to bespoke quality." The **highest-ceiling
direct-to-SMB** bet and the one most exposed to commoditization from Wix/Framer.

**Cluster V — Infrastructure / rails.** H7, plus original 07. Sell the `/api/v1` contract + signed
revalidation + governed write-layer as usage-priced rails other builders ship on. Richest multiple
(usage-based dev-infra), purest software economics — but **zero current demand signal** (two
consuming repos, both built by Strelva) and the slowest time-to-first-dollar. The **highest-ceiling,
highest-risk** bet, and the one that is not real until a third party builds on it.

---

## The 3-4 strongest high-MRR bets, and why

### 1. H4 / H1 — The free AI-visibility scan as wedge -> self-serve monitor (THE engine, and the recommendation's core)

H4 and H1 are the same motion: H4 is the free-tool distribution engine, H1 is the $39-$199/mo
monitor it converts into. Together they win on **every axis that the new objective added**, and
they win on the one axis Combination A optimized too (asset leverage).

- **MRR velocity (5):** The wedge is the most urgent, most newly-felt question an SMB has in 2026 —
  *"Does ChatGPT recommend me?"* AI Overviews now cover ~48% of Google queries; AI-search traffic
  converts at 14.2% vs 2.8% organic. The category's willingness-to-pay is already proven at scale
  (Peec AI $4M->$10M ARR in 6 months; Profound $96M at a $1B valuation; $200M+ disclosed funding) —
  but **every funded player targets enterprise marketing teams. The $39-$99 self-serve SMB tier is
  nearly unserved** (Otterly's $29 Lite is the closest, and it is a generic prompt-tracker, not a
  fix-it loop). This is a proven-demand category with an open lane Strelva is uniquely positioned
  to take.
- **Ceiling/TAM (5):** National-to-global. ~33M US local businesses; 0.1% at $60/mo = $24M ARR. The
  AI-visibility/website market is $3.2B in 2026 -> $17-31B by 2033-35. No zip code.
- **Scalability (5):** A scan is an API call, not a build. `runAudit()` already fetches, parses,
  scores, caches in Redis, and rate-limits. The only new capability is LLM-prompt sampling against
  ChatGPT/Perplexity — pure API cost, cents per scan. There is **no site to build**, so the four
  margin-flip automations are all reachable; the audit *is* automation #4 already.
- **Organic distribution (5):** The score *is* the ad (HubSpot Website Grader: 4M sites, 40,000+
  backlinks). The OG share card, the "Powered by Strelva" badge (ClickFunnels: ~20% of MRR from a
  badge alone), the programmatic per-business report pages (Zapier model), and the forwardable
  weekly receipt are four reinforcing loops, all on existing or near-existing assets.
- **Asset leverage (5):** The most-extractable approach on the board — it is the Basecamp/Shopify
  "extract the internal tool" pattern. ~70% ships on code that exists: the audit engine, the
  governed agent (becomes the fix-it differentiator), the `/api/v1` contract (becomes the agency
  channel), the receipt + cron (becomes recurring monitoring), the Stripe gate (flip the price ID).

**The structural reason this is recurring, not a one-off report:** the answer drifts. Unlike a
one-time SEO audit, "are you in the AI answer?" changes every time a model retrains, a competitor
publishes, or a prompt phrasing shifts. The thing being measured is *non-stationary* — that is the
mechanical reason the subscription never ends and churn fights itself. **Why it wins:** it is the
only approach that scores 5/5/5/5/5, and it is the lowest-lift path from today's repo to a real
recurring product.

### 2. H3 — The Governed Operator (the depth layer that lifts ACV and is the un-copyable moat)

H3 is not a competitor to H1/H4 — it is the **paid depth** of the same product. The monitor tells
you you're invisible; the governed operator *fixes it* and keeps running. This is the differentiator
every research source independently named as Strelva's: the detect-and-fix flywheel no pure-monitor
(Peec, Profound, Otterly) can replicate without rebuilding the governance engine.

- The governance engine (`ai-governance.ts` — field-level risk classification, auto/review/block)
  is **production-shipped on live data**. It is the rarest asset in the entire "AI agent for SMBs"
  category and the one a vibe-coder structurally cannot speed-run (45% of AI-generated code ships
  with vulnerabilities — the gate is the thing).
- It is what makes "trust the AI with your live site" a real promise instead of a liability. That
  is the moat against both pure-monitors (no fix layer) and horizontal builders (no governance).
- **Why it ranks second, not first:** it requires the one genuinely-new build — zero-touch
  onboarding that lets the agent act on a site the owner *already has* (OAuth GBP + a connection
  snippet/managed page), not a Strelva-built repo. That build is the prerequisite, and it is real
  work. H3 is the up-tier you sell *after* H1/H4 proves the funnel, and the governance-decision
  dataset it accumulates ("did a real owner accept this AI change to a live business?") is the
  compounding asset across thousands of SMBs.

### 3. H6 — The Index (the data-network moat that makes the wedge durable)

H6 is the maximization of the same scan engine into a national, vertical-segmented, longitudinal
benchmark — and it resolves the exact weakness that made the original 09/12 "data company" bets
fail in Combination A. Those were thin at n=6 because they waited to *sign and build sites* to get
data points. **H6 removes that constraint: it scans the open web at national scale, so the
benchmark is dense on day one without signing anyone.** The denominator is free to build, and the
denominator is the moat.

- Every funded competitor benchmarks only their *signed* customers' tracked prompts — their
  "industry average" is thin, paid, and enterprise-skewed. Strelva can scan any of ~33M US
  businesses for free. That asymmetry is the durable moat: a new entrant must scan and re-scan the
  same national universe *over time* to match the distributions and the "your rank dropped" history.
- It is also the PR/GEO flywheel: a public "State of AI Visibility" benchmark ("78% of US plumbers
  are invisible when ChatGPT is asked to recommend one") is statistics-dense, named-methodology
  content that ChatGPT/Perplexity *cite* — making Strelva the default answer to its own category's
  query. Being the cited source is a positioning a competitor cannot copy without the dataset.
- **Why it ranks third:** it requires three net-new builds (a persistent per-domain results store —
  the engine only 1-hour-caches today; LLM prompt-tracking; self-serve billing+metering). It is
  best understood not as a separate bet but as the **data spine that H1/H4 should run from day one**
  so the benchmark is real before the managed count is large.

### 4. H5 — Vertical Command (the highest-ACV, most-defensible shape — the strong contrarian alternative)

H5 is the one strong bet that is *not* a layer of the H1/H4/H3/H6 stack — it is a genuinely
different strategic choice, and it deserves to be named as the leading alternative to the
recommendation. The wager: pick ONE national vertical (med-spas: ~10,000+ US locations, $40k-$120k/mo
revenue, ad-spend-heavy, double-digit growth) and become its operating system at $99-$499/mo.

- **Vertical is the unlock for self-serve onboarding.** Bespoke is unavoidable *across* verticals
  (a law firm and a taco truck share nothing) but *evaporates within* one — ten med-spas need the
  same six page types, the same booking integrations (Boulevard/Vagaro/Mangomint), the same
  `MedicalBusiness` JSON-LD, the same AEO query set. Productizing one vertical is finite and
  shippable; productizing "all local business" (H8) is not.
- **ACV is the whole game:** at $300 ACV you need ~33 customers for $10k MRR; horizontal at $60 ACV
  needs 167. And governance is not a feature in a *medical* vertical — it is the license to operate
  (a generic AI builder cannot let an AI touch copy about a medical procedure; a governed one can).
- A vertical is a self-contained viral graph (same Facebook groups, same conferences — AmSpa, The
  Aesthetic Show, same consultants) where a peer-percentile scorecard ("bottom third of med-spas")
  detonates in a way a generic "local business" tool never could.
- **Why it ranks fourth despite the best ACV and defensibility:** it requires the hardest build
  (a multi-tenant rendered storefront) *up front* before $10k MRR, where H1/H4 reach $10k MRR with
  no storefront at all. It trades velocity for ceiling-quality. It is the **right answer if the
  founder wants one deep, defensible, high-ACV machine over a broad, fast, lower-ACV one.**

---

## What does NOT make the top tier, and why

- **H8 (full self-serve site builder)** — highest TAM, but **lowest MRR velocity (2)** of the
  serious bets because it requires the largest build (multi-tenant storefront + AI site generation)
  before a dollar, *and* it requires abandoning "every paid site is hand-crafted to bespoke
  quality" — directly competing with Wix/Squarespace/Framer/GoDaddy Airo on the commoditizing
  site-*generation* layer. Its real insight (the *running* layer is the differentiator, not the
  *making*) is fully captured by H3 acting on existing sites, without taking on the
  site-generation commoditization fight. **Keep the insight; don't lead with the site builder.**
  The one part of H8 worth pulling forward early: the "here's your site, already fixed" live
  preview as a *demo/wow surface* for the H1/H4 wedge — a screenshot moment monitoring alone lacks.

- **H7 (Strelva Rails / infra)** — richest multiple and purest software economics, but its
  **central demand signal is currently zero** (two consuming repos, both built by Strelva — selling
  infrastructure with one internal implementer is exactly the trap that killed original approach 07:
  a standard with one implementer is a vendor API). Slowest time-to-first-dollar in the set
  (infrastructure needs a consumer before it bills). It is a real **second act** layered on top of
  a proven product, not a first move. Do not market it as a platform until a non-Strelva builder
  ships a paying site on the rails. **Defer; revisit once H1/H4 proves the core.**

- **Original 01 (Trades Monopoly) and 05 (Buffalo OS)** — the heart of Combination A, now capped
  at a 1-2 on ceiling. They are the *safe* answer, not the *fast* one. They survive only as the
  fallback if the PLG loop fails to ignite (see kill signal).

---

## Through-lines shared by the strong high-MRR bets

Five threads run through H1/H4/H3/H6 (and H5). They are the spine of any fast-growth v1.

1. **The AI-visibility scan is the universal front door.** Every strong bet leads with the same
   free, instant, shareable "does ChatGPT recommend you?" grade. It is the wedge in H1, H4, H6, H5
   and the demo in H3 and H8. It rides the audit engine that is ~70% built. This is the
   single highest-leverage move and it ships first under any direction.

2. **The fix-it loop is the moat; the measurement is the commodity.** Pure monitoring is copyable
   in a weekend and crowded at the enterprise tier. The defensible thing — named by every source
   and present in every strong bet — is the **governed agent that closes the gap it detects.**
   Detect-and-fix in one product is a flywheel no monitor can bolt on without building Strelva's
   governance engine.

3. **Billing must turn on and self-serve must turn on.** `isBillingEnabled()` returning false and
   `SELF_SERVE_ENABLED=false` were correct for the free-site era. They are incompatible with every
   high-MRR bet. Pin a real price, wire self-serve Stripe checkout, flip the gate. This is the
   non-negotiable structural change.

4. **The benchmark data is the durable moat — and at national scan-scale it is dense on day one.**
   Combination A's data moat was real but thin (n=6 managed tenants). The high-MRR resolution is to
   *scan the open web*, not wait to sign clients. Run the data flywheel from day one (H6's
   mechanism) so the percentile is honest before the paid count is large.

5. **Distribution is a product property, not a budget line.** Output virality (the share card),
   the "Powered by" badge, programmatic SEO pages, and the forwardable receipt are the four organic
   loops that make CAC trend to zero at national scale. No cold outbound anywhere — the product is
   the funnel.

---

## How the strongest combine into one fast-growth v1

The strong bets are not competing products — they are **layers of one motion**, and they sequence
cleanly because each later layer attaches to a proven earlier one. This is the high-MRR analog of
Combination A, re-pointed national.

### Combination H (recommended) — "AnswerRank: the free AI-visibility scan that becomes the governed monitor that fixes it"

**H4 (free-tool distribution engine) -> H1 (self-serve monitor) -> H3 (governed fix-it operator as
the up-tier) -> H6 (national benchmark data run from day one).**

- **Lead with the free scan (H4).** The homepage *is* the input box: *"Does ChatGPT recommend your
  business? Find out in 30 seconds."* Score shown before the email gate (value-first, the HubSpot
  mechanic). Every result is a public OG-tagged page with a "Powered by Strelva" badge and a "send
  this to your web person" share affordance. This is the engine; it ships on the existing audit page.
- **Convert to the self-serve monitor (H1).** $39 floor (1 brand, 15 tracked prompts, weekly
  re-scan, fix checklist) -> $99 (competitors, more engines, the fix-it agent) -> $199 (white-label
  PDF, API) -> $299-$799 agency/white-label. Usage-metered expansion on prompts/competitors/
  locations targets NRR >=110% — the compound that separates fast trajectories.
- **Up-tier into the governed operator (H3).** The fix-it agent is the paid depth and the moat:
  it generates the schema/FAQ/entity content that moves the score, governed auto/review/block,
  proven climbing in the receipt. This is where Strelva's rarest asset (governance) becomes the
  un-copyable differentiator.
- **Run the benchmark from day one (H6).** Every free scan and paid tenant feeds a national,
  by-vertical, by-geo dataset. Seed it by scanning ~500 public sites in one vertical before any
  customer exists. The "State of AI Visibility" benchmark is the PR/GEO citation magnet and the
  receipt's emotional payload ("dentists in your metro average 62; you're at 41").

This is one coherent company: **the AI-visibility monitor for any business that doesn't just tell
you you're invisible — it fixes it, and proves it climbing every week.** Each layer feeds the next;
each scan (paid or free) sharpens the benchmark; the fix-it loop and the badge make distribution a
product property. It exploits the most-newly-possible capability (AEO + the governance engine) on
the most-extractable existing asset (the audit), and defers the heaviest builds (multi-tenant
storefront, rails) to later acts with a proven base to attach to.

### Combination V (the strong alternative) — "Vertical Command: own one national vertical end-to-end"

**H5 as the spine, with the H4 scan as the vertical-specific wedge and H3's governance as the
medical license-to-operate.** Same scan front door, but narrowed to med-spas, and the *site itself*
becomes part of the paid product (delivered from a multi-tenant storefront, not hand-built). Higher
ACV ($300 vs $60), deeper lock-in, more defensible — at the cost of a harder up-front build and a
narrower TAM. **Choose this if the founder prefers one deep, high-ACV, high-defensibility machine
over a broad, fast, lower-ACV one, and is willing to pay the storefront-build cost before $10k MRR.**

### Why H8 and H7 are sequenced later, not chosen now

H8 (full site builder) and H7 (rails) are the *destinations* of Combination H, not the starting
points. H8 is reachable once the multi-tenant storefront exists (which H5 or a later H-stage builds
anyway) and the brand can stomach non-bespoke quality. H7 is reachable once the contract has a real
external consumer. Leading with either means taking on the largest build or the zero-demand-signal
risk before proving the core. They are act two and act three.

---

## The honest pivot each top bet requires

This is the part the founder must accept. **None of the high-MRR bets are compatible with Strelva's
current shape as-is.** Stated plainly, per the honest-surface rule:

**Shared by all top bets (H1/H4/H3/H6 and H5):**

1. **The free hand-built custom site stops being the acquisition wedge.** It is replaced by the
   free scan/tool. Each hand-built site = Jacob-hours, a hard cap on MRR velocity. The site survives
   only as an **optional premium concierge tier** ("we'll fix/build it for you"), never the growth
   engine. This is the central flip every research source names: free-*site*-as-wedge ->
   free-*tool*-as-wedge.
2. **The bespoke per-client repo leaves the paid activation path.** A paying customer onboards with
   **zero Jacob involvement**: scan -> checkout -> monitoring. `DEFAULT_DELIVERY_MODEL = "custom_repo"`
   and the `/access-request -> "Jacob builds it"` funnel are the old motion. `SELF_SERVE_ENABLED`
   flips on; CLAUDE.md's "do NOT build self-serve auto-provisioning" reverses for the new product.
3. **Local/Buffalo focus is dropped for the growth motion.** National/horizontal from day one.
   Buffalo becomes the first dogfood dataset and a credibility story — *not* the market. The "City
   of Good Neighbors" trust moat does not transfer to a national SaaS, and that is fine, because the
   moat moves to data + the fix-it loop.
4. **Billing turns on now.** Pin a real price (the $39 floor), wire self-serve Stripe checkout, flip
   `isBillingEnabled()` from false-everyone-active to live. The "sites are free, pricing undecided"
   posture must end.
5. **The product identity changes** from "AI websites for local business" / "a Buffalo studio" to
   "AI-visibility monitoring for any business" / "a national product." The dashboard's hero metric
   becomes the **AI Answer Score and its trend**, not site analytics.

**Additional pivot for H3 (the governed operator):** build the one genuinely-new thing — zero-touch
self-serve onboarding that lets the agent act on the owner's *existing* site (OAuth GBP + connection
snippet/managed page), card on file, first governed draft in under 5 minutes. Everything else is
reuse; this is the real engineering lift.

**Additional pivot for H6 (the index):** build a persistent per-domain results store (the engine
only 1-hour-caches today) and LLM prompt-tracking against ChatGPT/Perplexity (the one genuinely-new
capability). Shift identity from "AI website manager" to "AI-visibility data product."

**Additional, heavier pivot for H5 (vertical):** abandon the hand-built repo for a **single
multi-tenant rendered storefront** serving every clinic from `/api/v1` (the largest lift, required
*before* $10k MRR); narrow all schema/templates/query-sets/marketing to ONE vertical (the horizontal
templates become legacy); the *site becomes part of the paid product*, not a free giveaway. If the
founder won't abandon hand-built free sites and the Buffalo frame, **H5 is dead and Combination A is
the right answer** — there is no high-MRR version that keeps the agency delivery model.

What survives unchanged across all of them: the audit engine, the governed agent, the `/api/v1` +
HMAC contract, the data store, the receipt, the cron backbone. **The pivot is in the go-to-market
shape and the delivery model, not the technology** — which is exactly why the fast path is reachable.

---

## Recommendation

**Run Combination H, led by the H4/H1 free-scan-to-monitor motion.**

This is the fastest, lowest-lift, highest-leverage path to meaningful MRR on the board. It scores
5/5/5/5/5, it is the most-extractable approach (the Basecamp pattern — the internal audit tool
becomes the product), and it requires **no storefront build, no site-generation, and no founder
hour per customer** to reach $10k MRR. It rides a category with proven willingness-to-pay (Peec,
Profound, $200M+ funded) into the one open lane those players ignore — the self-serve SMB tier — and
its recurring nature is mechanical (the AI answer drifts, so the monitor never finishes).

**The single fastest path to first meaningful MRR (the next 90 days):**

1. **Wire one "AI Visibility" category into the live `runAudit()`** (`src/lib/audit/checks.ts`).
   Sample 3 intent-matched prompts ("best [category] in [location]") against one LLM API, capture
   whether/how the business is named, score 0-100 in the existing `CategoryResult` shape. The four
   Phase-2 stubs (`stubGBPCompleteness`, `stubNAPConsistency`, `stubReviewPresence`,
   `stubLocalSEOGrid`) already define the slot; rebalance `WEIGHTS` to include it. Cache in the
   existing `reb:audit:` Redis keys; respect the existing 3/day rate limit.
2. **Make every result a public, OG-tagged, shareable page** with a "Powered by Strelva" badge and
   a "send this to your web person" affordance. This is the share surface the audit lacks today and
   the single highest-leverage missing piece for the loop.
3. **Gate email after the score is shown** (value-first), wired to the existing event store.
4. **Then, only after the share-rate clears the kill threshold:** pin the $39 price, wire self-serve
   Stripe checkout, turn on the weekly re-scan cron, and ship the fix-it agent up-tier (H3).
5. **Seed the benchmark from day one:** run the new scan across ~500 public sites in one vertical to
   compute the first real national distribution — proof, dataset seed, and the first "State of AI
   Visibility" PR artifact in one afternoon, zero customers, zero cold outbound.

**The leading indicator to watch (the one number that proves or kills the thesis):**

> **Does a scan arrive from a shared card, not from Strelva?** — i.e., scorecard share-rate and
> scan->email capture. Specifically: after ~1,000 free scans, **share-rate >= ~2% and scan->email
> >= ~15%.** If owners don't share the grade, the loop never ignites and this is an expensive lead
> magnet, not a PLG engine. This is the same pull-not-push test the prior synthesis defined, pointed
> at a national free tool instead of a local receipt.

The second-order indicator, once billing is live: **email->paid conversion >= ~3%** within 90 days
(below that, the grade scares people but the subscription doesn't close — pivot the wedge to the
agency channel, who feel the pain on behalf of clients, before pivoting the product).

---

## Contrast with the prior recommendation (Combination A) — the explicit tradeoff

This is the decision the founder is actually making. Both recommendations are *correct* — for
different objectives.

| | **Combination A (prior)** | **Combination H (this synthesis)** |
| --- | --- | --- |
| Optimizes for | Certainty, durability, survivability | MRR velocity, ceiling, software economics |
| TAM | Erie County (~1,417 trades shops) | National/global (~33M US SMBs) |
| MRR ceiling | Five-figure MRR, structurally capped | $100k -> $1M+ MRR, structurally uncapped |
| Delivery | Hand-built repos (founder-hour-bound) | Self-serve, near-zero marginal cost |
| Distribution moat | Buffalo trust, BNI seats (non-portable) | Data network + fix-it loop + output virality |
| First $ | Faster (warm local audits this week) | Slightly slower (must wire AEO + share surface) |
| Risk profile | **Low** — proven mechanics, real trust | **Higher** — depends on the share loop igniting and billing/self-serve shipping |
| Failure mode | Stays small but real | If the loop doesn't ignite, fall back to A |
| Valuation multiple | 1-3x revenue (services) | 3-10x+ (SaaS) |

**The honest read:** Combination A is the right answer if the founder values a real,
defensible, survivable business over a shot at a big one. Combination H is the right answer if the
founder is willing to accept higher execution risk — and to abandon the bespoke/free/local/services
model — for a national ceiling and SaaS economics. The founder has said A is too small. **Combination
H is the answer to that — and the fallback if H's loop fails to ignite is A, which remains intact and
survivable.** That asymmetry (big upside, known floor to retreat to) is what makes the high-MRR bet
worth taking now rather than later.

The one thing that is *not* a real choice: doing both at full effort with two people. Building
self-serve infrastructure competes with billable bespoke work for the same founder-hours — the
classic services-trap failure mode. **Combination H requires a hard, time-boxed commitment to the
product, with the hand-built concierge tier priced and fenced so it cannot cannibalize the roadmap.**

---

## Redesign / product implications

What the marketing and product surfaces become under the recommendation. The current surface is
"AI websites for local business" — generic, consensus, and structurally services-shaped. The
replacement is a single free tool that becomes a product.

### Marketing surface — "Does ChatGPT recommend your business?"

- **The homepage IS the scan input box** — not a value-prop paragraph, not a template gallery,
  not "request access." First experience: type your URL -> instant A-F AI-visibility grade ->
  the side-by-side of "ChatGPT names these 3 competitors, not you." The score is the hook; the gap
  is the pitch; the share is the distribution.
- **Category language shifts** from "AI website management" to **"AI-visibility monitoring"** /
  **"Be the answer, not just a result."** The site itself must be the most answer-native page in
  its category — it is the proof, and it must win the citation for "how do I show up in AI search."
- **Proof is national benchmark data, not Buffalo logos:** a public **"State of AI Visibility for
  Local Business 2026"** report (fed by the scan data) is the earned-media artifact and the GEO/AEO
  citation magnet.
- **One primary CTA (scan), one honest secondary (start monitoring — the paid tier).** Pricing is
  public and self-serve. The hand-built site, if offered at all, is a clearly-fenced concierge
  upsell ("have us fix it for you") — never the default, never claimed as included.

### Product surface — a self-serve monitor, not a managed-site dashboard

- **Hero metric is the AI Visibility Score and its trend**, with a competitor-overtake alert as the
  emotional payload (a tile owners watch climb).
- **The weekly receipt becomes the forwardable "your AI visibility this week" email** — branded,
  one page, single CTA, carrying the "Powered by Strelva" badge and a "scan your own site" footer
  so every share is top-of-funnel.
- **The governed agent surfaces as the fix-it panel** — "3 fixes will move your score from D to B" —
  with auto/review/block governance shown as *visible, branded UI*, because the guardrail (the AI
  fixes things, safely) is part of what's being bought. Governance is the moat made legible.
- **A live "what AI says about your business today" surface** so the owner *sees* the gap.
- **The agency/white-label tier is its own surface:** a reseller dashboard listing sub-tenant
  scores — the Vendasta multiplier on existing `/api/v1` + HMAC plumbing.
- **The custom-repo "build" flow disappears from the self-serve path entirely** and survives only
  behind an optional, honestly-gated "have us fix it for you" concierge upsell.

The organizing metaphor moves from *"we built and manage your website"* to *"we watch how AI sees
you, and our governed agent fixes it — proven climbing every week."* A product you subscribe to,
not a service you commission.

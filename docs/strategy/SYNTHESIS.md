# Strelva — Cross-Approach Synthesis

> Twelve divergent approaches were written to choose from, not to combine blindly. This
> document plots them on the axes that actually matter for a 2-person Buffalo studio with
> Strelva's specific assets, clusters them, names the strongest bets and why, the
> through-lines the best ones share, the ones to discard, and how the strongest combine
> into one coherent v1. It ends with concrete redesign directions for the top bets.
>
> Read order: this is the **start-here** document. Background in `JTBD.md` and
> `research/_DIGEST.md`. The approaches themselves are in `approaches/`.
>
> Opinionated by design. The recommendation is at the bottom; the reasoning is above it.

---

## The axes that matter

A 2-person organic studio has exactly two scarce inputs — **founder hours** and **trust**.
Every approach is really a bet about how to convert those into durable advantage. Four axes
separate good bets from bad ones here:

1. **Time-to-first-revenue (TTFR).** How fast does this produce a paid dollar or a
   cash-clearing engagement? A 2-person team cannot afford a long pre-revenue platform
   build.
2. **Durability of moat.** Once it works, how hard is it to copy? Data-network and
   referral-density moats compound; feature moats don't.
3. **Organic-distribution strength.** Does the thing *pull* (proof artifacts, AEO content,
   forwardable receipts, BNI seats) or does it require a sales motion the team can't run?
4. **Team-fit for 2 people.** Does it ride existing assets and near-zero marginal cost per
   client, or does it demand platform engineering, multi-tenant isolation, or unscalable
   in-person labor?

A fifth lens — **novelty/asymmetry** — is a gate, not an axis: every approach here was
written to be non-consensus, so the question is whether the asymmetry is *real and
defensible* or merely *positioning*.

### Scorecard (1 = weak, 5 = strong; H/M/L for fit)

| # | Approach | TTFR | Moat | Org. distribution | Team-fit | Asymmetry is… |
| --- | --- | :---: | :---: | :---: | :---: | --- |
| 01 | Trades Monopoly | 4 | 5 | 4 | H | Real (density + within-vertical data) |
| 02 | Workflow Catalog | 4 | 3 | 3 | M | Real (governance bar + scoped offer) |
| 03 | Agent-Native Operations | 3 | 4 | 3 | M | Real but ahead of demand (computer-use) |
| 04 | Proof Engine | 5 | 4 | 5 | H | Real (artifact = distribution) |
| 05 | Buffalo Operating System | 3 | 5 | 4 | M | Real (geo-locked) but broad |
| 06 | Operator-OS | 1 | 4 | 2 | L | Real but premature; wrong buyer now |
| 07 | Storefront Protocol | 1 | 4 | 2 | L | Overclaimed; no consumer of the protocol yet |
| 08 | Answer-Native Buffalo | 4 | 4 | 5 | H | Real (AEO window is open now) |
| 09 | Buffalo Index (network) | 3 | 5 | 4 | M | Real but data-thin at n=6 |
| 10 | Operator School | 2 | 3 | 4 | M | Real but founder-hour-bound |
| 11 | Business OS Bundle | 3 | 5 | 4 | M | Real (whole-funnel data + lock-in) |
| 12 | WNY Index (data asset) | 2 | 5 | 4 | M | Real but "data company" overreaches for 2 people |

These scores are judgment calls grounded in the digest, not measurements. The clustering
below is where the real signal is.

---

## Clusters

The twelve collapse into five families. Several approaches are the *same bet* dressed in
different ambition.

**Cluster I — Proof-as-distribution (the artifact loop).** 04 Proof Engine, 08
Answer-Native Buffalo. Both say: the product output (audit score, receipt, AI-visibility
number) is simultaneously the marketing. Lowest TTFR, strongest pull, best team-fit. These
are the *engine*.

**Cluster II — The benchmark / data-network family.** 09 Buffalo Index, 12 WNY Index, 05
Buffalo Operating System, and the data spine of 01. All bet that cross-tenant local
benchmark data is the durable moat. Strongest moat, but **data-thin at n=6** — the moat is
real but not yet *built*. These are the *long-term moat*, only credible once density exists.
12 over-rotates ("we are a data company"); 09 is the disciplined version of the same idea.

**Cluster III — Vertical depth.** 01 Trades Monopoly. A category of one. It is the only
approach that makes Cluster I (proof) and Cluster II (benchmark) *both true faster*, because
density-within-vertical is the precondition for an honest benchmark and the engine of the
referral graph. This is the **focusing lens** that makes the others work.

**Cluster IV — Governed operations / expansion (Division 2's real shape).** 02 Workflow
Catalog, 03 Agent-Native Operations, 11 Business OS Bundle. All bet the governance engine is
the rare asset and that Division 2 should be *productized and attached to the front-door
relationship*, not sold as bespoke discovery. 11 is the cleanest articulation of how the two
divisions become one offer; 02 is the most honest about delivery economics; 03 is the most
ambitious (and the most ahead of demand).

**Cluster V — Platform / standard / school (the high-ceiling, high-risk bets).** 06
Operator-OS, 07 Storefront Protocol, 10 Operator School. Each tries to sell a layer *above*
the client work — rails to other operators, an open standard, a curriculum. All three are
real ideas with the worst TTFR and team-fit. They are **premature**: they assume a proven
core that doesn't exist yet. 10 (the School) is the salvageable one — as a *channel*, not a
business model.

---

## The 3–4 strongest bets, and why

### 1. The Proof Engine (04) — the strongest standalone bet

It scores highest on the two axes a 2-person studio cannot fake: TTFR and organic
distribution. The entire thesis — *the product and the marketing are the same artifact* —
is the only model where CAC approaches zero while competitors' stays linear. It rides assets
that already exist (`/api/audit/scan`, `weekly-brief.ts`), needs no platform build, and the
first proof step is runnable this week with zero cold outbound (5 warm one-degree audits in
real inboxes). It directly serves the lowest-risk, highest-certainty unmet job — "prove it's
working" — and its kill signals are instrumentable (receipt forward-rate, audit→access-
request conversion). **Why it wins:** for this team, distribution is the binding constraint,
and this is the only approach where distribution is a property of the product, not a separate
cost center.

### 2. Answer-Native Buffalo (08) — the strongest *content* of the engine

08 is not really a separate company from 04 — it's the sharpest single thing the Proof
Engine can score and sell *right now*, because the AEO window is open in 2026 and closing
("51% plan to invest, 20% have started"). "Are you legible to ChatGPT?" is a more urgent,
more closeable, less-commoditized cold-open than a generic SEO audit, and Strelva is uniquely
able to score it *on the live site it operates*. The audit's four Phase-2 stubs map exactly
onto AEO factors — this is a wiring task, not a build. **Why it ranks:** it gives the Proof
Engine a differentiated, defensible, of-the-moment headline number that national audit tools
sell as a separate PDF and can't prove climbing. Risk to respect: the citation-mechanics
claim ("AI cited you N times") must be measurable before it's promised weekly.

### 3. The Trades Monopoly (01) — the strongest *focusing* bet

01 is the approach that makes the moat real fastest. Everything in Cluster II (the benchmark)
is vaporware until density exists; 01 is the only approach whose core *mechanism* produces
density. Within-vertical benchmarks ("vs. comparable Buffalo HVAC shops") are honest only if
you run many Buffalo HVAC shops; the BNI one-seat-per-category rule turns each happy client
into an exclusionary referral lock; and the same GBP/content data powers Noah's site, a voice
add-on, and Jacob's workflow — so per-client expansion gets *cheaper*. Erie County's 1,417
trades establishments at a 35-year construction high is the densest, most underserved, most
word-of-mouth-driven beachhead available. **Why it ranks:** it is the discipline that turns
the engine's pull into a compounding local monopoly instead of scattered logos. It is a lens
on 04/08/09/11, not a competitor to them.

### 4. The Business OS Bundle (11) — the strongest *expansion* bet

11 is how Division 2 stops being a separate, broken services line and becomes the natural,
high-margin expansion of an earned front-door relationship. It is the cleanest answer to "how
do the two divisions become one company": one spine (`/api/v1` + `ai-governance.ts` + the
event store + `weekly-brief.ts`), one receipt reporting on both halves, one renew-or-cancel
decision. The whole-funnel data ("businesses like yours that fixed intake recovered 2.3x more
booking clicks") is a benchmark no single-channel competitor can produce. **Why it ranks
fourth, not first:** its TTFR depends on a per-client workflow build being margin-positive
inside a subscription — an unproven economic claim. It is the *destination*, reached after the
engine proves the front door. It must honor the honest-surface rule rigorously: the
back-office half renders "available after onboarding," never as a blanket feature, until
actually built per client.

---

## Through-lines shared by the best bets

Four threads run through every strong approach. They are the spine of any v1 regardless of
which framing wins.

1. **The receipt is the product.** The weekly plain-English forwardable artifact is the
   churn anchor (43% of SMB churn is first-90-days; TTFV < 7 days cuts churn 50%) *and* the
   referral trigger (referred customers: 16% higher LTV, 4x referral rate). It appears as a
   load-bearing mechanic in 01, 03, 04, 05, 09, 10, 11. It is the cheapest, most certain win
   and should ship first under any direction.

2. **Cross-tenant benchmark data is the moat — but it must be earned, not claimed.** 05, 09,
   11, 12, and 01 all converge on it. The honest constraint: at n=6 the benchmark is thin.
   The resolution is density-within-one-vertical (01) + bootstrapping the *distribution* with
   public audit scans of unsigned sites (12's mitigation) so the percentile is real before
   the managed count is large. The benchmark is the destination of the data flywheel, not the
   day-one headline.

3. **AI legibility (AEO) is the wedge that is uniquely Strelva's right now.** The audit
   already parses JSON-LD; the Phase-2 stubs map onto AEO factors; the delivery pipeline can
   ship every site answer-native by default; and Strelva alone scores it on the production
   site it operates. The window is open in 2026 and narrowing. This is in 01, 04, 07, 08, 12.

4. **Governance is the only honest foundation for Division 2.** The auto/review/block engine
   is production-proven on live data — the rarest asset and the one a vibe-coder structurally
   cannot claim. Whatever Division 2 becomes (02 catalog, 03 operator, 11 bundle), governance
   is what makes "AI runs it, a Buffalo human signs off" a real promise rather than a
   liability. It is also the direct answer to the dominant blocking force (anxiety).

A fifth, softer through-line: **Buffalo is the non-portable amplifier.** Every strong
approach uses the same physics — BNI category seats, the BNP free tier, $150/year corridor
associations, "City of Good Neighbors" trust, earned media (Buffalo Rising / Business First).
This is not a flavor; it is the distribution engine itself, and it is the one thing no
geo-agnostic competitor can copy.

---

## Discard — and exactly why

- **07 Storefront Protocol — discard (as a primary bet).** A standard with one implementer
  is a vendor API. The approach itself names the fatal condition: "if after 90 days no third
  party and no AI engine is observably reading the manifest/MCP server, the standard framing
  is vanity." Today there is no consumer of the protocol — AI engines crawl HTML/schema, they
  don't invoke per-site manifests. This is real *infrastructure* Strelva already owns and
  should keep building under the hood (it's how the bundle and the action-layer compose), but
  selling "a standard" to a Buffalo plumber is a category error. **Keep the plumbing; drop the
  positioning.**

- **06 Operator-OS — discard (premature by 12–18 months).** Worst TTFR and team-fit on the
  board. You cannot license "studio-in-a-box" before the dogfood proves near-zero marginal
  cost, and that proof doesn't exist yet — the approach admits the kill signal is "operator-
  hours-per-client isn't trending toward zero," which is currently *unmeasured*. It also
  shifts the buyer to "operators," a narrower and harder sale, before the underlying product
  is even validated. Right idea, wrong decade for a 2-person pre-proof studio. Revisit only
  after the core book of business is boringly reliable.

- **12 WNY Index (as "we are a data company") — partially discard / fold into 09.** The
  insight (cross-tenant data is the flagship asset) is correct and shared with 09, but the
  framing over-rotates: a 2-person studio declaring itself "the measurement authority for
  Western New York" with n=6 is a credibility check it can't yet cash, and "data company"
  starves the actual revenue (services). 09 is the *disciplined* version of the identical
  idea — benchmark as the retention and referral layer *inside* the product, with public
  benchmarks as a distribution by-product. **Keep 09's mechanism; drop 12's "data company"
  identity.**

- **03 Agent-Native Operations — defer the headline, keep the framing.** "Governed AI
  operator that touches no-API tools via computer-use" is genuinely powerful and genuinely
  ahead of demand — computer-use reliability on real legacy tools is still emerging, and the
  approach's own risk is "the first pilot needs constant human rescue." The *operator framing*
  ("an AI runs it, a Buffalo human signs off") is excellent and should inform positioning; the
  *computer-use headline* should be a prototype against one real client pain, not a launch
  claim. Folds into 11/02 as the expansion's long-term direction.

- **10 Operator School — discard as a business model, keep as a channel.** "Teaching is the
  business" is founder-hour-bound and the kill signal ("two cohorts, good attendance, zero
  converted clients") is a live risk for a team that cannot spare the hours. But a *single
  recurring teaching act* — "How Buffalo customers find you in 2026," the audit live on a
  projector — is one of the best organic distribution moves available and rides the exact same
  assets. **Demote from strategy to tactic.**

- **05 Buffalo Operating System — absorb, don't run standalone.** It's correct and it's the
  broad umbrella the winning combination basically *is* — but as a standalone bet it's too
  diffuse ("own everything for everyone 1–20 in WNY") and lower TTFR than the focused version.
  Its best ideas (geo-locked benchmark, two divisions as one local OS) are fully captured by
  01 + 11 with sharper edges.

---

## How the strongest combine into one coherent v1

The strong approaches are not competing products — they are **stages of one motion**. Three
viable combinations, ranked.

### Combination A (recommended) — "Answer-native trades, proven weekly, expanded into the back office"

**01 (focus) × 04+08 (engine) × 11 (expansion), with 09's benchmark as the compounding layer.**

- **Focus on one Buffalo trade cluster** (HVAC/plumbing/electrical — shared homeowners,
  shared schema, shared BNI rooms). This makes the benchmark honest and the referral graph
  exclusionary fastest. (01)
- **Lead acquisition with the AI-Visibility audit** — the Proof Engine's artifact loop,
  headlined by the answer-native score because that's the open 2026 window and the
  differentiated cold-open. Every audit is a warm, one-degree door-opener that doubles as AEO
  content and a BNI show-and-tell. (04 + 08)
- **Deliver the free answer-native site + the forwardable weekly receipt** as the wedge and
  the renewal anchor. Receipt forward-rate is the leading indicator of the whole flywheel.
  (through-line 1)
- **Compound the within-vertical benchmark** into the receipt as density grows, honestly
  marked "early sample" until a defensible cell exists. (09, through-line 2)
- **Expand the trusting front-door client into the Business OS bundle** — one governed
  back-office workflow (the highest-attach trades workflow), one bill, one receipt reporting
  on both halves. (11)

This is one coherent company: *the answer-native web-and-operations team for Buffalo trades,
that proves it every week.* Each stage feeds the next; each new client sharpens the benchmark
and tightens the referral graph. It exploits the most newly-possible capabilities (AEO + the
governance engine + AI-assisted delivery economics) and defers the not-yet-ready ones
(computer-use, MCP-resale-at-scale, operator licensing) to later stages where they have a
proven base to attach to.

### Combination B — "The benchmark network, fed by proof"

**09 (core) × 04+08 (acquisition) × 01 (the vertical that makes the data dense).** Same
ingredients, but the *brand and hero* is the network/ranking ("see how you compare") rather
than the proof/answer-readiness. Higher ceiling on the data moat, but **bets the headline on
data that's thin at n=6** — more fragile in the first two quarters. Best chosen *after*
Combination A has produced density, by re-centering the dashboard on rank. Treat B as the
v2 of A, not an alternative starting point.

### Combination C — "Productized Division 2 first"

**02 (catalog) × 04 (proof) × governance.** Lead with the Workflow Catalog as named,
fixed-scope products. Honest and closeable, and the cleanest fix for the broken
automation-agency model — but it leads with the division that has *no track record* and a
*longer sales cycle*, and its central economic claim (the second build costs <30% of the
first) is unproven. Better sequenced as the *expansion offer* inside Combination A than as the
front door. Keep the catalog discipline; don't lead with it.

---

## Redesign directions (feeds the coming complete redesign)

What the marketing + product surface should become under the top bets. The current surface is
"AI websites for local business" — generic and consensus. Each direction below is a specific,
opinionated replacement.

### Under Combination A (recommended) — "Be the answer. Proven every week. Buffalo trades."

**Marketing surface.**
- Hero is not a value-prop paragraph and not a template gallery — it is **the audit input
  box**: *"See what AI says about your business."* The first experience is the live
  ChatGPT-answer-vs-answer-native split. The score is the hook; the gap is the pitch.
- Proof is trades-specific and local: real Buffalo HVAC receipts, the AI-Visibility number,
  "we run [N] WNY trades, median booking-click rate is X." A public **"State of Buffalo Trades
  Websites 2026"** benchmark page doubles as the earned-media artifact and the AEO citation
  magnet.
- One primary CTA (audit), one honest secondary ("what comes next once your storefront is
  working" — the back-office bundle, never claimed as already-included).
- Identity reads unmistakably Buffalo and trustworthy — a named local studio that stands
  behind its work, not a geo-agnostic SaaS.

**Product surface.**
- The dashboard's hero metric is the **AI Answer Score and its trend**, with a tile owners
  watch climb. The weekly Reports view becomes the **forwardable receipt** — clean, branded,
  one page, single CTA, with the within-vertical benchmark line as the emotional payload and
  an "audit your own site" footer that makes every share a top-of-funnel referral.
- A live "what AI says about your business today" surface so the owner *sees* what's being
  said.
- Division 2 appears as a **honestly-gated back-office surface**: "coming soon" / disabled
  until that client's governed workflow is actually live, then a back-office line in the same
  receipt ("9 intake forms auto-routed, 0 dropped").
- Governance is *visible, branded UI* — the guardrail is the thing being bought, so the
  customer should see auto/review/block working.

### Under Combination B — "See how you compare. The Western New York benchmark you can't get alone."

**Marketing surface.** Hero shifts from "see what's working" to **"see how you rank."** The
homepage *is* a live, public WNY Local-Business Performance Index — anonymized medians and
distributions by vertical, the headline AI-visibility gap, "scan your site to see your rank"
as the primary CTA. A quarterly co-brandable benchmark report becomes the Chamber/association
distribution artifact.

**Product surface.** The dashboard re-centers on **rank, not raw numbers** — Overview leads
with "your percentile vs. comparable WNY businesses," the receipt's hero line is the benchmark
move ("you went bottom-third → median this month"), a "Businesses Like Yours" panel shows the
median, the top-quartile move, and your rank trend. The organizing metaphor is **membership in
a network**, not a subscription to a tool. *Caveat: only ship this once a vertical is dense
enough to mark a percentile honestly — until then it violates the honest-surface rule.*

### Under Combination C — "A store with shelves, not an agency with a brief."

**Marketing surface.** Reads like a store: a **Websites shelf** (free managed site + receipt,
the wedge) and a **Workflow Catalog shelf** (four named products, each a one-line job, a fixed
"from $X / live in N days," a 30-second demo loom, a "governed by the same AI engine that runs
our managed sites" trust line). The audit is the universal front door — one scan, two
recommendations.

**Product surface.** The dashboard gains a **catalog/inventory model**: each client shows
which workflow products are installed, their governance activity (auto/review/block counts),
and the cross-tenant benchmark for that workflow. "My Site" / "Reports" extend to "My
Workflows" and a workflow line in the receipt. Organizing metaphor: **inventory, not
engagement.**

---

## Recommendation

**Run Combination A.** Focus the whole motion on one Buffalo trade cluster; acquire with the
answer-native audit as a proof artifact (Proof Engine + Answer-Native Buffalo); deliver the
free answer-native site and the forwardable weekly receipt as the wedge and renewal anchor;
compound the within-vertical benchmark into the receipt as density grows (honestly marked
until defensible); and expand each trusting front-door client into the governed Business OS
bundle. Ship the receipt and wire the AI-Visibility audit category first — both are this-week
moves on existing assets with zero cold outbound. Defer the high-ceiling platform bets (07
Storefront Protocol, 06 Operator-OS, 12 "data company") until the core is proven; demote 10
(School) to a recurring distribution tactic; keep 03's "governed operator" framing for
positioning and its computer-use headline as a prototype, not a claim. The single sharpest,
cheapest first test of the entire thesis is whether one real Buffalo trades owner forwards
their receipt or runs the audit because a peer told them to — that one event proves the loop
closes.

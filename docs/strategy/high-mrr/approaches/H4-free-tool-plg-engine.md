# H4 — The Free-Tool PLG Engine (the scan is the ad)

**One-liner**
A free, no-signup "How does AI see your business?" scanner that grades any URL A–F, hands back a screenshot-worthy scorecard with a `Powered by Strelva` OG card, gates email after the score is shown, and self-serve-upgrades to a $39–$99/mo AI-visibility monitor — so every scan markets the next one and CAC trends to zero at national scale.

> This is the **fast-MRR re-optimization**, deliberately opposed to the prior `SYNTHESIS.md` recommendation (Combination A: Buffalo trades, free hand-built sites, slow local compounding). That plan was correct for a 2-person studio optimizing for *safety and durability*. It is structurally incapable of $100k+ MRR because every paid dollar is gated on a Jacob-built repo. This approach optimizes the other variable the founder now wants: **velocity and ceiling**. Where the two conflict, this document chooses scale.

---

## The bet (high-MRR thesis) — why this can grow FAST and BIG, not slow and local.

The single fastest-growing software shape of 2024–2026 is a horizontally-deployable AI tool whose **output is the distribution** and whose **wedge is a free grader**. The digest is unambiguous: Cursor ($0→$1B ARR in ~24 months, zero marketing spend, 36% freemium conversion vs. 2–5% median), Lovable ($0→$400M ARR in 14 months, 15 people, no paid ads). The common trait is not the model — it is a **"screenshot moment"**: an artifact users compulsively show other users. HubSpot's Website Grader graded 4M sites, generated 40,000+ organic backlinks, and became their most effective lead-gen channel. ClickFunnels attributed ~$1M/month MRR (~20% of total) to a single `Powered by` badge.

Strelva already owns ~70% of the engine for exactly this shape. The audit (`src/lib/audit/`) parses JSON-LD, scores any URL across six categories, emits an A–F grade, is SSRF-safe, and rate-limits — it just doesn't yet *carry a viral loop or charge anyone*. The bet is to convert that one-shot lead-gen page into a **compounding PLG flywheel** by adding the one category the market is paying for right now and the audit doesn't yet score: **AI-search visibility / AEO** — "does ChatGPT/Perplexity/Google AI Mode mention you when someone asks for a business like yours?"

Why this grows fast and big rather than slow and local:

1. **The wedge rides a category in acute demand, validated by funding, not vibes.** Peec AI: $4M→$10M ARR in six months, $100M+ valuation (Nov 2025). Profound: $96M raised at a $1B valuation (Feb 2026) on ~$6.8M ARR. Bluefish: $43M Series B (Apr 2026). $200M+ in disclosed category funding. AI Overviews now cover ~48% of Google queries (up from 34% in Dec 2025); AI search traffic converts at 14.2% vs 2.8% for Google organic. Every one of those funded players targets **marketing teams at mid-market/enterprise brands** (Peec's customers include Wix, Ramp, DocuSign). The **SMB tier is nearly unserved** — no credible $39–$99/mo self-serve product purpose-built for the plumber, yoga studio, or restaurant asking "does ChatGPT recommend me?" Otterly's $29 Lite is the closest, and it isn't built for them. That is a national, open lane under a category that already has proven willingness-to-pay above it.

2. **The TAM is national-to-global, not one county.** US local businesses with a web presence ≈ 33M. At 0.1% penetration × $60/mo = **$24M ARR**. The AI website/visibility market is $3.2B in 2026 → $17–31B by 2033–2035 at 20–26% CAGR; SMBs are 63% of demand. The prior plan's TAM was Erie County's 1,417 trades establishments. This one is every business with a URL in any English-speaking market.

3. **The output is inherently shareable, which makes growth a product property, not a budget line.** A scary letter grade + a one-line gap ("ChatGPT names 3 competitors and not you") is a pride/shame hook that owners screenshot, forward to their web person, and post. Each share is a free impression on the *next* prospect — the HubSpot/ClickFunnels mechanic, applied to the most urgent question SMBs have in 2026.

The honest read from the digest is the spine of this whole document: *Strelva today is structurally an agency; that shape does not compound. The audit engine is the right PLG wedge — but only if onboarding becomes zero-touch and the free-**site** wedge flips to a free-**tool** wedge.* This approach is that flip, made concrete.

---

## MRR mechanics — pricing model, ACV, who pays, expansion revenue, and a realistic ramp.

**Pricing model: usage-gated freemium → flat floor + usage expansion.** Usage-based SaaS delivers 10% higher NRR and 22% lower churn than flat-rate (digest); companies with NRR ≥100% grow 2x faster YoY. So the model is a **flat monthly floor that captures the recurring relationship, with metered expansion on the dimension that scales with the customer's own ambition** (tracked prompts, competitors monitored, locations, brands).

| Tier | Price | Who it's for | Gate |
|---|---|---|---|
| **Free scan** | $0, no signup | Anyone with a URL | 3 scans/day/IP (already enforced). Score shown *before* email; email gates the full report + re-scan + tracking. |
| **Monitor** (entry) | **$39/mo** | A single local SMB watching its own AI visibility | 1 business, ~15 tracked intent prompts, weekly re-scan, fix recommendations, the forwardable receipt. |
| **Monitor Pro** | **$99/mo** | SMB that takes it seriously / multi-location | ~50 prompts, 3 competitors tracked, daily checks, the governed AI agent *applies* fixes (the flywheel no pure-monitor has). |
| **Agency / white-label** | **$299–$799/mo** | Freelancers, agencies, franchise groups | Manage N sub-tenants under their brand; $20–$50/mo per managed sub-tenant. Anchored to Duda ($199) and Vendasta's agency range. |

**ACV.** Direct SMB blended ACV ≈ **$60/mo → ~$720/yr**. Agency ACV ≈ **$300–$800/mo → $3.6k–$9.6k/yr**, each agency dragging 20–100 sub-tenants. The agency tier is the ACV multiplier; the direct tier is the volume and the proof.

**Who pays.** The business owner who just saw a D grade and "ChatGPT doesn't mention you" pays $39–$99 to stop that being true and to watch it climb. The agency pays $299–$799 because the free scan is the best client-prospecting tool they have and white-labeling it is cheaper than building it.

**Expansion revenue (the compounding engine).** (a) Free→paid on usage limits, not features — the Cursor/Lovable mechanic that converts at 3–10x flat-rate. (b) $39→$99 as owners add competitors/locations and want the agent to *fix*, not just *report*. (c) Net-new sub-tenants inside every agency account (land-one-expand-to-dozens — the Vendasta motion: 66,000 partners → 8.2M SMBs). (d) Eventually attach the existing governed **Business OS dashboard** (weekly receipt + content agent) as the up-tier — monitoring is the wedge, the dashboard is the depth.

**Realistic ramp:**

- **$10k MRR** (≈ 170 SMBs at $60, or a mix with ~20 agencies). *Requires:* the AEO category wired into the live audit; the shareable scorecard + OG card + email gate shipped; self-serve Stripe checkout (no Jacob step); a working weekly re-scan. This is a **3–6 month** milestone *with distribution behind it* (per digest's free-grader timeline), and it is reachable on existing infra — the audit is already 70% built. AI-native sub-$1M ARR companies grow at ~100% median vs 75% traditional; AI-native startups are 3x more likely to hit $1M ARR within 6 months.
- **$100k MRR** (≈ 1,000–1,500 paying SMBs + 50–150 agencies). *Requires:* the growth loop actually compounding (share-rate × scan→signup × signup→paid sustained), programmatic SEO pages indexing and ranking, the agency channel live as a 10–100x reach multiplier, and **near-zero founder hours per new customer** — i.e., the hand-built-site dependency fully removed from the paid path. This is the milestone the prior plan **structurally cannot reach**, because there it = ~1,500 Jacob-built repos.
- **$1M MRR** (≈ a national base across both tiers, NRR ≥100% so the base expands faster than it churns). *Requires:* expansion revenue dominating new-logo revenue (agency sub-tenant growth + tier upgrades + Business OS attach), defensible benchmark data ("the average local business scores 41/100 on AI visibility") feeding both the product and a GEO/earned-media moat, and a lean team at $1M–$2M ARR per FTE — which is only possible because the cost basis is software, not service.

---

## Growth loop — the organic/PLG/viral engine (each user brings the next).

The loop, end to end, with no cold outbound and no sales team:

```
 someone sees a Strelva scorecard (shared screenshot / OG card / programmatic page / agency demo)
        │
        ▼
 runs a free scan of their own URL  ──►  gets an A–F grade + "ChatGPT names 3 competitors, not you"
        │  (score shown BEFORE the gate — value first, the HubSpot Grader mechanic)
        ▼
 email gate to unlock full report + weekly re-scan  ──►  qualified lead captured
        │
        ▼
 self-serve upgrade to $39–$99/mo Monitor  ──►  paying customer, zero founder hours
        │
        ▼
 every weekly receipt + every scorecard carries "Powered by Strelva — scan your site"
        │   (ClickFunnels badge = ~20% of MRR; every artifact is an impression on a non-user)
        └────────────────────────────────────────────────────────────────────────────►  back to top
```

Four reinforcing sub-loops, all riding existing or near-existing assets:

1. **Output virality (the core).** The scorecard and the weekly receipt are the artifacts users share. Today the audit result is one-directional and ephemeral. The change: render every result as a **public, OG-tagged, branded page** (`strelva.com/report/[slug]`) with a screenshot-ready card and a dual-incentive share ("send this to your web person"). Every share is a top-of-funnel event at zero marginal cost.
2. **The badge.** `Powered by Strelva — see how AI sees your business` on every scorecard and every weekly email. Each report sent is an inbox impression on the *owner*; each forward is an impression on a *new* owner. This is the ClickFunnels/ChiliPiper line-item that becomes 15–20% of MRR on its own.
3. **Programmatic product-led SEO (the compounding long-tail).** Auto-generate a public `[Business Name] AI-Visibility Report` page for indexed local businesses using the data Strelva already pulls (Google/Yelp). Zapier built millions of organic visits this way. These pages capture "[business] website review" / "[city] [trade] AI visibility" queries nationally and — because they're statistics-dense and structured — get **cited by ChatGPT/Perplexity** (GEO/AEO), which is the very thing the product measures. The tool's own category is its distribution channel.
4. **Agency-as-amplifier (the multiplier).** Freelancers/agencies adopt the free scan for client prospecting, then white-label it. One agency = dozens of SMBs entering the funnel. This is the bottom-up-smuggling → reseller path the repo already names as a future option, pulled forward because the API contract is already shaped for it.

**Time-to-traction (honest, from digest):** PLG virality *if the wow moment is real* can move in weeks (Lovable hit traction in ~4); free-grader SEO compounds over **6–18 months**; programmatic pages start ranking in **3–6 months**. Email lead-gen starts **immediately**. So: paid conversions can begin in weeks; the *compounding* organic flywheel is a 6–18 month build. The binding question is not the channel — it is whether the scorecard has a genuine screenshot moment. The AEO grade ("ChatGPT doesn't recommend you") is the most likely candidate Strelva can ship.

---

## Why it scales (software economics) — where marginal cost approaches zero.

Marginal cost per new customer must approach the cost of an API call, not an hour of Jacob's time. The four automations the digest names as the services→software flip, mapped to what exists vs. what must be built:

| Automation | Status today | What's required |
|---|---|---|
| **1. Zero-touch onboarding** | Partial — tenant provisioning exists but assumes a hand-built repo | Sign up → pick the business → first scan, **no human step**. Decouple "paid monitor account" from "custom repo." |
| **2. Self-serve activation / first value < 5 min** | The scan itself is already instant, no-signup | The scan *is* the activation moment. First value is the grade. This is already true — the gap is converting it, not creating it. |
| **3. Automated billing + metering** | Stripe wired but billing gated off (`isBillingEnabled()` false) | Turn billing on for the monitor tiers; meter on tracked prompts/competitors. |
| **4. In-product depth that's automated, not bespoke** | The governed AI agent already exists and runs on live data | The agent *applies* the fixes it recommends (governance decides auto/review/block). The "fix" is software, not a Jacob task. |

Where marginal cost is ~zero: a scan is one HTML fetch + one PageSpeed call + N LLM prompt-checks. Monitoring is a cron re-running that. The scorecard, OG card, badge, and programmatic pages are static/edge-rendered. The model cost per tracked prompt is cents and bounded by tier limits — keeping AI cost well under the ~20% of revenue gate. **Nothing on the paid path requires a founder hour once onboarding is decoupled from repo-building.** That decoupling is the entire game: it is what converts the cost basis from 30–50% services margin to 70–80%+ software margin, and it is what makes $1M–$2M ARR/FTE possible.

---

## Leverage from Strelva assets — which existing assets this rides.

This approach is unusually well-matched to what's already in the repo — it is mostly *wiring and exposure*, not greenfield:

- **The audit engine (`src/lib/audit/checks.ts`, `scoring.ts`, `types.ts`).** Already does A–F grading, JSON-LD/schema parsing, six weighted categories, SSRF protection (`validateUrlSafety`, `isPrivateIP`), and graceful degradation. This *is* the free-tool wedge. The four **Phase-2 stubs** (`stubGBPCompleteness`, `stubNAPConsistency`, `stubReviewPresence`, `stubLocalSEOGrid`) are pre-built insertion points; the AEO category is a fifth check of the same shape.
- **The scan route + rate limiting (`src/app/api/audit/scan/route.ts`).** Per-IP rate limit (`reb:audit-ratelimit:{ip}`, 3/day) and Sentry instrumentation already exist — the abuse/cost guard for a public national tool is done.
- **The audit store (`src/lib/storage/audit-store.ts`).** `logAuditEvent` / `getAuditLog` already persist scans — the substrate for benchmark data ("average local business scores 41/100") and for the programmatic report pages.
- **The AI agent + governance (`src/lib/agent-executor.ts`, `src/lib/ai-governance.ts`).** Gemini-backed, with auto-approve/review/block governance on live data. This is the differentiator no pure-monitoring competitor (Peec, Profound, Otterly) has: Strelva can **detect the AI-visibility gap and fix it** without the owner doing anything. It is also the up-tier from monitor → managed.
- **`/api/v1` versioned contract + HMAC signed revalidation (`src/lib/scaffold-contracts.ts`, `revalidate-client.ts`).** Already the right shape for the **white-label agency channel** — multi-tenant, versioned, signed. The agency tier is an exposure of plumbing that exists.
- **Integrations + connections (`src/lib/connections.ts`, `integration-registry.ts`).** Google/Yelp/Instagram/Search Console access — the data source for the programmatic `[Business Name] Report` pages and for richer AEO scoring.
- **The weekly receipt (`src/lib/weekly-brief.ts`, `reports.ts`).** Already the forwardable-artifact engine. Repointed at the AI-visibility number, it becomes the badge-carrying, share-driving retention loop.

The only genuinely *new* surface is the share/distribution layer: public OG-tagged scorecard pages, the email gate, the badge, and the LLM-prompt-tracking check. Everything else is repointing assets that already exist.

---

## The pivot required — HONEST: what must change or be abandoned.

This is the part the founder must accept for any of the above to be true. None of it is compatible with Strelva's current shape as-is.

1. **The free hand-built custom site stops being the acquisition wedge.** It is replaced by the **free tool**. The site can survive only as a **premium concierge tier** ("we'll build and run it for you"), explicitly *not* the growth engine. Reason: each free site = Jacob-hours, which hard-caps MRR velocity at build capacity. This is the single most important change and the digest is blunt about it: *free-site-as-wedge must flip to free-tool-as-wedge.*
2. **The bespoke per-client repo is removed from the paid path.** A paying monitor customer must activate with **zero Jacob involvement**. Hand-built repos continue only for concierge clients. The `DEFAULT_DELIVERY_MODEL = "custom_repo"` assumption and the `/access-request` → "Jacob builds it" funnel are the *old* motion; the new motion is self-serve checkout.
3. **The local / Buffalo constraint is dropped.** This is national from day one. BNI seats, corridor associations, "City of Good Neighbors" trust — the prior plan's entire distribution engine — do **not** apply and are not the moat here. The moat must come from data + the loop + the fix-it agent, not geography.
4. **Billing turns on.** `isBillingEnabled()` returning false (subscription gating short-circuited while billing is off) was correct for the free-site era. For this approach, **the monitor tiers must charge from launch** — the entire thesis is recurring software revenue, and a usage-gated freemium with no paid tier is just a lead magnet.
5. **The product identity changes from "AI websites for local business" to "AI-visibility monitoring for any business."** The dashboard's hero metric becomes the **AI Answer Score and its trend**, not site analytics. The company stops describing itself as a studio and starts describing itself as a product.
6. **CLAUDE.md's "Do NOT build self-serve auto-provisioning" and `SELF_SERVE_ENABLED=false` are reversed for the monitor product.** Self-serve is now the point, not the anti-pattern. (The custom-repo concierge tier keeps its hand-built discipline; the monitor tier must not.)

What is *kept*: the governed AI agent (the real differentiator), the audit engine, the `/api/v1` contract, the event/data store, the weekly receipt. The monetized layer (dashboard + report + agent) survives intact; only the **delivery and acquisition model** is abandoned.

If the founder is unwilling to drop the free hand-built site as the wedge and turn billing on, this approach cannot work and the honest recommendation is to stay with Combination A and accept the lower ceiling.

---

## Moat — what compounds and resists copying at scale.

The free-grader category is crowded at the top (Peec, Profound, Bluefish, Otterly, Hall) and a public scanner is copyable in a weekend. So the moat is **not** the tool. Four things compound and resist copying:

1. **Benchmark data on AI-visibility for SMBs at national scale.** Every scan (free and paid) feeds the store. After tens of thousands of scans, Strelva can say "the average local restaurant scores 38/100; you're in the bottom quartile" — a number no new entrant has and no enterprise-focused incumbent collects, because they don't scan SMBs for free. This data also powers GEO content that gets cited by the LLMs the product measures, compounding domain authority (the HubSpot backlink cascade).
2. **The detect-and-fix flywheel.** Pure monitors *report* a gap and leave the owner to fix it. Strelva's governed agent *closes* it — auto-approve factual fixes, review copy, block structural. "It found the problem and fixed it while I slept" is a retention and word-of-mouth mechanic monitoring-only tools structurally cannot match without building a governed agent + content pipeline, which is years of the work Strelva already did.
3. **The output-virality + badge loop itself.** Once the scorecard and `Powered by` badge are seeded across thousands of shared artifacts and indexed programmatic pages, the organic top-of-funnel is a compounding asset (40,000+ backlinks in the HubSpot case). A copycat starts that flywheel at zero.
4. **The agency channel's switching cost.** An agency that white-labels Strelva and onboards 50 sub-tenants under its brand has a real migration cost to leave (Vendasta's durability).

Honest read: the moat is **moderate, not absolute**, and it is *earned over months*, not owned on day one. The defensible position is the **SMB-local AEO niche that the funded enterprise players are not serving**, deepened by the data and the fix-it agent. The risk is commoditization from Wix/Squarespace/Framer or a well-funded monitor moving down-market — so speed to seed the loop matters more than feature breadth.

---

## Risks & kill signal.

- **No screenshot moment.** If the AEO scorecard doesn't make owners share — if share-rate stays near zero — the loop never ignites and this becomes an expensive lead magnet. *This is the make-or-break risk; everything else is secondary.*
- **AEO scoring is hard to make truthful.** "ChatGPT cited you" must be *measurable* before it's promised weekly (the prior synthesis flags this exact risk). LLM outputs are nondeterministic; a flaky or gameable score destroys trust. The score must be defensible methodology, not theater.
- **Category crowding / commoditization.** $200M+ has flowed into AI-visibility tooling. A funded incumbent moving down to $29–$49 SMB self-serve, or Wix/Squarespace bundling a free AEO grade, compresses the lane. The SMB-local niche + fix-it agent is the hedge; speed is the other.
- **Margin leak from model cost.** Uncapped prompt-tracking on heavy users can blow past the ~20% cost gate. Metering and tier limits must be enforced from day one.
- **Founder identity drag.** The team is wired as a services studio; the gravitational pull back toward "just build them a site" will compete with the product for Jacob's hours (the classic services-trap failure mode). The free-site concierge tier must be priced and fenced so it doesn't cannibalize product focus.

**Kill signals (instrument from launch):**
- After 1,000+ free scans, **scorecard share-rate < ~2%** *and* **scan→email < ~15%** → the artifact has no viral pull; the core thesis is dead, revert to a lead-magnet framing or back to Combination A.
- After ~90 days of live billing, **email→paid conversion < ~3%** (well under freemium-with-real-value benchmarks) → the AEO score isn't creating enough problem-awareness to justify the subscription; re-examine pricing or the wedge.
- **AEO score can't be made deterministic/defensible** in testing → don't ship the weekly-citation promise; fall back to the structural site grade as the headline and treat AEO as directional.

---

## First move this week — a concrete, self-serve-leaning step on existing assets.

**Wire one AEO category into the live audit and ship a public, shareable scorecard — no new product, no billing yet, no Jacob step.** Concretely, in priority order:

1. **Add an `checkAIVisibility` category to `src/lib/audit/checks.ts`**, same shape as the existing six and the Phase-2 stubs. v0 can be deterministic and honest without LLM nondeterminism: score JSON-LD completeness, entity clarity, FAQ/answer-structured content, NAP/schema legibility — the structural prerequisites for being cited. Add a non-zero weight (rebalance `WEIGHTS` to sum to 1.0) and push the result in `runAudit()`. This rides the documented "adding a new category" path exactly.
2. **Render every scan result as a public OG-tagged page** at `strelva.com/report/[slug]`, persisted via the existing `audit-store` (`logAuditEvent` already writes; add a readable slug + `generateMetadata` with an OG card showing the A–F grade). This is the share surface the audit currently lacks — the single highest-leverage missing piece for the loop.
3. **Add a `Powered by Strelva — see how AI sees your business` badge** to the scorecard and a "send this to your web person" share affordance. Zero cost, compounding impressions.
4. **Move the email gate to *after* the grade is shown** (value-first, HubSpot mechanic) to capture qualified leads without killing the wow moment.

This is all on existing assets, ships without turning billing on, and produces the **one measurement that proves or kills the thesis**: do real owners share the scorecard and re-scan because a peer sent it? That single event — a scan that arrives from a shared card, not from Strelva — is the proof the loop closes, exactly as the prior synthesis defined the test, but pointed at a national free tool instead of a local receipt. Only after share-rate clears the kill threshold do you wire Stripe, the weekly re-scan, and the monitor tiers.

---

## Redesign implication — what the product + marketing surface becomes.

**Marketing surface.** The homepage *is the scanner*. Not a value-prop paragraph, not a template gallery, not "AI websites for local business" — a single input box: **"See how AI sees your business."** The first experience is: type your URL → get an A–F grade → see "ChatGPT names these 3 competitors, not you." The score is the hook, the gap is the pitch, the share is the distribution. A public **"State of AI Visibility for Local Business 2026"** benchmark page (fed by the scan data) is the earned-media artifact and the AEO citation magnet. Identity shifts from *a Buffalo studio that builds you a site* to *a national product that scores and fixes your AI visibility*. One primary CTA (scan); one honest secondary (the monitor subscription, and — clearly fenced — concierge "build it for me").

**Product surface.** The dashboard's hero metric is the **AI Answer Score and its trend** — a tile owners watch climb. The weekly Reports view is the **forwardable receipt**, branded, one page, single CTA, carrying the `Powered by` badge and a "scan your own site" footer so every share is top-of-funnel. A live "what AI says about your business today" surface lets the owner *see* the gap. Governance is **visible, branded UI** — auto/review/block shown working, because the guardrail (the AI fixes things, safely) is part of what's being bought. The hand-built site, where it exists at all, appears as an honestly-gated concierge surface, never as a default feature. The organizing metaphor moves from *"we built and manage your website"* to *"we watch how AI sees you, and our governed agent fixes it"* — a product you subscribe to, not a service you commission.

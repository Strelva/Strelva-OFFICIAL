# H7 — Strelva Rails: the "Powered-by" Infrastructure Layer for AI-Run Local Sites

**One-liner**
Stop being the studio that builds sites and become the **rails other builders ship on**: expose Strelva's versioned `/api/v1` content contract, signed revalidation pipeline, capability manifest, and governed write-layer as a usage-based API + SDK that any developer, agency, or AI site-builder embeds — so Strelva earns near-zero-marginal-cost MRR on every site *they* build, and a `Powered by Strelva` impression on every one.

> This is the **fast-MRR re-optimization**, and it is the highest-ceiling, highest-risk shape in the set. It is deliberately opposed to `SYNTHESIS.md` (Combination A: Buffalo trades, free hand-built sites, slow local compounding) and it goes one layer deeper than its sibling H4. H4 sells a *product* to end-SMBs (the free scan → $39–$99 monitor). **H7 sells the rails under the product to the people who build for SMBs.** Where the prior synthesis chose safety and the prior approach (07 Storefront Protocol) was correctly killed as premature, this document chooses scale — and is honest that it requires the hardest pivot and an adoption signal Strelva does not yet have.

---

## The bet (high-MRR thesis) — why this can grow FAST and BIG, not slow and local.

The consensus play is to be the best *vendor* — the best managed site, the best dashboard. The non-consensus, higher-ceiling wager is to be **the layer every vendor's product is expressed in**. Strelva already runs, in production, the three hardest pieces of an infrastructure product for AI-managed local sites:

1. a **versioned content contract** (`/api/v1/content`, `/api/v1/page-config`, `/api/v1/site-capabilities`) that is already the canonical wire shape two live client repos (GLDF, Rohlax) consume;
2. a **signed delivery pipeline** — HMAC `x-reb-signature` / `x-reb-timestamp` revalidation (`src/lib/scaffold-contracts.ts`, `src/lib/revalidate-client.ts`) with failure tracking and reconciliation; and
3. a **governed write-layer** (`src/lib/ai-governance.ts`: auto-publish factual / review copy / block structural) plus a **machine-readable capability manifest** (`src/lib/site-capabilities.ts`) whose `allowedActions: ["read","draft","publish","request_custom"]` is already a tool-declaration schema.

The bet: package those as **Strelva Rails** — a hosted API, an SDK, and a `create-strelva-site` starter (the `custom-repo-starter/` scaffold already exists) — and sell *consumption* of them to the builders who are currently the fastest-growing buyers in software: the people and AI tools shipping local-business sites at volume.

Why this grows fast and big, not slow and local:

- **The buyer is a multiplier, not a single SMB.** One agency or AI-builder integrating Strelva Rails brings 20–200 sites under the contract — the Vendasta physics (66,000 agency partners → 8.2M SMBs; $92.9M ARR, $800M valuation) but at the *infrastructure* layer rather than the white-label-app layer. The unit of growth is an integration, and each integration self-expands as its own customer base grows.
- **It rides the single hottest distribution surface of 2026.** AI app/site builders (Lovable: $0→$400M ARR in 14 months; Framer ~$50M ARR profitably; the AI-website market $3.2B in 2026 → $17–31B by 2033–2035 at 20–26% CAGR) are generating sites faster than any of them can give those sites a *governed content + AI-management backend*. They build the front end; almost none of them have a safe, versioned, agent-writable content + revalidation layer underneath. Strelva does. That is the "extract the internal tool" pattern (Basecamp, Shopify, Stripe-as-internal-billing): the rails Strelva built to run its own client sites are the product.
- **Infrastructure trades at the top of the multiple gap.** Services exit at 1x–3x revenue; SaaS at 3x–10x; usage-based developer infrastructure (Stripe, Twilio, Vercel, Resend) is the richest and most defensible shape of all because revenue *compounds with the customer's own growth* — NRR structurally above 100%, and companies with NRR ≥100% grow 2x faster YoY (digest). Resend went 0→400K users by being the default the docs and the agents pick; that is the exact motion available here.
- **The TAM is "every builder of local sites," nationally and then globally** — not Erie County's 1,417 trades shops. The wire contract has no zip code.

The honest spine, stated up front: **this is the only approach in the set whose core demand signal is currently zero.** Two consuming repos exist, and Strelva builds both. There is no third-party building against the contract yet. Section "The pivot required" and "Risks & kill signal" treat that as the central fact, not a footnote.

---

## MRR mechanics — pricing model, ACV, who pays, expansion revenue, and a realistic ramp.

**Pricing model: usage-based with a platform floor — the Stripe/Twilio/Vercel shape, not flat SaaS.** This is the model the digest names as the richest (10% higher NRR, 22% lower churn than flat-rate; expansion that tracks the customer's own success). Three meters, one floor:

| Plan | Floor | Metered on | Who it's for |
|---|---|---|---|
| **Free / Hobby** | $0 | Up to ~3 sites, contract reads, `Powered by Strelva` badge **required** | Solo devs, indie builders, anyone trying the SDK. The badge is the price. |
| **Pro (builder)** | **$49/mo** | Per **managed site** beyond included (~$5–$12/site/mo) + governed AI writes ($/1k) + revalidation calls (after a generous free block) | Freelancers and small shops running client sites on the rails. Badge optional. |
| **Agency / platform** | **$299–$799/mo** | Volume-tiered per-site ($3–$8/site at scale) + write/revalidation overage; white-label (no badge) | Agencies, franchise groups, and SMB-SaaS platforms embedding the rails under their own brand. |
| **Embed / OEM** | **negotiated, usage-priced** | Per-site + per-governed-write, revenue-share or wholesale | AI site-builders (Lovable/Framer-class) that want a governed content+management backend without building one. |

Pricing anchors from the digest and adjacent infra: Duda white-label $199/mo; Vendasta agency tier in the $299–$799 range; Semrush AI-visibility add-on $99/mo; usage-based developer infra (Resend/Twilio/Vercel) bills a small floor + consumption. Strelva Rails sits as **infrastructure priced under all of them** — you pay per site you ship and per AI write you run, the way you pay Stripe per charge.

**ACV.**
- Pro builder ≈ **$49 floor + ~$8/site × 10 sites ≈ $130/mo → ~$1.5k/yr**, and it grows as the builder wins clients.
- Agency ≈ **$299–$799/mo + per-site overage → $5k–$20k/yr**, each agency dragging 20–200 sites.
- Embed/OEM ≈ **five-figure-plus ARR each**, and a single one can dwarf hundreds of direct accounts.
The ACV multiplier is the agency and embed tiers; the developer free/Pro tier is the *adoption funnel and the badge engine*.

**Who pays.** Not the SMB owner — the **builder** who ships sites for SMBs and would rather pay per-site for a governed content+revalidation+AI-management backend than build and maintain one. Their incentive is brutal: building a versioned content API with signed revalidation, a capability manifest, and a governed auto/review/block write-layer is *months* of engineering they can rent for $8/site.

**Expansion revenue (the compounding engine).** (a) **Per-site growth inside every account** — the builder's own client wins add sites automatically; revenue rises with zero new-logo effort (the structural NRR>100% engine). (b) **Meter expansion** — more governed AI writes and more revalidations as each site gets actively managed. (c) **Tier graduation** — Hobby→Pro→Agency→Embed as a builder's book grows. (d) **Attach the monetized layer up-stack** — the existing weekly-receipt + governed dashboard (`weekly-brief.ts`, the Business OS) becomes a higher-margin add-on the builder resells to *their* clients on top of the rails.

**Realistic ramp:**

- **$10k MRR.** ≈ 60–80 Pro builders, or ~15 agencies, or a handful of agencies + one small embed deal. *Requires:* the contract published as a real external API with auth + keys + metering (today it is internal and assumes Strelva owns both ends); the SDK + `create-strelva-site` starter shipped publicly; Stripe usage-billing turned on (`isBillingEnabled()` is currently false); and — the gating fact — **at least 3–5 third parties building real client sites on the rails.** Honest timeline: **6–12 months**, and *only if* the first external integrations land. This is slower-to-first-dollar than H4 because infrastructure requires a consumer before it bills.
- **$100k MRR.** ≈ 30–80 agencies + several embed/OEM deals + a long tail of Pro builders, with per-site expansion compounding inside each. *Requires:* the growth loop proven (every shipped site carries a badge that recruits the next builder), the SDK genuinely best-in-class for "give an AI-built site a governed backend," NRR ≥100% so the base out-expands churn, and **the hand-built-repo dependency fully removed from the rails path** — Strelva must not be in the critical path of any customer's site build. This is the milestone the prior plan and the bespoke model structurally cannot reach.
- **$1M MRR.** ≈ a national/global base of builders and several material OEM embeds, expansion revenue dominating new-logo revenue, defensible governance + benchmark data feeding both product and moat, at $1M–$2M ARR per FTE because the cost basis is API calls, not Jacob-hours. The Resend/Twilio trajectory: the rails become the default the docs, the starters, and the AI agents reach for.

---

## Growth loop — the organic/PLG/viral engine (each user brings the next).

The loop is the **developer-PLG + powered-by-badge** flywheel — the same one that built ClickFunnels (~$1M/mo MRR, ~20% of total, attributed to one badge), ChiliPiper (every scheduling link is a demo), and Resend (0→400K via being the agent/doc default). No cold outbound, no sales team.

```
 a developer / agency sees a Strelva-powered site (Powered by Strelva badge,
 a starter template, an MCP/SDK listing, or another builder's recommendation)
        │
        ▼
 runs `npx create-strelva-site` or installs the SDK  ──►  ships a governed,
        │  AI-managed local site in minutes (first value: a live site with a
        │  versioned content backend + working revalidation, for free)
        ▼
 their client's site goes live carrying `Powered by Strelva` (free tier price)
        │   (every shipped site = an impression on the NEXT builder + the SMB owner)
        ▼
 the builder's client base grows  ──►  more sites, more governed writes, more
        │  revalidations  ──►  metered usage crosses the floor  ──►  paying account,
        │  zero founder hours
        ▼
 the builder white-labels (drops the badge) at the agency tier, OR recommends
 the rails to peers because it saved them months  ──►  back to top, multiplied
```

Four reinforcing sub-loops, each on an existing or near-existing asset:

1. **The badge (core viral surface).** Every free-tier site renders `Powered by Strelva — give your site an AI backend`. Each shipped site is an impression on (a) the next builder who inspects it and (b) the SMB owner who could become a direct customer. This is the ClickFunnels line-item; at zero marginal cost it can be 15–20% of MRR on its own.
2. **Starter/SDK gravity (developer PLG).** `create-strelva-site` (the `custom-repo-starter/` scaffold, published) is the Resend move — become the default scaffold the docs and the AI coding agents reach for when someone asks "build a local-business site with an editable backend." Each new project built on it deepens the standard's gravity.
3. **MCP / agent-directory distribution (emerging, zero-cost).** The capability manifest *is already* a tool-declaration schema and the agent tools (`read_section`, `update_section`, `list_blog_posts`) already exist in `agent-executor.ts`. Publishing a **Strelva MCP server** to Smithery/Glama/PulseMCP (MCP: ~85% MoM growth, 17,000+ servers, <5% monetized) puts the rails in front of every Claude/Cursor/GPT agent building or editing a local site — an early-mover channel into exactly the builder audience this approach sells to.
4. **Programmatic + GEO content (compounding long-tail).** Docs and benchmark pages ("the average governed local site handles N AI writes/week," "how AI-built sites stay editable") are statistics-dense and get cited by the LLMs — the HubSpot backlink cascade (40,000+ backlinks) pointed at developer queries.

**Time-to-traction (honest, from digest):** badge + starter PLG can move in weeks *if the SDK has a genuine "this saved me months" moment*; doc/GEO SEO compounds over 6–18 months; MCP-directory is early but fast. The binding question is **not** the channel — it is whether a builder who is *not Strelva* chooses the rails over rolling their own. That is an unproven assumption and the whole loop depends on it.

---

## Why it scales (software economics) — where marginal cost approaches zero.

Infrastructure is the purest software-economics shape: marginal cost per new site is an API call, a cache write, and a few LLM tokens — not an hour of Jacob's time. The four automations the digest names as the services→software flip, mapped to the rails:

| Automation | Status today | What's required |
|---|---|---|
| **1. Zero-touch onboarding** | Internal only — provisioning assumes Strelva builds both ends | Self-serve API keys, project creation, and SDK install with **no human step**. A builder signs up, gets a key, ships. |
| **2. Self-serve activation / first value < 5 min** | The `custom-repo-starter/` scaffold exists but isn't a public `create-` command | `npx create-strelva-site` → live governed site in minutes. The starter is 80% there; the gap is publishing + auth, not building. |
| **3. Automated billing + metering** | Stripe wired, billing gated off; revalidation + audit already track per-key events in Redis | Turn billing on; meter per-site / per-write / per-revalidation. The event-tracking substrate (`reb:` Redis counters, `logAuditEvent`, revalidation failure/last-success keys) already exists. |
| **4. In-product depth that's automated, not bespoke** | Governance engine runs auto/review/block on live data | Expose governance *as a feature of the API* — every write through the rails is governed by default. The safety layer is software, not a Jacob review. |

Where marginal cost is ~zero: a content read is a Redis cache hit falling through to Sanity; a revalidation is one signed HTTP call; a governed AI write is one Gemini call + a governance decision; the SDK, starter, and badge are static. The model cost per write is cents and bounded by metering — keeping AI cost under the ~20%-of-revenue gate. **Nothing on the rails path requires a founder hour once the API is externalized.** That externalization *is* the flip from 30–50% services margin to 70–80%+ infrastructure margin and is what makes $1M–$2M ARR/FTE reachable.

---

## Leverage from Strelva assets — which existing assets this rides.

This is the approach most purely made of assets that already exist — it is *externalization and metering* of an internal platform, not greenfield:

- **`/api/v1` versioned contract (`src/app/api/v1/content|page-config|site-capabilities`).** Already the canonical, consumed-in-production wire shape. The whole product is "let other people consume this contract too." CLAUDE.md already mandates it stay owned directly and versioned-only — exactly the discipline an external API needs.
- **HMAC signed revalidation (`src/lib/scaffold-contracts.ts`, `src/lib/revalidate-client.ts`).** Signing, timestamping, failure tracking, reconciliation, last-success keys — the hard, boring reliability work of a delivery pipeline is *done*. This is the piece a builder would least want to rebuild.
- **Capability manifest (`src/lib/site-capabilities.ts`) + governance (`src/lib/ai-governance.ts`).** The `allowedActions` manifest is a ready-made tool schema; auto/review/block is the differentiator no commodity backend or vibe-coded API has. "Every write through our rails is governed" is the headline.
- **`custom-repo-starter/` (`scaffold-client.ts`, `revalidate-route.ts`, `content-defaults.ts`).** The drop-in scaffold is 80% of `create-strelva-site`. The SDK is mostly already written as the client these files embody.
- **The governed AI agent (`src/lib/agent-executor.ts`).** `read_section` / `update_section` / `create_blog_post` etc. are already agent tools — wrap as an MCP server and as SDK methods to give every rails site AI-management out of the box.
- **Metering substrate (`src/lib/storage/audit-store.ts`, revalidation Redis keys, rate limiting).** Per-key event counting and rate limits already exist — the usage-billing meter has a foundation.
- **`release-manifest.json` + `scripts/custom-repo-workspace-check.ts`.** Versioned compatibility tracking across consuming repos — the multi-tenant-contract-version discipline a public API requires is already practiced.

The genuinely *new* surface: external auth/API keys, a public SDK + `create-` command, usage metering→Stripe billing, a docs site, and an MCP listing. Everything load-bearing underneath is in production.

---

## The pivot required — HONEST: what about today's bespoke/free/local/services model must change or be abandoned.

This is the hardest pivot of any approach in the set, and the founder must accept all of it:

1. **Strelva stops being the builder and becomes the rails.** The entire identity — "Jacob hand-builds each client's site" — is *abandoned as the growth engine*. Hand-built sites survive only as a tiny concierge/reference-implementation tier (it's how you keep dogfooding the rails), explicitly **not** the business. This is more total than H4's flip: H4 keeps Strelva selling to SMBs; H7 stops selling to SMBs at all and sells to the people who do.
2. **The free hand-built site as acquisition wedge is gone.** The wedge becomes the **free developer tier + badge + starter**. Each free site is now *someone else's* labor carrying Strelva's brand, not Jacob's hours — that inversion is the whole point.
3. **The local / Buffalo constraint is dropped entirely.** This is a global developer product. BNI seats, corridor associations, "City of Good Neighbors" trust — none apply. The moat is the contract, the governance record, and the network of builders, not geography.
4. **Billing turns on, usage-based.** `isBillingEnabled()` → true; meter per-site / per-write / per-revalidation. A free internal contract with no metering is not a business.
5. **`SELF_SERVE_ENABLED=false` and "Do NOT build self-serve auto-provisioning" are reversed at the rails layer.** Self-serve key issuance and project creation are now the entire point. (Concierge keeps its discipline; rails must not.)
6. **The contract becomes a public API with all the obligations that implies** — backward-compatibility guarantees, deprecation policy, SLA expectations, security/abuse hardening, support. CLAUDE.md's "change v1 only by versioning" rule must now hold against *external* consumers you don't control, which is a real and permanent engineering tax.

**The honest, load-bearing caveat — the adoption signal required before this is real:** every other asset is in production, but the *demand* is not. Two repos consume the contract and Strelva builds both. **This approach is not real until at least one builder who is not Strelva ships a real client site on the rails and pays for it.** Selling "infrastructure" with one (internal) implementer is exactly the trap that killed approach 07 — a standard with one implementer is a vendor API. The difference from 07 is the buyer and the proof gate: 07 tried to sell "a standard" to a *plumber* (a category error); H7 sells *consumption of rails* to a *builder* whose incentive to rent vs. build is concrete and measurable. But the gate is the same and must be respected: **do not market this as a platform until a third party builds on it.** Until then it is an internal API with billing ambitions.

If the founder is unwilling to abandon "we build the sites" as the identity, this approach cannot work — and unlike H4 (which can run while Strelva still sells to SMBs), there is no half-measure. Honest recommendation if that's a non-starter: run H4 instead, which keeps Strelva selling a product while still escaping the bespoke trap.

---

## Moat — what compounds and resists copying at scale.

The contract itself is copyable; a competitor can publish a content API in a sprint. The moat is what compounds *around* the contract once builders are on it:

1. **Standard gravity / switching cost.** Every site shipped on the rails is a switching cost. A builder with 80 client sites on Strelva's contract, SDK, and revalidation pipeline has a real migration cost to leave — and every starter, doc, and MCP listing that picks Strelva as the default raises the cost of any competitor's standard. This is the Stripe/Twilio durability: you don't leave the rails your whole book runs on.
2. **The governance record — the one thing a copycat starts at zero on.** Every governed write through the rails sharpens the auto/review/block calibration *per vertical and per builder*. After tens of thousands of governed writes, Strelva knows what's safe to auto-apply in ways a new entrant can't replicate without the same volume of live data. "Every write is governed, and the governance is battle-tested" is not forgeable in a weekend.
3. **Cross-site benchmark data at the infrastructure layer.** Reads, writes, and revalidations across thousands of sites produce population-level data ("governed local sites recover N% more booking clicks after the agent fixes X") that no single-builder backend can produce — and that feeds both the product and GEO content the LLMs cite.
4. **The badge + starter network effect.** Once `Powered by Strelva` and `create-strelva-site` are seeded across thousands of shipped sites and indexed pages, the organic top-of-funnel is a compounding asset a copycat must start from zero.

Honest read: the moat is **real but earned over 12–24 months and depends entirely on reaching builder density.** Below density it is just a nicer API. The defensible wedge is the **governed write-layer** — the rarest asset, production-proven, and the one a vibe-coder or a thin API wrapper structurally cannot claim.

---

## Risks & kill signal.

- **No third party ever builds on it (the central risk).** If after a defined window no non-Strelva builder ships a paying site on the rails, this is approach 07 again — a standard with one implementer. *This single risk dominates all others.*
- **The "rent vs. build" incentive isn't strong enough.** AI builders may just generate their own thin content backend rather than depend on Strelva. The hedge is governance + revalidation reliability + the AI-management agent — the parts that are genuinely months of work — not the content CRUD, which is cheap to clone.
- **Slowest time-to-first-dollar in the set.** Infrastructure needs a consumer before it bills; $10k MRR is a 6–12 month milestone, not a 3-month one. If the founder needs revenue velocity *now*, H4 (sells direct, bills in weeks) is the better first move and H7 is the *second* act layered on top.
- **Public-API obligation tax.** Backward-compat, deprecation discipline, abuse hardening, and support for external consumers is a permanent cost that competes with product velocity — the services-trap's infrastructure cousin.
- **Big-platform commoditization.** Vercel, a CMS vendor, or an AI-builder could ship a governed content+management layer and bundle it free. Speed to builder density and the governance data moat are the only hedges.

**Kill signals (instrument from launch):**
- **90 days after the SDK/API is public: zero non-Strelva sites shipped on the rails** → the rent-vs-build incentive is too weak; revert to selling the rails as the engine *under H4's own product* rather than as a standalone platform.
- **6 months: < 3 paying external builders** → builder PLG isn't igniting; the platform framing is premature (the 07 outcome) — fold the contract back to internal and lead with H4 or H1.
- **Per-site expansion (NRR) trending below 100% once accounts exist** → the usage model isn't capturing the customer's growth; re-price the meters before scaling spend.
- **Green-light signal:** a developer who is not Strelva opens an issue, stars the starter, or asks "how do I run my own clients on this?" *without being sold* — the same pull-not-push test the prior synthesis defined, pointed at builders instead of SMB owners.

---

## First move this week — a concrete, self-serve-leaning step on existing assets.

**Externalize the contract as a real, key-authed public API surface and publish the starter as `create-strelva-site` — no billing yet, no Jacob step, prove the rent-vs-build pull before building the meter.** In priority order:

1. **Add API-key auth to the `/api/v1/*` routes** so a non-Strelva caller can read the contract with a self-issued key (the routes, signing, and rate-limit substrate already exist — this is auth + a keys table, not a new API). Gate writes behind governance exactly as today.
2. **Publish `custom-repo-starter/` as a public `npx create-strelva-site`** that scaffolds a working site against the public contract with a `Powered by Strelva` badge in the footer. The scaffold (`scaffold-client.ts`, `revalidate-route.ts`, `content-defaults.ts`) is 80% there; this is packaging, not building.
3. **Stand up a one-page docs site** ("give any AI-built site a governed, editable backend in minutes") with the quote-able, GEO-ready positioning that makes the rails the default an AI coding agent reaches for.
4. **List a minimal Strelva MCP server** (`read_section` / `update_section` already exist as agent tools) on one directory (Smithery/Glama) to seed the agent-channel.

This ships on existing assets, turns on no billing, and produces the **one measurement that proves or kills the thesis**: does a builder who is *not Strelva* clone the starter, issue a key, and stand up a real site? That single event — an integration that arrives from the starter, not from Jacob — is the proof the platform has pull, exactly the pull-not-push gate that killed 07. Only after that signal clears do you wire usage metering, turn billing on, and open the agency/embed tiers.

---

## Redesign implication — what the product + marketing surface becomes.

**Marketing surface.** The homepage stops selling "AI websites for local business" and starts selling **rails to builders**: the hero is a code block and a `create-strelva-site` command, not a template gallery — *"Give any site a governed, AI-managed backend. Versioned content API, signed revalidation, auto/review/block writes. Ship in minutes."* The proof is a live `Powered by Strelva` example site you can inspect, the docs, and the SDK. The identity shifts from *a studio that builds your site* to *the infrastructure other builders ship on* — a developer product (Resend/Twilio shape), not a local studio. Primary CTA: get an API key / run the starter. Secondary, clearly fenced: the SMB-facing monitor/dashboard (H4's product) as the thing built *on* the rails, and concierge "build it for me" as the reference tier.

**Product surface.** The center of gravity moves from the SMB dashboard to a **developer console**: API keys, per-site usage and metering, the capability manifest as a live, documented schema, governance activity (auto/review/block counts) shown as a feature being bought, and a revalidation health view. The existing SMB dashboard, weekly receipt, and content agent become the **reference application** — the proof that the rails produce a real product, and an attachable up-stack tier a builder can resell to their own clients. The organizing metaphor moves from *"we built and manage your website"* to *"the rails every AI-built local site runs on — governed, versioned, and proven."*

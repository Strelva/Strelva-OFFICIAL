# The Workflow Catalog — Buffalo's Off-the-Shelf Custom Software

**One-liner** — Stop selling "custom software" as a discovery-to-bespoke services queue; ship a small, public catalog of four proven SMB workflow products (intake→CRM, estimate→invoice, booking→reminders, client onboarding) that Jacob builds near-instantly from a hardened template plus a thin per-client config, sold as named products with fixed scope, governed by the same auto/review/block engine that already runs Strelva's content agent in production.

## The bet

The consensus in the AI-automation-agency world is that custom software must be *bespoke* — every engagement starts with a paid discovery call, a blank Figma, and an n8n canvas, because "every business is different." That belief is what makes the model broken: one-off projects, no recurring revenue, 50% of prospects offering under $2K, and a maintenance burden that eats the next sale. Our wager is that the *opposite* is true at the 5–20-person scale: the four highest-volume repetitive workflows in trades and professional services are 80% identical across every business, and the 20% that differs is **configuration, not engineering**. If we productize those four as a catalog — each with a fixed price, a fixed delivery window, a live demo, and a governance layer we already own — Custom Software becomes a *product line with inventory*, not a services backlog. The non-consensus part: we publicly cap what we sell so we can deliver it in days, while everyone else keeps the menu infinite to look "enterprise."

## Jobs-To-Be-Done served

**Functional job:** "Make my business run without me being the bottleneck on this one repetitive thing." Not "build me software" — *remove one specific manual loop* (re-typing a web lead into the CRM, chasing an estimate that never became an invoice, manually texting appointment reminders, onboarding a new client through the same five emails every time). The owner is hiring the catalog item the way they'd hire a part for a truck: a known thing that fixes a known failure.

**Emotional job:** Kill the low-grade dread of "I know something is falling through the cracks." 80% of SMBs cite founder-dependency as a critical operational risk; 95% of secondary pain is undocumented process living in one person's head and inbox. A catalog product that *names the exact workflow* ("Estimate→Invoice, never lose a job to a forgotten follow-up") converts vague anxiety into a purchasable, scoped fix — which is far less frightening than "let's discover your needs."

**Social job:** Look like a real, in-control business to staff and clients — and feel safe buying. The dominant blocking force here is not lack of desire, it's "I don't know what I'm asking for" and "the last dev shop over-promised." A fixed-scope, named, demoable product with a price tag removes both. You can buy "the booking-reminder workflow" the way you buy a tool, not the way you commission a building.

**Trigger / struggling moments:** A critical employee quits and takes the process with them; a job slips because the estimate never got chased; a double-booking embarrasses the owner in front of a customer; a third of a meeting is spent hunting for a lead that came in through the website three weeks ago and was never entered. These are "I almost lost a client / almost missed payroll" moments — loss aversion, not modernization aspiration. The catalog meets them with a same-week answer instead of a six-week discovery.

## What Strelva becomes

Strelva becomes a **two-shelf studio with shared inventory and a shared governance spine**:

- **Noah / Websites (the wedge):** unchanged as the free acquisition layer — hand-built client site, the weekly plain-English receipt, the governed content agent. This division *opens the door and proves the governance pattern works on live data*. Every website client is a warm, trust-established prospect already inside Strelva's data store.
- **Jacob / Custom Software (the expansion, now a product line):** owns a literal **catalog of four workflow products**. Each catalog item = (1) a hardened, reusable template module, (2) a thin per-client config (which CRM, which booking tool, which fields, which message copy), (3) the same three-tier governance engine (`decideAiContentGovernance`-style: auto-execute factual/idempotent steps, route ambiguous steps to human review, block destructive/structural ones) wrapped around the workflow's AI decision points, and (4) a fixed price and delivery window. Delivery is "configure and ship," not "scope and build."

**Wedge vs. expansion:** The free managed website is the wedge into the relationship and the live proof of governed AI. The first catalog workflow is the first paid Custom Software unit — sold to a business Noah already serves or to a warm referral, because we can point at their *own* site data and say "you got 14 leads through your contact form last month; none of them are in a CRM — here's the Intake→CRM product." The expansion is the second and third catalog item for the same client, and the same four items resold to the next same-vertical business at near-zero marginal build cost.

## Novel Q4-2026 capability exploited

Two newly-possible capabilities make the *catalog* viable where bespoke was the only honest option 12 months ago:

1. **AI-assisted delivery economics for tiny teams.** 2–5-person teams now report ~68% delivery-speed gains with agentic coding tools (vs. 31% for large orgs), and 40% of new MVPs are primarily AI-assisted. A year ago, "near-instant build from a template" still meant a real engineering week per client because the config glue was hand-written. Now Jacob can stamp a configured instance of a hardened workflow in days — *but only because the moat isn't the code, it's the governance bar*: 45% of AI-generated code ships with security vulnerabilities, and a professional rebuild runs $5–30K. Strelva already runs a **production-proven** three-tier governance engine (`src/lib/ai-governance.ts`, with the exact `auto` / `review` / `block` decisions) on live client content. Reusing that spine on workflow decision points is the thing a commodity vibe-coder structurally cannot claim — they have speed without a quality gate.

2. **MCP as the catalog's resale substrate.** MCP crossed to operational standard in H1 2026 (97M+ monthly SDK downloads, 41% of software orgs in production, Linux Foundation governance) and <5% of servers are monetized. Building each catalog workflow as an MCP server — not a bespoke app — means each product is (a) composable by whatever Claude/Cursor/Copilot the client or Strelva already uses, (b) resellable to any similar business by swapping the config, and (c) discoverable as AI agents increasingly invoke MCP tools. Strelva's existing agent and per-tenant data store are already MCP-shaped. A year ago there was no standard substrate to make "build once, configure many" portable across clients and toolchains; now there is.

## Organic GTM motion

The flywheel is **audit → website → workflow catalog → referral**, run entirely through Strelva's existing audit engine and Buffalo's structured referral graph. No cold outbound.

- **The audit becomes a dual-shelf door-opener.** The live any-URL audit engine (`/api/audit/scan`, six real categories today, four Phase-2 stubs — `stubGBPCompleteness`, `stubNAPConsistency`, `stubReviewPresence`, `stubLocalSEOGrid` — already exported and ready to wire) already scores a prospect's site. We add **one operational question to the post-audit follow-up**: "Where do your website leads go after they come in?" That single question diagnoses Intake→CRM demand and hands Jacob a qualified workflow lead from the same scan that sells Noah a website.
- **Buffalo density inside one vertical.** Erie County has 1,417 construction/trades establishments — the second-largest business category by count, employment at a ~35-year high, owners booked solid and ignoring their back office. These businesses share the *same four workflows*. Win one, and the catalog item is pre-built for the next twenty. The referral graph has explicit on-ramps: take the single "web/AI" category seat in a **BNI WNY** chapter (one-seat-per-category is a structural lock), and the **Buffalo Niagara Partnership** free tier (5-or-fewer-employee businesses) puts the catalog in front of 4,500 annual attendees who are exactly the 5–20-person ICP.
- **The weekly receipt carries the catalog.** The website receipt is already a forwardable artifact ("47 people found you, 12 clicked booking"). We add **one line** when the data supports it: "12 booking clicks last week — none are in your CRM. The Intake→CRM workflow fixes that." The receipt becomes a standing, zero-outbound cross-sell channel for the catalog, and it's the artifact owners forward to other owners.

**First three concrete distribution acts:**
1. Publish a one-page public **catalog page** on the Strelva marketing surface listing the four workflow products by name, with a fixed "from $X / live in N days" frame and a 30-second loom of each running — proof, not a pitch.
2. Wire the post-audit follow-up email to include the "where do your leads go?" operational question and a link to the catalog page.
3. Take the open web/AI seat in one BNI WNY chapter and bring the catalog page + one client's anonymized weekly receipt as the "here's what we actually ship" artifact.

## Moat / where value compounds

- **Template hardening compounds per build.** Every client config of "Estimate→Invoice" surfaces a real edge case (a weird QuickBooks field, a trade-specific approval step). Fold it into the template and the *next* build is faster, safer, and covers more reality. Bespoke shops re-pay this cost every project; the catalog amortizes it to near zero.
- **Governance precedents compound.** Each workflow we ship under the auto/review/block engine adds tested decision rules ("auto-execute a CRM insert, review a price-bearing invoice line, block a record deletion"). That library of governed decisions is the asset a vibe-coder can't speed-run — it's earned from production incidents, not generated.
- **Cross-tenant workflow benchmarks become a second data moat.** The per-tenant event store (Google, Yelp, Instagram, Search Console, site activity in `src/lib/integration-registry.ts`) already aggregates across tenants. Once workflows run, we also hold *operational* cross-tenant data: "trades businesses on the Intake→CRM workflow respond to leads 3x faster." No single-client shop can produce that number; it justifies the retainer and feeds AEO content.
- **MCP-as-product compounds distribution.** Each catalog item shipped as an MCP server is one more resalable, agent-discoverable unit at zero marginal build cost — the inventory grows, the per-unit margin rises.

## Why competitors will not (or cannot) copy this

- **The consensus keeps the menu infinite to look credible.** Agencies and AI-automation shops believe scope-capping makes them look small, so they keep selling bespoke discovery — which is exactly what traps them in the broken one-off model. Capping to four named products is a *positioning* move they're structurally unwilling to make.
- **They have speed without a governance spine.** Any vibe-coder can stamp a Zapier-plus-LLM workflow fast. Almost none can say "the AI decision points run under a three-tier governance engine that's been live in production on paying clients." Strelva already runs that engine (`src/lib/ai-governance.ts`) on the Websites side — Jacob inherits a production-proven quality bar that a new automation shop would need real incidents and months to earn.
- **They have no warm, proof-backed front door.** Strelva's catalog is sold into relationships the *free website* already opened, anchored by the client's own audit and receipt data. A competitor cold-pitching "custom software" walks in with claims; Strelva walks in with the prospect's own numbers and a same-vertical benchmark.
- **Buffalo density is geo-agnostic-proof.** National automation agencies run LinkedIn ads and cold email; they can't take the one BNI category seat or be the named, local studio a trades owner refers to the next trades owner in one phone call. "City of Good Neighbors" penalizes the remote generic vendor and rewards the embedded local — the catalog is built to ride that referral physics.

## Redesign implication

The marketing surface stops reading like an agency ("we build custom software for your business") and starts reading like a **store with shelves**:

- A **Websites shelf** (Noah): the free managed site + weekly receipt, framed as the wedge and the proof.
- A **Workflow Catalog shelf** (Jacob): four named products, each with a one-line job ("Estimate→Invoice — never lose a job to a forgotten follow-up"), a fixed "from $X / live in N days," a 30-second demo loom, and a "governed by the same AI engine that runs our managed sites" trust line.
- The **audit** becomes the universal front door for both shelves — one scan, two recommendations (a website fix and the relevant workflow product).
- Product-side, the dashboard gains a **catalog/inventory model** instead of a bespoke project tracker: each client shows which workflow products are installed, their governance activity (auto/review/block counts), and the cross-tenant benchmark for that workflow. The "My Site" and "Reports" surfaces extend naturally to "My Workflows" and a workflow line in the weekly receipt.

The redesign's organizing metaphor is **inventory, not engagement** — Strelva sells named things off a shelf, not hours against a brief.

## Risks & kill signal

- **Risk: the 80/20 split is wrong** — if the four workflows turn out to be 50% bespoke per client, "near-instant" collapses back into a services queue and the catalog is a lie. **Early signal:** the *second* build of any catalog item takes more than ~30% of the time the first took. If template hardening isn't bending the build-cost curve down by the second client, the productization premise is false — kill or re-scope that item.
- **Risk: governance overhead eats the margin** — if too many workflow steps route to human review, the "near-zero marginal" economics evaporate into Jacob babysitting queues. **Early signal:** review-queue volume per workflow doesn't fall across the first three clients on the same item.
- **Risk: the catalog is too narrow for real demand** — if audits and BNI conversations keep surfacing a *fifth* workflow nobody's buying the four for. **Early signal:** the post-audit "where do your leads go?" question repeatedly returns a pain that none of the four products address.
- **Hard kill signal:** after three months of the audit→catalog funnel in one Buffalo vertical, zero warm conversations convert to a paid catalog install *and* no client forwards a receipt that mentions a workflow. That means the wedge isn't carrying the expansion and the catalog should fold back into Noah's website motion until proof exists.

## First proof step

**This week, solo, with existing assets:** Pick the single most common gap in the current website clients' own data — almost certainly Intake→CRM (booking/contact-form leads with no downstream system). Build *one* hardened, configurable instance of the Intake→CRM workflow as an MCP server wrapping the existing event store and the governance engine in `src/lib/ai-governance.ts`, configured against one real existing client's actual contact form. Record a 30-second loom of a real website lead flowing automatically into a CRM with one step routed to review. That loom is the first catalog product, the first proof, and the asset Jacob carries into the first BNI conversation — built from primitives Strelva already runs in production, not a greenfield engineering bet.

## Open questions

- Which four workflows are *actually* the highest-volume across Buffalo trades + professional services — is it the assumed quartet (intake→CRM, estimate→invoice, booking→reminders, onboarding), or does the audit-question data reveal a different top four?
- What is the honest fixed price and delivery window per catalog item once we've measured a real second build, and does that price clear the under-$2K floor that breaks the consensus model?
- Which CRM / booking / invoicing tools dominate the Buffalo trades stack (QuickBooks? Jobber? Housecall Pro?), and how many connectors must the template cover before "configure, don't build" is true?
- Does the MCP-server delivery form actually reduce per-client integration cost, or is it premature packaging before we've validated demand for even one item?
- How much of the governance rule library transfers from content decisions to operational/workflow decisions without net-new design — i.e., is the spine genuinely reusable or only structurally similar?
- Is there a clean handoff line between Noah's free-website motion and Jacob's paid-catalog motion that doesn't dilute the "website is free" wedge or confuse the buyer about what costs money?

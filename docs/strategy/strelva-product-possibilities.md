# Strelva Product Possibilities

Date: 2026-06-07  
Context: Ideation from current REB/Strelva product surface. This is not a roadmap. It is a possibility map for choosing the next product bet.

## Premise

Strelva has three real assets in the codebase:

1. Managed website control plane: content, tenants, dashboard, custom-repo delivery.
2. Governed AI action layer: propose/update/review/block with receipts and revalidation.
3. Audit / AnswerRank seed: site audit plus AI visibility score logic.

The strongest product possibilities do not come from adding more dashboard. They come from turning these assets into artifacts, approval loops, and fix-it loops that travel.

## Possibility map

### 1. AnswerRank Scorecard

- Shift: Local discovery is moving into AI answers; owners cannot see whether they are legible.
- Primitive: One business/site in, AI visibility scorecard out.
- Tiny build: Web route with business, URL, category, city; uses `scoreAiVisibility()`; renders grade, verdict, evidence, top fix.
- Distribution object: Screenshot/share URL: “AI can’t tell what this business does — here’s the fix.”
- User: Agency/freelancer/SEO consultant first; owner second.
- Call: Build first.

### 2. AI Visibility Action Brief

- Shift: Audits are boring unless they become an approved change.
- Primitive: Scorecard plus one concrete patch proposal.
- Tiny build: After scan, generate “recommended website update” with copy/schema/FAQ suggestion and approval CTA.
- Distribution object: A one-page action brief a marketer can send a client.
- User: Local marketers, freelancers, agencies.
- Call: Strong service-first bridge before full automation.

### 3. “Send To Your Web Person” Mode

- Shift: Many owners will not fix the issue themselves; they need a forwarding object.
- Primitive: Recipient-specific handoff card.
- Tiny build: Result page has tabs: Owner / Web person / Agency. Each explains what to do next.
- Distribution object: “Forward this to whoever controls your site.”
- User: SMB owner with existing vendor.
- Call: Build inside scorecard, not as separate product.

### 4. Weekly AI Visibility Drift Monitor

- Shift: AI answers drift; recurring value comes from changes, not static grade.
- Primitive: Weekly drift email: score moved, competitor appeared, top fix changed.
- Tiny build: Save scan target, run weekly cron, email plain-English delta.
- Distribution object: “Your business disappeared from this AI answer this week.”
- User: Owners/marketers after they have felt scorecard anxiety.
- Call: Build after Gate A signal.

### 5. Competitor Named, Not You

- Shift: Abstract grade is weaker than named competitive loss.
- Primitive: Citation comparison receipt.
- Tiny build: Live probe asks category/city prompts and extracts named businesses; result says who showed up.
- Distribution object: “AI recommended X and Y before you.”
- User: Operators in competitive local categories.
- Call: High emotional pull, but must be honest and measured.

### 6. Local Marketer / Agency Portal

- Shift: Agencies need a new recurring value artifact for clients as old SEO reports stale.
- Primitive: Client scan ledger.
- Tiny build: Let a marketer save 10 client scans, export branded action briefs, track weekly deltas.
- Distribution object: White-label or co-branded monthly AI visibility pack.
- User: Freelancers, local SEO consultants, small agencies.
- Call: Strong first buyer path if individual scorecard forwards.

### 7. Free Claude Skill / MCP Scanner

- Shift: Builders and marketers increasingly invoke tools from their work substrate, not destination sites.
- Primitive: Agent-readable scanner.
- Tiny build: Package `scoreAiVisibility` as CLI/MCP/Claude skill that outputs markdown scorecards.
- Distribution object: “Install this and scan every client before a pitch.”
- User: AI-native freelancers/agencies.
- Call: Weird but high-upside; do after web scorecard copy is sharp.

### 8. AI Visibility Leaderboard / Local Index

- Shift: Benchmarks spread better than individual tools, but need enough data.
- Primitive: Public benchmark pages by vertical/city.
- Tiny build: Persistent scan store, aggregate anonymized percentiles, publish “AI visibility of Buffalo medspas/plumbers.”
- Distribution object: “78% of Buffalo plumbers are invisible to AI answers.”
- User: Media/marketers/operators.
- Call: Park until persistent scan volume exists.

### 9. Fix-It Operator

- Shift: Monitors diagnose; operators want the issue removed.
- Primitive: Approved website fix loop.
- Tiny build: For failing signals, generate a structured patch: schema JSON-LD, FAQ block, title/meta rewrite, services copy.
- Distribution object: Before/after fix receipt.
- User: Owners who ask “how do I fix this?”
- Call: The paid product, but only after scorecard pull.

### 10. Schema Fix Studio

- Shift: A lot of AI visibility fixes are boring technical facts; that is good for productization.
- Primitive: LocalBusiness schema generator + deploy handoff.
- Tiny build: Generate schema JSON-LD from business inputs, validate it, copy/install instructions.
- Distribution object: “Your AI-readable business facts block.”
- User: Web people and DIY owners.
- Call: Good narrow wedge if full scorecard feels too broad.

### 11. Review-To-Answer Engine

- Shift: Reviews contain language customers and AI trust, but sites rarely reuse it.
- Primitive: Convert review language into answer-format website sections.
- Tiny build: Paste reviews / connect Google reviews; generate FAQ/service proof blocks from recurring phrases.
- Distribution object: “Your customers already wrote the page AI needs.”
- User: Service businesses with strong reviews and weak sites.
- Call: Very Strelva-native; build as paid fix module.

### 12. GBP-To-Site Truth Sync

- Shift: Business reality changes on Google Business Profile/social before website catches up.
- Primitive: Source-of-truth gap scanner.
- Tiny build: Compare website against GBP-like fields or pasted GBP data; propose diffs.
- Distribution object: “Your Google profile says X; your website still says Y.”
- User: Multi-location or active local operators.
- Call: Strong later trust/action loop; needs data access.

### 13. Site Change Approval Inbox

- Shift: Owners do not want dashboards; they want approve/deny on concrete business changes.
- Primitive: Approval queue as the product surface.
- Tiny build: Turn audit/review/social/GBP changes into proposed website diffs with approve button.
- Distribution object: Weekly “3 updates waiting” email.
- User: Existing Strelva site clients.
- Call: Product-completion/retention, not acquisition wedge.

### 14. “Website That Keeps Up” Receipt

- Shift: Managed websites need proof of motion or owners churn.
- Primitive: Weekly work record: changes shipped, traffic/clicks, issues caught, next recommended action.
- Tiny build: Sharpen existing weekly brief into a forwardable external receipt.
- Distribution object: “Here’s what your website did this week.”
- User: Current/future Strelva clients.
- Call: Keep improving, but don’t lead GTM with it.

### 15. Intake Loss Brief

- Shift: Website work exposes lead-flow bottlenecks; custom software should be sold from observed friction.
- Primitive: Lead loss / speed-to-lead brief.
- Tiny build: Use actual event/booking/form data for Rohlax/GLDF to show missed follow-up risk and propose one workflow fix.
- Distribution object: “You had N high-intent actions; here is where response breaks.”
- User: Existing clients only at first.
- Call: Sell-first. Do not build a catalog.

### 16. Vertical Answer Packs

- Shift: AI answer visibility differs by vertical; generic prompts create generic value.
- Primitive: Prompt/query pack for one vertical.
- Tiny build: Medspa/chiro/HVAC prompt sets: “best X near me,” “who offers Y,” “is Z worth it,” “emergency X.”
- Distribution object: Vertical-specific AI visibility report.
- User: Above-SMB operators / marketers in one vertical.
- Call: Strong if horizontal scorecard feels too mushy.

### 17. “Are You In The Answer?” Embeddable Badge

- Shift: Badges can distribute when they confer status.
- Primitive: Verified AI-readable / monitored badge.
- Tiny build: Badge snippet for businesses above threshold or monitored customers.
- Distribution object: Powered-by link from client sites.
- User: Strelva-managed sites first.
- Call: Later; badge has to mean something real.

### 18. AI Search Readiness API

- Shift: Agents/builders need machine-readable checks, not dashboards.
- Primitive: API endpoint for AI-readiness score and fixes.
- Tiny build: Authless/rate-limited API returns score JSON for a URL.
- Distribution object: Docs/API/CLI examples.
- User: Other builders, agencies, SEO tools.
- Call: Park; no evidence of third-party demand yet.

## Strongest directions

### A. The artifact wedge

Build the public AnswerRank scorecard and prove people forward it.

Why: fastest path to market signal, uses existing code, creates distribution surface.

### B. The agency primitive

Turn the scorecard into an action brief freelancers can send clients.

Why: agencies already need client-facing reasons to sell AI-search/GEO work; they are better early distributors than random owners.

### C. The fix-it loop

Turn failures into approved site changes.

Why: this is Strelva’s unfair asset. Monitors stop at diagnosis; Strelva can fix with governance.

## What not to build yet

- Generic dashboard redesign.
- Full self-serve site builder.
- Billing-first monitor.
- National benchmark pages before scan volume.
- Custom workflow catalog.
- Platform/API/MCP as the lead product before the scorecard artifact is proven.

## Best next ideation question

Which user do we want the first artifact to make look smart?

1. SMB owner: “I found out AI can’t see us.”
2. Freelancer/agency: “I found a new risk in your client’s site.”
3. Web person: “Here is the exact technical fix.”
4. Jacob/Strelva: “Here is a scored lead with a fix we can sell.”

The product changes depending on that answer. My current call: start with #2, because agencies/freelancers can run this repeatedly and distribute it faster than owners.
# Custom Software: Horizontal vs Vertical — Verified Research

Date: 2026-06-09
Method: deep-research harness — 5 search lanes, 21 sources fetched, 105 claims extracted, top 25 adversarially verified (3 votes each): 18 confirmed, 7 killed. Confidence noted per finding. This doc supersedes the pricing/channel assumptions in the June 9 Jobber wedge decision where they conflict.

## Verdict (research's recommendation — founder decides)

**Vertical-first, sequenced.** Commit the Custom Software division to the Jobber home-service wedge; keep the chassis (event store → weekly brief, governed AI actions) as shared internal libraries, **not** as a second horizontal product. Horizontal optionality is preserved at near-zero cost by the library extraction; the horizontal *market* lane itself is verifiably commoditized.

Confidence: medium — the market findings are high-confidence, but two research lanes (solo-founder distribution case studies; architecture outcomes at comparable companies) produced almost no surviving verified evidence, so the repo guidance and kill criteria are reasoned from verified constraints, not precedent.

## Why not horizontal (high confidence, 12-0 verifier votes)

Every axis a solo founder could compete on is already price-anchored or feature-shipped:

- OpenAI entered the agent-builder category with AgentKit (Oct 6, 2025).
- Workflow-automation price floor: ~$9–20/mo (Make Core $9/mo annual, Zapier Professional $19.99/mo, free tiers below).
- Automated SMB/agency reporting clusters at $20–44/mo entry (AgencyAnalytics $20/client/mo, Supermetrics/DashThis $44/mo) with ~$199/mo as the high anchor.
- "Plain-English / chat with your business data" reporting is already shipping across incumbent platforms at multiple tiers (Improvado AI Agent, AgencyAnalytics Ask AI $79/mo, Whatagraph MCP) — the capability alone is not a differentiator.

Honesty note: claims that the horizontal space is *saturated* (Zapier Agents mass adoption, agent-written-report dominance) were **refuted** in verification. The case is about supply and price anchors, not proven incumbent dominance. It is still sufficient: there is no defensible position or pricing power there for a solo founder.

## Corrections to the June 9 Jobber plan (high confidence, primary sources)

1. **The "5 paying accounts pre-approval" gate is a hard cap and a coordinated channel, not an open beta.** Jobber's developer docs (fetched live 2026-06-09): API access is *blocked* if a Draft app connects more than 5 paying accounts; mass distribution of connect URLs is *prohibited* unless Jobber authorizes it; Draft-state customer engagement is expected to be coordinated with a Jobber developer rep; marketplace approval is a manual human review, and approval ≠ listing — Jobber controls release timing (typically a ~2-week beta first).
   - Consequence: the "recruit from FB groups/subreddits charging from day one" step in the 90-day plan likely violates the mass-distribution rule unless coordinated with Jobber. **Pre-approval, "be found" distribution is foreclosed** — this conflicts with the operating default of being-found acquisition until the app is listed.
2. **Price toward $79–99+/mo, not $29–49/mo.** Jobber's own pricing page proves its customers pay $29–99/mo for add-ons (AI Receptionist $99/mo, Marketing Suite $79/mo, Reviews $39/mo, Campaigns/Referrals $29/mo). And the strongest founder-evidence in the research (Walling: "the higher price, typically the lower the churn, the faster the growth") cuts against a $29–49 wedge nearly as hard as against horizontal — vertical wins only insofar as it enables higher ACV.

## What supports the vertical call

- Jobber scale: 200k+ service *professionals* (May 2023; "200k businesses" slightly overstates — these are users), $100M+ revenue as of early 2023, ~250k–300k+ pros per 2025 vendor PR. Vendor-disclosed figures; hedged accordingly.
- Housecall Pro confirmed out: API gated to MAX plan only ($299/mo tier), no comparable self-serve marketplace path.
- Gamez (founder-track-record): a founder with existing vertical skill should leverage it rather than go horizontal — **partially met**: Jacob's domain expertise is local-business websites broadly, not home services specifically.
- Vertical referral networks are real (verified mechanism; vertical SaaS CAC ~25–35% lower partly via word-of-mouth) — but the flywheel compounds only after ~10–20 referenceable customers, and trust cycles can run years (DocuSign → NAR took 6 years).

## Strongest case against the verdict

You'd be renting distribution from a platform that:
- already sells first-party AI/marketing add-ons in adjacent categories (so it competes with its own marketplace),
- can sherlock the feature (documented platform behavior — TapeACall/Apple; note: sherlocking proves risk, not lethality, and "marketplaces systematically mine usage data to decide what to clone" was refuted),
- caps pre-approval validation at 5 coordinated accounts and prohibits broad distribution until approval,
- controls listing timing,
while vertical referral payoff historically lags the runway of a $0-MRR solo founder.

## Kill criteria

1. Cannot get 5 paying Draft accounts connected within the validation window, or Jobber declines to coordinate/approve within ~2 quarters.
2. Jobber ships a native weekly revenue report or folds one into the Marketing Suite — kill immediately.
3. Connected shops won't sustain ≥$79/mo (a $29/mo wedge that can't climb is a slow no).

## Repo restructure implication (inference, not precedent — lane 4 had no surviving evidence)

- **Do not build the Jobber product inside the multi-tenant control plane.** It's a different tenant model (Jobber OAuth account, not a Strelva website tenant), different lifecycle, different deploy cadence.
- **Extract the chassis as packages**: events/weekly-brief/report rendering and the governance layer become libraries consumable by both the control plane and a thin new Jobber app. This is the "clean for restructure" work — it preserves horizontal optionality without building a horizontal product.
- **The strelva-marketing/strelva-app split and rebrand cutover are a separate, already-in-flight motion** (see `docs/strelva-migration-plan.md`); the new input is that the topology should anticipate a third deployable (the Jobber app) sharing packages, which argues for a workspace/monorepo shape or a deliberately thin shared-package story rather than ad-hoc duplication.

## Open questions (close before committing build time)

1. Jobber marketplace economics: revenue share, listing fees, typical review duration, indie approval rate — none in public docs; ask Jobber directly.
2. How a founder with no Jobber relationship initiates the Draft-state coordination the docs require.
3. Real indie outcomes on FSM marketplaces (revenue, time-to-approval, sherlocking incidents) — zero verified case evidence survived; 2–3 founder interviews would close the biggest gap.
4. Willingness-to-pay for a weekly plain-English revenue report at $79–99/mo specifically, given Marketing Suite already occupies adjacent budget at $79.

## Key sources

- Jobber developer docs (primary, live 2026-06-09): [testing/draft limits](https://developer.getjobber.com/docs/building_your_app/testing_your_app/), [app review](https://developer.getjobber.com/docs/publishing_your_app/app_review_process/), [custom integrations](https://developer.getjobber.com/docs/custom_integrations/)
- [Jobber pricing (add-ons, live-verified)](https://getjobber.com/pricing) · [Contrary Research on Jobber](https://research.contrary.com/company/jobber) · [TechCrunch Series D](https://techcrunch.com/2023/02/07/jobber-series-d/)
- [Housecall Pro API overview](https://help.housecallpro.com/en/articles/8505035-api-overview) (MAX-only, primary)
- [OpenAI AgentKit announcement](https://openai.com/index/introducing-agentkit/) · [Zapier pricing](https://zapier.com/pricing) · [Make pricing](https://make.com/en/pricing)
- [Startups for the Rest of Us ep. 711 (Gamez/Walling, verified against transcript)](https://www.startupsfortherestofus.com/episodes/episode-711-finding-early-customers-horizontal-vs-vertical-prosumer-saas-and-more-listener-questions-with-ruben-gamez)
- [ScaleVP on vertical software](https://scalevp.com/insights/these-misconceptions-about-vertical-software-need-to-fade-away) (VC blog, pro-vertical bias noted)
- [NPR on sherlocking/TapeACall](https://www.npr.org/2024/06/17/g-s1-4912/apple-app-store-obsolete-sherlocked-tapeacall-watson-copy)

Refuted claims (do not cite): Zapier Agents 50k-team adoption; agent-written reports collapsing production cost to ~20 min/client; "only 6% of agencies at mature agent-reporting stage"; Jobber per-plan prices from myquoteiq blog; "horizontal requires more product sophistication"; integration-breadth as an unmatchable bar; systematic marketplace data-mining-to-clone.

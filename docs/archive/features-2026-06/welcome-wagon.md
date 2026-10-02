# Welcome Wagon — first touch to every new WNY business

**Picked:** 2026-06-10, founder (Jacob), from a /features GTM-outbound run. Founder's framing at pick
time: exploring outbound where the lead is found and enriched by signal, not blasted; sibling
candidates (spec-built sites, citation-probe call opener, public league table) benched, not killed.
**Status:** spec'd, not yet approved to build.

## What it is

A standing pipeline that watches daily New York State new-business filings, filters to Western New
York, and produces a **physical welcome kit** mailed to each new business within days of its filing
date — before the business has a website, an agency, or any inbound noise. The kit contains a
hand-signed letter, a one-page "what new local businesses get wrong online" sheet, the business's
AI-visibility scan if it has any web presence (most won't — then the kit frames "start visible from
day one"), and a QR code to a personalized landing path.

The position this buys: Strelva is the studio every new Buffalo business hears from first. Day-one
timing is the asset — there is no incumbent to displace and no crowded inbox to fight, because the
channel is paper and the trigger is a public record almost nobody watches.

**Quotable sentence:** "Every new business in Buffalo gets a letter from us the week it files —
before it has a website, a Google profile, or anyone else's pitch."

## Why this survives (vocabulary for agents, not output)

- **Type: asset.** Stands on territory (Buffalo presence, true "Built in Buffalo"), timing (daily
  filing feed), and a physical channel a prospect's own AI cannot occupy. A generic agency running
  the same scripts has no local name to sign and no local proof to cite.
- **Interaction shape: delegate-and-review.** The pipeline gathers and drafts; Jacob reviews a weekly
  queue and physically sends. Nothing is ever sent autonomously — this is a hard rule, not a phase.
  (Research basis: the autonomous-outreach category is a documented graveyard as of mid-2026; the
  surviving shape is AI-researches / human-sends. See "Research" below.)
- **Data accrual:** every run grows a registry of new WNY businesses + per-kit outcomes (scanned QR,
  replied, converted). Over months this is a proprietary timing-and-response dataset no copy starts
  with.

## Mechanism (for the builder)

1. **Feed.** NY Department of State new entity filings, daily. Two known paths as of 2026-06-10:
   the Apify "US Biz Filings" actor (covers NY, ~4,000 entities/day nationally, filterable by filing
   date) or NY DOS public corporation search/bulk data directly. Filter: registered address in Erie /
   Niagara counties (extend later). Known data caveats: filings include name + address + registered
   agent but **almost never email or phone**; some addresses are registered-agent offices, not the
   business — detect and deprioritize known agent addresses (they repeat across filings).
2. **Enrich (best-effort, free-tier).** Light pass per filing: does a website/GBP/social already
   exist? Vertical guess from the entity name. Output feeds kit personalization, never a send
   decision.
3. **Scan.** If any web presence exists, run the AI-visibility scorecard
   (`scripts/ai-visibility.ts`, `--html` one-pager). If none: skip the scan, use the
   "day-one visibility" framing instead. Honest-surface rule applies — never claim a probe result
   that wasn't measured.
4. **Kit assembly.** Weekly review queue for Jacob: one screen per prospect (name, filing date,
   address quality, enrichment notes, drafted letter). Approved kits get printed; Jacob signs by
   hand (the anti-slop signal is the point — mid-2026 research shows synthetic personalization
   backfires and verifiably-human is the premium marker).
5. **Tracked landing.** Each kit's QR resolves to a per-prospect token URL that records the scan and
   forwards to `/access-request?ref=welcome-<token>` (the repo's only lead path). Reuse the existing
   tracker/event infrastructure; no new analytics product.

## This-week version (the first honest test — requires founder go)

Manual concierge run, no pipeline code beyond what exists: pull one week of Erie/Niagara filings by
hand, curate 20 with real (non-agent) addresses, write and print 20 kits, mail them
(~$60 postage), QR-tracked. This validates the response before any automation is built.
Per founder's standing rule, this outbound test ships only on explicit approval.

## Proof plan (done = proven)

- **Proof of life:** QR scans and replies within 3 weeks of the first 20-kit batch. Honest bar: ≥2
  scans or 1 real conversation justifies batch two; zero of both is a finding, not a failure to hide.
- Pipeline "done" (if built): a weekly queue renders real filings with enrichment, a test kit's QR
  round-trips to `/access-request` with its ref intact (shown working, not just tests), and outcomes
  land in the registry.

## Known risks, said out loud

- New businesses are cash-poor; the $1,500–2,500 Door-1 offer may be wrong for them. Which door (or
  a starter variant) this funnel feeds is a founder pricing call, deliberately left open here.
- Response rate is a guess. Direct-mail channel advantage is directionally credible but the cited
  magnitudes are sender-side industry numbers.
- Filing-address quality is the operational risk: too many registered-agent addresses → wasted
  postage. The curation step exists for this.

## Research this stands on (dated 2026-06-10, re-verify after ~3 months)

- Cold email to local SMBs degraded by inbox-provider enforcement (Google/Yahoo 2024, Microsoft
  2025); AI-SDR autonomous-outreach category in documented collapse (11x/Artisan ~70–80% churn,
  TechCrunch Mar 2025).
- Direct mail: widest reported response advantage of any channel (ANA/DMA-cited ~4.4% vs ~0.12%
  email; magnitude vendor-inflated, direction consistent across sources); almost no AI-native
  tooling pointed at it.
- New-business-registration feeds productized 2025–26 (Apify US Biz Filings, NY covered) and lightly
  used; registries lack contact email — which physical mail does not need.
- Anti-slop countertrend: AI-avatar/synthetic personalization measurably backfires in B2B tests
  (Sagum, Mar 2026); hand-signed physical artifacts read as premium.
- Regulatory: mail is outside TCPA/CAN-SPAM concerns; the aggressive 2025 TCPA one-to-one consent
  rule was vacated (11th Cir., Jan 2025). Not legal advice.

# Custom Software (Workflows) — Value-Prop Research & Ranking

> Grounds the previously-undefined Custom Software division. Source: a 9-agent
> research workflow (5 web-grounded researchers -> rank on the founder rubric ->
> adversarial pressure-test of the top 3), 2026-06. The pressure-test materially
> corrected the ranking — read §3 before acting on §1.

## 1. Ranking (verdict-first, scored 0-10)

| # | Value prop | Score | Verdict |
|---|---|---|---|
| 1 | **Intake → CRM / speed-to-lead** — "stop losing leads in your voicemail" | 8.4 | Strongest wedge; warm, data-backed cross-sell; fastest to paid |
| 2 | **Website + workflow managed bundle ("Business OS")** | 8.1 | The MRR engine — lift ACV on top of #1, not a standalone pitch |
| 3 | **Estimate → Invoice follow-up (trades)** — "stop leaving $15K in your quote folder" | 7.6 | Second catalog item — *but see §3, fails as framed* |
| 4 | **Vertical package for ONE Buffalo trade** (HVAC/plumbing) | 7.5 | Durable destination; build after 1-2 catalog items prove |
| 5 | "One workflow that pays for itself" (ROI framing) | 6.8 | A messaging layer, not a product — apply across the catalog |
| 6 | Client intake/onboarding (prof. services + wellness) | 6.3 | Legit 3rd/4th catalog item; most commoditizable of the four |
| 7 | Booking reminders / no-show recovery | 5.6 | Near-solved commodity; only if audit data demands it |
| 8 | Restaurant scheduling / compliance | 4.6 | Real pain, wrong fit (incumbents, thin founder advantage) |
| 10 | Generic "business-in-a-box" ops system | 4.4 | The bespoke trap in disguise — avoid |
| 9 | Payroll / tip reconciliation | 3.9 | **Avoid** — high-liability, incumbent-dominated trap |

**Top recommendation:** lead with **#1 (Intake → CRM)** as the single first catalog
workflow; monetize through **#2 (managed bundle)** as a warm upsell, not a one-off
project; **#3** is the second catalog item (re-scoped, see §3); **#4** the vertical
destination. Adopt **#5** framing everywhere. Avoid #8/#9/#10.

## 2. Why the top picks (the real moats)
The thesis leans entirely on three assets Strelva already owns and competitors
structurally cannot copy:
1. **The per-tenant event store** — turns the pitch into a warm, data-backed opener
   ("you got 14 leads last month, none are in a CRM"), zero-CAC, vs a cold claim.
2. **The production governance engine** (`src/lib/ai-governance.ts`) — the auto/review/block
   gate is the actual defensibility vs a generic AI/Zapier flow.
3. **The managed-website book + weekly receipt + Buffalo BNI referral graph** — the
   organic, founder-led distribution channel.

## 3. The pressure-test corrected the ranking (the most important section)
Adversarial verification of the top 3 changed the picture:

- **#1 Intake → CRM — survives, but the 8.4 is optimistic by ~1-1.5 pts, and
  commoditization is HIGH not medium.** GoHighLevel ($97/mo) ships missed-call-text-back
  natively; Zapier+Twilio replicates the core; OpenAI AgentKit (Oct 2025) claims
  8-minute no-code equivalents; GHL white-label agencies already niche to HVAC at
  $297-497/mo. The atomic automation is a commodity. The *only* genuine edges are the
  **warm-data front-door** and **governance** — and governance is **invisible at
  point-of-sale** (trades owners don't ask for "governed workflows"). Survival hinges
  entirely on the warm cross-sell actually converting.
- **#2 Managed bundle — survives, but WtP is UNPROVEN (`wtpReal: false`).** $500-2,000/mo
  is an assumption; realistic first proof is $200-500/mo. The bundle is "custom-services
  economics disguised as subscription" — margin-negative and non-scaling past ~5-8
  clients **unless the catalog is genuinely productized** (fixed scope/hours). Works only
  as a back-door upsell on earned trust, never a cold/bundled pitch.
- **#3 Estimate → Invoice — does NOT survive as framed (`survives: false`).** Jobber Grow
  ($199), Housecall ($59), QuickBooks all do follow-ups natively; Hatch is direct prior
  art; WorkQuote Pro is $20/mo. The "finds Jobber rigid" ICP is unsupported. **Rescuable
  only** by (a) restricting ICP to contractors with **no FSM software at all**, and
  (b) repositioning from "automated reminders" to **"the gap between your Excel quote,
  your QuickBooks invoice, and your job cost — with a human checkpoint when prices
  change."** As "reminders," the contractor buys Jobber or prompts ChatGPT.

**Cross-cutting flags:** the pain stats ($45K-$300K/yr, 21x, $17.5K avg unpaid) are
largely **vendor-blog-sourced** (Invoca, CallRail, Intuit) — directionally credible,
do not cite as fact without hedging. Commoditization is the recurring threat across the
top picks: Strelva is **not selling automation (commodity); it's selling a trusted local
human + AI that runs and governs it.** That has to be the explicit position.

## 4. The caveat the research kept assuming away (founder read)
Every top pick rests on the **warm website book** as the distribution channel. Per
current reality, that book is **~2 live clients (GLDF, Rohlax) and $0 MRR.** So this is a
strong plan for a book that **doesn't exist at scale yet.** Implication: don't build a
catalog for a hypothetical book — **test #1 on the two real clients first.** The binding
constraint is unchanged from the website division: *will one real local business pay for
a managed workflow?* The architecture, the catalog, and the vertical package are all
downstream of that single paid proof.

## 5. Kill criteria (keep these)
Fold Custom Software back into the website motion, or don't stand it up, if:
1. **Productization fails** — 2nd build of the first workflow takes >~30% of the first
   (workflows aren't 80% identical -> collapses to bespoke).
2. **Governance margin fails** — review-queue volume per workflow doesn't fall across the
   first 3 clients (Jacob is babysitting queues -> no "near-zero marginal").
3. **Warm-door fails** — 3 months of audit→receipt→catalog in one vertical yields zero
   warm conversions and no forwarded receipt.
4. **Price-floor fails** — can't clear ~$3K project + $500/mo at positive margin.
5. **Commoditization fails** — buyers are satisfied with what a generic AI / $50/mo
   Zapier flow already does and won't pay for governance + ownership + local trust.
6. **Liability tripwire** — the only deals require payroll/tax correctness (rank 9): refuse.

## 6. The honest first move
1. Take **#1 (Intake → CRM)** to **Rohlax and/or GLDF** (the two real clients) with the
   warm opener using their actual event data.
2. Lead with **#5 framing**: "this recovers ~N jobs/month you're losing to slow response =
   $X/yr," not "we automate your intake."
3. If one pays (even $200-500/mo), the division has a pulse and the catalog/vertical plan
   becomes worth building. If not, the kill criteria say fold it back.

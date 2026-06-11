# Strelva Websites — Two-Door Offer (hardened)

Date: 2026-06-09
Status: hardened via founder-loop review + live claims verification (Squarespace/Wix exit docs, WaaS contract norms, NY/FTC auto-renewal status, competitive shelf). Founder decision pending on final prices.

## The product (both doors, same fulfillment)

Done-for-you custom site (separate repo, client-owned domain) + governed AI management + the weekly plain-English report. The build is not the product — the *never-think-about-it* layer and the weekly proof are.

## Door 1 — "Built for you" (lead with this, always)

- **$1,500–2,500 one-time, paid before work starts** (floor: $1,000, warm referral only; walk below that).
- **Includes first 3 months of management; $99/mo after.** Management is never an optional add-on — the attach is built into the price, and the renew decision lands at day 90 after three receipts have argued for us.

## Door 2 — "Managed" (the rescue close when Door 1's upfront price balks)

- **$499 start + $199/mo, 12-month minimum, auto-renews month-to-month after.**
- **Own-it-after-12:** at month 12 the repo and all files transfer on request; the domain was theirs from day one.
- **Early exit:** keep the domain + full content export, always. Repo buyout before month 12: build value ($1,995) minus subscription paid to date, floor $0.
- Pitch order discipline: never offer Door 2 first — it cannibalizes upfront cash for the same year-one total.

## Scope walls (what $99–199/mo includes — without this, it's unlimited agency work)

**Included:** governed AI content/text/image updates, hours/services/menu changes, blog posts, weekly report, uptime monitoring, small tweaks. **One active request at a time.** (AI-visibility monitoring returns to scope when the recurring cron ships — claims discipline.)
**Excluded — quoted separately as Custom Software:** redesigns, new sections beyond one/quarter, e-commerce, integrations, custom features, workflows.

## Verified competitive claims (graded by live verification, 2026-06-09)

**Safe as-is:**
- "Leave Squarespace and you get a partial content file — text, images, one blog. No design, no CSS, no store, and it won't import into another platform." (Squarespace's own docs, fetched.)
- "Move off Wix and you're rebuilding from scratch — only your domain comes with you." (Wix's stated position; fetch the Wix help article directly before contract use.)
- "12-month pay-monthly-then-own-it is industry-standard — we just made the terms honest."
- "With us the domain is in YOUR name from day one, and you leave with everything."

**Never say:**
- "You lose your domain on Squarespace" (false — transfers out).
- "Squarespace gives you nothing" (false — content export + reactivation window exist).
- "The law requires us to send renewal notices" (FTC click-to-cancel vacated 7/2025; NY GBL 527-a is consumer-only). We send reminders and allow one-email cancellation as policy, not compliance.
- Townsquare "locks you in" as their policy — attribute to BBB/Trustpilot reviews (post-cancel hosting fees, domain disputes), not their stated terms.

## The shelf this sits on (buyer's comparison set, 2026 prices)

GoDaddy Airo $10–27/mo (DIY, not managed) · B12 $169–339/mo (managed updates only at top tier) · Hibu ~$499 + $99–159/mo (12-mo verbal lock-in reputation) · Townsquare ~$250 advertised / $350–900 real (entrapment complaints) · local care plans $100–300/mo · GHL agencies ~$297/mo. **The shelf's shared weakness is entrapment; ownership-in-writing is the wedge.**

## ICP want-map (evidence-ranked, scouts 2026-06-09 + JTBD.md)

1. **The outcome (customers), not the artifact** — strongest (39% build for sales; 45% say customers are the challenge)
2. **Never do or learn this work** — 46.8% cite lack-of-knowledge as #1 tool barrier; no marketing hire at ≤10 staff
3. **Get found** (Google + AI) — ~90% search-reliant; owners do nothing about it
4. Look credible — secondary (24%)
5. Predictable cost — weakest; never lead with price

## The beat-Squarespace case (documentable)

1. **They hand the owner the outcome** — Squarespace's own help doc: ranking is "your own work." Their 2026 AI accelerates DIY but keeps the owner operating and owns no result. Business-model-deep gap; can't be patched into $16/mo self-serve.
2. **No local layer at all** — no GBP, reviews, local schema, or outcome reporting. That layer is our product.
3. **"Looks nice, does nothing"** — the live-but-silent site is the felt failure; the weekly receipt closes the loop.

Sales line (sourced to their docs): "Squarespace says getting found is 'your own work.' That's the part you're paying us for."

Pitch corrections from evidence: sell the chat + receipt, demote the dashboard (proof, not product); for trades, open with money leaking ("customers are looking; you're not there"), never "your website." Never promise lead counts — we own the work and the proof, not a guaranteed result.

## Objection table

| Objection | Clears with |
|---|---|
| "Squarespace is $23/mo" | "That's software — you're the webmaster. This is never thinking about it, plus weekly proof." Show a real receipt. |
| "Last guy disappeared with my site" | Domain in your name day one; own-after-12 in writing. |
| "How do I know it's working?" | The weekly report IS the answer. Show one. |
| "12 months is long" | Own-it-after framing + buyout math + keep-domain-and-content always. |
| "Can't AI do this free?" | "Yes — the build. You're not paying for the build." |

## Open items

- Lawyer pass on the 12-month auto-renew terms before the first Door 2 signature (B2B exclusion from NY 527-a assumed, unconfirmed).
- Fetch Wix help article directly before Wix claims enter a contract.
- Up-front charge (Door 1 build / Door 2 $499 start) is collected via a per-client `/pay/[slug]` link Jacob mints with `POST /api/admin/pay-links`; the Door 2 $199/mo + $99 care recurring prices still need creating in the Stripe dashboard.
- Capacity ceiling acknowledged: 4–6 builds/month ≈ $8–15K/mo one-time + accreting MRR; the cow's size until acquisition repeats without founder labor (first organic at-bat is the signal to watch).

## Review verdicts (founder-loop, 2026-06-09)

Pursue Door 1 now · test Door 2 as rescue close on next 3 warm balks · test $1,500–2,500 on next close · weakest axis is distribution/repeatability (4/10) — plan produces $3–10K/mo while founder actively sells; becomes a cow only when an acquisition event happens that the founder didn't manually create.

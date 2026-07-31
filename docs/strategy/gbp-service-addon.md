# GBP Managed Service — Add-On Scoping (deep)

> Scoping a paid "managed Google Business Profile" add-on sold on top of the
> Strelva managed-website subscription. Research 2026-07-30 (3 fronts: Strelva's
> existing GBP code, the GBP API reality, the market). This is Strelva's own
> product built on Google's public API + market — not derived from any other repo.

## TL;DR

- **The wedge:** nobody bundles *the website they already manage* with GBP as one
  done-for-you local presence. You hold the client and the site; GBP drives the
  map-pack traffic to the site you built. Same NAP, one throat to choke.
- **The surprise:** Strelva's **GBP write + governance engine is already built and
  tested** — posting, hours, photos, review replies, auto-reply, all through the
  queue-and-approve spine. The single hard blocker is **Google Business Profile
  API access approval** (a 3-10+ day manual gate). Everything downstream is coded.
- **The gap to sellable** = the client-facing VALUE layer: GBP-native performance
  insights, map-pack rank (geogrid), broader profile editing, multi-location — plus
  that API grant.
- **Price:** DFY GBP management runs ~$200-300/mo/location standalone. Bundle it at
  **+$99 / +$149 / +$199/mo** tiered to the site plan (anchor **$149**). High margin
  because the work is largely automatable and CAC is ~zero (existing site clients).

## 1. What Strelva already has (the head start)

**Built + LIVE today:**
- Google OAuth connect (one consent, `business.manage` + GSC + GA4 scopes; encrypted
  token storage, refresh, `google-meta:{tenant}` account/location).
- Review **fetching** (poll-google-reviews cron, paginated, diffed, owner alerts) +
  Yelp poll + sentiment/intelligence (admin-vs-client split, urgent-first reply queue).
- Reply-voice governance modes (off / approve / auto).
- Single-point local SERP + local-pack + AI-answer tracking via Serper.dev (not GBP,
  not geogrid) — cheap (~$0.012/tenant/mo).

**Built but BLOCKED on Google API access approval (not a Strelva flag):**
- `create_gbp_post`, `update_business_hours`, `upload_gbp_photo`, `publishReviewReply`,
  and the 12h-delayed auto-reply — all SSRF-guarded, write-then-read-back-verified,
  routed through the governed queue-and-approve path (never auto-publish external
  without approval). `isSetupPendingError()` already soft-fails to a "being set up"
  state and keeps approved drafts pending so they fire the day access lands.

**Missing (the value layer a managed client pays for):**
- **GBP-native performance insights** — NONE. "Performance" today = GSC + GA4 only.
  Clients expect "your profile got N calls / N direction requests / N searches."
- **Map-pack rank / geogrid** — NONE (single-point SERP only, no geographic grid).
- **Profile-field breadth** — only hours/posts/photos/replies. No description,
  categories, services, attributes, special hours, Q&A, products.
- **Multi-location** — OAuth blindly takes `accounts[0]/locations[0]`; no picker,
  no roster.
- Post scheduling / content calendar (posts are one-shot on approval).
- The `google-meta` tenant-rename gap (linkage strands on a slug rename).

## 2. The GBP API reality (what's automatable)

| Capability | API? | Notes |
|---|---|---|
| Local posts (standard/event/offer) | ✅ | Local Posts (v4 surface, active) |
| Reviews read + reply | ✅ | Reviews API (v4) |
| Business info (hours, categories, attributes, phone, description) | ✅ | Business Information API v1 |
| Media / photos | ✅ | Media API v1 |
| Performance (impressions, map views, calls, directions, clicks, search terms) | ✅ | Performance API v1 (`fetchMultiDailyMetricsTimeSeries`); data lags 3-5 days |
| Q&A | ❌ | **API shut down 2025-11-03** — monitoring is now manual only |
| Messaging / chat | ❌ | Discontinued 2024, no API |
| **Local rank / geogrid** | ❌ | **Never in any GBP API** — must buy 3rd-party grid scans |

**Access + quota reality (the critical path):**
- One scope: `business.manage`. Access is a **manual Google approval** (days to weeks)
  via the Business Profile API access request form.
- Default 300 QPM/API after approval; **hard cap 10 edits/min per profile** (can't be
  raised) — bulk edits must be paced.
- **Two traps:** (a) approval can leave Account-Management quota = 0 (blocks
  `accounts.list`) → separate quota request; (b) increases denied if you use <50% of
  current QPM, so you can't pre-provision for scale. Denials also hit when the app's
  website domain ≠ contact email domain or the use case is vague.

**Geogrid = a bought input.** Grid scans (query Maps from many lat/long pins, render a
heatmap) are the industry-standard "where do you rank across the map" deliverable and
cost per scan: **Local Falcon** (category leader, real API, ~$25/mo+), **Geogrid.dev**
(API-first, pay-per-use), BrightLocal (from $39/mo, coarser). Budget as a per-location
recurring cost; pick one with a real API so scans automate.

## 3. The market + pricing

- **DFY GBP management median: ~$200-300/mo per location** (+$300-500 typical one-time
  setup). Tools (BrightLocal $39-59, Whitespark $20+, Localo $39) sell software, not
  outcomes — they put the work back on the owner. Agencies silo GBP with no website tie-in.
- **What SMBs actually pay for, ranked:** (1) review monitoring + replies — the #1 thing
  they want off their plate; (2) showing up in the map pack + rank reporting (the ROI
  proof); (3) profile optimization; (4) posts ("keeps it active"); (5) photos; then Q&A,
  suspension monitoring (low until it happens, then critical), and the monthly report
  (low intrinsic value, high *perceived* value → retention tool).
- **They don't buy "GBP management" — they buy more calls/directions/bookings, a clean
  review reputation, and not having to think about it.**

## 4. Recommended product

**Bundle it, don't silo it.** "Your website and your Google presence, managed together."

Pricing (tiered to the site plan; anchor **+$149/mo**):
- **+$99/mo** (on the $99-199 site tiers) — posts + review monitoring & replies +
  profile optimization + monthly performance report.
- **+$149-$199/mo** (on the $299-499 tiers) — adds map-pack **geogrid** rank reporting +
  review-generation + competitive monitoring.
- **One-time setup/optimization: $99-199** (below the $300-500 market norm — captures the
  front-loaded work without scaring the bundle).
- **À la carte pass-through** (don't absorb incident risk): suspension reinstatement
  ~$750, review dispute ~$425, matching the market.

Margin is strong: posts, review replies, and reports are automatable; geogrid is the only
per-location hard cost (~$25/mo tier). CAC ~0 (upsell to existing site clients).

## 5. Build plan (ordered by critical path)

1. **Apply for GBP API access NOW.** This is the gate on everything already built, it's a
   3-10+ day manual review, and the Account-Management-quota-0 trap can add another round.
   Use a domain-matched site + a concrete "we manage listings for our website clients" use
   case. **Nothing ships until this lands — start it today.**
2. **GBP Performance API insights** — the core "here's what your profile did this month"
   reporting (calls / directions / map views / searches). Highest client-facing value;
   today only GSC/GA4 exist. Reuse the report/email + 3-5-day-lag-trim patterns already built.
3. **Map-pack visibility** — either ingest **Local Falcon/Geogrid** scans (real geogrid
   heatmap, per-location cost) or, as a v0, surface the existing Serper local-pack tracking
   as a client-facing "map pack position" report. Geogrid is the ROI proof clients renew for.
4. **Multi-location selection UI** — replace the blind `accounts[0]/locations[0]` pick;
   required for any client with more than one obvious listing (and for multi-site accounts
   like Twin Trees).
5. **Broaden profile editing** — description, categories, services, attributes, special
   hours (all Business Information API v1). The day-to-day of "managing" a GBP.
6. **Post scheduling / content calendar** — recurring posts vs. one-shot-on-approval.
7. **Close the `google-meta` tenant-rename gap** (in AGENTS.md's known-issues).

## 6. Risks / gotchas

- **API approval delay + quota-0 trap** — the #1 launch risk; front-load it.
- **10 edits/min/profile hard cap** + 429s on burst — pace bulk work, backoff.
- **Performance data lags 3-5 days**, zero rows for unreported days (trim trailing zeros —
  the report engine already handles this pattern).
- **Verification / owner-or-manager access must be granted per location** before you can
  manage programmatically — an onboarding step, not automatable.
- **Q&A + messaging can't be automated** — set expectations; Q&A monitoring is manual.
- **Geogrid is a real recurring cost** — price it into the higher tier, don't eat it flat.

## 7. Bottom line / recommendation

Strelva is unusually close to this: the hard part (governed GBP writes) is already built.
The move is: **(1) file the GBP API access request immediately** (critical path),
**(2) build the performance-insights + map-rank reporting layer** (the value a client pays
for), **(3) launch as a +$149/mo bundle** to the existing website book. It's high-margin
recurring revenue on largely-automatable work, with a real wedge (nobody bundles the
managed website + GBP), and it compounds the OWSH sales motion rather than being new product
for its own sake — you're deepening the wallet share of clients you already have.

---

# Combined feature set — Website + GBP (2026-07-31)

The bundle story: **one login, one monthly report, one bill** for a local business's
entire online presence. The website is the conversion destination; GBP is the map-pack
traffic engine that feeds it. Below, `[live]` = works today, `[built·blocked]` = coded +
tested, waiting on Google API access, `[build]` = to build for the add-on.

## Base: Managed Website (existing — $99 / $199 / $499)
- Custom hand-built site + hosting + client-owned domain `[live]`
- Update-by-chat AI agent (governed publish/review/block) `[live]`
- Dashboard: Today, Analytics (GA4 + GSC), Reviews, Reports `[live]`
- Lead capture — "who reached out" + spam-gated forms `[live]`
- Site health / SEO audit + weekly/monthly report `[live]`
- Single-point local visibility (SERP + local-pack + AI-answer mentions, Serper) `[live]`
- Ownership: domain in client's name, content export anytime `[live]`

## GBP Add-on (+$99 / +$149 / +$199)

### Pillar 1 — Reviews (the #1 thing they want off their plate)
- Monitor all Google reviews (poll cron, new-review alerts) `[live]`
- Done-for-you replies: off / draft-to-approve / auto-post after 12h, per-client mode `[built·blocked]`
- Sentiment + urgent-first "needs a reply" queue; owner sees positive numbers only `[live]`
- Review generation: owner's Google review link + order-triggered request emails `[built·blocked]` (needs the Place ID field — now operator-settable)

### Pillar 2 — Posts (keeps the profile alive)
- AI-written Google Posts through the governed approve path `[built·blocked]`
- Post scheduling / recurring content calendar `[build]`

### Pillar 3 — Profile management
- Business hours + special hours `[built·blocked]` (hours) / `[build]` (special hours)
- Photo management (logo/cover/exterior/interior/…) `[built·blocked]`
- Description, categories, services, attributes `[build]` (all Business Information API v1)
- Q&A + messaging — NOT offered (Google killed both APIs; Q&A monitoring is manual)

### Pillar 4 — Performance + proof
- GBP-native insights: calls, direction requests, map views, search impressions, search terms `[build]` (Performance API v1)
- Map-pack geogrid: rank heatmap across a grid of points `[build]` (Local Falcon / Geogrid ingest)
- Combined monthly report: site performance + GBP performance + map-rank movement `[build]` (extend the existing report engine)
- Multi-location: account roster + per-location GBP (ties into the org-layer accounts) `[build]`

## Tiering (which features land in which add-on tier)

| | +$99 Essential | +$149 Growth | +$199 Scale |
|---|---|---|---|
| Review monitor + DFY replies | ✅ | ✅ | ✅ |
| Google Posts (managed) | ✅ | ✅ | ✅ |
| Profile optimization (hours/photos/categories/services) | ✅ | ✅ | ✅ |
| GBP performance in monthly report | ✅ | ✅ | ✅ |
| Review generation (request campaigns) | — | ✅ | ✅ |
| Map-pack geogrid rank reporting | — | ✅ | ✅ |
| Competitive monitoring | — | — | ✅ |
| Multi-location management | — | — | ✅ |
| One-time setup/optimization | $99 | $149 | $199 |
| À la carte pass-through | suspension reinstatement ~$750 · review dispute ~$425 |

## What unlocks each pillar
- Pillars 1-3 (reviews / posts / profile) are almost entirely **`[built·blocked]` → the
  single unlock is Google API access approval.** File it first.
- Pillar 4 (performance + geogrid + report + multi-location) is the **net-new build** and
  the real client-facing value — do it in parallel with the API application so it's ready
  when access lands.

## Cost inputs to the margin model (geogrid TBD)
- GBP API: **free** (just the approval gate + quotas).
- Serper local visibility: already ~**$0.012/tenant/mo** (near-free).
- **Geogrid (Local Falcon): the one real per-location recurring cost — pricing modeled
  separately (in progress).** This is what sets the floor on the +$149/+$199 tiers.

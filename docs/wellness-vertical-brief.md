# Strelva Wellness Vertical — Brief for Jacob (+ agent)

**From:** Noah · **Date:** Jul 7 2026 · **Status:** Decision made (wellness = first vertical), scoping + validation next
**Purpose:** This is my thinking + the research so far on making wellness studios Strelva's first vertical. **I want you (and your agent) to validate it, pull it apart, and tell me where I'm wrong** — especially on positioning and GTM, your lane. It's self-contained: everything below came out of a working session (Acuity deep-dive → 7 research agents → product/architecture/branding/roadmap scoping). Straight, not a hype doc — the caveats are called out on purpose so you can pressure-test them. Push back hard; I'd rather be corrected now than a month into the build.

---

## TL;DR

I want to make Strelva's **first vertical focus wellness studios (Pilates/reformer to start).** The one-liner: **"Acuity but modern and actually good, plus the online-presence layer we already do."** Studios today duct-tape a booking tool (Acuity/Mindbody) to a separate generic Squarespace/Wix site. We make it one thing, and make it beautiful.

This is a shift from our Jul 4 strategy (which picked trades/auto-repair). I still think trades is a good later lane. I want to lead with wellness because it plays to our single biggest strength (design) and I have a warm first user to build with right now (Jazz's studio, Cove Wellness). Details + the honest tension below.

**Where I need you:** positioning, ICP refinement, and GTM — and specifically, running a handful of studio-owner validation calls with me before we commit the heavy build.

---

## Why wellness (the case)

1. **Our design edge is the deciding factor here, and wasted elsewhere.** A plumber does not care if his site is gorgeous. A Pilates owner buys on exactly that — wellness is an aesthetics-driven, Instagram-native market where the brand *is* the product. Every Mindbody/Squarespace studio site looks identical and cheap. This is the one market where the thing we're best at is what closes the sale.
2. **The incumbents are beatable.** Mindbody is expensive ($139-699+/mo, real spend often $1,000+ after fees) and openly hated. Acuity is cheap but dated, stagnant under Squarespace, and can't really do classes (no waitlist, no real class engine). None of them bundle a genuinely nice site — 80% of Mindbody's own customers run a separate Squarespace/Wix.
3. **Warm, watchable first user.** Cove Wellness (Jazz's 2-person reformer studio). We can build with a real studio in the loop, and studio owners refer each other constantly — word of mouth is strong in this world.
4. **Category tailwind.** Reformer Pilates is booming — 46% of all new boutique-fitness openings in 2025, ClassPass Pilates bookings +66% YoY. 80%+ of the market is tiny independent studios (not chains), which is exactly our reachable buyer.

---

## The market (validation summary)

From a 5-agent validation pass. **Verdict: build, but narrow.**

- **Size:** TAM ~$240-430M/yr (all wellness categories, NA). SAM (Pilates+yoga) ~$48-90M/yr, ~40-50K studios. SOM ~$0.5-1.8M ARR at 1-2% share (150-300 studios) — a real 2-person cashflow business, not a venture rocket.
- **The honest catch:** "bundle site + booking" is **not** a novel wedge. OfferingTree has sold exactly that since 2018 (bootstrapped, still independent). Arketa ($26M raised), Walla ($18M), Momence all claim it. And the market just consolidated hard: Mindbody+ClassPass+EGYM = a $7.5B entity; Momence + Mariana Tek got rolled into one PE portfolio. Capital is chasing franchises, not tiny studios — which opens a gap at the bottom, but means we're not entering empty space.
- **The buyer barely switches.** Real switches are triggered by acute failure ("nightmare, lost my data"), locked behind 12-36 month contracts and fear of losing client/billing data in migration. So the wedge is not "more features" — it's **design + trust + honest pricing + doing the class stuff right**.

## Competitive quick map

| Player | Real cost/mo | Site bundled | Design | Fails a tiny studio because |
|---|---|---|---|---|
| Mindbody (now Playlist) | $139-699, real $1k+ | No | Dated | Expensive, hated, 20% marketplace cut, enterprise-first |
| Acuity + Squarespace | $16-49 + site | No | Clean | Two tools, no real classes/waitlist (this is Cove today) |
| Momence | $60-499+ | Yes | Modern | Now PE-owned; small studios likely deprioritized |
| Walla | $220-679 | +$160/mo add-on | Strong | Website is a pricey add-on on top of a high base |
| Arketa | $49-124+ | Top tier | Strong | Documented trust failures (payout holds, "holds your data hostage") |
| GlossGenius | $24-148 | Yes | Best | Structurally can't do group classes |
| OfferingTree | $26-225 | Yes | Generic | Closest analog; its own users say the sites are the weak spot |

---

## The 3 wedges (what makes us worth switching to)

1. **Real reformer bay-selection** — a visual floor map where each numbered reformer is a bookable resource. Marketed by everyone, delivered by almost no one (Momence fakes it with duplicate class listings). Strongest differentiator.
2. **Design a studio would screenshot** — our existing edge, and the reason we win vs OfferingTree/Mindbody.
3. **Disclosure-first, done-for-you migration** — the #1 fear that keeps owners stuck (losing clients/billing data). Nobody does it well. Turn it into the reason they leave.

**Plus a cheap bonus (not a headline):** every studio's own site installs to a member's phone as *their own* branded icon (a PWA) — an app-like experience for ~free, no App Store, pulled from the studio's branding. Incumbents gate even this behind $100-700/mo. A real native App Store app is a V3 maybe, not a promise.

---

## How it fits Strelva (product model)

**Wellness is not a new product — it's an edition.** Strelva is one multi-tenant control plane; we already have 6 template packs (wellness, food-brand, restaurant, trades, professional, fashion-stylist). A studio signs up to the same Business OS as any other tenant; what changes is the preset:

- `tenant.template` (the look) + `site_capabilities` (which modules turn on) + `dashboard-surfaces` (what the owner sees) + defaults.
- Sign up as a studio → wellness edition boots (class roster, members, packages) instead of a menu editor (restaurant) or quote tool (trades).

Right shape for a 2-person team: serve many verticals off one codebase, spend build **depth** in exactly one (wellness). Others stay light. If wellness wins → it's the flagship edition and the rest prove the model repeats.

---

## Architecture reality (what's built vs what's new)

- Control plane = one deployment; public studio sites are separate custom repos pulling `/api/v1/*`. Routing in `src/proxy.ts` (subdomain → tenant, custom domain, path fallback).
- **Already built + reused:** multi-tenancy, Stripe subscription billing (live), a booking engine (`src/lib/booking.ts` + `bookings` table + availability/timezone/buffer), Calendly + Vagaro webhooks, member CRM/loyalty (`reward_members`) + operator CRM, reviews/audits/analytics/GBP, the AI agent, and a `wellness` template (the registry default).
- **The new build for Pilates:** `bookings` is 1:1 appointment only today — **no recurring classes / capacity / waitlists** (the core build), no member portal, no class-payment path.
- **One architecture call:** class-booking-with-payment breaks the current "control plane doesn't own client checkout" rule (or lives in a shared package the studio site consumes). We've decided to build it.
- **The real bottleneck (agent should flag this):** today each site is hand-built (productized *agency*), not self-serve SaaS. We can't reach 150-300 studios if each needs a bespoke build. The highest-leverage move is **productizing the studio site into a near-self-serve templated delivery lane** (`custom-repo-starter`). That's what decides $500K-agency vs $1M+-ARR-SaaS.

---

## Branding direction (the Strelva-side wellness marketing surface)

Two surfaces: (1) a `strelva.com/wellness` marketing page that sells the edition to owners; (2) the studio's own site theme (personalizable per studio — NOT a uniform skin). Direction: keep Strelva DNA (Fraunces + Inter + sage) but invert our dark OG landing to **light + pastel + airy**, because that's what a studio brand wants to feel like. Distinctive take, not the generic cream-serif-stretch-pose wellness template. Mock is in the artifacts below.

---

## Pricing

- **Cove today:** Acuity Standard $27/mo + Squarespace (~$16-23) = **~$45-55/mo across two tools.** A budget, light buyer.
- **Structure that fits:** keep the **subscription low** (an easy yes vs their current ~$50 split — think ~$49/mo all-in, consolidating two tools + upgrading the site/booking/app) and make the real money on the **payments spread** (Stripe Connect % of class revenue). This matches the incumbent model — payments is >50% of Mindbody's revenue.
- **Two segments to price for:** budget studios like Cove (Acuity refugees — low sub + payments), and premium studios (Mindbody/Walla refugees paying $200-700 — bigger consolidation + savings pitch, higher ACV). The premium segment is where the money is; Cove is the design partner.

---

## Roadmap: V1 → V2 → V3

**V1 — MVP (run Cove, let a studio switch).** The core loop, beautiful and reliable.
Stunning site [reuse] · recurring classes + 1:1 privates one system [extend] · capacity = #reformers [extend] · basic numbered-bed pick [new] · self-booking web+PWA [extend] · packs/memberships/drop-ins/intro offers [new] · payment tied to booking via Stripe Connect [new] · auto late-cancel/no-show [new] · client records + visit history [extend] · intake+waivers [new] · email reminders [extend] · basic exportable reports [extend] · disclosure-first white-glove migration [new].

**V2 — Depth (become the favorite).**
Visual reformer floor-map spot selection [new] · waitlist+auto-promote · SMS+win-back · membership freezes · sub-instructor swap · real reporting: retention/LTV (whitespace — incumbents fumble this) · gift cards+light retail · proactive AI drafting posts/replies/win-backs [reuse].

**V3 — Scale/moat/repeat.**
Multi-location · payroll/commission · native App Store app, optional (Strelva container or premium branded) · marketplace/lead-gen or a Strelva network · virtual/VOD (optional) · advanced proactive AI ops · launch the next vertical (trades) on the same rails.

**Usage data anchoring V1** (Pilates Bridge owner survey): self-booking 86%, packs 73%, reports 66%, privates 56%, waitlist 49%, app+memberships 44% | payroll 30%, video-on-demand 7% (= V3/skip).

## Deliberately NOT building (bloat that sinks small-studio tools)

20%+ marketplace commission (owners route around it), enterprise marketing funnels, dynamic pricing (no incumbent even ships it), heavy payroll, video-on-demand first, and multi-location until a studio actually needs it. All "pay for and never touch" for small studios.

## Two rules above the feature list

1. **Reliability beats features.** The #1 reason studios stay is "no outages." A silent billing failure is invisible until it's a client complaint — and user zero is Jazz's real revenue. V1's payment/auto-charge path must be bulletproof.
2. **Migration is a trust ritual, not a data dump.** The universal failure is *silence before commitment*. We win by front-loading exactly what can't move (cards, ACH re-auth) *before* they sign, and reconciling pack balances before go-live.

---

## The honest tension (so we decide it with eyes open)

Our Jul 4 research picked **trades/auto-repair** because: real whitespace (no bundled site+GBP+reviews incumbent there), we already have trades traction, and the plan was keep the product horizontal + niche only the marketing. Wellness cuts against that: it's a mature-incumbent field (Mindbody etc.) and it pulls us toward a studio-operations/booking product (a different, deeper build) vs the get-found/presence product we've been building.

**My resolution:** the conflict is really about depth.
- **Stage 1 (wellness as a GTM lane on the current product) doesn't conflict** — beautiful site + presence/reviews (built) + their existing booking embedded. Uses our design edge + warm users, can run alongside trades.
- **Stage 2 (the class engine + member app + class-pay) is the real commitment** — that's where we choose to go deeper than a plumber needs. I'm calling it: we build it, but we **validate first** (below).

## What I want from you (validate + push back)

Be a hard check on this, not a rubber stamp. Specifically:

1. **The wellness-over-trades call.** I'm leaning wellness first. Does your read on our trades traction change that? If you think trades is still the right first move, make the case — I want to hear it.
2. **The market read.** Does the "design + migration + honest pricing" wedge hold up against your instincts, or am I underrating how entrenched Mindbody/Momence are? The whole thing rests on studios paying a premium for design, which is still unproven.
3. **Positioning + GTM (your lane).** How do we actually say this, and how do we get in front of studio owners? Facebook groups, IG, referrals, a switch-story content play? What's the one-liner?
4. **Pricing.** Low subscription + payments spread — agree? What number would you put on it?
5. **Identity question.** Are we comfortable stretching Strelva from "local presence / get-found" toward "studio operations / booking"? Wellness pulls us that way.
6. **The validation calls.** Will you run 5-8 studio-owner calls with me before we commit the heavy build? This is the cheapest way to be right.

Disagree with any of it. The point of this doc is to get your brain on it, not to sell you.

## Immediate next step (the cheap unlock)

**Run 5-8 studio-owner validation calls (you + me).** The one thing in this entire analysis that's still a guess, not a fact: *will small studios pay a premium for design + safe migration?* Cove validates the consolidated-beautiful-site wedge but is a light class user, so it does NOT validate the heavy class build on its own. We need to hear it from Mindbody/Walla-refugee studios that feel real class pain. If they'll pay, we green-light Stage 2. If they hesitate like they do about every switch, this is a design-led managed-site business (still real), not a SaaS. (Noah to draft the interview script.)

---

## Artifacts (visual, shareable)

- **Market validation memo (verdict):** https://claude.ai/code/artifact/fd07afa3-e177-41e8-bc9b-c4e7e20f924d
- **System topology (how a studio lands):** https://claude.ai/code/artifact/b629e6cf-662d-4e87-8b5b-33bb1fb86671
- **Product model (editions/verticals):** https://claude.ai/code/artifact/fb4968af-7a33-484f-b4fa-4942036f8c99
- **Wellness landing direction (light/pastel):** https://claude.ai/code/artifact/a00c6b6a-6848-4f2e-bb16-c196ad6c8710
- **V1/V2/V3 build roadmap:** https://claude.ai/code/artifact/7e3abd73-56bc-4adf-9758-78c8c1832f85

*Full internal working notes: `brain/1-projects/scaffold-web/wellness-vertical-2026-07-07.md` (Noah's vault).*

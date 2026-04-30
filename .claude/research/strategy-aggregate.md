# Stochastic Strategy Aggregate (n=10)

10 independent strategy agents, identical prompt, grounded in research brief.

## Consensus (mode — what most/all agreed on)

**Wedge (10/10).** "AI texts the owner one specific signal + one drafted fix; owner replies YES; agent ships in <60s and confirms with live URL. Recurs weekly." This is the entire product. Detect signal (Search Console + Google Business Profile + site monitoring) → SMS → reply YES → publish → confirm.

**Wedge re-framed (10/10).** "The thread IS the product. The dashboard is the receipt." The SMS conversation is the primary surface. Owner never opens a CMS. Web app is mirror of the texts.

**Homepage hero (10/10).** A live, scrolling iMessage thread between the agent and a real customer. NO gradient, NO 3-card grid, NO "AI-powered" copy, NO Sparkles. Aesthetic anchor: **Linear (8/10)**, with Cal.com (1) and Mercury (1) named as alternates. Dense, dark, monospace timestamps, real timestamps, the work IS the marketing.

**Day-one session (10/10).** Owner enters phone + current site URL → SMS arrives within 60–90 seconds with first finding/fix offer → owner replies YES → page/change live in <60 seconds → confirmation text. Returns next week because Monday/Friday text arrives unprompted.

**Shareable artifact (10/10).** Weekly report rendered for SMS-screenshot proportions. Three numbers ("47 found you / 12 clicked / 4 booked") + plain-English line of what the agent did + one pending YES decision. Public URL at `/report/[week]` or `/this-week/[id]` for forwarding. Either iMessage screenshot or branded card. Format itself is the marketing.

**Sitemap skeleton (10/10).** Every agent's sitemap includes:
- `/` — SMS thread hero
- `/signup` or `/start` — phone + URL (≤2 fields)
- `/thread` or `/inbox` — SMS web mirror, primary surface
- `/this-week` or `/report` — weekly artifact
- `/report/[week]` — public shareable URL
- `/site` — live preview, recent changes
- `/admin/queue` — operator approval pile (Jacob)
- `/admin/tenants` — MRR + health
- `/admin/signals` — Slack-mirrored event stream

**First 100 customers (10/10).** Physical, in-person, one metro, one vertical, free first month, force peer-to-peer pollination. Print the artifact, hand it over, get the YES same-day. Jobber/Toast playbook. Paid ads explicitly rejected.

**Kill criteria (10/10).** Reply-rate threshold. Range: "<30% YES reply within 30 days" to "<40% YES reply by week 4" to "<50% by day 90." Median: **<30–40% YES reply rate by week 4 = kill.**

**Top uncertainty (8/10).** SMS deliverability + reply rate. Whether owners actually open and reply to AI-initiated texts vs treating as spam. Several explicitly call out **A2P 10DLC registration** as non-negotiable. Validation must happen week 1 with manual pilots before scaling.

**Confidence (10/10).** Medium or medium-high. Nobody high-confidence. Nobody low.

---

## Splits (genuine judgment calls — agents disagree)

### Vertical: Home services (6) vs Wellness studios (4)

**Home services (6/10) — agents 1, 4, 5, 7, 8 + the brief's primary leaning**
- Pros named: Jobber-proven willingness to pay ($400–500/mo to agencies today), severe website pain, trade Facebook groups + supply houses + BNI for distribution, Jobber doesn't touch sites/AI (gap)
- Cons named: trades don't screenshot anything → organic spread is weaker

**Wellness studios (4/10) — agents 2, 3, 6, 9, 10**
- Pros named: tight community DMing daily, Instagram-fluent → screenshot natively → organic spread, Mindbody-proven density
- Cons named: lower budget, design-snobby (voice/brand protection — may edit every draft), Agent 10 flagged Search Console data may be too thin to generate non-generic weekly texts at low traffic

**Tiebreaker logic:** Wellness has the better organic-spread artifact (screenshots in studio-owner Slack/IG). Home services has the better wallet (proven $400+/mo agency spend) and clearer pain. The decision is whether the bet is **"organic compounds faster"** (wellness) or **"unit economics work day 1"** (home services).

### Build fee: Keep $1,500 (5) vs Drop entirely (5) — TRUE 50/50

**Keep (5/10)** — agents 1, 3, 7, 8, 9: filters tire-kickers, anchors value, funds Jacob's polish hours, trades pay setup fees for everything (truck wraps, software). Most propose "keep for first 20–50, drop after."

**Drop (5/10)** — agents 2, 4, 5, 6, 10: removes the "riskier conversation" the research brief flagged, makes self-serve real, friction kills conversion at zero proof. Several propose hybrid — drop for early cohort to buy density, reintroduce once self-serve is clean.

**Synthesis:** Both camps actually converge on a hybrid. **Drop for the first 20 customers (white-glove during proof-of-product), reintroduce $1,500 at customer 21 as self-serve gate.** The disagreement is sequencing, not principle.

### Geo: Austin (5) — Phoenix (3) — Buffalo (2) — Denver/Brooklyn/Columbus (1 each)

**Austin (5/10)** is the modal pick — works for both verticals, dense studio + trade scenes, founder-friendly tech-density.
**Phoenix/Dallas/Buffalo** named for trades specifically (HVAC density, contractor breakfasts).

### Report cadence: Monday (7) vs Friday (1) vs Sunday (1) vs Daily (1)

Most agents put the recurring text on **Monday morning** (7am or 8am). Agent 10 argued **Friday at 8am** because retrospective frames better. Agent 4 argued **Sunday 7pm** — owner reads in driveway before week starts. Minor split.

---

## Outliers (1–2 agents only — creative ideas worth noting)

**Agent 1**: physical outreach to **HVAC supply houses (Ferguson, Locke) at 6am when trucks load** — capture contractors before they go to job sites.

**Agent 8**: `/quote` route — public 60-second audit by URL paste, lead magnet that **becomes** the first text thread. Conversion vehicle that doesn't require signup commitment.

**Agent 10**: `/agency` route present but **dormant until month 6** — explicit reservation of the GoHighLevel-style agency-reseller channel without activating it day 1.

**Agent 4**: founder **audits 10 truck-side websites in supply-house parking lot, texts audit links to owners on the spot** — turns the cold pitch into a same-minute conversion.

**Agent 9**: live homepage counter — **"Edits made this week: 412. Owner approval rate: 94%."** Real-time aggregate proof, not testimonials.

**Agent 3**: agent monitors **Mindbody/Acuity schedule diffs** as a unique signal source — when class times diverge between booking platform and website, that's an automatic fix and a free credibility win.

**Agent 2**: SMS conversation includes **template selection by digit reply** — "Reply 1 for yoga-studio template, 2 for wellness-clinic" — embeds onboarding in the text channel, no web form.

**Agent 6**: weekly report **narrative format** — "I added your Saturday class and updated your hours" written as a letter from the agent, not a metrics dashboard.

**Agent 1**: A2P 10DLC SMS compliance flagged as the single failure mode that kills the entire wedge.

---

## Synthesized recommendation

The 10-agent consensus is a coherent product. Open decisions: **which vertical** and **which metro**.

**Strongest single-bet synthesis:**

- **Vertical: Wellness studios.** The artifact-spread mechanic (Instagram screenshots, studio-owner DMs) is structurally better than trades. Wellness owners share. Trades reply but don't share. Compounding > unit economics at the wedge stage; the 4-5 year wedge-to-platform pattern (research §5) means you live or die on word-of-mouth in year 1.
  - Caveat: Agent 10's flag is real — if a studio's Search Console traffic is <200 impressions/week the agent has nothing to say. Validate this before building. Solution: agent draws from MORE sources than just Search Console (Mindbody schedule diffs, GBP, Instagram caption gaps, review queries).

- **Metro: Austin.** Modal pick (5/10), dense studio scene, founder access, and the existing platform name "Scaffold Web" works in a creative-class metro better than a Buffalo one.

- **Wedge: SMS thread + Monday morning report + reply-YES.** Unanimous. No deviation needed.

- **Homepage: live iMessage thread, Linear-density.** Unanimous. Use Linear changelog as anchor, iMessage as render.

- **First 100 customers:** Monday morning, walk into 5–10 East Austin yoga studios between classes (post-9am lull). Carry a printed `/this-week` mockup pre-built for THAT studio (scrape their site + GBP). Five free builds in week 1. Force them into a shared studio-owner WhatsApp/Slack. Sponsor one yoga teacher-training cohort dinner in month 2.

- **Build fee: drop for first 20, reintroduce at $1,500 from customer 21.** Hybrid resolves the 50/50 split.

- **Kill criteria:** if <40% of first 10 free trials reply YES to at least one Monday text by week 4, the wedge is wrong. Falsifiable. Cheap to test.

- **Pre-build validation (week 1):** manually run the wedge for 3 studios. Founder texts the YES, founder publishes the change, founder sends the receipt. If reply rate works at human-pace, automate. If not, the entire thesis collapses regardless of code state.

---

## What this aggregate did NOT answer (open questions for the founder)

1. **Who picks the vertical — research says wellness is the artifact-spread bet, but if you have stronger personal signal in trades, that compounds faster than the better category.** Distribution is your network.
2. **Build fee tradeoff is not actually 50/50 — it depends on Jacob's bandwidth.** If Jacob can build 2 sites a week white-glove, drop the fee. If he can only do 1, the fee is the rate-limiter that protects throughput.
3. **The pivot from "platform for any local business" (current CLAUDE.md) to "wellness studios in Austin" is a real strategic choice.** Means renaming the marketing site, picking a niche-specific brand, and trimming non-wellness templates. Reversible but costly.
4. **Funding shape:** is this a $1M ARR bootstrapped business or a fundable startup? Brief leans the former unless agency-reseller channel activates in month 6+. The 10 agents didn't push hard on the fundability question — that's a founder call.

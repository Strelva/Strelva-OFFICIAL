# Strelva Current Product Focus

Date: 2026-06-07  
Repo: `/Users/laneyfraass/REB`

## Operator call

Strelva should stop treating “finish the website platform” as the active product strategy.

The repo already contains a working managed-website control plane, owner dashboard, agent governance, weekly report surface, custom-repo contract, audit engine, and client delivery model. The strategic bottleneck is no longer whether Strelva can manage local-business websites. The bottleneck is whether Strelva has a distributable product primitive that creates pull beyond Jacob’s trust network.

The product focus should be:

> **AnswerRank: an AI Visibility Scorecard that shows whether AI can understand and recommend a local business, then converts into weekly monitoring and governed fixes.**

## Repo facts

- `AGENTS.md` still names the core product as Strelva Websites: free hand-built client site + monetized owner dashboard + AI updates + weekly report.
- `DEFAULT_DELIVERY_MODEL` remains custom repo. Self-serve auto-provisioning is gated off by default.
- `/home` still sells “A site that keeps up when you change” and CTA “Get my free first site.”
- `/audit` still positions as generic “Free Site Health Audit,” checking speed, SEO, mobile, schema, SSL, accessibility.
- The AI Visibility proof-of-magic exists as code:
  - `src/lib/ai-visibility/score.ts`
  - `scripts/ai-visibility.ts`
  - `docs/strategy/ignition/PROOF-OF-MAGIC.md`
  - `docs/strategy/ignition/GATE-A-TEST.md`
- The current Gate A is not passed: a non-friend has not reproduced the wow on a business/client they care about.
- The previous product-completion tranche is complete: reports surface, owner/operator journey, smoke coverage, lint/test/typecheck/build were recorded as passed in `docs/goals/reb-full-completion/notes/T019-final-tranche-completion.md`.
- Local shell blocker during this inspection: `pnpm`, `node`, `npm`, and `corepack` were not available in this Hermes environment, so I could not re-run the CLI/tests live here.

## What changed in the world

AI search and answer engines are becoming a business discovery surface. Local operators and the marketers who serve them now have a new anxiety:

> “When someone asks AI for the best provider near them, do we show up or do our competitors?”

Classic site health is too generic. “Speed, SEO, mobile, security” sounds like every website audit. The new object is more visceral: **AI named competitors, not you** — or, if live citation is unavailable, **your site is hard for AI to read.**

## Product primitive

**AI Visibility Scorecard**

One business/site in → one public artifact out:

- Grade: A-F / 100.
- Verdict: “AI can barely read you” or, when live probe runs, “AI did not recommend you.”
- Evidence: crawler access, business schema, NAP clarity, answer-format content, title/description, live citation probe when available.
- Top fix: one concrete correction.
- Share action: “Send this to your web person/client.”
- Paid next step: “Monitor this weekly” / “Let Strelva fix it with approval.”

This is a better wedge than “free website” because the artifact can travel before Jacob does labor.

## Divergence and attack pass

### 1. Obvious path: keep finishing Websites

- Build more dashboard, more self-serve, more custom-repo automation.
- Problem: services economics remain. Each new logo still pulls founder hours.
- Call: **park as support layer.** Do not make it the growth engine.

### 2. Weird path: AnswerRank as agency/freelancer primitive first

- Give web people / SEO consultants / local marketers a repeated-use scanner they can run on client sites.
- Artifact makes the sender look current and useful.
- Call: **strong.** Likely better first distribution than random SMB owners.

### 3. Service-first path: AI Visibility Action Brief

- Jacob manually runs 5-10 scorecards, records reactions, then offers one approved fix.
- This proves whether the artifact makes people want a fix before building full self-serve.
- Call: **do immediately if web scorecard is not ready.**

### 4. Distribution-first path: shareable result pages and OG cards

- Public scan URLs, screenshotable score, “send to your web person,” source tracking.
- Problem: current `/audit` is a generic, non-traveling site-health result.
- Call: **build next.**

### 5. Reason to kill

Kill or demote AnswerRank if 5 non-friends understand it but do not care, share, ask for the fix, or forward it to a client/web person.

### 6. Non-Strelva analogue

This is closer to HubSpot Website Grader + enterprise AI visibility tools, but moved downmarket with a fix-it loop. The wedge is the free artifact; the paid product is monitoring + governed action.

## Active product strategy

### Build now

1. **Promote AI Visibility from CLI to product surface**
   - Route: likely `/ai` or replaced `/audit`.
   - Inputs: business name, URL, category, city.
   - Output: scorecard result, verdict, top fix.

2. **Add shareable scan result artifact**
   - Persistent scan ID/result URL.
   - OG card / screenshot-ready summary.
   - “Send this to your web person/client.”
   - Source tracking.

3. **Wire live citation probe honestly**
   - Use Gemini first because repo already has Google AI SDK dependency.
   - Only say “AI did not recommend you” when probe ran.
   - Otherwise use readiness language.

4. **Email capture after value**
   - Show score first.
   - Then: “Get weekly AI visibility drift alerts.”

5. **Manual Gate A run**
   - 5 non-friends: ideally marketers/freelancers/agency people plus 1-2 local operators.
   - Track reaction, share intent, fix intent, confusion.

### Keep but do not lead with

- Managed websites.
- Owner dashboard.
- Weekly report.
- Custom-repo delivery.
- AI content update agent.

These become the fix/retention layer after the scorecard creates pull.

### Sell-first only

- Custom Software / workflows.
- First candidate remains Intake → CRM / speed-to-lead, but only with Rohlax or GLDF using actual warm data.
- Do not build a catalog until a real client pays.

### Park

- Full self-serve website builder.
- Broad dashboard redesign.
- Platform rails / protocol.
- National benchmark until persistent scan storage exists.

## Tiny build

**AnswerRank Gate A product surface**

Scope:

- Replace or flank `/audit` with AI Visibility positioning.
- Use `scoreAiVisibility()` from `src/lib/ai-visibility/score.ts` behind a web API.
- Form collects business, site, category, city.
- Result renders grade, verdict, failing signals, top fix, citation note, honest-mode label.
- Persist the result enough to create a shareable URL.
- Add CTA after result: “Get weekly AI visibility alerts” / “Ask Strelva to fix this.”

Explicitly exclude:

- Dashboard redesign.
- Billing.
- Full monitoring product.
- Multi-model prompt suite beyond the minimum live probe.
- National benchmark pages.
- Custom workflow catalog.

## Distribution object

The object that spreads is not “Strelva’s website.” It is the scorecard screenshot/link:

> “AI can’t tell what this business does — here’s the fix.”

Agency/freelancer version:

> “I scanned your client’s site for AI visibility. It has no business schema and no answer-format content. This is why AI tools may skip it.”

Owner version:

> “When customers ask AI who to use, your site gives it weak facts. Your top fix is simple: add LocalBusiness schema and answer-style service copy.”

## First market-contact move

Do not launch broadly first. Run a controlled Gate A:

1. Pick 5 non-friends who either own a business or serve SMB clients.
2. Run their business/client through the scorecard.
3. Send the artifact, not a pitch.
4. Ask one question: “Would you send this to the owner/web person/client?”
5. Record whether they ask how to fix it.

Pass signal:

- At least 2 of 5 ask about fixing or monitoring.
- At least 1 forwards or says they would forward it.
- Confusion is about the score mechanics, not the premise.

Fail signal:

- “So what?”
- They prefer generic SEO/site health language.
- They understand it but would not forward it.
- The grade feels arbitrary/unfair.

## Recommended next implementation packet

Name: `answer-rank-scorecard-surface`

Goal: turn the existing CLI proof-of-magic into a web artifact capable of Gate A testing.

Likely files:

- `src/lib/ai-visibility/score.ts`
- new or existing API route under `src/app/api/...`
- `src/app/(marketing)/audit/page.tsx` or new `src/app/(marketing)/ai/page.tsx`
- `src/components/marketing/AuditPage.tsx` or a new `AiVisibilityPage.tsx`
- storage route/helper if persistent result URLs are included
- focused tests for honest verdict language and required scorecard copy

Verification target:

- Unit test: readiness-only result never says AI did not recommend the business.
- UI test or component/copy test: page has business/category/city inputs and renders score, verdict, top fix, citation status, and share/send CTA.
- Typecheck/build when local JS toolchain is available.

## Call

**Build AnswerRank Gate A now.**

Not because the old Websites product is useless — because it is too founder-labor-bound as the lead wedge. The scorecard is the new front door. Websites, dashboard, weekly reports, and governed fixes become the conversion and retention layers after the artifact proves pull.

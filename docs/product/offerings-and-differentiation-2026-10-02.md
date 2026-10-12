# Offerings, value, and how we win

Research and recommendation, October 2, 2026. Nothing here changes prices,
production, or client agreements. Competitor figures come from vendor pages
fetched today unless marked *third-party* or *unverified*.

> **October 4, 2026:** the customer-facing noun is now a System, not an
> offering ([CONTEXT.md](../../CONTEXT.md#product-model)). The market findings
> and the accountability argument stand; offerings become packaging for
> Systems.

## The short version

Building software for a small business is now nearly free. A site costs
$0–50 a month at Wix, Durable, or Squarespace. An app costs $25 at Lovable.
An AI phone agent costs $49 at Rosie. A booking page costs nothing at Square.

What nobody sells is **accountability**. Read the one-star reviews for
Podium, Thryv, Yext, Birdeye, Wix, Lovable, and GoHighLevel. The complaints
aren't about missing features. They're about the moment something breaks and
nobody owns it: SMS silently failing, a booking card that can't be charged, a
lost listing after cancelling, a support queue, a renewal fight.

Strelva should sell the thing that's still expensive: **a business that keeps
working, with a receipt for every change and someone accountable when it
doesn't**. Software does the work. An agency handles the exceptions. Every
outside write is approved, done, read back, receipted, and undoable.

We have 22 capabilities in code (see [capabilities](../capabilities/README.md)).
Most of them are table stakes or internal machinery. Four offerings are worth
leading with. The rest should be included, folded in, or parked.

## What the market looks like today

| Category | What it costs a small business | Table stakes now | Nobody does |
| --- | --- | --- | --- |
| Website | $17–50/mo (Wix $17.77–39.77, Durable $22–49, Squarespace $19–49 annual). Hostinger $2.99 on a 48-month term. | Prompt-to-site, AI copy and images, SEO basics, hosting, free tiers | Fixes it when it breaks. Support is the top complaint at Wix, Squarespace, Framer, Duda |
| Listings and reviews | $31–49/mo (BrightLocal); $99–399 (Thryv); $300–700/location (Podium, Birdeye, *third-party*); Yext $800–2,500/location/yr (*third-party*) | Listing sync, review monitoring and requests, post scheduling | Read-back proof the facts are right; month-to-month without lock-in (Yext is 1.5★ on Trustpilot over lost listings and auto-renewals) |
| Bookings | $0–50/mo solo (Square free, Calendly $10, Acuity $16–49); $84–200+ multi-staff (Vagaro) | Booking page, calendar sync, payments, reminders | Setup done for you; someone to call when the booking fails |
| Phone and inquiries | $49–300/mo AI-only (Rosie, Goodcall, Smith.ai Starter $300/30 calls); $399–599/location (Slang, restaurants) | Answer 24/7, take a message, text a booking link | Answers on the same record as the website, bookings, and reviews |
| AI visibility | $29–200/mo (Otterly, Peec €85, Semrush $165); BrightLocal bundles it from $31 | Prompt tracking across ChatGPT, Perplexity, AI Overviews | Fixes the cause. Every tool is a dashboard; the customer does the work |
| Internal apps | $25–100/mo (Lovable, Bolt, Replit, Glide); Retool per builder | Describe it, get a working app | Shares data with anything else; anyone accountable (Lovable: 170 of 1,645 apps had exposed databases; Replit's agent deleted a production database) |
| Agency platforms | $97–497/mo (GoHighLevel), $99–999 (Vendasta); real spend $600–1,200 | CRM, calendars, forms, SMS, site builder | Platform owns failure. The agency eats DNS, A2P SMS registration, and every outage |

Our live plans are Presence $99, Growth $199, Scale $499
(`src/lib/billing-plans.ts`). That's 3–10× a website builder. It's only
defensible if the price buys done-for-you work and accountability, not a site.

## What's newly possible

Five things changed in the last year that matter for a local business:

1. **AI agents now call businesses to book.** Google Search's AI calls local
   businesses to book and check availability in the US (Business Profile →
   Advanced settings → "Bookings and inquiries from customers"). AI Mode books
   beauty and wellness through Booksy, Fresha, and Vagaro. ChatGPT books
   restaurants through Yelp, OpenTable, and Resy since August 10. Gemini "Call
   for Me" entered beta September 24. The agent channel for local services is
   **phone calls and booking feeds**. The checkout protocols are retail-only,
   and OpenAI retired Instant Checkout in March.
2. **A voice agent costs about $0.10 a minute.** Retell is about $0.13 all-in,
   ElevenLabs $0.08 plus model, gpt-realtime-mini $0.06–0.15. A bakery's 300
   minutes a month costs $30–45 in compute.
3. **Watching everything daily costs a few dollars.** Five listings, every
   review, five competitors, and a 30-prompt AI panel per business per day is
   about $2–5 a month on a small model with batch pricing. Web search fees
   ($10 per 1,000) are the real cost, not tokens.
4. **Writing code is solved for small apps.** Top models score 80–97% on
   SWE-bench Verified (*third-party*). A CRUD app costs a few dollars to
   generate. Building stopped being the moat for anyone.
5. **Official doors exist but are gated.** Google Business Profile API needs
   quota approval. Apple Business, Bing bulk, and Yelp reply APIs are
   partner-only. Google's Actions Center needs a direct contract with every
   merchant in the feed. Square, QuickBooks, and Google Workspace now ship
   official MCP servers. Chrome's WebMCP origin trial lets a site expose
   `book_appointment()` to agents.

Item 5 is the one competitors underrate. **Access is the new moat.** A $25
builder can't get Actions Center partner status, because it doesn't hold
merchant contracts. An agency-operated platform does.

## The offerings, ruthlessly

### Lead with these four

**1. Front desk: every customer answered, on one record.**
A call at 9pm, a website form, a text, Google's AI calling to book a massage
on Saturday. All of them land as one request on one contact, and get answered,
booked, or routed in minutes. The phone is answered by a voice agent; the
booking writes to the same calendar the website uses.
- *Why it wins:* receptionists ($49–300) don't share a record with the site or
  bookings. Podium does, at $450–600 with 12-month contracts.
- *What we have:* inquiries (deepest module, flag off), bookings (fixture
  calendars), tenant leads (live). No voice. No SMS (A2P not registered).
- *Missing:* voice agent, real calendar providers, SMS registration, contact
  record with a write path.

**2. Facts that stay true everywhere.**
Change your holiday hours once. Google updates by API. Apple, Bing, Yelp,
and Foursquare are updated through a partner API or a supervised browser
agent. The website updates. Each change comes back with a read-back receipt
and a before-and-after. ChatGPT's local data reportedly comes from Foursquare,
Bing, and Yelp (*third-party*), so these listings now feed AI answers too.
- *Why it wins:* BrightLocal monitors; Yext pushes but locks you in. Nobody
  proves the change landed.
- *What we have:* GBP management and review replies (live, tenant-only), the
  governance path, the scanner.
- *Missing:* GBP API quota on the workspace model, a listings partner or
  supervised browser path, read-back across non-Google listings.

**3. Bookable by AI agents.**
Every Strelva business turns on Google's automated bookings, answers those
calls with the front desk, and exposes availability, booking, and inquiry as
agent-callable tools on its website. Next, Strelva becomes a Google Actions
Center booking partner for its own businesses, so Google books directly, with
no phone call and no Booksy in between.
- *Why it wins:* this is ADR 0009's rung 4, and the contract requirement
  keeps builders out.
- *What we have:* public website bookings, `/api/v1/bookings`, the bookings
  MCP plan.
- *Missing:* Actions Center application, WebMCP tools on sites, signed-agent
  detection.

**4. The agency operating system.**
An agency runs 30 clients on Strelva. Software does the front desk, facts,
and site work. The agency handles exceptions in one queue, packages its
methods, and sells outcomes instead of hours. Strelva owns platform failures,
not the agency.
- *Why it wins:* GoHighLevel sells tools and hands the agency every outage.
  Vendasta needs a one-year contract.
- *What we have:* Strelva's own agency serving nine clients, offerings and
  provider delivery, the operator console.
- *Missing:* a second agency (John Leone is named), human minutes measured
  per client, a portfolio exception queue.

### Include, don't lead

| Capability | Treatment |
| --- | --- |
| Website (managed, drafts, rebuild) | The front desk's public face. Included in every plan. Rebuild-from-URL is the onboarding trick: paste your site, get a better one in minutes. |
| AI visibility check | Free acquisition, exactly per ADR 0009. Its follow-up is "facts that stay true," not a dashboard. Report Search Console and Bing AI data as official, our prompt panel as a sample. |
| Website audit | Same: free, folds into the check. |
| Reviews and Google posts | Part of "facts that stay true." |
| Billing | Infrastructure. |
| Analytics and reports | Becomes the weekly receipt: what we answered, booked, fixed. |

### Fold in or park

| Capability | Call | Why |
| --- | --- | --- |
| Internal apps, custom applications | Agency-built only; no self-serve | Owners don't build apps (Oct 2). Lovable is $25. Our edge is that agency-built apps read the same record. Custom-app builds also need Docker, which Vercel lacks. |
| Onboarding (document collection) | Fold into front desk for law and bookkeeping | Useful as "collect what a new client must send," not as its own offering. |
| Tracker | Park | Google Sheets owns this. No differentiator. |
| Documents | Park | Google Docs and Notion own this. |
| Ongoing checks | Fold into facts | "Notice when two records disagree" is how facts stay true, not a product. |
| Work plans, delegated work | Internal machinery | How agents and agencies operate. Not something a business buys. |
| Product learning | Internal | Already super-admin only. |
| Home Finder | John Leone's item | An outside creator's offering per ADR 0010, not ours to sell. |
| Domain monitor | Internal | Operator tool. |

## How we build differently

Building is cheap for everyone now, so *how fast we write code* is not a
differentiator. These are:

1. **Every outside write closes the loop.** Approve → write → read back →
   receipt → undo. The October 1 research found no agent platform, enterprise
   or small business, that undoes writes to outside systems. This is the
   thing to protect and make universal.
2. **One business record, capabilities as apps on it.** The front desk,
   website, and facts read the same contacts, bookings, and facts. A
   Lovable app is an island; ours isn't.
3. **We operate what we build.** Each capability is graded against the
   [five bar](../capabilities/README.md#status-words): real providers, loop
   closed, failure tests, a production proof run on a Strelva-owned test
   business, monitoring, and at or above the best competitor. A capability
   isn't done when its tests pass. It's done when we'd accept responsibility
   for it.
4. **Access as an asset.** GBP API quota, Actions Center partnership, an Apple
   Business partner path, A2P SMS registration, and merchant contracts take
   weeks and paperwork. Competitors skip them. We should collect them on
   purpose.
5. **Human minutes per business, measured.** The agency is in the loop, and
   every exception it handles is a signal for what software should do next.

### Where today's method falls short

- **Breadth before one closed loop.** 22 capabilities and six registries,
  with most at 2–3 on the five bar. Zero workspace memberships in production.
  More capabilities don't help; one operated loop does.
- **The receipt path is tenant-only.** `ai-governance` is Redis-authoritative
  and the governed-work tables aren't applied. Our main differentiator doesn't
  yet run on the workspace model.
- **Fixtures on the default path.** Calendars are fixtures. No voice. No SMS.
  A front desk that can't answer the phone isn't a front desk.
- **Offerings named by mechanism.** Code offerings are "Customer inquiry
  intake" and "Staff request application." ADR 0009 says customers browse
  outcomes: "Never miss a new client."

## Scenarios that test the model

- *A Buffalo wellness studio gets a Saturday booking from Google's AI phone
  call while the owner sleeps.* Which record does it land on? Who's notified?
  If the calendar write fails, who's accountable and what's the receipt?
  Today: no voice, fixture calendars. This is the first loop to close.
- *The Mooney Firm changes office hours for Thanksgiving.* How many places
  change, and how does Jacob prove each one did? Today: Google only, tenant
  model, no read-back elsewhere.
- *John Leone's agency takes over a Strelva client.* Does the history, the
  record, and the receipts move with no migration? Workspace exit and export
  exist; agency handoff is `not_enabled`.
- *A bakery asks for a cake-order tracker.* The agency builds it in an hour
  on the business record. The tracker reads the same contacts the front desk
  creates. That's the internal-apps story, and it's agency-built.

## What needs Jacob

- **Prices.** Whether Presence/Growth/Scale become front-desk plans priced by
  responsibility (for example, inquiries answered), per ADR 0009.
- **A stated guarantee.** "If we lose a booking or inquiry, here's what we
  credit," plus month-to-month and full-history exit. Buying voice from an
  AIUC-1 insured vendor (ElevenLabs) could back it.
- **Outside applications.** GBP API quota, Google Actions Center partner, A2P
  SMS brand registration, a listings partner (Yext-style reseller or
  BrightLocal). Each is an external commitment.
- **The cuts above.** Parking tracker and documents, and making internal apps
  agency-built only.

## Sources

Competitor research: vendor homepages and pricing pages for Durable, Wix,
Squarespace, Framer, Hostinger, 10Web, Duda, Yext, BrightLocal, Birdeye,
Podium, Owner.com, Thryv, Square, Vagaro, Calendly, Cal.com, Acuity, Smith.ai,
Goodcall, Rosie, Slang, Profound, Peec, Otterly, Semrush, Lovable, Bolt,
Replit, Glide, Softr, Retool, Airtable, GoHighLevel, Vendasta; Trustpilot, G2,
and BBB pages for each where cited.

Technology: [Google AI business calling](https://support.google.com/business/answer/16190256?hl=en),
[Gemini Call for Me](https://techcrunch.com/2026/09/24/google-tests-letting-gemini-make-phone-calls-initially-for-us-pixel-owners/),
[AI Mode booking](https://techcrunch.com/2025/11/04/googles-ai-mode-gets-new-agentic-capabilities-to-help-book-event-tickets-and-beauty-appointments/),
[Actions Center](https://developers.google.com/actions-center/verticals/reservations/e2e/overview),
[ChatGPT reservations via Yelp](https://blog.yelp.com/news/yelp-chatgpt-integration/),
[Instant Checkout retired](https://www.digitalcommerce360.com/2026/03/06/openai-shifts-checkout-plans-agentic-commerce-strategy/),
[OpenAI pricing](https://developers.openai.com/api/docs/pricing),
[Retell](https://www.retellai.com/),
[ElevenLabs agents pricing](https://elevenlabs.io/blog/weve-lowered-api-agents-pricing-and-introduced-pay-as-you-go),
[A2P 10DLC fees](https://support.twilio.com/hc/en-us/articles/1260803965530-Pricing-and-Fees-for-A2P-10DLC-Service),
[GBP API updates](https://developers.google.com/my-business/content/latest-updates),
[Apple Business partner API](https://support.apple.com/guide/business/apple-business-partner-api-access-abcb4226f877/web),
[Yelp Respond to Reviews](https://docs.developer.yelp.com/docs/respond-to-reviews-api-v2),
[Bing AI Performance](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview),
[Square MCP](https://developer.squareup.com/docs/mcp),
[Google Workspace MCP](https://developers.google.com/workspace/guides/configure-mcp-servers),
[Cloudflare signed agents](https://blog.cloudflare.com/signed-agents/),
[AIUC-1](https://aiuc.com/).

Not verified: the full reach of Google's summer calling expansion, the
Foursquare share of ChatGPT local data, Podium and Birdeye list prices, and
the SWE-bench figures (third-party trackers).

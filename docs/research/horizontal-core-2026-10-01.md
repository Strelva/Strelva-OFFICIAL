# What Strelva's horizontal core should be

Research, October 1, 2026. Four parallel investigations:
- how six platforms split core from apps
- what small businesses install
- what agent-era platforms ship
- what Strelva's own docs and ADRs already decided

This is research, not a decision. Production state is unchanged.

## The answer in one line

**The core is one business record plus the rules for changing it, open to any
app or agent.** It doesn't own a CRM screen or a builder. Every app built by
Strelva, a partner or the agent reads the same record. Every write goes
through one permission and approval ledger, with a receipt and undo.

No one sells that to small businesses today. Microsoft Dataverse and
Salesforce Data 360 sell it to enterprises with IT staff. AI app builders
give every app its own database. Supabase says over 60% of its new databases
are launched by AI tools ([TechCrunch](https://techcrunch.com/2026/06/05/supabase-doubles-valuation-to-10b-in-8-months/)).
That is the volume of business software now being generated, and all of it
starts without shared data or governance.

## What the evidence says

### 1. Every horizontal platform drew the line in the same place

Shopify, HubSpot, Salesforce/Dataverse, Square, Wix, GoHighLevel and Stripe:

| Primitive | Platforms with it in core (of 7) |
| --- | --- |
| Contacts / customers | 7 |
| Catalog (products, services) | 7 |
| Team, users, roles | 7 |
| Payments, orders, subscriptions | 6.5 each |
| Custom fields and objects | 6 |
| Conversations / inbox, invoices, email marketing | 5.5 each |
| Website / content, automation engine, forms, AI agent | 5 each |
| Bookings / calendar | 4.5 |
| Deals / pipeline | 3 |
| Tickets / cases | 2 |

Four patterns repeat:

- **Records and rules live together.** Shopify Functions, Flow, HubSpot
  workflows and Wix Automations all run logic next to the data.
- **Custom objects are always core.** Without them, apps keep their own copies
  of the business's data.
- **The platform absorbs the most-installed app category as a basic, free
  version.** Shopify did this with Email, Inbox, Forms, Subscriptions and
  Flow, and left the advanced end to Klaviyo and Recharge.
- **The AI agent is now core and builds apps.** Shopify Sidekick generates
  custom admin apps from plain language on the public API (Winter '26).

**Wix has the cleanest rule for us.** Its own Bookings and Stores are apps on
the same platform as third-party apps. Any app can read their data. Writes go
through the owning product's API
([Wix CMS docs](https://dev.wix.com/docs/overview/site-features-tools/cms)).

Sources: [Shopify Admin API](https://shopify.dev/docs/api/admin-graphql),
[Shopify Functions](https://shopify.dev/docs/api/functions),
[HubSpot objects](https://developers.hubspot.com/blog/a-developers-guide-to-hubspot-crm-objects-standard-objects),
[Common Data Model](https://learn.microsoft.com/en-us/common-data-model/schema/core/applicationcommon/overview),
[Square API](https://developer.squareup.com/reference/square),
[Sidekick](https://www.retailbrew.com/stories/2025/12/11/shopify-plugs-in-more-ai-power-to-merchant-assistant).

### 2. What small businesses install shows a gap

**Twelve jobs show up in nearly every vertical.** Four have an owner that
businesses won't leave:
- accounting (QuickBooks)
- email and calendar (Google, Outlook)
- card processing (Stripe, Square)
- payroll (Gusto)

**The fragmented jobs form one chain:** capture the lead, book it, follow up,
get the review, answer the phone, all on one customer record.
- Seven of Zapier's 22 most popular apps are forms, lead capture or
  scheduling ([Zapier](https://zapier.com/apps)).
- Reviews are Shopify's #1 app category, at 1.1M installs
  ([StoreCensus](https://www.storecensus.com/stats), third party).
- HubSpot's top installs are Gmail, Google Calendar and Outlook. The Claude
  connector is #4 at 183K
  ([HubSpot](https://ecosystem.hubspot.com/marketplace/featured/popular)).
- **Google Sheets is #1 on both Zapier and Make.** 53% of Intuit's
  small-business panel manage finances in spreadsheets, 27% run six or more
  systems, and 36% report problems with tools that don't integrate
  ([Intuit](https://quickbooks.intuit.com/r/small-business-data/small-business-insights/)).
  Businesses are building their own shared record in Sheets because their
  tools don't share one.

### 3. Agent-era platforms agree on governance, and none of them ship undo

OpenAI AgentKit, Microsoft Copilot Studio, Salesforce Agentforce, Google
Gemini Enterprise, Zapier and Notion all treat these as core:
- agent identity
- scoped permissions inherited from a person
- connectors over MCP
- human approval before high-impact writes
- audit logs

**None of them undo writes to outside systems.** The only shipped rollback
product is Rubrik Agent Rewind, which is enterprise-only and covers files,
databases and configs
([Rubrik](https://www.rubrik.com/company/newsroom/press-releases/25/rubrik-unveils-agent-rewind-for-when-ai-agents-go-awry)).

**Small businesses don't trust agents running unsupervised:**
- 78% of 942 US owners don't fully trust AI on basic tasks without oversight
  (Bluevine/Centiment, April 2026,
  [via KRDO](https://krdo.com/stacker-small-business/2026/07/16/3-4-of-small-businesses-dont-trust-ai-for-basic-tasks/)).
- In July 2025 Replit's agent deleted a production database
  ([Masad](https://x.com/amasad/status/1946986468586721478)).
- In April 2026 a Cursor agent deleted PocketOS's production data and backups
  in 9 seconds; the car-rental businesses it serves were down about 30 hours
  ([Fast Company](https://www.fastcompany.com/91533544/cursor-claude-ai-agent-deleted-software-company-pocket-os-database-jer-crane)).
- Vibe-coded apps leak: the Base44 auth bypass
  ([Hacker News](https://thehackernews.com/2025/07/wiz-uncovers-critical-access-bypass.html)),
  and Lovable apps with row-level security never turned on.

**Not proven:** that small businesses pay more for governance. Distrust is
proven; willingness to pay is not.

MCP is the standard for opening a core to agents. It moved to the Linux
Foundation in December 2025, with 10,000+ public servers and 97M monthly SDK
downloads
([MCP blog](https://blog.modelcontextprotocol.io/posts/2025-12-09-mcp-joins-agentic-ai-foundation/)).

### 4. What Strelva already decided

- **Company invariants:** identity, relationship membership, parent Work,
  accepted economic limits, correlation, portable result conventions and
  evidence lineage. Domain promises stay with each product
  (company `CONTEXT.md:174-180` in the parent `strelva/` folder, ADR 0007).
- **One record, one set of verified facts, one decisions inbox, one bill per
  business.** Items declare their data and permissions before they are turned
  on (ADR 0010).
- **Gates.** No shared runtime extraction until two independently operated
  products reuse the same invariant with measured leverage. No public
  "general capability" claim until a second product with real customer use
  improves on unchanged primitives (ADR 0007). HomeFinder is the intended
  second item (ADR 0009).
- **Rejected:** a speculative platform, universal memory, a universal
  dashboard or assistant, a second approval engine, a proprietary credit
  wallet, and a horizontal builder sold as the product.

Sixteen platform modules already exist in `src/platform/`, including
workspaces, work-participation grants, agent-access tokens, work-execution,
work-economics, customers, and exports/exit. All are local, partial and
unproven in production.

## Proposed core

### Records: the nouns every app shares

| Record | What it is | Today |
| --- | --- | --- |
| Business | The workspace: identity, locations, hours, verified facts | `workspaces`, `work-context` (partial) |
| People | Team members, roles, invitations, agent identities | `workspaces`, `agent-access` (partial) |
| Contacts | One person or organization, with a timeline of every interaction | `customers` (read-only, no write path) |
| Requests | Anything a contact asks for: inquiry, quote, showing, support | `inquiries` (deepest module) |
| Bookings | A commitment at a time | `scheduling` (fixture-only calendars) |
| Catalog | Services and products with price labels | absent |
| Money references | Pointers to Stripe or Square payments, invoices and subscriptions; never a copy of the ledger | `work-economics` (doesn't charge) |
| Content | Website pages, documents, published facts | `websites`, `documents` |
| Custom objects | Typed records an app defines for itself, so apps never keep private copies | absent |

### Rules: how anything changes the records

| Rule | What it does | Today |
| --- | --- | --- |
| Grants | Scoped, expiring permission per installation, person or agent, enforced on the server | `work-participation`, `agent-access` |
| Ledger | Approve → write → read back → receipt → undo, for every write to the record or the outside world | `ai-governance`, `governed-work` (Redis-authoritative, tenant-only) |
| Events and triggers | Record changes emit events; rules run next to the data | absent (crons only) |
| Connectors | Google, Microsoft, QuickBooks, Stripe in; MCP out | calendar adapters, GBP; no MCP |
| Agent | Reads the record, proposes ledger writes, generates apps on the public API | website agent, tenant-only |
| Export and exit | The whole record and receipts, any time | `workspace-exports`, `workspace-exit` |

### First-party apps on the core (the Wix rule)

Website, front desk (inquiries, bookings, reviews), and follow-up. Each is
built as an app: it reads the shared record and writes through its own API
and the ledger. That keeps ADR 0005's rule that products own their promises,
and the core stays a set of invariants instead of a universal runtime.

### Connect, don't rebuild

Accounting, email and calendar, card processing, payroll, vertical systems of
record (Clio, Dentrix, Toast, Mindbody), and ad and lead sources.

### Leave as apps until installs prove otherwise

Deals and pipeline, tickets, inventory, loyalty, quotes and estimates, and
vertical apps such as HomeFinder. **Absorption rule:** when an app category
reaches [n]% of workspaces, ship a basic version in core and leave the
advanced end to apps. That's the Shopify pattern.

## Economics this structure makes possible

- **App revenue share.** Shopify takes 0% on a developer's first $1M lifetime,
  then 15%
  ([Shopify](https://shopify.dev/docs/apps/launch/distribution/revenue-share)).
  Wix takes 0% in year one, then 20%. GoHighLevel takes no commission and lets
  agencies mark up apps. Shopify paid developers $1.3B in the past year
  ([Shopify](https://www.shopify.com/news/billion-dollar-ecosystem)).
- **Channel.** HubSpot's Solutions Partners and the customers they referred
  were about 25% of customers and about 49% of revenue (from a search summary
  of HubSpot's FY2025 filing; not opened to confirm).
- **Integration correlates with growth.** Square restaurant sellers with at
  least one integration grew payment volume more than 2x faster
  ([Block](https://investors.block.xyz/investor-news/news-details/2024/Square-Serves-Up-Fresh-Restaurant-Partnerships-Integrations-with-SevenRooms-Restaurant365-and-More-as-New-Data-Highlights-Partner-Ecosystem-Growth/default.aspx)).
  That's correlation, not proof that apps cause retention.
- **Usage.** Every agent write and generated app runs through the ledger,
  which makes usage measurable and billable per action.

## The tension with ADR 0007

ADR 0007 says not to extract a shared runtime until two operated products
need it. This proposal doesn't extract a runtime. Records and rules are the
invariants CONTEXT.md already names, plus the contact record and events. But
opening them as a public app API and an MCP server is a "general capability"
claim, and that gate requires a second product with real customer use.

CONTEXT.md already allows one exception. Machinery can become shared "when
one product proves it is a company-wide safety or economic rule." The grants
and the ledger are safety rules. The Replit and PocketOS incidents are what
happens without them. So the ledger and grants can be centralized under
today's rules. The contact record, custom objects and the public API can't.

There are two honest paths for the rest:

1. **Keep the gate.** Build the contact record and ledger for the front desk,
   connect HomeFinder as the second item, and open the API publicly only once
   both are operated.
2. **Amend the gate for the tech-startup direction.** Open the core API to
   our own first-party apps and one design partner now, and treat the public
   claim as the gated step.

This is Jacob's call. The research supports path 2's build order with path
1's public claim.

## What's open, and the risks

- **Willingness to pay for governance** is unproven. Price it inside plans,
  not as an add-on, until we have evidence.
- **Wix is the closest threat.** It has Base44, a shared CMS rule, Harmony,
  and AI visibility. If it adds a cross-app approval ledger, the gap narrows.
  Airtable Omni is the closest small-team shared record, but it has no
  outside-write ledger.
- **Shared records cost more to build** than per-app databases, and the
  market's volume is going to per-app databases today.
- **Install counts aren't usage.** Several app-store numbers are third-party,
  and HubSpot's partner revenue share isn't verified.
- **Not researched:** Twenty CRM, and a first-party Shopify figure on
  retention by app use.

## What this changes in the current plan

- The **front-desk spec** builds the contact record, requests, bookings and
  the ledger as core primitives with an API, and the front desk is their
  first client.
- The **bookings MCP server** becomes the core MCP server over records and
  ledger writes, scoped by grants.
- The **website rebuild spec** writes facts into the business record and
  contacts. Its site document stays owned by the website app.
- **Custom objects and events** are the two missing primitives with no code
  today.
- **HomeFinder** is the first outside app: requests, bookings and contacts
  through grants. That satisfies ADR 0009's second-item test.

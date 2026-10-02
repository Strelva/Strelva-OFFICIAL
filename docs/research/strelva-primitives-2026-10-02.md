# Strelva's primitives

Date: 2026-10-02
Kind: research input, not a decision. Proposes the primitive set for Strelva
Reborn and beyond. Decisions land in [product-ontology](../architecture/product-ontology.md)
and an ADR once Jacob picks.

## What Strelva is reaching for

Strelva is the software department for a small business. One record of the
business. Its capabilities, its agency and outside AI agents all act on that
record through one governed ledger: propose, approve, write, read back,
receipt, undo. Agencies package what they know once and run it across many
businesses. Strelva is paid for responsibilities kept, and every one is
proven by receipts.

The pieces of that sentence are already decided (ADR 0007 compounding
responsibility, ADR 0009 "turns a business need into software made for that
business, and keeps it working", ADR 0010 agencies as creators and channel,
Oct 1 managed default, Oct 2 agency in the loop). What the docs never settled
is the small set of nouns all of it runs on. Today there are about 20, with
four collisions: provider, capability, responsibility and item vs method.

## What the outside world says

**Every platform that lasts converges on the same five nouns:** typed record,
typed link, governed action, event, grant. The ones that age well add a
versioned package. Palantir Foundry routes every write through an action
type and logs it; agents get those same actions, auto-run or after
confirmation, and staged edits wait as proposals
([action types](https://www.palantir.com/docs/foundry/action-types/overview),
[Agent Studio tools](https://www.palantir.com/docs/foundry/agent-studio/tools)).
Stripe composes through IDs, thin events and idempotency keys that replay the
stored response ([idempotency](https://stripe.com/blog/idempotency)).

**The failures all come from editing live state.** Dataverse's unmanaged
layer silently overrides upgrades; ServiceNow's edited records stop
upgrading; Salesforce couldn't retire profiles after three years
([solution layers](https://learn.microsoft.com/en-nz/power-platform/alm/solution-layers-alm),
[SalesforceBen](https://www.salesforceben.com/salesforce-backtracks-on-permission-retirement-in-profiles/)).

**Agents already book small businesses, through platforms and phone.**
Google AI Mode books through Booksy, Fresha and Vagaro worldwide since April
2026, and Google's AI calls US home-repair, beauty and pet-care businesses
for prices and availability
([GBP Help](https://support.google.com/business/answer/16190256?hl=en)).
OpenAI pulled Instant Checkout in March 2026
([TechCrunch](https://techcrunch.com/2026/03/24/openais-plans-to-make-chatgpt-more-like-amazon-arent-going-so-well/)).
Square enrolled eligible sellers into ChatGPT and Claude in one move on July 1,
2026 ([Square](https://squareup.com/us/en/press/claude-chatgpt-integrations)).
The winners own the record and the booking.

**Worker agents run on procedures with per-tool approval.** Intercom Fin
Procedures must pass simulation before deploy; Copilot Studio gates each tool
with approve, approve for session, or deny. Outcome pricing is real
(Fin $0.99 per resolution) and its weak point is the definition: a customer
going silent counts as resolved
([Fin pricing](https://fin.ai/help/en/articles/13975800-fin-pricing-outcomes)).

**Agency templates rot because they are copies.** GoHighLevel snapshots
overwrite or duplicate client edits on push; Airtable, Notion, Zapier and n8n
templates never update. The working answers are versioned packages with
per-component ownership (Salesforce managed packages, HubSpot parent/child
themes) and gated per-install upgrades with rollback (ManageWP)
([HL snapshots](https://help.gohighlevel.com/support/solutions/articles/48000982511-snapshots-overview),
[ManageWP](https://managewp.com/features/safe-updates/)).

## The primitives

Nine. Five are the industry's, because they work. Four are Strelva's,
because Strelva runs the business instead of storing it.

| # | Primitive | One job | Replaces |
|---|---|---|---|
| 1 | **Business** | Owns everything. The isolation boundary, the payer, the decider. | workspace kind `customer`; tenant as root |
| 2 | **Record** | A typed thing with stable identity, links to other records, and a timeline. Types: profile facts, contact, service, availability, policy, booking, inquiry, page, review, app records, custom types. | business record tables, inquiry overlays, website document facts, app records |
| 3 | **Action** | The only way anything changes. Typed, versioned, risk-rated, idempotent. Proposed → approved → executed → read back → undone or marked irreversible. Its log is the receipt. | Change, Receipt, Redis events, governed-work, approvals, undo paths |
| 4 | **Event** | Something happened, referencing records. Thin, at least once, reconciled. Procedures and responsibilities react to events. | Signal, Redis activity events, ad hoc cron scans |
| 5 | **Grant** | Who may run which actions on which record types, for whom, until when. Actors: owner, staff, agency seat, Strelva operator, worker agent, customer agent, anonymous public. | memberships, delegations, assignments, leases, agent tokens, ~8 grant tables |
| 6 | **Connection** | An authorized link to an outside system (Google, calendar, Stripe, domain, phone line, booking platform) with scopes, health and renewal. Capability, never authority. | Redis OAuth per tenant, calendar connections, domain claims |
| 7 | **Package** | A versioned bundle of record types, actions, procedures, responsibilities and interfaces, with every element marked package-owned, business-owned or overridable. Strelva's capabilities and agencies' methods are both packages. **Install** links a business to package@version plus its overrides and connections. | capability (customer sense), offering, item, method, installation, template, snapshot |
| 8 | **Procedure** | How an agent does a job: plain-language intent compiled into versioned steps, rehearsed against synthetic input before release. | Rule, Rehearsal, agent prompts inline in routes |
| 9 | **Responsibility** | A condition kept true over time with a precise measured definition, its evidence (actions), breach handling and a meter. The unit Strelva prices. An offering is just its customer-facing name. | responsibility (three definitions), provider commitment, SLA language |

What stops being a primitive: **Work** becomes a view over actions and events.
**Provider** splits cleanly: a provider seat is a grant; an outside system is
a connection. **Capability** keeps its three tenant-era meanings only as v1
compatibility names. **Customer agent** is an actor kind on a grant.

## Watch it work

An illustration, not a running system. The Mooney Firm installs Strelva's
*Never miss a new client* package. It brings record types (contact, inquiry,
service, policy), actions (reply, book consult), a procedure (qualify and
reply), and a responsibility: every inquiry answered within five minutes
during business hours, measured from the inquiry event to the reply action's
receipt.

At 9:12 pm Google's AI calls about a consultation fee. The call arrives as an
anonymous customer-agent actor. The procedure reads the service and policy
records, answers, and runs *hold consult slot*, an action granted to the
public. The hold is an action with a receipt and the call transcript as
evidence. At 9:13 the responsibility's meter records one inquiry answered in
61 seconds.

Next month Strelva ships v1.3 of the package: a better qualification
procedure. Mooney overrode the greeting; that field is business-owned, so the
upgrade leaves it. Each install's responsibility runs in rehearsal first;
installs whose checks fail stay on v1.2.

[An agency] packages its own *dental recall* method on the same primitives
and installs it across [n] practices. Same ledger, same
receipts, its own royalty.

## What this changes

- **The offer.** Businesses on Strelva become answerable and bookable by AI
  agents in one move, the way Square did for its sellers: one MCP surface and
  one schema.org profile generated from every business's service,
  availability and policy records.
- **The proof.** Every responsibility is measured from events to action
  receipts Strelva wrote itself. That is a sharper outcome definition than
  "the customer went quiet", and it's what makes per-outcome pricing
  defensible.
- **The agency channel.** Methods stay live packages, so an agency's
  improvement reaches every client and nobody's edits get stomped. That is
  the failure GoHighLevel's whole market lives with.
- **The factory test.** Procedures are versioned and rehearsed, so human
  minutes per business can fall release by release, and we can see which
  release did it.

## What it means for Reborn now

1. **Record identity before the business record lands.** The
   `reborn-business-record` branch builds separate typed tables. Give every
   row a shared record identity (id, type, business, links, timeline) and add
   **policy** and **availability** types now; outside agents need them first.
   The migration isn't applied anywhere, so this is one migration's change.
2. **The approval store becomes the Action ledger.** Section 2's "one
   approval store" generalizes governed-work's proposal, decision, execution
   and outcome tables to every action, keyed by business.
3. **An event outbox** written in the same transaction as each action.
4. **Connections move out of Redis** with scopes and health (section 2 and
   Publishing).
5. **Conversion installs a package.** The managed website becomes Strelva's
   first package, v1, installed into each converted business. Overrides and
   upgrade diffs can wait until after 1.0; the install link can't.
6. **Responsibilities get one measured definition** before any is priced.
   Inquiries answered is the first.

## Still unproven

- Whether Strelva can measure a responsibility reliably outside its own
  inbox. Nobody in SMB operations does this yet.
- Whether agent traffic reaches small businesses directly or only through
  platforms like Booksy and Square. Phone calls are the live channel today.
- Whether any agency other than Strelva adopts methods. Reborn has none.
- Whether owners log in. One sign-in in 30 days; the design must work for
  clients who never do.
- Several outside prices and adoption numbers come from secondary sources.

## Decisions this needs from Jacob

- Amend ADR 0005/0007's per-product data ownership in favor of one business
  record that every capability reads. The horizontal-core research left this
  to Jacob.
- Accept the nine primitives and the renames (provider → seat/connection,
  offering/method/installation → package/install).

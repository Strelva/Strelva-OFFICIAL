# Strelva glossary

This is the single authority for words in product copy, docs and the internal
model. The [product ontology](./docs/architecture/product-ontology.md) owns
structure and governance rules; both CONTEXT.md files point here for language.
These definitions apply Jacob's decisions of October 9–12, 2026, including
[ADR 0014](../docs/adr/0014-one-model-at-three-zooms.md) and
[ADR 0015](../docs/adr/0015-two-doors-self-serve-and-agencies.md).

## On screen

Words a person sees. The concepts are defined here; exact product labels remain
Jacob's call where marked label open. The October 11 decisions keep Possibility
and Queue and select Internal tool. Internal distinctions stay in Underneath.

The named actor is whoever did the work. An agency uses its display name with
“Runs on Strelva” credit. “Strelva Agency” names Strelva's own agency.
“Strelva” alone names only real platform actions: platform billing, account
authentication, platform checks and support, and work the platform does for a
business that uses Strelva itself with no agency (ADR 0015). Never infer the
actor from the viewer; an unknown actor is “Actor not recorded”.

Owners see their agency's brand in the workspace shell, emails, entry and signed
pages. End customers see the business's name. Failed brand lookup shows a neutral
state and holds agency-authored sends; it never silently becomes Strelva.

### Systems and their state

**System** _(label open)_:
Something that works and that a business runs through Strelva, such as a website,
proposal, booking page, intake flow or internal tool. It is either made in
Strelva or brought in: a website the business already runs elsewhere or its
Google listing is a System from the day it is connected. Its identity survives
changes to its content, data, logic and screens. Draft, Live and Paused express
intent; Health is separate.
_Avoid_: product, project, installation, module, app (for a business's own System)

**Connection**:
What a System reads, acts on, appears in, shares with, depends on or is triggered
by: business facts, another System, a person, an outside account or a domain.
An account connection is one kind. A Connection never grants authority by itself.
_Avoid_: integration (as the general on-screen noun), permission


**Connections**:
The workspace section for outside accounts a business or agency works with.
Each row names whose account it is, whose provider access carries it, its state,
and the Systems using it. Outside tools never appear as Apps.

**Whose account** _(Account holder underneath)_:
The business, agency or platform whose login was connected. Show **Your business**,
**<Agency name> (your agency)** in a business, **<Agency name>** in an agency,
or **Strelva** for the platform. Legacy accounts show **Unknown** and
“Reconnect to record whose account this is”. Never infer the holder from membership.

**Access through**:
Whose approved provider app or project carries the calls. Agency access reads
“Through <Agency name>’s Google access”. Platform access does not need a second
line. An account Connection grants no authority; agency access still needs the
business’s area grant while that agency acts.

**Works with**:
An Apps filter over the Connections declared by each reusable App. It finds Apps
that work with a provider; it never turns an outside tool into an App.

**Possibility**:
A working alternative to one or several Systems that a person can open, use
and compare. A suggestion alone is not a Possibility. Make real turns it on.
Proposal remains an Underneath research response, never an on-screen synonym.
_Avoid_: idea, recommendation, research proposal, experiment (as synonyms)

**Make real** _(concept, never a button label)_:
Turn a Possibility on under the same authority and approvals as any other change.
The result says what happened, including when only part of it became real.
_Avoid_: activate everything, automatic approval, guaranteed success

**Make it live**:
The button for an owner approval that authorizes a live change. A press-and-hold
control says **Hold to make it live**. The result records what landed, what is
waiting and what could not be confirmed; the label promises no automatic success.
An approval that only saves a private preview keeps its preview-specific wording.
Other acts keep their own verbs: **Hold to confirm** for a booking, **Send to
[business]** for agency work sent to owner review, **Not yet**, and **Undo**.
_Avoid_: Make real, Make it real, Hold to publish, Approve and publish
(as live-approval button labels)

**Release / Releases**:
A numbered revision on owner and agency screens: **Release 12**. A local change
reads **Release 12 + 1 local change**; a draft reads **Release 13 draft**.
Releases may label the collection. Internal revision IDs and contracts stay as
they are; a Release is not a Version adapted to another business or context.
_Avoid_: r12, r12+1, Package r13, Source revisions (on screen)

**Time this month**:
The agency's usage column for the current month's recorded time.
_Avoid_: Minutes · Oct (as the column label)

**Usage this month**:
Estimated cost of Strelva work for one business in the current period, at list
prices.
_Avoid_: AI spend, tokens, credits (on screen)

**Usage limit**:
A monthly ceiling on usage for one business, set by its agency or by Strelva.
Work pauses when it is reached and resumes when the period resets.
_Avoid_: cap, budget (on agency screens)

**Version** _(label open)_:
The same System adapted to another context, such as a location, client or
segment, with lineage to its source. Across businesses, each Version is that
business's own System with its own data, accounts and grants.
_Avoid_: History, release, revision, copy, fork (as synonyms)

**History** _(label open)_:
Past states of a System, including states a person can restore.
_Avoid_: Version, release, revision (as the on-screen noun)

**Health** _(label open)_:
How a System is doing now, separate from whether the business intends it to
be Draft, Live or Paused.
_Avoid_: lifecycle, Live (as proof of health), guaranteed uptime

**Internal tool / Internal tools**:
A System a business uses for its own work, including a tracker or an intake tool.
Internal tool is the kind; Internal tools is the collection; open it by its own name.
_Avoid_: Application, Internal application, App, Private app, Spreadsheet tracker
(as kind or collection labels)

**Bookings**:
The System kind for receiving, confirming and managing bookings, including
request-based booking and existing calendars or rosters.
_Avoid_: Scheduling, Schedule, Reservations (as kind labels)

**Saved check**:
A saved comparison or inspection that can be run again with its stated sources;
when maintained over time, its result contributes to the watched System's Health.
_Avoid_: saved investigation, Ongoing check, Website monitoring (for all checks)

### Requests and what keeps running

**Request / Requests** _(label open)_:
Asked-for work with an end: Asked → Needs you → In progress → Ready for your
review → Done. A Request goes to the business's own agency; it is not an
accepted job until scope and deadline are agreed. A business with no agency
makes the thing itself or brings in an agency first; there is no default
recipient.
_Avoid_: Work (as a business-screen noun), start request, ticket, obligation

**Running** _(label open)_:
What is kept true over time under stated limits, named by the condition being
maintained rather than the machinery that maintains it.
_Avoid_: Work, Ongoing, Responsibility, Assignment (as business-screen nouns)

**Needs you** _(label open)_:
Decisions, information or approvals that need the person's attention before
work can continue.
_Avoid_: failures (as a synonym), agent queue, operator inbox

**What changed**:
The place showing completed actions and their results. Each action names whoever
did the work, including an agency's display name when the agency acted.
_Avoid_: Strelva handled (former label), Strelva did it (when another actor did),
anonymous agency work

**Actor not recorded**:
The visible attribution when the recorded evidence cannot identify who acted.
It never assigns unknown work to Strelva or to the current viewer.
_Avoid_: Strelva (as a fallback actor), Strelva or your team

**Ask Strelva** _(label open)_:
Where a person says what they want to happen. Their words are an ask before
work exists; an ask alone grants no permission to run, share or publish anything.
The platform answers, drafts and prepares; no person at Strelva is behind it.
_Avoid_: Start, start request, prompt, Chats (as the phone place name)

### People and businesses

**Business / Your business**:
The organization whose work and records remain separate from other businesses.
The owner sees “your business” or its name; the agency sees a client.
_Avoid_: customer (for the business), tenant, account

**Client**:
A business an agency makes and runs Systems for. Agencies see “your clients”
and “Client email.” Delegation determines which clients an agency can see.
_Avoid_: customer (for the business), tenant, account

**End customer**:
A member of the public the business serves: “their customers” or “end customers.”
_Avoid_: customer (for the business or agency), Platform Member, Studio Member

**Agency**:
Anyone who makes and runs Systems for clients. Strelva's own agency is one of
them with no extra powers. An agency sees only clients that delegated to it and
may be chosen as payer for a business.
_Avoid_: provider (for people), partner, reseller, white-labeler (as synonyms)

**Owner**:
The business's owner role: decides, launches, exits and invites. An owner who
uses Strelva directly makes the business's Systems too (ADR 0015).
_Avoid_: payer (as a synonym), agency (as a synonym), account holder

**Use it yourself / Run it for others**:
The two doors into Strelva (ADR 0015). Use it yourself: a business runs Strelva
directly, with no agency and no human service. Run it for others: anyone who
runs work for several businesses works through the agency zooms. One product.
_Avoid_: self-serve tier, direct plan, DIY (on screen); managed client (for a
business with no agency)

**Bring in an agency**:
The one way a business gets work done for it. The owner chooses from a list of
agencies, never a default, picks what each may do, and the agency accepts before
anything changes. Strelva Agency is listed the same way as any agency.
_Avoid_: Contact the team, Request your build, hire Strelva, platform support
(for getting work done)

**Getting started**:
How a business or agency starts on Strelva from what it already has: its website,
its Google listing, its tools and, for an agency, its existing clients. Nothing
has to move first.
_Avoid_: onboarding (a System kind a business runs for its own customers),
migration, setup wizard

**Found fact**:
A fact Strelva read from somewhere the business already is, such as its website
or Google listing, shown with where it came from. It joins the business record
only when the owner confirms it.
_Avoid_: suggestion, imported fact, auto-filled, confirmed (until confirmed)

**Import clients**:
An agency adding many clients at once, from a list or from a tool it already
uses. Each imported client is added exactly as one added by hand and still
needs its owner's claim.
_Avoid_: bulk upload, migration, sync (as synonyms)

**Claim**:
The owner taking up a business an agency added. The owner sees what was found
and prepared, confirms facts and decides what each agency may do.
_Avoid_: activation, invite acceptance, transfer

**Prepare / Full control**:
What a business lets one agency do in one area (website, inquiries, bookings,
Google, internal tools). Prepare: the agency builds and stages; the owner
approves. Full control: the agency approves and makes it live in that area. One
agency holds Full control of an area. Payer, adding and ending agencies, data
and exit always stay with the owner. Before a claim, the agency that added the
business may Prepare in every area and nothing it prepares goes live; at the claim
the owner decides each area.
_Avoid_: admin access, white-label, delegation (on screen)

**Inquiry**:
One end customer's request to a business, with its handling status and assignee.
Customer Inquiry is the full term.
_Avoid_: lead (the stored copy), submission, prospect, record

**Agency handoff**:
An owner-authorized change of serving agency that names the business and both
agencies and preserves its records and History.
_Avoid_: Provider handoff, Provider change, Complete provider change

**Billing group**:
An operator grouping of businesses or linked sites for a shared billing
arrangement; it is neither a Client identity nor a person's Account.
_Avoid_: Account, client (for a group of sites), ownership or access grant

### Finding your way

**Three zooms**:
One model viewed as agency “All clients”, agency inside one client, or owner
“Your business”; the same nouns apply within the viewer's granted scope.
Inside a client the agency sees the owner's workspace plus Version/source and
preparation controls; owner-only approval, exit, payer decisions and sensitive
data remain owner-only.
_Avoid_: separate agency product, agency status as owner authority

**Queue**:
The agency's cross-client list of its client-service items, read through ordinary
agency scope; owner decisions read “Waiting on [business]” with the owner's
same title and a link to that exact item, without approval controls.
_Avoid_: operator queue (as the agency's source), Strelva's work (platform bucket),
Needs you (as the cross-client place name)

**App / Apps**:
A reusable System a creator publishes for other businesses to install. Installing
an App gives the business a Version: its own System, with its own data, accounts
and grants, and lineage back to the App. The App's creator is credited for every
business that runs a Version of it; who runs that Version is a separate matter.
Apps is also where a business finds them. Managed services are an agency's offer,
not Apps, and never a default for a business. Installing grants no agency
authority.
_Avoid_: Ready-made, catalog item, plugin, template (as synonyms); app (for a
business's own System); an outside platform's app (Strelva's listing in another
product is not an App)

**Bundle**:
An App made of several Systems that install together. Each becomes the
business's own System, in Draft, and each keeps its own History and Health.
Who runs each one is decided per area, as with any App.
_Avoid_: package, suite, plan (a Bundle is not a price)

**Library**:
An agency's own Apps and their client Versions, with improvements and conflicts;
an App a business sees in Apps is the same reusable definition, installed without
transferring records, accounts, secrets or grants.
_Avoid_: separate catalog model, implicit client-data sharing

**Section**:
A workspace destination: Home, Needs you, Requests, Running, What changed or
Systems, with Business details, People & access and Help in the business menu. Account is
personal account context; Ask Strelva is the ask entrance. A System opens by
its own name.
_Avoid_: Work, Ongoing, Settings, Explore, Start (as current place names)

## Underneath

Internal model words. These are not nouns for business screens.

### Businesses and what they run

**Workspace kind**:
Whose workspace it is: one person's own (personal), an agency's or a business's.
_Avoid_: tenant, account, customer workspace

**Business workspace**:
The workspace of one business, with records separate from every other business.
_Avoid_: customer workspace, tenant, site

**Business record**:
The shared facts, contacts, requests, bookings and content belonging to a business.
_Avoid_: CRM, knowledge graph, tenant config

**System kind**:
A type of System, such as Website, Bookings or Internal tool. A System has one kind
for its whole life.
_Avoid_: product, executable, horizontal, native product, tool

**Capability**:
A reusable, governed ability to create, inspect or operate a kind of business
work. Systems are built from capabilities.
_Avoid_: System (as a synonym), module, executable, feature

**Capability Version**:
A fixed definition of a Capability's inputs, outputs, rules and supported actions.
_Avoid_: Version (without Capability), History, release

**Agent Capability**:
A governed tool or action an agent may attempt.
_Avoid_: permission, guaranteed ability, autonomous authority

**Offering**:
An outcome packaged for a business under stated limits, delivered through one
or more capabilities. Packaging for a System, not the primary on-screen noun.
_Avoid_: item, shelf item, System (as a synonym)

**Installation**:
An offering configured for one business with its selected definition and
connected resources. It grants no new authority and proves no agency commitment.
_Avoid_: System (as a synonym), permission, service acceptance

**Entrance**:
How an Agent Capability starts: reviewed work, delegated ongoing work, a
schedule or a person acting directly.
_Avoid_: channel, surface, source (as synonyms)

### People and permission

**Membership**:
A person's direct place in a workspace, carrying a workspace role.
_Avoid_: access, seat, join

**Workspace role**:
The rank a member holds: owner, admin or member.
_Avoid_: viewer, editor (legacy tenant roles), seat, permission level

**Workspace permission**:
A named action a workspace role allows for the duration of membership.
_Avoid_: capability, authority, allowance, scope, flag

**Delegated read**:
Read-only sight of a business workspace granted to an agency. It carries no
role and lets nobody operate anything.
_Avoid_: shared access, agency access, Assignment

**Acting agency**:
The agency a person represents in delegated client work. Every agency has the
same standing, Strelva's included.
_Avoid_: acting provider, operator, Strelva staff (as an agency role), super admin

**Client-resource mandate**:
A business's grant allowing one agency to perform a named effect on one named
resource. The owner grants and ends it.
_Avoid_: account connection, agency verification, unrestricted permission

**Work access**:
How a viewer relates to internal work: owned, member, delegated read, addressed
by an incoming handoff or public.
_Avoid_: access (without a qualifier), ownership, sharing

**Tenant membership**:
A person's place on a legacy managed-website tenant, ranked viewer, editor,
admin or owner. Separate from workspace membership.
_Avoid_: workspace membership, business membership

**Strelva staff**:
People employed by Strelva. Employment alone does not grant agency authority
over client work.
_Avoid_: super admin (in workspace contexts), god mode, operator override

**Verified actor**:
A signed-in person with a confirmed email address.
_Avoid_: current user, session user (as synonyms)

**Assignment**:
Explicit, limited permission for a person or agent to operate named work within
agreed limits and time. It does not transfer business ownership.
_Avoid_: Responsibility, membership, unlimited delegation

### Agencies and the platform

These terms follow ADR 0012's neutral platform decision. Agency is defined in
On screen.

**Strelva Agency**:
Strelva's own agency, with the same standing and powers as every other agency.
It is always named "Strelva Agency" on screen, so its work is never mistaken
for something the platform, "Strelva", did.
_Avoid_: Strelva (alone, for the agency), Strelva staff, house agency, operator, platform

**Agency basis**:
Why a business has the agency it has: the owner brought it in from the agency
list, or (for businesses that moved in from the older tenant model) an existing
contract with that agency.
_Avoid_: default agency, assignment, provider attribution

**Platform operator**:
Strelva staff acting for the platform in support, incidents or release. Its
actions are logged. It never sells to or serves a client; client work follows
the ordinary agency path.
_Avoid_: Strelva Agency, super admin, operator override

**Payer**:
Who pays Strelva for one business: the business itself or its agency, chosen
for that business.
_Avoid_: owner (as a synonym), billing owner, account holder

**Creator**:
Anyone who publishes Apps: an agency, an independent builder or Strelva Agency.
_Avoid_: developer, partner, vendor (as synonyms)

**Agency verification**:
The per-agency check for outside effects such as publishing, Google writes,
sending email and taking payment. It does not replace a business's authority.
_Avoid_: approval, partner status, onboarding

**Agency commitment**:
Work an agency has agreed to take care of. Asking an agency is not its acceptance.
_Avoid_: provider commitment, Request (as proof of acceptance)

**Method**:
An agency's reusable way to set up and run offerings for clients, without
business data, secrets or grants.
_Avoid_: playbook, snapshot, template, recipe (as synonyms)

**Contribution reward**:
An explicitly awarded benefit for helping develop an offering, such as usage
or subscription credit. It is not equity or access to client information.
_Avoid_: royalty (unless agreed), ownership, permission

### Workspace state

**Workspace release**:
Whether workspace Systems are available in an environment.
_Avoid_: System Version, service acceptance

**Release**:
An application release, such as 1.0.0.
_Avoid_: Version, History

**Stopped workspace**:
A workspace whose exit has completed, with readable records and no new work.
_Avoid_: deleted, archived, frozen

**Unconfirmed exit**:
A workspace whose stopped state could not be confirmed.
_Avoid_: stopped, deleted, confirmed exit

**Read-only reason**:
The principal reason a person cannot change the open workspace: delegated
read, stopped, unconfirmed exit or role.
_Avoid_: error, lock (without a reason)

**Workspace write**:
An authorized change to workspace work.
_Avoid_: Request (as a synonym), automatic permission

### Work and records

**Work**:
The internal durable thread from a person's intent to an answer, Change,
Capability or Responsibility. On screen, finite work is Requests; maintained
conditions are Running.
_Avoid_: Work (as a business-screen noun), permission

**Responsibility**:
An ongoing condition kept true under stated limits. It states permitted actions,
limits, escalation and required approvals; Assignment is permission to operate.
_Avoid_: Assignment, retainer, maintenance, unlimited service

**Receipt**:
Durable evidence of an action: who acted, what happened, why, its target,
outcome and any supported inverse. Acceptance and read-back are distinct facts.
It keeps the actor's name as it was when the action happened.
_Avoid_: guaranteed success, anonymous agency work

**Workspace record**:
A typed thing a System kind keeps for one workspace, such as a website draft,
booking, document or onboarding case, with one record kind and successive revisions.
_Avoid_: saved work, product work, resource, item (as synonyms)

**Record kind**:
The owning System kind and the kind of thing it keeps, such as a tracker row
or onboarding case.
_Avoid_: resource kind, product id (alone), type (alone)

**Owning kind**:
The one System kind allowed to create and change a record kind.
_Avoid_: owning product, writer, source product

**Companion state**:
State a System kind keeps alongside workspace records under its own rules.
_Avoid_: side table, sidecar, workspace record (as a synonym)

**Revision**:
The count of accepted changes to one workspace record.
_Avoid_: Version, History, release

**Revision conflict**:
A change refused because another change was accepted after its starting revision.
_Avoid_: merged change, accepted change, generic error

**Revision entry**:
An append-only note of who made a revision, what changed and when.
_Avoid_: Receipt, Audit (as synonyms)

### Starting work

**Ask**:
The words a person writes about what they want before work exists. An ask is
request data, never permission to run, share or publish anything.
_Avoid_: start request, pending Request, prompt, continuation, draft

**Ask route**:
A destination an ask is aimed at, such as a document, plan, onboarding or Help.
_Avoid_: start route, route (alone), product id

**Routed ask**:
An ask aimed at one destination, waiting for new work to begin from it.
_Avoid_: routed request, continuation, start context

**Spent ask**:
An ask from which work has been saved; the work now carries those words.
_Avoid_: spent request, consumed intent, used draft

**Cleared ask**:
An ask the person explicitly emptied, which stays empty.
_Avoid_: cleared request, discarded draft, reset (without a subject)

**Service request**:
A Request sent to an agency. It is not an accepted job until scope and deadline
are agreed.
_Avoid_: start request, human provider, job (until accepted), agency commitment

### Finding your way

**Workspace location**:
Where a person is within a workspace: a section, opened work and its detail.
A location never grants access.
_Avoid_: state, permission, route (as synonyms)

**Opened work**:
One piece of internal work shown in the tool for its kind, or new work being made.
_Avoid_: horizontal view, product view

**Location detail**:
The part of a location meaningful within one section or opened work.
_Avoid_: section (as a synonym), sub-route

**Return target**:
A workspace location that can be reopened after sign-in.
_Avoid_: permission, access grant

### Inquiries and research

**Lead**:
The stored copy of an end customer's own words and contact details, separate
from handling decisions. Internal inquiry storage, never Strelva's sales record.
_Avoid_: Inquiry, prospect, contact, CRM record (as synonyms)

**Prospect**:
An agency or business considering Strelva. A prospect record is Strelva's own
pre-relationship sales record.
_Avoid_: lead, Delivery Lead, end customer

**Proposal**:
One proposed response to a research Opportunity. It is not yet a working
alternative or authorization to implement one. A proposal System offered by a
business is a separate use of the ordinary word.
_Avoid_: Possibility (for research), supported Capability, permission

**Inquiry intake**:
A business's inquiry Capability: its form, routing, follow-up and Responsibility.
Its identity survives new Capability Versions.
_Avoid_: offering, installation, form (alone)

**Live intent**:
The owner's intention that a Capability Version be on the website, separate
from confirmation that it is there.
_Avoid_: verified, published, healthy

**Current inquiry**:
An open inquiry whose intake has live intent and whose captured Capability
Version is the live one.
_Avoid_: fresh, valid, active (without a qualifier)

**Inquiry workspace**:
The inquiry domain's versioned store of intakes, Capability Versions, Receipts
and record changes. Separate from the business workspace and end-customer fields.
_Avoid_: workspace (alone), snapshot, business workspace

**Record change**:
A published, undoable change to inquiry handling status or assignee.
_Avoid_: Lead, submission, overlay

**Intake outcome**:
The answer an inquiry entry gives for a submission: accepted, duplicate,
pending, stopped, changed, missing, invalid or unavailable.
_Avoid_: evidence status, message outcome

**Customer agent**:
An AI acting for an end customer, such as an assistant making a reservation.
It is not Strelva's agent and holds no business authority.
_Avoid_: bot, AI customer, business agent

### Outside systems and inquiry messages

**Provider**:
An outside system, such as Google, Resend, Stripe or a calendar. People and
agencies serving a business are agencies.
_Avoid_: agency, human provider, service provider (for people)

**Account connection**:
A stored login or credential binding to an outside system, with its connection
state. One kind of Connection; it never grants authority by itself.
_Avoid_: Connection (as if all Connections were accounts), mandate, Assignment

**Inquiry message**:
An email about one inquiry for one purpose.
_Avoid_: action, notification, send attempt (as synonyms)

**Message purpose**:
Why an inquiry message exists: reply to the end customer, follow-up to the
end customer or staff notice.
_Avoid_: action, owner notification (for a staff notice)

**Message review**:
The exact rendered inquiry message held for the Responsibility sponsor's approval.
_Avoid_: approval event, change request, Draft (as synonyms)

**Approval**:
The sponsor's explicit yes to a message review. Standing approval is a
Responsibility rule permitting a purpose without an individual review.
_Avoid_: unlimited authorization, resolve

**Send attempt**:
One try to hand an inquiry message to an email provider.
_Avoid_: delivery, acceptance, retry (as synonyms)

**Accepted**:
The provider took the message. Acceptance is the completion boundary for sending.
_Avoid_: delivered, verified, guaranteed receipt

**Rejected**:
The message was refused before the provider took it.
_Avoid_: bounced, suppressed, unknown outcome

**Unknown outcome**:
An attempt may have reached the provider but no answer was received. Possibly accepted.
_Avoid_: rejected, failed, safe to retry

**Unconfirmed**:
Accepted, without a provider report or read-back confirming the later result.
_Avoid_: rejected, unsent, delivered

**Provider report**:
Later evidence about an accepted message: delivered, deferred, bounced,
suppressed, failed or complained. It does not undo acceptance.
_Avoid_: send outcome, Approval, guaranteed delivery

**Reconciliation**:
Checking what happened to an unknown outcome or a stuck Receipt and recording
the finding. It is not another send.
_Avoid_: retry, recovery, repair (as synonyms)

**Message receipt**:
The durable record that the exact message was sent under the stated approval,
including who acted.
_Avoid_: delivery receipt, provider receipt, guaranteed delivery

**Payment link**:
A web address an agency shares so a client can pay an agreed amount by card. It
charges on the agency's own Stripe account; Strelva never holds the money.
_Avoid_: pay link (in UI), checkout link

**Invoice**:
The numbered document for one Payment link: who charges, who is billed, what for
and how much. Issued when the link is created and never edited.
_Avoid_: bill, quote

**Payment receipt**:
The numbered document showing Stripe reported a payment on a Payment link. Not a
Receipt, which is evidence of an action.
_Avoid_: Receipt (alone), confirmation

## Open naming questions

- **AI Visibility:** whether it is an App whose install gives a business a System,
  or a Saved check that contributes to a website's Health, remains open.

- **On-screen labels:** What changed, Possibility, Queue and Internal tool are
  decided. Other labels marked open remain Jacob's call; those open choices do
  not reopen the October 9–11 decisions.
- **Capability and System kind:** whether every System kind corresponds to one
  Capability or composes several remains open. They are internal words, not
  competing on-screen nouns.
- **Internal tool records:** the name for records inside an Internal tool,
  distinct from workspace records, remains open.

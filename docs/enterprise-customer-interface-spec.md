# Enterprise and customer interface specification

Status: proposed interface for review, September 8, 2026. Jacob's direction is
that agencies are Enterprise relationships and should have access to selected
Home Finder capabilities. Layouts, detailed roles, billing terms, and broader
delegated operations remain proposals. This specification supersedes the earlier
recommendation to defer Customers from this release.

## Intent before layout

People need to recognize the business they are acting for, understand what they
can control, inspect an object, and act on it. Their relationship with Strelva
must not force them to learn a different product. Enterprise adds organization
and customer scope to the same interface. It does not make every capability
available or give an agency ownership of everything it can see.

The durable visible objects are people, organizations, customers, assessments,
websites, and Home Finder installations. “Work” is a useful history label, not a
universal object model or a mandatory series of steps. A customer can own multiple
resources. Multiple organizations can have separate, explicit relationships to
one customer. A typed business name from an assessment is not proof of identity.

## People, intent, and scope

| Person/context | Intent | Information and controls required |
| --- | --- | --- |
| Visitor | Understand what Strelva can do and try a useful capability | Public discovery, explicit diagnostic inputs, evidence, export, optional sign-in to save |
| Individual user | Return to their resources without owning a managed website | Personal context, assessment history, available capabilities, account recovery |
| Direct managed customer | Understand their site and the service they receive; change something | Website, current evidence, proposals, history, people/access, own accepted service |
| Enterprise agency administrator | Understand customer coverage and what their organization can provide | Customers, authorized resources, team/access, available products, own service/billing |
| Enterprise agency member | Do permitted work for assigned customers | Assigned customer list and resource controls; no implicit team, billing, or owner powers |
| Agency's customer / brokerage member | Inspect their resources and understand the agency's access | Own business context, authorized resources, access details, relevant approval and service information |
| Buyer on brokerage site | Find a home and contact the brokerage | Brokerage-branded search, listing detail, explicit inquiry consent, honest submission state |
| Strelva operator | Establish and verify service and resolve exceptions | Separate operator console, correct customer/installation, evidence, scoped configuration and recovery |

These are interface test personas, not a new authorization enum. Entitlement,
membership, object ownership, delegation, payer, and service responsibility are
independent facts. Agency membership alone must not expose every customer.

## Page families derived from intent

The paths below are proposed logical destinations. Preserve deployed paths and
deep links; do not rename production routes just to match this table. Many are
views of one object, not additional permanent navigation items.

| Page family | Intent and principal content | Actions and necessary states |
| --- | --- | --- |
| Public introduction / product detail | Is this useful for me? Concrete capability, limits, evidence, availability | Try supported assessment, preview Home Finder, contact Strelva; no implied entitlement from discovery |
| Sign-in / recovery / acceptance | Resume the exact destination with the correct identity | Sign in, recover, accept an addressed invitation; expired/revoked/wrong-account states, preserved result |
| Home | What can I use, and what needs my attention? | Recent resources, relevant decisions, explicit start; useful empty state, bounded unavailable reads |
| My work | Find a specific assessment or website | Search/filter by subject/type, open, restore URL context; no hidden archive dependency |
| Customers (Enterprise) | Which customer am I responsible for and what can I access? | Search by name/domain, open customer; empty, assigned-only, unavailable, revoked states |
| Customer detail | Understand this relationship and its resources | Websites, assessments, installations, people and scope; one customer with multiple sites, unknown relationship, revoked resource |
| Assessment entry/result | Understand a specific business or website | Scope selection, retained inputs, evidence, save/export; running, partial, failed, unavailable, interrupted, read-only |
| Website | Inspect or change the site | Existing preview/content/media/collection modes, contextual Ask Strelva, proposed changes, history; read-only and disconnected states |
| Website performance | What is happening and what changed? | Existing current metrics, period selector, dated reports, source evidence; no data, missing connection, unavailable source |
| Home Finder installation | Understand this brokerage's installation and what remains to enable it | Overview, buyer preview, readiness, delivery evidence, access/service; sample, preparing, live only with proof, unavailable |
| Home Finder setup | What is missing, and who must supply it? | Exact origin, brokerage, authorized source, verified destinations and evidence; request change or contact responsible person, never arbitrary activation |
| Home Finder deliveries | Did inquiries reach the brokerage? | Content-free receipts, event time, pending/delivered/bounced/failed; no results, stale evidence, unavailable, expired history |
| Resource people/access | Who can do what here? | Inspect access; bounded grant/revoke/handoff where supported; owner vs agency, copy vs delegation, expired and wrong-recipient states |
| Organization people | Who belongs to my organization? | Proposed member list/assignment/invite controls; administrator vs member, pending invitation, removed membership |
| Service & billing | What did we agree to, who pays, and who provides support? | Actual accepted terms, payer, covered resource, next known billing event, support contact; unknown, no agreement, inaccessible billing |
| Help | Who can help with this resource or request? | Resource-aware request, known support responsibility; distinguish copy/open-email from submitted/accepted request |
| Account | Which person is signed in? | Identity, organization membership links, sign-out/recovery; preserve separate business settings |
| Buyer search/detail/inquiry | Find a home and knowingly contact its brokerage | Existing separate IDX embed; mobile filters/detail, consent, preview/pending/delivered/error states |
| Operator customer/installation | What must Strelva verify or resolve? | Existing restricted console plus proposed installation details; attribution, source authorization, delivery worker and recovery evidence |

## Navigation and interaction proposal

Use the current common Strelva frame. Home, My work, and Explore remain available
while the proposed consolidation is evaluated. Customers appears for an Enterprise
context with the appropriate permission. Account and Help remain easy to reach.
Organization people and service belong to organization context, not every resource.

One explicit context selector changes personal/organization scope. Customer
selection then occurs within the authorized organization. On a resource, show its
customer and object name persistently. Switching context cancels stale requests
and clears the prior resource selection; back/forward and deep links retain scope.
Do not fetch a global customer list and hide unauthorized rows in the browser.

Customer detail opens a resource in the same frame. Website and Home Finder use
contextual modes, rather than each adding a full second application sidebar.
Delivery detail can be an inspector on desktop and a full-height view on mobile.
Precise configuration uses labeled controls; conversation is optional and only
appears where an executing capability supports it.

Search operates on the current authorized collection. Empty search results offer
clear-filter; an empty customer book explains how a relationship is established.
Unavailable data must not look like an empty portfolio or imply healthy operation.
Direct customers do not see an Enterprise upsell in place of their own resources.

## Home Finder: what each person sees

The Enterprise agency sees customer installations, configured public identity,
readiness evidence, approved origin, and bounded delivery evidence. The brokerage
sees its own installation and its agency relationship. Buyers see brokerage branding
and no Strelva/agency management chrome. Agency staff never gain buyer contact
details or message content through delivery evidence.

The current product has installation configuration and an internal receipt route,
but no shared-session Enterprise administration boundary. A worker bearer secret
must not be passed to the browser or reused as an Enterprise permission model.
Add an authenticated, installation-scoped server adapter and explicit mapping
between the organization/customer and the installation. Receipt responses require
a bounded presentation: state/time/reference, not raw internal records or secrets.
Listing metadata should be included only where product policy permits it.

Readiness is evidence, not a decorative percentage: brokerage approval, permitted
source/display rules, origin, verified routing, infrastructure, and delivery proof
each have known/missing/unverified states and an accountable party. A customer
request may propose a configuration change; it does not directly edit verified
routing, credentials, or live mode. Destination changes cannot redirect an already
accepted inquiry's encrypted routing snapshot.

“Pending” means awaiting confirmed delivery. “Delivered” requires the verified
provider delivery event. “Bounced”/“Failed” retain their distinct evidence. A
missing read is “Unavailable,” not failed delivery. Do not supply a manual Resend
button without product-approved idempotent recovery semantics.

Initial preparation can expose synthetic preview and explicit readiness gaps.
Live operation requires the existing product gates. The pilot document's prices
are not newly selected Enterprise prices. Show agreed terms only when backed by
the actual agreement; support responsibility must also come from that agreement.

## Authority examples for acceptance

| Operation | Required evidence; not implied by relationship label |
| --- | --- |
| List a customer's resources | Organization membership plus explicit customer/resource scope |
| Read a saved assessment | Ownership/membership or specific active delegation |
| Hand over an assessment | Supported product operation and authority over source; addressed recipient accepts a copy |
| Edit a managed website | Tenant permission and enabled site capability; agency label is insufficient |
| Approve a consequential change | Relevant approval authority and exact resource/change |
| Inspect Home Finder receipt | Authorized installation mapping and a content-free server projection |
| Change installation routing | Proposed change plus verified destination/authority; manual administration remains until implemented |
| Inspect or change billing | Payer-specific permission; customer delivery access is insufficient |

Website Audit handoff and agency website management are currently unimplemented.
The prototype must not imply those permissions merely because it shows the
corresponding object. An agency's customer can have an independent Strelva account;
ending agency access must not erase customer-owned results or affect an unrelated
service. Transfer of an installation or service remains an explicit operation.

## UI contract after the intent decisions

Reuse the restrained dark Strelva frame, sage actions, quiet borders, readable
sans-serif controls and display serif headings. Use lists for customers and
resources; do not turn every capability into an equal promotional card.
Expose object identity and the main action before supporting metadata. Metadata
includes who owns it, relevant permission, evidence date and actual availability.

Desktop: persistent quiet navigation, a bounded main working area, optional
contextual inspector. Mobile: modal navigation with focus return, stacked rows,
full-width detail, no horizontal page scroll. Long organization/customer names
wrap; controls remain reachable without hover. Native keyboard access, visible
focus, Escape/close for dialogs, live status feedback, and preserved form inputs
are requirements. A failed action retains the user's context and says what was
or was not confirmed.

Prototype controls that choose a persona or failure state are clearly outside the
product. All examples are fictional. Proposed invitations, billing, installation
administration and grants have no backend implementation in this prototype.

## Build boundaries and release scope

- Account and workspace: reuse verified identity, scope selection and private
  storage. Do not merge tenant, payer and workspace identities.
- Access: coherent presentation over current policies; add a customer/installation
  authorization boundary before exposing Enterprise management data.
- Customers: new organization-scoped read model and resource navigation, with
  explicit mappings. Do not clone the operator CRM or infer owners from domains.
- Assessment/Website: deepen existing controls and operations rather than replace
  scanners, editors, governed publishing or recovery.
- Home Finder: preserve the separate product runtime. Build only the server
  adapter and management presentation justified by the chosen initial controls.
- Service: project known agreements; no new entitlement/paywall engine without
  accepted terms. Do not turn free/paid/Enterprise labels into permission checks.

Sequence: review the complete interface with fictional personas; implement
resource/customer scope and server adapters; connect read views; then enable each
authorized mutation with failure-path tests. Release can honestly provide a Home
Finder preview before a live installation is ready, but cannot claim live service.

Acceptance must cover all personas, not only the Enterprise administrator:
wrong organization/customer IDs, removed membership, revoked delegation, direct
links, back/forward, switching contexts mid-request, partial outages, missing
agreements, safe receipt projections, and desktop/mobile keyboard behavior.
Production permission, migration, dependency security and hosted-CI requirements
remain separate from prototype approval.

## Evidence and review artifact

- [Clickable interface study](./prototypes/enterprise-interface/index.html)
- [Earlier functional review](./deep-module-review-2026-09-08.md)
- [Earlier release scope](./deep-module-release-scope-2026-09-08.md)
- [Workspace context](../CONTEXT.md)
- [IDX product](../../strelva-idx-ops/PRODUCT.md)
- [IDX implementation state](../../strelva-idx-ops/STATE.md)
- [IDX installation contracts](../../strelva-idx-ops/src/lib/installations/types.ts)
- [IDX internal receipt route](../../strelva-idx-ops/app/api/internal/inquiries/[requestId]/route.ts)

Unselected consequential details: exact Enterprise member/customer assignment
policy, who may request or approve installation changes, installation transfer,
Enterprise pricing and support terms. The proposed read-focused interface can be
reviewed before selecting those writes or commercial commitments.

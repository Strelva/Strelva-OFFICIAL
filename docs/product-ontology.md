# Strelva product ontology

Status: **normative**
Updated: 2026-09-05

## Product transition

The founder's current direction is one accessible conversational Strelva
experience for Users, Paid Users, Clients, and Enterprise accounts. Existing
managed clients retain Client status. Standard paid access and personalized
managed service are independent facts; neither status grants permissions.
Agencies are a partner relationship with explicit delegated access, not an
additional user tier.

The managed-presence model below describes the existing delivery system and its
compatibility vocabulary. It must not impose a website or tenant requirement on
general Strelva users. The transition is specified in
[`strategy/2026-09-05-product-structure-and-agency-experiment.md`](strategy/2026-09-05-product-structure-and-agency-experiment.md);
[`../src/README.md`](../src/README.md) defines source boundaries. Shared
conversation access and account-owned persistence are not yet deployed by this
structural migration.

This document defines what the product is, the concepts it owns, and the
language code and product work should use. It exists to keep commercial
packaging, customer experience, delivery architecture, and persistence from
collapsing into one overloaded idea of a “feature.”

## Existing managed-presence product

Strelva is a **managed business-presence operating service with a software
control plane**. The customer buys an outcome—an effective presence that is
kept current and produces proof—not access to a self-serve website builder.

The system has four layers:

1. **Acquisition** — AI Visibility, audits, Access Requests, and qualification.
2. **Client control plane** — Today, Ask Strelva, Website, Analytics, Reports,
   reputation, settings, and governed work.
3. **Delivery** — a bespoke Site Property in a separate custom repository,
   connected through the additive `/api/v1` contract and signed revalidation.
4. **Operator system** — portfolio attention, CRM, provisioning, approvals,
   billing, health, audit, and maintenance.

AI Visibility is the acquisition wedge. The managed presence service is the
core product. Vertical operating systems are expansion bets and remain behind
explicit validation gates.

## Relationship model

```text
Prospect
  └─ AI Visibility / Audit / Access Request
       └─ Delivery Lead
            └─ Tenant
                 ├─ Platform Memberships and roles
                 ├─ Commercial Plan
                 ├─ Presence Profile
                 ├─ Tenant Capabilities and Feature Sets
                 ├─ Domains and Connections
                 ├─ Content, Page Config, and Catalog
                 └─ Site Property (custom repository)
                      ├─ reads versioned public contracts
                      ├─ renders the public experience
                      └─ emits signals, Customer Inquiries, and order telemetry

Signals and owner requests
  └─ Strelva agent
       └─ governed Draft / Suggestion
            └─ Workflow Event
                 └─ approval or policy resolution
                      └─ site/provider action
                           └─ Activity + Analytics + Report
```

## Independent classification axes

These axes answer different questions and must not be inferred from one another.

| Axis | Question | Canonical values/examples |
|---|---|---|
| Actor | Who is acting? | prospect, client team member, end customer, operator, system |
| Access role | What may a platform user do? | viewer, editor, admin, owner, super-admin |
| Lifecycle | Where is the relationship? | access request, building, live, at risk, churned/offboarded |
| Commercial Plan | What service scope and price were agreed? | Presence, Growth, Scale |
| Presence Profile | How is the business found? | local, online, hybrid |
| Vertical | What market/operating context applies? | wellness, restaurant, trades, professional, commerce |
| Feature Set | Which coherent capability bundle is enabled? | Wellness, E-commerce |
| Tenant Capability | What optional product behavior is enabled? | schedule, roster, commerce, blog |
| Site Capability | What does this exact live repository render/support? | manifest sections, actions, design tokens |
| Agent Capability | What governed tool may Strelva use? | update content, draft GBP post, reply to review |
| Surface | Where is evidence or an action presented? | Today, Website, Analytics, Reports, Schedule |
| Delivery Model | Where is the public experience implemented? | custom_repo; platform_template is legacy-only |
| Provider | What external system can Strelva integrate with? | Google, Yelp, Instagram, Calendly |
| Connection | Is one tenant configured with a provider? | connected, disconnected, error |
| Authority | Which store decides truth? | Postgres, Redis, custom repository/provider |

A Commercial Plan never implies a capability. A Vertical never implies a
Commercial Plan. A template is a legacy/default Site Archetype, not the live
site contract. The capability manifest is the authoritative section inventory
for a connected custom repository; omitted sections are unsupported.

## Canonical glossary

### Tenant

The client business and root control-plane aggregate. The tenant id is a stable
text slug. A Tenant owns configuration, commercial state, content authority,
domains, connections, memberships, governance policy, and delivery metadata.

Do not use Tenant to mean the public website when the distinction matters.

### Site Property

The delivered public experience for a Tenant. For paid clients this is normally
a separate custom repository. There is no independent `sites` table today; the
property is represented by Tenant delivery metadata plus content/configuration.

“Website” is the client-facing surface label. “Site Property” is the domain term.

### Actor

An entity that initiates or owns an action. Canonical actor classes are
Prospect, Client Team Member, End Customer, Operator, and System. Actor answers
*who*; it does not encode authorization. A Platform Membership grants a client
team member access, while a role describes what that authenticated actor may do.

### Tenant Capability, Site Capability, and Agent Capability

- A **Tenant Capability** enables optional control-plane behavior for one Tenant.
- A **Site Capability** states what the deployed Site Property actually renders
  or supports. Its fetched manifest is authoritative and subtractive.
- An **Agent Capability** is a governed tool/action Strelva may attempt.

These inventories are related but not interchangeable. A tenant flag cannot
prove a custom repository renders a section, and a rendered section does not
authorize an agent mutation.

### Surface

A place where an Actor sees evidence or performs an action: Today, Ask Strelva,
Website, Analytics, Reports, Reviews, Store, Schedule, or an operator console.
A Surface is presentation/navigation, not the underlying capability or domain
entity. Inspect mode may reveal a gated Surface to a super-admin, but it does
not change the Tenant's capability state.

### Platform Membership

The authorization relation between an authenticated Strelva user and a Tenant.
Its role is viewer, editor, admin, or owner. Owner contact fields are business
metadata and do not grant authorization.

### Customer / Studio Member

An end customer of a client business. This is never called a Platform Member.
Reward members and any future authenticated studio members belong to this
customer domain.

### Prospect, Access Request, and Delivery Lead

A Prospect is considering Strelva. An Access Request is their intake submission.
The resulting Delivery Lead is Strelva’s pre-tenant sales/delivery record.

### Customer Inquiry

A lead captured for a Tenant through its public Site Property. It is recent
customer activity, not Strelva’s own sales lead and not a full CRM record.

### Commercial Plan

The agreed price and managed-service scope. `presence`, `growth`, and `scale`
are plan keys. Plans do not unlock software capabilities unless a future product
decision introduces an explicit Plan Inclusion policy.

### Presence Profile

`local`, `online`, or `hybrid`. The persisted `settings.businessModel` field is a
legacy wire name for this concept; new product language says Presence Profile.

### Vertical, Site Archetype, and Feature Set

- **Vertical** supplies market context and validated operating assumptions.
- **Site Archetype** supplies initial content/layout defaults; legacy code calls
  this `template`.
- **Feature Set** is an enabled bundle of Tenant Capabilities.

Wellness currently means operational-lite Schedule, Roster, and read-only Member
visibility. Classes, capacity, waitlists, packages, member authentication, and
Stripe Connect are not implied by that set.

### Provider and Connection

A Provider is a supported external system. A Connection is a Tenant’s actual
credential/configuration and state for that provider. Registry availability does
not prove a connection, write scope, provider approval, or quota.

### Signal

An observed fact that can inform product behavior without itself being a work
item: page views, booking clicks, orders, inquiries, review changes, search
metrics, health regressions, and owner engagement. Signals become Analytics
evidence and may trigger governed work. A Signal is not a Workflow Event,
Activity, Audit entry, or Report.

### Content Section, Collection, and Catalog Product

- A Content Section is singleton structured content such as Hero or Services.
- A Collection contains repeating entries such as blog posts or products.
- Catalog Product is the canonical commerce entity in the `product` collection.

`shop` and the singleton `products` section are compatibility representations.
New catalog behavior uses collection products. Tenant capability writes normalize
the legacy `shop` and `products` flags to `commerce`; reads and route guards still
accept them for deployed tenants. Product reads prefer the canonical collection
and may fall back to the singleton `products` section. Remove that fallback only
after each custom repository consumes the collection-backed product contract.

### Content Event and Workflow Event

A Content Event is public calendar/event content. A Workflow Event is a
`UnifiedEvent` representing pending or resolved operational work. Product copy
should not shorten both to “event” when the context is ambiguous.

### Draft, Version, Activity, Audit, and Report

- **Draft** — proposed unpublished state.
- **Version** — restorable historical state.
- **Activity** — client-facing proof of work performed.
- **Audit** — operator/security accountability.
- **Report** — an interpreted period narrative built from evidence.

Analytics is live/rolling evidence. Reports are interpreted weekly/monthly
narratives. Repeating the same undifferentiated cards across both weakens the
model and should be treated as product debt.

## Governance model

```text
Site/Agent Capability
  → schema validation
  → risk classification
  → block / review / publish
  → authoritative mutation
  → version + activity
  → signed revalidation
```

External provider writes resolve through the Workflow Event action spine. A
provider acceptance is the completion boundary; read-back verification is a
separate signal. A process that dies with a non-idempotent action marked
`processing` requires reconciliation and must not automatically retry.

Review auto-reply is the narrow exception to human approval: it requires the
client’s explicit `auto` mode, a 12-hour safety window, a live mode recheck, and
the same resolver used by manual approval.

## Product-state vocabulary

Use these labels in plans and reviews:

- **Core implemented** — present, integrated, and locally verified.
- **Conditionally operable** — implemented but dependent on configuration,
  provider approval, data, or an audience switch.
- **Partial** — useful behavior exists but the job is not closed-loop.
- **Compatibility** — retained to protect deployed wire/data contracts.
- **Validation-gated** — intentionally not expanded until market evidence exists.
- **Production-verified** — confirmed against the deployed external system.

“Implemented” never means production-verified. “Connected” never means provider
write-approved. “Green tests” never prove an unapplied migration is live.

## Product strategy guardrails

1. Optimize the managed presence loop: observe → decide → govern → act → prove.
2. Complete AI Visibility as a durable acquisition loop before adding unrelated
   acquisition tools: result identity, capture, shareability, follow-up, and a
   monitoring conversion path.
3. Keep client service scope separate from software capability.
4. Treat operator automation as leverage for the managed service, not evidence
   that customers want another self-serve surface.
5. Expand vertical operations only after a paid workflow proves the domain.
6. Preserve additive `/api/v1` and `x-reb-*`/`reb:` compatibility until a
   coordinated rollout explicitly versions them.

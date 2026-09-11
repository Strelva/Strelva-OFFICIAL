# Strelva inquiry-first product specification

Selected 2026-09-11. Status: canonical specification for the local migration.
This document authorizes local implementation and verification. It does not
authorize a production migration, deployment, live message, provider write,
environment change, public claim, or change to an existing client agreement.

The [acceptance matrix](./inquiry-first-acceptance-2026-09-11.md) defines the
evidence required before this work can be called complete. Existing production
authority and compatibility rules in [AGENTS.md](../AGENTS.md),
[persistence-boundaries.md](./persistence-boundaries.md), and the versioned
storefront contract still apply.

## Product decision

Strelva starts with the work that happens after a person asks a business for
something. The first complete path is:

```text
website form
  -> inquiry record
  -> routing decision
  -> notification
  -> follow-up if no one replies
  -> receipt with causal evidence
```

The first slice must support buyer and seller inquiries for a brokerage, quote
and booking requests for a service business, and the common mechanics beneath
them. It must work end to end for one narrow form before the product claims a
general automation platform.

An **Inquiry** is one incoming Record from a business's customer. A
**Capability** is the governed, versioned way Strelva receives and handles one
kind of inquiry. A **Change** is a proposed, previewable, reversible
modification. A **Responsibility** is the policy that limits what Strelva may do
for a capability. A **Receipt** is durable evidence of what happened and why.
These records stay separate even when one screen shows them together.

The product primitives are Business, Record, Capability, Change,
Responsibility, and Connection. **Work** is the thread from an intent to an
answer, Change, Capability, or Responsibility. Work is navigation and history,
not an authority object. Agent is an implementation role and is not shown as a
business object.

The earlier September 11 product-direction memo remains useful research, but
its generic Request object and Home, Requests, Resources, Business rail do not
govern this migration. This specification supersedes those parts. Business,
access, tenant isolation, approval, provider-write, and compatibility
boundaries remain in force.

## Interface frame

The product uses one persistent frame. The sidebar contains:

- **New**, the clear starting point for stating intent without choosing a
  product category.
- **Search**, permission-scoped search across business objects and work.
- **Businesses** or **Clients**, limited to businesses the signed-in actor may
  access.
- **Recent work**, a short list of resumable work and receipts.
- **Account**, for the signed-in person's identity and preferences.

The frame may show a current business, but switching it must be explicit. A
business switch cannot carry a draft, selection, or approval into another
tenant. Agency users see only assigned businesses. The operator console stays
separate.

Every form in the first slice stays narrow. Ask only for facts needed to create,
route, or follow up on the inquiry. Progressive questions are preferred to a
long setup questionnaire.

## Fourteen screen contracts

These are behavior contracts. The implementation may compose more than one in
one route, but it must not omit the distinct states and actions.

### 1. Home

Home always uses this order:

1. **Needs you** shows only decisions or missing facts that this actor can
   resolve now.
2. **Handling** shows work Strelva is actively responsible for. Each row has a
   pause control when the actor has authority to pause it.
3. **Changed** shows recent receipts with the exact consequence and an Undo
   action only when a valid inverse is available.
4. **Live** shows the quiet list of published capabilities and their current
   state.

Empty sections remain in the same order with calm empty copy. Home uses lists,
not metric cards, charts, scores, invented activity, or unsolicited business
numbers. Numbers appear only when the person asked for them or when a decision
requires the exact count.

### 2. New

New accepts an intent in the selected business without a category picker or a
blank detached chat. The first response is a Shape. It never starts a build.

The Shape classifies the intended result as an Answer, Change, Capability, or
Responsibility. It says what each proposed part touches. The person can strike
out a part before continuing.

### 3. Search

Search finds only Businesses, Records, Capabilities, Changes,
Responsibilities, Connections, and Work that the actor may access. It does not
use result counts, names, snippets, or filters to reveal another tenant. A
result reopens the exact object and business context.

### 4. Work and Shape

Shape describes the workflow before Strelva starts work. A concrete example is:

- Form on the website.
- Catering request record.
- Rule sends the request to Maria.
- Follow-up runs if nobody replies.

The screen names the input, durable record, routing rule, follow-up condition,
connections, sender, responsibility, and evidence that will be recorded. It
shows consequences and unresolved choices before the primary action.

The primary action is **Go**. It appears before work begins. It authorizes only
the displayed draft scope. A material shape change requires another explicit
Go. Copy such as “we will get started” cannot substitute for the recorded
authorization.

After Go, Work keeps the intent, Shape, plan, preview, Change receipt, and
status in one durable thread. Direct edits and written instructions contribute
to the same Work. Running commentary stays brief and links to receipts. It does
not expose model reasoning.

### 5. Change, editable preview, and receipt

The preview is the working artifact, not a chat transcript. It shows the form,
record fields, routing rule, message templates, and follow-up as one editable
composition. The person can inspect and edit each part without leaving the
work.

The preview and receipt share one component model. Before publication it shows
the proposed version and validation state. After publication it shows the
accepted version, evidence, and available inverse. The UI must not reconstruct
the receipt from loose activity strings.

One Change groups all affected items and shows each in its native rendering.
The receipt lists exact counts, before and after, actor, what, why, evidence,
and version. Changes for one Capability are serialized so two live drafts
cannot silently merge.

**Make live** publishes the exact rehearsed version. The confirmation states
the version, business, connected surfaces, routing consequence, sender, and
responsibility boundary. A stale or changed draft cannot be published using an
older rehearsal.

For the first slice, an example receipt is “7 pages, 1 routing rule, and 2
email templates,” with a before and after view of the native form. Counts come
from the accepted version and write results.

Undo creates and applies a recorded inverse when supported. It restores the
previous capability version and stops future handling under the undone version.
It never deletes inquiries or leads received after publication. Those records
remain visible with the version and rule that handled them.

### 6. Capability

The Capability screen is the stable record for one inquiry workflow. It owns:

- business and capability identity;
- supported inquiry type and input schema;
- current draft and published version;
- routing and follow-up rules;
- connected provider scopes;
- responsibility policy;
- publication, pause, and verification state;
- links to inquiries, rehearsals, receipts, and causal evidence.

Rules are data with stable identity and versioning. They are not buried in
prompt text. A published capability is immutable in place. Editing creates a
new draft version.

### 7. Record and Inspector

Every Record has a factual timeline in the Inspector. Each entry
records actor, action, target, time, reason, evidence, outcome, and related
version or receipt. It distinguishes proposed, authorized, attempted,
provider-accepted, verified, failed, paused, and undone.

Bulk actions may select records, but selection never widens authority. The
confirmation names every target and consequence. Execution is isolated per
record and returns an honest result for each one. One failure cannot make the
others appear successful.

### 8. Rehearsal

Rehearsal runs a saved draft in an isolated environment with synthetic inputs
and blocked external writes. It saves its fixtures, draft version, checks,
results, and timestamps. It can be rerun later against the same version.

“Passed 8 of 8” is allowed only when eight recorded checks or repeated scenario
runs actually ran and passed. The count must be derived from stored results. A
changed draft invalidates the old rehearsal for publication, while preserving
it as history.

The first capability checks at least input validation, record creation,
routing selection, recipient eligibility, sender disclosure, template render,
follow-up scheduling, and external-write blocking.

### 9. Why

Why answers a causal question from recorded evidence. It does not generate a
plausible story. For example:

```text
Thursday request received
  -> inquiry record created
  -> notification bounced
  -> follow-up blocked by the bounce
```

The failed step is highlighted. The screen links to supporting events and
offers a bounded fix, such as changing the recipient or repairing a connection.
If evidence is missing, it says what cannot be determined.

### 10. Responsibility

A Responsibility records:

- the capability and business in scope;
- what Strelva may do;
- what Strelva must never do;
- what always requires a person;
- daily budget or volume limits;
- who receives escalations;
- approved voice and hours;
- trust level: supervised or trusted;
- the clean record that supported any promotion.

Supervised is the default for consequential behavior. Promotion requires an
explicit actor and a clean, inspectable operating record. A promotion cannot
erase earlier limits or provider requirements. Pause takes effect before new
automated work is claimed.

### 11. Connection

Connections covers Google, email, calendar, Stripe, and MLS when the capability
needs them. Each connection shows granted scopes, purpose, business, status,
last checked time, and Disconnect.

Connection requires explicit consent for named scopes and purpose. A connected
label does not prove write scope, provider acceptance, or a healthy credential.
Disconnect revokes future use by the capability and preserves historical
receipts. Secrets stay behind the existing encryption boundary and never appear
in receipts, logs, fixtures, or UI payloads.

### 12. Business model onboarding

Onboarding starts from the business website. Strelva proposes facts inline and
the person corrects them in place. Example facts include “brokerage in Buffalo,”
“three agents,” “open weekdays,” and “uses MLS.” Each statement has provenance
or is clearly marked as an unverified suggestion.

The person confirms only the facts needed for the first capability. A website
scan cannot silently grant connection scopes, infer legal authority, select a
sender, or enable publication.

### 13. Agency Attention

Attention is a cross-client list for an agency. It shows only assigned clients
and only items that need agency judgment. The agency handles one consequential
item at a time. A cross-client count or selection does not grant cross-client
authority.

Client ownership, agency assignment, payer, reviewer, and service
responsibility remain separate. An agency cannot approve for a client unless a
specific grant allows the exact action.

### 14. Agency Patterns

Patterns lets an agency reuse a proven capability shape, such as seller intake.
Applying a pattern creates a new client-scoped draft. The agency adapts brand,
staff, sender, connections, rules, and responsibility, then rehearses that exact
version. A pattern cannot copy credentials, inquiry data, approvals, or tenant
authority.

## Frame utilities

Account shows the signed-in person, memberships, role, and preferences without
mixing them with business facts. Recent work is a resumable index of searches,
draft capabilities, rehearsals, receipts, and investigations the actor may
access. It is not a second activity ledger.

Links return to the exact business and record. Missing or revoked access has an
explicit state and does not leak names, counts, receipt content, or provider
status from another business.

## Record and rule contract

The implementation may preserve legacy storage names behind adapters, but the
product contract must represent these concepts:

| Record | Required facts |
| --- | --- |
| Business | stable identity, tenant boundary, people and access |
| Record | stable identity, business, type, fields, links, capability version, timeline |
| Capability | stable identity, business, kind, draft version, published version, state |
| Capability version | immutable shape, form schema, routing rules, templates, follow-up rules, responsibility reference |
| Inquiry | stable identity, business, capability version, source, submitted facts, handling state |
| Rule | stable identity, version, condition, consequence, order, enabled state |
| Change | business, work, exact affected versions, preview, authorization, state, inverse |
| Rehearsal | business, capability version, fixtures, named checks, result, isolation proof |
| Publication | actor, exact version, authorization, accepted writes, verification state |
| Receipt | actor, what, why, target, version, evidence, outcome, inverse availability |
| Responsibility | allowed, forbidden, asks-first, limits, escalation, voice, hours, trust |
| Connection grant | business, provider, scopes, purpose, consent actor and time, health |

Every action receipt answers **who, what, why, and what proves it**. Receipt
payloads use structured references to records and evidence. Display text is a
projection of those facts.

Rules must use a fixed set of tested components for input, conditions, routing,
notifications, follow-up, and escalation. The first slice does not allow
arbitrary code, hidden prompt-only rules, or custom components that bypass the
same validation and receipt path.

## Authority and failure semantics

- Tenant access is resolved from authenticated membership or trusted routing
  before any record read or write. Service-role access never substitutes for
  the application check.
- Go, Make live, Undo, bulk actions, trust promotion, connection consent, and
  consequential rule changes record the exact actor, target, version, and
  consequence.
- Non-idempotent provider acceptance closes the retryable write. Failed
  read-back adds verification-failure evidence and cannot reopen the write.
- Notification delivery is separate from provider acceptance and verification.
  Suppressed, bounced, deferred, and delivered are different outcomes.
- Follow-up scheduling checks the current inquiry state, current capability
  version, pause state, responsibility, recipient eligibility, and delivery
  evidence before acting.
- Incoming inquiry records are append-only business evidence. Redaction and
  retention follow explicit policy. Undo, pause, or capability deletion cannot
  erase them as a side effect.
- Strelva identifies itself as the sender when Strelva sends a message on behalf
  of a business. The exact disclosure may vary by channel and approved brand
  voice, but it must not misrepresent a human author. This is a product trust
  policy. This specification makes no universal legal claim about disclosure.

## First end-to-end acceptance journey

1. Start from New and select an accessible business.
2. Confirm the minimum inline facts from its website.
3. Shape one native website inquiry form, durable record, routing rule, and
   no-reply follow-up.
4. Record Go for the exact draft.
5. Edit the unified preview.
6. Rehearse the saved version against named synthetic checks with external
   writes blocked.
7. Make live only when the current version has a passing rehearsal.
8. Submit a realistic inquiry through the rendered form.
9. Prove the record, route, notification result, and follow-up decision in the
   Inspector and receipt.
10. Use Why to explain a forced bounce or blocked follow-up from stored events.
11. Undo the publication and prove the received inquiry remains intact.

Brokerage buyer and seller, service quote, and service booking variants must
use the same fixed components and lifecycle. They may change fields, copy,
recipients, hours, and rules without introducing a second engine.

## Release boundary

Local fixtures and preview routes are design and execution evidence only. They
do not prove production auth, storage, email, provider access, DNS, client-site
integration, or adoption. No production migration, deploy, live send, Google
write, Stripe mutation, MLS enrollment, or environment change is part of this
implementation without separate explicit authority.

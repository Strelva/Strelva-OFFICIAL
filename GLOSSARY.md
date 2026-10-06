# Strelva glossary

Terms the workspace code, docs and UI copy use for businesses, the Systems they
run, the people who work on them, and the work and records underneath.

This file adds to two existing authorities and never overrides them:

- [Product ontology](./docs/architecture/product-ontology.md) (normative):
  Tenant, Site Property, Actor, Platform Membership, Customer Inquiry, Record,
  Capability, Capability Version, Agent Capability, Change, Work,
  Responsibility, Rehearsal, Receipt, Draft, Version, and more.
- [CONTEXT.md](./CONTEXT.md) "Language": Business, Offering, Installation,
  Assignment, Work, Provider commitment, Contribution reward.

Design notes behind the newer entries live in
[docs/architecture/deepening-2026-10-05/](./docs/architecture/deepening-2026-10-05/).
Terms marked _(ADR 0011, proposed)_ follow company ADR 0011, which is not yet
accepted.

## Businesses and what they run

**Workspace kind**:
Whose workspace it is: one person's own (personal), an agency's, or a
business's.
_Avoid_: client workspace, tenant, account, customer workspace

**Business workspace**:
The workspace of one business. Its records stay separate from every other
business.
_Avoid_: customer workspace, client, tenant, site

**System** _(ADR 0011, proposed)_:
A thing a business has made in Strelva and keeps using, such as its website,
a schedule or a private application. It keeps its identity while its content
and behaviour change.
_Avoid_: product, project, installation, app (as the general noun)

**System kind**:
A type of System that Strelva knows how to make and run, such as a website, a
schedule or a document. A System has exactly one kind for its whole life.
_Avoid_: product, executable, horizontal, native product, tool
Overlaps the ontology's Capability; see the open questions below.

**Entrance**:
The way an Agent Capability gets started: from a reviewed work plan, from ongoing
delegated work, on a schedule, or by a person acting directly.
_Avoid_: trigger, channel, surface, source

## People and permission

**Membership**:
A person's direct place in a workspace, which always carries a workspace role.
_Avoid_: access, seat, join

**Workspace role**:
The rank a member holds in a workspace: owner, admin or member.
_Avoid_: viewer, editor (legacy tenant roles), seat, permission level

**Workspace permission**:
One named thing a workspace role allows across the whole workspace, such as
creating work or managing the calendar connection. It lasts as long as the
membership and has no budget or expiry.
_Avoid_: capability, ability, authority, standing, allowance, scope, flag

**Delegated read**:
Read-only sight of a business workspace that the business grants to an
agency. It carries no role and lets nobody operate anything.
_Avoid_: shared access, agency access, read access, Assignment

**Work access**:
How the viewer relates to one piece of work: owned (in their personal
workspace), member, delegated read, addressed (an incoming handoff), or
public.
_Avoid_: access (without the qualifier), ownership, sharing

**Tenant membership**:
A person's place on a legacy managed-website tenant, ranked viewer, editor,
admin or owner. It is separate from workspace membership, even for the same
business.
_Avoid_: workspace membership, business membership

**Strelva staff**:
A person at Strelva who can open any tenant. In a workspace they hold nothing
special and act only through membership or an Assignment.
_Avoid_: super admin (in workspace contexts), god mode, operator override

**Verified actor**:
A signed-in person whose email address is confirmed. Only a verified actor can
read or change workspace work.
_Avoid_: user, session user, current user

## Workspace state

**Workspace release**:
The switch that decides whether workspace Systems exist in an environment at
all. When it is closed, no workspace work is offered or accepted.
_Avoid_: feature flag, beta, rollout

**Stopped workspace**:
A workspace whose exit has completed. Its records stay readable and nothing
new starts in it.
_Avoid_: exited workspace, closed, deleted, archived, frozen

**Unconfirmed exit**:
The state where Strelva could not check whether a workspace has stopped, so
changes pause until it can.
_Avoid_: unknown, error state, stopped

**Read-only reason**:
The single most important reason a person cannot change the open workspace:
delegated read, stopped, unconfirmed exit, or role.
_Avoid_: disabled reason, lock, error

**Workspace write**:
A request that changes workspace work. It must come directly from Strelva,
never from another site acting with the person's sign-in.
_Avoid_: mutation, POST

## Work and records

**Workspace record**:
One thing a System kind keeps on behalf of a workspace, such as a website
draft, a schedule, a document or an onboarding case. It belongs to exactly one
workspace and one record kind, and changes one revision at a time.
_Avoid_: saved work, product work, bounded work, saved product work, resource, item

**Record kind**:
What a workspace record is: the System kind that owns it plus the kind of
thing within it, such as "tracker / tracker" or "onboarding / case".
_Avoid_: resource kind, product id (alone), type

**Owning kind**:
The one System kind allowed to create and change records of a given record
kind. Other kinds may read those records but never change them.
_Avoid_: owning product, writer, source product

**Companion state**:
State a System kind keeps beside its workspace records under its own rules,
such as application releases, custom-application grants and budgets.
_Avoid_: side table, durable state, sidecar

**Revision**:
The count of accepted changes to one workspace record. A change names the
revision it started from.
_Avoid_: Version (a restorable state, see the ontology), CAS, sequence

**Revision conflict**:
The refusal of a change because another change was accepted after the one it
started from. The person reloads and tries again; nothing is merged.
_Avoid_: stale write, race, concurrent edit error

**Revision entry**:
The append-only note of who made a revision, what kind of change it was, and
when.
_Avoid_: history row, audit entry, change log

## Starting work

**Start request**:
The words a person writes to say what they want Strelva to make happen,
before any work exists. It is request data only and never permission to run,
share or publish anything.
_Avoid_: pending request, intent, prompt, continuation, start context, draft (Draft is unpublished state)

**Start route**:
A destination a start request can be aimed at, such as a document, a work
plan, onboarding or Help.
_Avoid_: route (alone), view, product id

**Routed request**:
A start request the person has aimed at one start route, waiting for that
System kind to open new work with it.
_Avoid_: continuation, start context, horizontal request, plan start request

**Spent request**:
A routed request whose System kind has saved work from it. From then on the
work carries the words and the start request is gone.
_Avoid_: consumed intent, used draft

**Cleared request**:
A start request the person explicitly emptied. It stays empty and never comes
back from an older copy.
_Avoid_: reset, discarded draft

**Service request**:
A start request sent to a human provider through Help. It is not an accepted
job until scope and deadline are agreed.
_Avoid_: job, ticket, provider commitment (until accepted)

## Finding your way

**Workspace location**:
Where a person is inside one workspace: the workspace, the section or opened
work, and any detail within it. It is a navigation hint; it never grants
access.
_Avoid_: view, route, page, state, URL

**Section**:
One of the fixed destinations every workspace has: Home, Work, Ongoing, People
& access, Settings, Help, Explore, and Start.
_Avoid_: view, tab, page, area

**Opened work**:
A single piece of work shown in the tool that fits its kind, or new work being
made in that tool.
_Avoid_: selected work, horizontal view, product view

**Location detail**:
The part of a workspace location that only makes sense inside one section or
opened work, such as a standing, an assignment, an inquiry record, a tracker
row or an offering.
_Avoid_: embedded route params, sub-view, sub-route

**Return target**:
A workspace location that is safe to carry through sign-in and reopen
afterwards. Anything that cannot be read back exactly is refused, not
repaired.
_Avoid_: next, redirect, continue URL

## Inquiries

**Inquiry**:
One customer's request to a business, received through a published inquiry
form or booking page, together with its handling status and assignee.
_Avoid_: lead (the storage record), submission (the delivery payload), record
The ontology's Customer Inquiry; "inquiry" is the short form.

**Lead**:
The stored copy of the customer's own words and contact details. It is the
authority for customer fields and never holds handling decisions.
_Avoid_: inquiry, contact, CRM record

**Inquiry intake**:
A business's Capability of the inquiry kind: its form, routing, follow-up and
Responsibility. Its identity survives every new Capability Version.
_Avoid_: offering, installation, form (alone)

**Live intent**:
The owner meant this Capability Version of an inquiry intake to be on the website,
whether or not the read-back has confirmed it yet.
_Avoid_: live (alone), verified, published

**Current inquiry**:
An inquiry that is still open, whose inquiry intake has live intent, and whose
captured Capability Version is the live one. Only a current inquiry can receive
governed messages.
_Avoid_: fresh, valid, active

**Inquiry workspace**:
The versioned store of one business's inquiry intakes, Capability Versions,
Receipts and record changes. It is not the business workspace and holds no customer
fields.
_Avoid_: workspace (alone), snapshot, state

**Record change**:
A published, undoable change to an inquiry's status or assignee. It is the
authority for handling decisions.
_Avoid_: overlay, bulk update, patch

**Intake outcome**:
The single answer a visitor-facing entry point gets for one submission:
accepted, duplicate, pending, stopped, changed, missing, invalid, or
unavailable.
_Avoid_: capture result, evidence status

## Inquiry messages

**Inquiry message**:
One email Strelva sends about one inquiry for one purpose. There is at most
one per inquiry and purpose.
_Avoid_: delivery, notification, action, send

**Message purpose**:
Why an inquiry message exists: reply to the customer, follow-up to the
customer, or staff notice.
_Avoid_: action, owner notification (it goes to staff, not the owner)

**Message review**:
The exact rendered inquiry message, held for the responsibility sponsor's
approval.
_Avoid_: approval event, change request, draft

**Approval**:
The sponsor's explicit yes to one message review. A standing approval is a
responsibility rule that allows a purpose without a review.
_Avoid_: authorization, resolve, pre-authorization

**Send attempt**:
One claimed try to hand an inquiry message to the email provider.
_Avoid_: delivery, execution, claim, retry

**Accepted**:
The provider took the message and gave it an id. From then on the message
counts as sent, and Strelva never offers another attempt.
_Avoid_: delivered, success, sent, verified

**Rejected**:
The message was refused before the provider took it. Only a rejected message
can have another attempt.
_Avoid_: failed, bounced, suppressed

**Unknown outcome**:
An attempt may have reached the provider, but Strelva never heard back. It is
treated as possibly accepted.
_Avoid_: failed, timeout, error

**Unconfirmed**:
Accepted, but no provider report has arrived and read-back has not confirmed
anything yet.
_Avoid_: accepted_unverified, pending verification

**Provider report**:
Later evidence about an accepted message, from a webhook or a read-back:
delivered (the recipient's server took it), deferred (delayed, provider still
trying), bounced (refused for good), suppressed (the provider would not send
to that address), failed or complained. Every report leaves the message
accepted.
_Avoid_: outcome, verification, webhook status

**Reconciliation**:
A person or job checks what happened to an unknown outcome or a stuck
receipt, then records the finding. It never sends.
_Avoid_: retry, recovery, repair

**Message receipt**:
The durable record in the business workspace that Strelva sent this exact
message on this approval.
_Avoid_: delivery receipt, responsibility receipt, provider receipt

## Open naming questions

- **Capability vs System kind.** The ontology's Capability is "a reusable,
  governed ability to create, inspect, or operate a kind of business work".
  ADR 0011 (proposed) calls the things a business runs Systems. Until ADR 0011
  is accepted, code keeps Capability, and System and System kind stay proposed.
- **Work.** The ontology defines Work as "the durable thread from a person's
  intent to an answer"; CONTEXT.md defines it as "a finite request, action or
  result". Both predate this glossary.
- **Assignment vs Responsibility.** CONTEXT.md's Assignment and the ontology's
  Responsibility both describe explicit, limited permission to operate work.
- **Application records.** Rows inside a custom application are called
  application records in code; they are not workspace records.

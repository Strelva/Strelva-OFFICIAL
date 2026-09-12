# strelvav2 horizontal acceptance

Updated: 2026-09-11. Jacob requested the full horizontal vision, running locally,
with tested customer journeys and production kept off. This expands the earlier
[first slice](./horizontal-first-scope-2026-09-11.md); it does not discard its
permissions, storage, compatibility, or proof requirements.

## Product promise

A person brings a business goal and the context they have. Strelva helps them
choose a useful starting point, proposes what it will create or change, rehearses
the result, and operates approved work within explicit limits. The same work can
move between self-service, Strelva assistance, and an outside agency. Customers
retain their records, decisions, and history.

The foundation works across industries. Internal R&D develops industry knowledge
and proves offerings against customer outcomes, human effort, and cost. A working
demonstration is not proof of saved money or a supported offering.

## Completion contract

The [definition of done](./strelvav2-definition-of-done.md) now specifies the
proposed horizontal screen gate, local product gate, and internal product
learning loop. This ledger remains the current implementation inventory for
the twenty customer-product requirements; its R&D row does not stand in for the
ten new learning requirements.

## What 95% must mean

Earlier estimates of 40%, 55%, 64%, 85%, 95%, and 100% used different scopes or
unverified screen classifications and are not an audited completion measure.
Do not reuse them as measured progress. A directory with fourteen inquiry links
does not establish fourteen accepted horizontal screens.

The 95% target requires all core journeys below to work through authenticated
local adapters, with durable state and failure recovery. The remaining work may
be minor polish or separately authorized rollout. Missing execution, permissions,
data durability, cost enforcement, or whole capability classes cannot be counted
as the last 5%. Count demonstrated behavior, not routes, screens, code volume, or
unit-test totals. Hosted operation and customer value require separate evidence.

## Acceptance ledger

| Area | Required behavior | Current implementation and remaining work |
| --- | --- | --- |
| Starting | Useful examples and permitted context help people begin without knowing product names; a request produces an editable proposal before work starts | Outcome entry, examples, scope selection, original request retention, and an explicit planning path implemented; manual review pending |
| Planning | Plans name supported operations, dependencies, missing inputs, limits, costs, and decisions; unsupported requests cannot masquerade as executable work | Bounded model-backed plans, selected sources, reviewed private document/tracker outputs and saved receipts implemented; other operations remain descriptive, estimates unknown, real model calls unverified |
| Shared work | Requests, plans, results, decisions, receipts and costs reopen at stable links in one workspace | Inquiry, tracker, documents, plans, assessments and experiment results integrated locally; common job state partial |
| Business home | Needs you, delegated jobs, changes, and live capabilities appear in order, with useful empty and error states | Inquiry business home implemented; cross-capability business view partial |
| Records | Lists and detail views support editing, history, filtering, adding records and scoped bulk changes | Tracker and inquiry records, task/project/inventory starts, record creation and grouped edits implemented; broader record relationships missing |
| Changes | Preview before applying; one grouped receipt and Undo; later records survive; conflicting edits are protected | Inquiry implemented; tracker grouped changes added in this expansion |
| Interfaces | Forms, lists, detail views, documents, and pages use approved components and meaningful editable results | Forms, lists, details, private documents and website previews implemented; general app creation missing |
| Rehearsal | Stored tests rerun after relevant changes; pretend inputs and provider inboxes are visibly separate from real operation | Stored inquiry rehearsals implemented; cross-capability rehearsal partial |
| Ongoing work | Explicit owner, worker, approver and next step; durable wait, resume, retry, pause and cancellation | Inquiry delivery and assessment recovery implemented; common execution missing |
| Autonomy | Approved rules govern spending, publishing, messaging, deletion and access; revocation takes effect before a new action | Strong product-specific gates; broader standing jobs and sponsored agents missing |
| Collaboration | Customers and agencies share scoped work, request review, contribute safely and revoke access | Assessment/tracker handoff and read delegation implemented; write contributions and general review missing |
| Agency operations | Cross-client attention, client-specific access, reusable installations and clear maintenance ownership | Inquiry attention and versioned pattern installations implemented; broader maintenance agreements and contribution workflows missing |
| Reuse | Install definitions without data/secrets/grants, pin versions, review updates, preserve local changes, rehearse and undo | Inquiry pattern updates, explicit conflict review, durable pending updates and rehearsal/publish integration implemented; manual review pending |
| Connections | Each connection states permitted reads/writes, consent, freshness, failure and disconnect behavior | Existing tenant providers; universal connection and task-scoped access model missing |
| Context | Sourced facts, corrections, preferences and procedures are inspectable; learned preferences cannot grant authority | Business onboarding facts, private procedures and selected versioned planning sources implemented; learned preferences and general memory missing |
| Economics | One explicit payer, estimate acceptance, enforced reservations, attributable usage, unknown costs, and no customer charge for Strelva-caused retries | Local budget acceptance, reservations, cost reports and separate Strelva retry accounting implemented; provider enforcement and general job billing are not wired |
| R&D | Same-workload candidate comparisons, versioned evidence, support-inclusive effort/cost, explicit qualification decision | Baseline/candidate comparisons implemented with support, maintenance, unknown cost and evidence provenance; customer outcome evidence remains to be collected |
| Agent participation | Bounded agent identity, delegated scope, budget, task status, cancellation and attributable receipts | Existing tenant agent only; general and third-party participation missing |
| Custom applications | Bounded generation, sandbox execution, test evidence, dependency management, deployment ownership and recovery | Not implemented as a horizontal offering |
| Large organizations | Organization policy, identity lifecycle, access review, audit/export, retention and operational requirements | Organization/resource foundations present; enterprise acceptance not established |

## Verification and authority

Implementation above is not end-to-end acceptance. The new planning path has
not been exercised against a paid model, and the full horizontal product is not
95% complete. General autonomous execution, third-party agents, custom application
generation, cross-capability rehearsal, and enterprise acceptance remain material
work.

Jacob's latest direction is implementation first, with behavior-first TDD at
the public command boundary and a small set of critical failure checks. Jacob
will perform end-to-end behavior review. Do not expand automated browser suites
or repeat broad checks to substitute for completing the product. Record this
manual review as pending until it happens.

Every completed entry must cite its implementation and successful user journey,
including the relevant denial, stale edit, retry, cancellation, and unavailable
state. Keep local simulation, real local Auth/database adapters, hosted staging,
real provider operation, and customer results distinct.

Use [the release checklist](./horizontal-release-checklist-2026-09-11.md) for
activation. No production deployment, migration, live message, paid provider
experiment, billing change, or third-party grant follows from this ledger.

The current branch remains `strelvav2`. Public branding and frozen compatibility
names remain as documented in [the internal release entry](./strelvav2.md).

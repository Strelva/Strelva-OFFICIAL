# 01 — Release intent and scope

Status: selected direction translated into a proposed implementation baseline. Version, launch composition, visual layout and new commercial terms remain open decisions.

## Intended result

`REL-01` A person can enter Strelva, use an available capability, find a saved result or authorized resource, understand the business it concerns, and continue useful work without moving between relationship-specific applications. An Enterprise agency can find an assigned customer and inspect that customer's authorized assessments, websites and Home Finder installations in the same environment. A customer can understand what belongs to them and what access an agency retains.

`REL-02` Functional consolidation must reduce the rules callers and users need to coordinate. Assessment owns result preparation and recovery. Website owns coherent site operations. Access owns explicit grants and acceptance. Customers owns an authorized relationship/resource projection. Home Finder owns its native search and inquiry behavior. A common header, fewer tabs, a universal chat box, or a large component containing every branch does not satisfy this requirement.

`REL-03` The interface distinguishes the person, selected organization, customer, resource owner, payer, permitted action, and accepted service. They may coincide; the implementation must not assume they do. “Enterprise” includes agency relationships in this release direction, but is not a blanket grant or entitlement.

## Proposed release baseline

| Area | Existing local evidence | Required release result | Scope status |
| --- | --- | --- | --- |
| Shared interface | `StrelvaShell`, `AppFrame`, workspace and managed frames | Consistent entry, identity, context, return, errors and mobile navigation | Existing, consolidate |
| Assessment | AI Visibility and canonical Website Audit; public results and private copies | Shared entry/result operations with explicit method, provenance, support and recovery | Existing, deepen |
| Saved results and Access | Workspaces, AI Visibility handoff, addressed acceptance and `work:read` delegation | Explicit supported actions; owner/copy/delegation clarity; destination continuity | Existing, deepen |
| Managed Websites | Structured controls, conversation, governance, approvals, performance and history | One coherent Website composition, preserving specialized controls and tenant permission | Existing, deepen |
| Enterprise Customers | No generalized customer portfolio boundary | Organization-scoped customer and resource list/detail; assigned-only views; bounded access summary | New, proposed minimum |
| Home Finder management | Separate IDX runtime with installation configuration and internal receipts | Authorized installation overview, synthetic preview, readiness and safe delivery evidence | New integration, proposed minimum |
| Operator | Existing CRM, accounts, portfolio and operational consoles | Customer/installation context for setup and exceptions; authoritative joins and missing-evidence states | Existing plus narrow additions |
| Service and account | Personal identity, tenant service/billing, operator account facts | Show only actual accessible agreements, payer and support; unknown states where no record exists | Existing projection; no new checkout |
| Marketing/public | Separate public repository; diagnostic entry redirects | Accurate capabilities and availability, preserved links, product continuity and honest Home Finder preparation | Review and targeted change proposed |
| Release operations | Workspace migrations and release gate; incomplete final acceptance | Reproducible checks, security closure, real-session acceptance, compatible migration, monitored rollout | Blocked until evidence |

`REL-04` The Enterprise minimum is a useful read capability, not a mock management console. It requires real authorization and installation mappings, safely projected real records where available, and explicit synthetic preview where no live installation exists. Empty Customers explains how a relationship is established; it must not manufacture a customer from an assessment's business name. No full team administration, assignment mutation UI, automated provisioning, Enterprise checkout, installation configuration write, or generalized agency Website write is required by this baseline.

`REL-05` Existing managed clients retain their actual service, routes, membership and billing behavior. Preserve the `gldf` and `rohlax` subscription-enforcement exceptions and the historical `/pay/rohlax` agreement. Interface adoption must not silently migrate agreements, switch payer, enroll a subscription, or require customers to recreate their account.

`REL-06` Separate three outcomes: (1) the specification is reviewable; (2) code is locally and in preview verified; (3) a selected release is authorized and proven in production. This document achieves neither code acceptance nor production acceptance. The shared version is currently `0.1.1`; the next version is unselected. Follow [VERSIONING.md](../../VERSIONING.md) when a version is chosen; IDX's version is independent.

## Capabilities explicitly outside this baseline

`REL-07` Do not add a universal Work execution runtime, arbitrary task acceptance, company-wide capability promises, a CRM for agency buyer data, lead scoring, automated buyer follow-up, a page builder, drag-and-drop/code editor, client checkout, a new scoring engine, or independent scan/history authority. Domain-specific product runtimes remain separate.

Website Audit handoff is deferred unless explicitly added through `DEC-08`. General agency Website management requires tenant permissions for each operation and a separately reviewed grant/approval model. Team invite/remove/assignment controls and installation transfer are deferred mutations even though their read states are specified. Paid usage, free allowances, usage accounts, and support terms require commercial decisions and authoritative stores before presentation as purchasable products. Performance and operator consolidation may deepen read models, but wholesale route removal is not a release condition.

`REL-08` Home Finder preparation can ship with a clearly identified synthetic preview and readiness requirements. Live search, inquiry delivery and “Live” management status remain blocked until product-specific authority and operating evidence are present. The prior agency-first pilot terms remain a historical offer definition, not an accepted Enterprise contract or a selected direct brokerage sales policy.

## Release success and falsification

`REL-09` Evaluate the following tasks against the current interface and the candidate. Record completion, wrong-context attempts, repeated context entry, navigation reversals, and whether the person correctly explains result/ownership/status. Use comparable tasks and real participating users when making usability claims; synthetic fixtures only prove behavior and presentation. A numerical adoption or conversion target is not selected.

1. A visitor runs only the diagnostic they intend, understands an incomplete result, then saves and reopens it after sign-in.
2. A managed owner changes supported text and an image, understands the exact proposal, and finds the resulting publication/verification evidence.
3. An agency member opens the intended customer, distinguishes allowed from unavailable resources, and inspects an installation without seeing buyer content.
4. A customer accepts an assessment copy without agency access. In a separate acceptance with access enabled, the customer understands the read grant and revokes it without losing the result. An independent later-grant flow is not currently implemented.
5. An operator finds the correct installation's missing proof and sees who must act without confusing provider acceptance with delivery.

Reject a composition if hiding controls makes these tasks harder, if a combined assessment silently adds cost, if an agency can infer unassigned customer data, if stale evidence looks live, or if a support/activation request looks accepted before it is. Retain a specialist page when it materially improves precise work. Exact navigation and layout are `DEC-01`, not prerequisites for writing correct module contracts.

## Repository boundaries

`REL-10` REB owns the common customer frame, workspace records, managed Website operations and operator presentation. The sibling marketing repository owns company claims and public acquisition. Each client repository owns client-specific presentation and behavior. `custom-repo-starter/` receives repeated client behavior before propagation. `strelva-idx-ops` owns installation validation, IDX display, signed listings, inquiry workflow, retention and receipts. Do not copy any of these authorities into the common interface to make the release appear integrated.

See [People and authority](./02-people-and-authority.md), [Deep modules](./03-deep-modules.md), and [acceptance/decisions](./07-delivery-and-decisions.md) for the concrete contracts and unresolved choices.

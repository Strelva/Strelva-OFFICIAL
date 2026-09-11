# Functional consolidation review

Subsequent scope: see the [Enterprise/customer interface specification](./enterprise-customer-interface-spec.md)
for Jacob's agency-as-Enterprise direction, Home Finder integration boundaries,
and the clickable interface study prepared after this review.

Status: recommendation for Jacob's review, not an accepted product or architecture decision.

## Finding

Strelva has consolidated presentation further than functionality. The shared frame
is useful, but it still exposes many implementation categories. The opportunity is
to give people fewer concepts to understand while making each concept substantially
more capable. Moving links into menus, putting everything in chat, or assigning
every activity to a generic Work object would not accomplish that by itself.

A deep module owns a coherent responsibility, enforces its rules, and contains its
failure handling behind a small interface. A product module, a software module,
and a navigation destination need not have a one-to-one relationship.

Review basis: current REB source, company context, marketing route inventory, and
local T3 browser inspection of workspace Home, managed website frame, and Account.
Earlier browser inspection in this conversation covered public diagnostics.
Managed preview content is fictional and cannot establish editor or provider
behavior. Operator recommendations are source-based; this is not an authenticated
production audit or an adoption study. No product behavior changed in this review.

## Surface decisions

| Current surfaces or functions | Proposed treatment | What the boundary must preserve |
| --- | --- | --- |
| Home, My work, Explore, Start something | One common entrance and return mechanism; discovery can be contextual. Test whether Home and Explore need separate destinations. | Supported capability remains discoverable; unfamiliar users must not need a perfect prompt. No final navigation selection yet. |
| AI Visibility and Website Audit | One assessment interface with explicit assessment scope and appropriate evidence. Keep direct product links. | Different methods, costs, input requirements, scores, and retention policies remain identifiable. Do not fabricate a combined score or automatically run all checks. |
| Public result, private result, export, save, reopen, recovery | Consistent result controls, backed by product-owned read/save/export/recovery operations. | Public bearer access is not ownership. Saving is an explicit private copy. Recovery depends on the operation's actual effects. |
| Website preview, content, assets/media, collections, brand kit, history | A capable Website module: inspect the site, select the relevant object, edit or request a change, inspect versions. These can remain contextual modes. | Direct structured editing, bulk collection work, and visible publication state. No forced chat or unsupported visual editor. |
| Ask Strelva page, discussion panel, suggested prompts | One website-assistance capability, accessible in context; full conversation view remains available when useful. | Existing tool gates and conversation context. A panel beside an assessment must not imply website write authority. |
| Today, Analytics, Reports, health, milestones, activity proof | A coherent website overview and performance module. Current evidence and dated recaps are views with explicit time semantics. | A historical report must not change when live data changes. Activity proves actions, not causal revenue improvement. Unknown data must not become a healthy status. |
| Google Business, Reviews, connected profiles | Keep domain controls, but consolidate connection state, permissions, and relevant actions in the business context. Reviews deserves a focused view when volume warrants it. | Listing edits and replies have different approval and provider rules. Google remains an understandable destination where it matters. |
| Needs you, drafts, approval detail, history | One governed-change capability used by contextual detail and aggregate queues. | Proposed, authorized, provider-accepted, verified, failed, and recoverable are different facts. Aggregation never grants permission. |
| Agency workspace, handoff, sharing, read-only view | Shared Access controls on the relevant assessment or workspace. Agency is a relationship/context, not another application. | Handing over a copy differs from granting read access. Existing delegation does not authorize website management. |
| Account, website settings Account, ownership, invitations | Personal identity belongs to Account; resource access belongs beside the resource. Provide consistent access controls across them. | Identity, workspace ownership, website membership, and payer are distinct. A common interface cannot merge those records casually. |
| Business settings, branding, domains, integrations, plan | Place configuration with its object: website appearance, domain/connection health, people, and accepted service. | Avoid a single settings drawer containing unrelated authority. Provider scopes, domain ownership, and subscription status stay explicit. |
| Help, service inquiry, capability request | One human-contact surface with context attached. | Current implementation opens email or copies text; it does not submit a tracked request. An automated-assistance interface must distinguish escalation to a person. |
| Operator Clients, Accounts, client detail | A customer-centered view that contains sites, contacts, payer, service, and access, with portfolio filters. | Existing accounts can group multiple sites. Tenant identity is not customer identity, and workspace identity is not automatically either. |
| Operator Leads, Onboard, Pay links | Contextual acquisition and service actions on a prospect/customer, with bulk queues where useful. | A prospect need not have a tenant. Payment collection is not subscription activation or acceptance of scope. |
| Operator Actions, Drafts, Maintenance | One attention surface with typed items and domain-specific inspectors. | Keep distinct execution paths and per-item failure evidence. A common list must not imply identical bulk approval semantics. |
| Operator Ops, Uptime, Audit | One system overview with resource-specific health and investigation detail; retain searchable audit history. | Operational freshness, failures, and immutable evidence are different views, not one mutable health badge. |
| Marketing product, service, pricing, proof and acquisition pages | Explain concrete capabilities and service promises, then open the relevant product with context retained. | Discovery and public proof remain useful outside the application. Do not force all marketing into the signed-in shell or invent a general capability promise. |
| Client public sites, store, booking, member experiences | Keep customer-specific interfaces and domain modules in their own repositories. | Condensing Strelva controls must not homogenize client sites or move checkout/booking responsibility into the control plane. |
| Home Finder, experiments, browser tools | Keep independent candidates explicit until they demonstrate a shared responsibility worth extracting. | Visual similarity is insufficient evidence for a universal product engine or shared database. |
| Sign-in, callback, no-access, delivery and payment links | Compact entry and recovery surfaces that retain their destination and object. | Authentication, acceptance, payment, and delivery remain explicit actions. These are not new top-level products. |

## Most valuable module boundaries

### 1. Assessment

Public interface: choose a business or URL and supported scope; inspect findings,
sources, limitations, and date; save or export the result.

Contains input normalization, relevant checks, provider calls, budget enforcement,
typed findings, provenance, and result retention. Website health and AI visibility
can share this presentation without merging their scoring engines or commercial
identities. The existing canonical scanner remains authoritative.

Success test: a person can assess a website without first understanding two product
implementations, while still being able to request only the assessment they need.
Reject consolidation if it makes checks slower, more expensive, or less explainable
without a corresponding benefit.

### 2. Website

Public interface: inspect the website, change a supported part, see the proposal
and publication state, and inspect or restore an available version.

Contains content schemas, media, collection structure, capability manifests,
preview, governed publishing, revalidation, verification, and history. Appearance
and content controls become relevant to the selected object. Collections with many
items still need dedicated list/table controls; depth does not mean hiding them.

Success test: changing a picture and its associated copy does not require learning
separate asset, content, draft, and history systems. The same underlying operation
can serve direct controls and Ask Strelva without two implementations.

### 3. Performance

Public interface: select a website and period; understand its observed condition,
changes, and supporting evidence; open a dated recap when needed.

Contains metric retrieval, time-window rules, source availability, anomalies,
health evidence, and report retrieval. Current and historical evidence must be
explicitly labeled. Consolidating destination pages does not mean combining
unrelated metrics into a score or recomputing previously delivered reports.

Success test: Today, a chart, and a report cannot silently disagree because they
use different periods or fallback semantics. Detailed reporting remains directly
addressable for users who depend on it.

### 4. Access

Public interface: who can see or act on this object; invite, grant, revoke, or hand
over an explicit copy where supported.

Contains identity verification, membership, invitation resolution, delegation,
resource authorization, and recovery. Resource-specific policies remain inside
their domains. Presenting them consistently does not require one universal role
table or transferring tenant data to workspace storage.

Success test: a customer understands what an agency retains after handoff, and
revocation affects only the intended scope. Payer status never implies access.

### 5. Customer operations

Public interface for the operator: find a customer, inspect their sites and agreed
service, see what needs a decision, and take a bounded action.

Contains joined read models for contacts, sites, billing, permissions, and service
evidence. Existing authoritative stores remain in place; missing joins are shown
as unknown rather than inferred. Prospects can exist without provisioned sites.

Success test: understanding one customer's position does not require reconciling
Clients, Accounts, Pay links, and separate configuration pages manually. Portfolio
queues remain available for high-volume work.

## Software depth: what exists and what needs improvement

- `src/lib/scan.ts` and `scan-store.ts` already provide the canonical audit boundary.
  Reuse them; do not implement a second assessment engine to simplify the UI.
- `src/lib/event-actions.ts` already centralizes governed resolution and handles
  provider acceptance separately from retryable execution. Deepen callers around
  that responsibility, preserving caller authorization and domain-specific rules.
- `src/platform/workspaces/operations.ts` contains leases, checkpoints, and atomic
  completion behind `runWorkspaceOperation`. That is useful depth for supported
  assessments. Its low-level `operationRequest` is also exported and used by the
  workspace route; a bounded recovery operation could hide that protocol from the
  route. Do not apply this read-only recovery model to arbitrary external writes.
- `src/products/managed-presence/server.ts` currently projects authorized tenant
  links. It is a careful compatibility adapter, not yet the deep Website module
  suggested by its product folder. A folder boundary alone does not encapsulate
  website behavior.
- `src/app/dashboard/analytics/page.tsx` and `reports/page.tsx` each compose several
  sources. A typed performance read model could own periods, availability, and
  evidence provenance beneath both presentations.
- `src/experience/workspace/WorkspaceApp.tsx` and its layout still know assessment
  types and rendering differences. Keep ownership/navigation common while moving
  domain result handling behind small explicit product contracts. Two real result
  types justify bounded reuse, not a plugin framework for hypothetical products.
- `src/experience/app-frame/StrelvaShell.tsx` is appropriately a presentation module.
  It should not acquire permissions, billing, or product execution to seem deeper.
- `src/lib/email/send.ts` is another useful existing boundary: callers state
  audience and content while delivery policy stays centralized.
- `WorkspaceSidebar.tsx` has no external TSX references in the current search.
  Its older navigation is not evidence of the active product interface. Confirm
  broader references before any cleanup; do not design around dead alternatives.

## Constraints and counterexamples

Fewer destinations is an effect to evaluate, not the target metric. A clear
specialist view can be better than a single overloaded view. Retain direct URLs,
keyboard-efficient controls, detailed evidence, and explicit consequential actions.

Do not invent a universal Business record merely to group identical-looking names:
a public assessment's typed business name does not establish the identity of an
authorized managed tenant. Context association needs evidence and permission.

Do not automatically combine Google reputation, website operations, and diagnostics
into one product mandate. Their interfaces may compose while their responsibilities
remain separate. Likewise, customer billing and operator collection use the same
underlying facts but different authorized actions and information.

## Recommended order and review criteria

1. Test Website consolidation first. It contains the greatest concentration of
   existing capability and the clearest object. Compare the current interface with
   a composition that keeps the website and contextual controls visible together.
2. Test the common assessment interface using both existing diagnostic types.
   Preserve direct entries and compare whether users can understand scope/results.
3. Establish common Access controls without enlarging agency permissions.
4. Consolidate performance read models before merging reporting presentation.
5. Join customer evidence for the operator before collapsing customer navigation.

For each candidate, measure concepts the user must learn, repeated context entry,
ability to find specialized controls, and clarity of outcome/authority. At the
software boundary, check how many internal steps callers must orchestrate and
whether adding a supported operation forces changes throughout routes and UI.

Reject a candidate if it merely replaces visible tabs with hidden menus, moves all
logic into a giant component, requires chat for precise edits, or obscures failure.
Validate with representative direct users, managed clients, and agency collaborators;
current source and fictional previews cannot establish their preferences.

Jacob's decision remains the interface composition and which candidate to implement.
This review recommends functional boundaries, not new product names, a new price,
a universal workflow, or a production rollout. The CI/security/migration blockers
already identified remain separate release requirements.

## Source map

- [Current implementation context](../CONTEXT.md)
- [Interface contract](../DESIGN.md)
- [Workspace layout](../src/experience/workspace/WorkspaceLayout.tsx)
- [Product catalog](../src/platform/products/catalog.ts)
- [Managed navigation](../src/components/dashboard/ManagedNavigation.tsx)
- [Dashboard surface resolver](../src/lib/dashboard-surfaces.ts)
- [Operator navigation](../src/app/admin/AdminRail.tsx)
- [Persistence boundaries](./persistence-boundaries.md)

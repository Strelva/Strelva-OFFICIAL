# Strelva interface and Managed Websites context

Reviewed: 2026-09-17

Component checkpoint reviewed on this date; earlier product evidence retains its
own dates.
Kind: product

Internal release: **strelvav2**. See the [release entry point](./docs/strelvav2.md).
This branch is for internal work and is not approved for production.

## Role

REB owns the Managed Websites control plane and the current local implementation
of the common Strelva customer interface. Workspace, managed website, and account
views use one shared frame. Company direction and cross-product boundaries live
in the [workspace context](../CONTEXT.md); interaction decisions live in
[DESIGN.md](./DESIGN.md).

## Current component work

Start with the [foundation inventory](./docs/component-system.md): tokens,
atoms, contracts and remaining adoption work. The
[September 17 component checkpoint](./docs/design/current-component-context.md)
records local implementations, rejected treatments, alternatives and proof.
The system is partially adopted, not fully migrated. No material winner, final
visual acceptance or production release is implied.

The September 18 [visual direction map](./DESIGN.md#visual-direction-and-extension-map)
and [foundation extension contract](./docs/component-system.md#extending-the-foundation)
connect selected direction, source owners, specimens and verification. They
resolve older font-selection guidance in favor of the recorded Geist/custom-logo
decision. This is structural documentation work; component implementation and
adoption gaps remain in the foundation inventory.

## Current product work

Jacob's latest direction makes websites the main current commercial focus and
self-service the primary experience. The [website release focus](./docs/horizontal-product-brief-2026-09-11.md#september-20-website-release-focus)
owns that decision. Read the [website release review](./docs/strelvav2-horizontal-acceptance.md#website-release-review)
for the distinction between existing managed sites, new customer creation and
outside-site connection. Supporting workspace capabilities remain available
according to their own evidence; the new focus does not certify a self-service
website builder or change existing customer obligations.

The September 20 completion work prepares shared version `0.2.0` as an
Unreleased candidate. The [current execution record](./docs/strelvav2-horizontal-acceptance.md#september-20-completion-execution)
owns the latest implementation and verification state; [the completion plan](./todo.md#september-19-completion-plan)
separates local work from operating and production requirements.

The [September 16 transition and hypotheses](./docs/horizontal-product-brief-2026-09-11.md#september-16-transition-and-hypotheses)
explain the move from hiring Strelva for defined delivery toward using a product
to improve and operate business work. Improving existing work and enabling
previously unaffordable work are equally part of the direction. The
[evidence register](./docs/product-reality.md#september-16-transition-hypotheses)
keeps this selected direction separate from unproven adoption and economics.

Jacob's September 15 direction authorizes local implementation of the full
business and offering topology in the
[product brief](./docs/horizontal-product-brief-2026-09-11.md). The earlier staff
application journey remains a required regression, not a restriction on broader
work. The [acceptance ledger](./docs/strelvav2-horizontal-acceptance.md) separates
proof from unfinished behavior. Existing customer agreements, native product
authority and production restrictions remain unchanged.

## Language

**Business:** The customer organization whose work and records must remain
separate from other businesses. A business is not a website tenant, payer or
agency merely because the same person can access them.

**Offering:** A specific promise combining usable software, completed work or
ongoing help. Its limits and provider commitments are explicit.

**Installation:** An offering configured for one business, with its selected
version and connected resources. Installation does not grant new authority or
prove that a human provider accepted service.

**Assignment:** A person's or agent's explicit permission to operate specified
work within agreed limits and time. It does not transfer customer ownership.

**Work:** A finite request, action or result. Work can belong to an installation
or remain independently useful.

**Provider commitment:** The work a provider has actually agreed to take care of.
Requesting a provider is not its acceptance.

**Contribution reward:** An explicitly awarded benefit for helping develop an
offering. It may begin as usage or subscription credit; it is not company equity
or permission to access client information.

## Evidence state

Jacob authorized the full horizontal local implementation on September 12. The
[acceptance ledger](./docs/strelvav2-horizontal-acceptance.md) is the completion
record. The current work adds durable owner-approved execution, private bounded
apps, local scheduling, repeated saved-source investigations, scoped contributions,
source context, runtime cost admission, and the internal learning loop. Results
remain central in the common frame; website requests carry into the governed
composer and document drafting stays in place. Generated app plans create native
private drafts through the existing atomic plan-output receipt.

The isolated Auth/Postgres journeys have exercised actual local persistence,
revocation and native execution. Browser fixtures separately prove interface
behavior. Neither proves production operation, live calendar/provider integration,
real research samples, customer value, or Jacob's human acceptance. Production,
paid calls, live messages, grants and deployments remain unapproved.

- **Latest confirmed product direction:** the
  [horizontal product brief](./docs/horizontal-product-brief-2026-09-11.md)
  records Jacob's subsequent decisions: users across organization sizes, fluid
  self-service and managed collaboration, outside agencies and agents, and
  vertical R&D measuring time and financial value. The inquiry migration below
  is one narrow implementation slice, not the whole product or its launch
  sequence. See the [audit and staged plan](./docs/horizontal-audit-and-plan-2026-09-11.md).
  These planning decisions do not change live scope, billing or runtime authority.

- **Existing inquiry implementation contract:** the
  [inquiry-first product specification](./docs/inquiry-first-product-spec-2026-09-11.md)
  governs the September 11 local migration. The
  [acceptance matrix](./docs/inquiry-first-acceptance-2026-09-11.md) keeps
  implementation and evidence status separate from the selected behavior.
  Work present in the local tree is under review and does not establish release,
  deployment, provider access, live delivery, or customer adoption.

- **Implemented locally:** the shared frame, workspace Home/My work/Explore,
  contextual website navigation, account presentation, and release-gated account
  entry routing are present in the September 7 working changes. The existing
  workspace supports bounded AI Visibility results and scoped agency access;
  the September 12 bounded execution work extends this foundation; it is not an unrestricted agent runtime.
- **Verification:** focused account tests cover invitation processing, release
  gating, managed recovery, operator routing, verified identity, and unavailable
  workspace storage. The production build and focused browser checks pass locally. Native T3
  review covered the shared home, product directory, managed frame, and account;
  automated checks cover narrow-screen navigation, focus, and request flows.
  This is local verification, not release acceptance.
- **Deployed:** this local interface change has not been deployed or enabled in
  production. The earlier [September 7 audit](../.scratch/product-adoption-audit/full-audit-and-structure.md)
  distinguishes live observations from source capability.
- **Operated, adopted, commercial:** managed website agreements and live use
  require the corresponding current evidence. A working shared interface does
  not establish new paid plans, adoption, or accepted service.

## September 11 inquiry migration checkpoint

The inquiry engine, business entry, fixed public form, version-bound intake,
rehearsal UI, publication transaction, receipts, consent controls, and undo now
have local implementation and tests. Production activation remains pending. The [initial implementation checkpoint](./docs/inquiry-first-implementation-status-2026-09-11.md)
is historical. The [horizontal verification record](./docs/horizontal-local-verification-2026-09-11.md)
records the later implementation and authenticated local evidence. Keep
`STRELVA_INQUIRIES_RELEASE` off until that checklist is complete and a separate
production action is authorized.

## Owns

- The common customer frame and the implemented workspace routes and records.
- Managed website access, content, governed actions, approvals, publishing,
  verification, history, integrations, and product-specific billing.
- The internal operator console and the deployed versioned storefront contract.

## Does not own

Company strategy or public marketing presentation; independently operated product
runtimes; customer-specific frontend code; authority implied by a relationship
label; new commercial terms inferred from navigation. Existing client agreements
and provider permissions survive the interface transition.

## September 8 self-service transition

Local changes move `/ai-visibility`, its retained public results, and `/audit`
out of the marketing layout into the common product frame. Website diagnostics
use the existing canonical audit engine; the marketing repository redirects old
entry/report URLs to the product. Anonymous assessment remains available; private
AI Visibility and website-audit saving retain the workspace release gate. Website
audits now support explicit private copies of retained server reports; lead details
and browser-supplied result payloads are not imported. Public result URLs support
reopening while their retained source exists.

Saved-work URLs now include workspace identity. Reload, browser history, sign-in
and failed callback recovery retain the requested result. Missing results have
an explicit unavailable state; handoff acceptance opens the customer's copy and
assessment retry retains its business inputs. The additive September 8 recovery
migration introduces actor-bound attempts, leased execution, a durable result
checkpoint, and atomic completion into one saved work item. Recovery is explicit;
a pre-checkpoint interruption may repeat read-only provider checks. Pending
assessments can be found from the server as well as the same browser session.

Pricing options live in `../.scratch/product-release/pricing-2026-09-08.md`.
No price, new entitlement, production migration, deployment, or release flag was
selected or changed. The product and marketing builds pass locally; live auth,
database and existing-client rollout acceptance remain separate gates. Isolated
PostgreSQL verifies the workspace and recovery migrations; read-only production verification now uses the existing Vercel login and the
production connection from `strelva-admin`, whose domains include `app.strelva.com`.
The identity table is accessible, but workspace tables and RPCs are not exposed
to the service role through PostgREST; the new workspace schema is not available
to the application. No migration or activation was performed. On September
8, public HTTP checks returned 404 for `/workspace` and 200 for `/sign-in`,
`/ai-visibility`, and `/audit`. These do not prove authenticated production behavior.

## Current attention

The [internal product research](./docs/research/strelva-horizontal-product-research.md)
and [evidence register](./docs/product-reality.md) examine horizontal capabilities
and product structure. Jacob clarified the high-growth technology-product aim,
with clients becoming product users under subscription/usage pricing. Exploration
keeps app creation, recurring work, interactive shared outputs, and reusable
products open. A work-centered or agency-delivery default is not accepted. R&D
is strictly internal. These research options authorize no implementation or
production change.

The [September 12 frontier report](./docs/research/frontier-strelva-2026-09-12.md)
adds a six-month capability delta, 29 source-inspected workflow teardowns, four
product alternatives, and ten proposed demonstrations. Its recommendations are
research, not a newly selected strategy or evidence of general autonomous
operation. Existing authority and release boundaries remain in force.

The [definition of done](./docs/strelvav2-definition-of-done.md) proposes separate
acceptance gates for the horizontal interface, working local product and internal
research/learning system, and operated customer offerings. Inquiry screen counts
do not measure horizontal completion. Internal research retains sourced claims,
observations, inferences, unknowns, and contradictory evidence; synthetic users
do not establish demand. These definitions add no production or spending authority.

The [full horizontal acceptance ledger](./docs/strelvav2-horizontal-acceptance.md)
now defines the requested expansion beyond the first slice. Current local work
adds outcome entry, private documents, grouped tracker edits and Undo, task and
project starts, model-backed planning with selected sources, reusable inquiry
updates, cost records, and richer experiment comparisons. Implementation is in
progress; the earlier first-slice verification does not prove these additions.
Jacob will conduct the end-to-end behavior review. Use focused behavior tests,
critical failure checks, and type checking during implementation. Production
remains off, and no audited full-product completion percentage is established.

The [first horizontal scope](./docs/horizontal-first-scope-2026-09-11.md) is selected:
shared inquiry work, CSV trackers, and internal experiment evidence. Its local
implementation passes unit, browser, build, compatibility and isolated storage
checks, including authenticated local journeys. See the
[verification record](./docs/horizontal-local-verification-2026-09-11.md) for the
exact evidence and limits. Provider testing, representative client installation
and production activation remain release gates. Use
the [rollout checklist](./docs/horizontal-release-checklist-2026-09-11.md) to keep
local, authenticated staging, and production evidence separate. Preserve the
inquiry acceptance requirements for any
inquiry release without weakening the existing
shared-navigation, website-continuity, narrow-screen, keyboard, error,
read-only, and account-recovery boundaries. Keep capability and price
availability honest. A submitted capability request is not an accepted delivery
promise, and a local inquiry fixture is not a live handling authority.

## Verify before consequential action

Read [AGENTS.md](./AGENTS.md). Verify the deployed release, tenant membership,
accepted service, billing, and required provider authority before live action.
`STRELVA_WORKSPACE_RELEASE` remains the production workspace gate. Synthetic
routes under `/preview/strelva` require both development mode and
`STRELVA_UI_PREVIEW=1`; they are interface fixtures, not authentication bypasses
or evidence of a production result. Do not enable a release or deploy from the
presence of these routes.

## Context map

- [Operating instructions](./AGENTS.md) and [developer setup](./README.md).
- [Interface contract](./DESIGN.md), [shared frame](./src/experience/app-frame/StrelvaShell.tsx),
  [workspace experience](./src/experience/workspace/WorkspaceApp.tsx), and
  [managed website frame](./src/components/dashboard/ConversationShell.tsx).
- [Testing and CI](./docs/testing-and-ci.md) and
  [persistence boundaries](./docs/persistence-boundaries.md).
- [Inquiry-first product specification](./docs/inquiry-first-product-spec-2026-09-11.md)
  and [acceptance matrix](./docs/inquiry-first-acceptance-2026-09-11.md).
- [Client dashboard surfaces](./docs/client-dashboard-ia.md) and
  [operator responsibilities](./docs/operator-command-center.md).

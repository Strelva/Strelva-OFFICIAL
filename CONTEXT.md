# Strelva interface and Managed Websites context

Reviewed: 2026-09-11
Kind: product

Internal release: **strelvav2**. See the [release entry point](./docs/strelvav2.md).
This branch is for internal work and is not approved for production.

## Role

REB owns the Managed Websites control plane and the current local implementation
of the common Strelva customer interface. Workspace, managed website, and account
views use one shared frame. Company direction and cross-product boundaries live
in the [workspace context](../CONTEXT.md); interaction decisions live in
[DESIGN.md](./DESIGN.md).

## Evidence state

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
  this is not a general execution engine.
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

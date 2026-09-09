# Strelva interface and Managed Websites context

Reviewed: 2026-09-07
Kind: product

## Role

REB owns the Managed Websites control plane and the current local implementation
of the common Strelva customer interface. Workspace, managed website, and account
views use one shared frame. Company direction and cross-product boundaries live
in the [workspace context](../CONTEXT.md); interaction decisions live in
[DESIGN.md](./DESIGN.md).

## Evidence state

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

Complete review of shared navigation, result and website continuity, narrow-screen
behavior, keyboard access, empty/error/read-only states, and account recovery.
Keep capability and price availability honest while the release scope is being
selected. A submitted capability request is not an accepted delivery promise.

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
- [Client dashboard surfaces](./docs/client-dashboard-ia.md) and
  [operator responsibilities](./docs/operator-command-center.md).

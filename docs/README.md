# Docs

Updated: 2026-10-04

| Folder | Holds | Start with |
| --- | --- | --- |
| [capabilities/](./capabilities/README.md) | Every customer capability: what it does, status, code, specs, tests | [capabilities/README](./capabilities/README.md) |
| [architecture/](./architecture/README.md) | Data, auth, tenancy, contracts, platform layers | [persistence-boundaries](./architecture/persistence-boundaries.md) |
| [operations/](#operations) | Runbooks: release, rollback, secrets, domains, onboarding, testing | [production-readiness](./operations/production-readiness.md) |
| [product/](#product) | Direction, briefs, evidence, roadmap | [product-reality](./product/product-reality.md) |
| [design/](./design/) | Tokens, components, color, motion, brand | [component-system](./design/component-system.md) |
| [research/](./research/), [strategy/](./strategy/00-INDEX.md) | Research memos and strategy explorations. Inputs, not decisions | — |
| [archive/](./archive/README.md) | Finished migrations, superseded plans, old releases | Don't build from these |
| [prototypes/](./prototypes/) | Design prototypes (`scripts/design/` writes here) | — |

## When docs disagree

1. [`AGENTS.md`](../AGENTS.md): repo rules and live-client constraints.
2. [CONTEXT.md](../CONTEXT.md#product-model): the customer model and its
   names. [product-ontology](./architecture/product-ontology.md): deployed
   compatibility names and boundaries.
3. [persistence-boundaries](./architecture/persistence-boundaries.md): store authority.
4. Current code and contract tests.
5. Runbooks in `operations/`.
6. Everything in `archive/`, `research/`, and `strategy/` is context only.

Don't fix a historical plan by making code match it. Promote the decision into
a current doc and a contract test.

## Operations

| Doc | Use it for |
| --- | --- |
| [production-readiness](./operations/production-readiness.md) | Release and production verification (read by `pnpm check:prod`) |
| [launch-blockers](./operations/launch-blockers.md) | The release gate (read by tests and `pnpm check:prod`) |
| [horizontal-release-checklist](./operations/horizontal-release-checklist-2026-09-11.md) | Production rollout that keeps client sites up |
| [strelvav2-horizontal-acceptance](./operations/strelvav2-horizontal-acceptance.md) | Acceptance and release evidence ledger, incl. the Sept 30 release |
| [testing-and-ci](./operations/testing-and-ci.md) | Test layers and what a green run means |
| [rollback](./operations/rollback.md) | Code, content, schema, Redis, provider recovery |
| [secret-rotation](./operations/secret-rotation.md), [first-time-production-secrets](./operations/first-time-production-secrets.md) | Secrets |
| [domain-setup](./operations/domain-setup.md) | Client domains and DNS |
| [client-onboarding](./operations/client-onboarding.md), [`PROVISIONING.md`](../PROVISIONING.md) | Signed lead to live client |
| [activation-runbook](./operations/activation-runbook.md), [tracking-rollout](./operations/tracking-rollout.md) | Analytics on client sites |
| [tenant-redesign](./operations/tenant-redesign.md), [repo-transfer-runbook](./operations/repo-transfer-runbook.md) | Client repo redesign and handoff |
| [where-things-live](./operations/where-things-live.md) | Which system owns what, and drift rules |
| [`VERSIONING.md`](../VERSIONING.md) | Lockstep app/marketing versions |

## Product

| Doc | Use it for |
| --- | --- |
| [Product model](../CONTEXT.md#product-model) | Systems, Connections, Possibilities, Versions: the customer model and its rules (Oct 4) |
| [offerings-and-differentiation](./product/offerings-and-differentiation-2026-10-02.md) | Every offering against the market, what to lead with, how we build differently (Oct 2; customer noun now System) |
| [product-reality](./product/product-reality.md) | Evidence register and the current decision (Oct 1) |
| [horizontal-product-brief](./product/horizontal-product-brief-2026-09-11.md) | Confirmed product direction, clarified through Oct 1 |
| [horizontal-audit-and-plan](./product/horizontal-audit-and-plan-2026-09-11.md) | Source audit and build order |
| [Strelva Reborn](./product/strelva-reborn.md) | The `0.x` release series that moves every client into a business workspace. Exit criteria and order (Oct 2) |
| [Strelva 1.0.0](./product/strelva-1.0.0.md) | Every feature planned for the 1.0.0 launch, with today's state and open decisions (Oct 5) |
| [strelvav2](./product/strelvav2.md), [definition of done](./product/strelvav2-definition-of-done.md), [module map](./product/strelvav2-module-map-2026-09-19.md) | The Sept 30 workspace release (history) |
| [roadmap](./product/roadmap.md) | Delivery state as of Aug 1 (older than product-reality) |
| [strelva-labs](./product/strelva-labs.md), [assets](./product/assets.md) | Labs direction; client and asset snapshot (Jul 30) |
| [`todo.md`](../todo.md) | Sept 19–20 completion plan and backlog |

Company direction and ADRs live outside this repo in `../CONTEXT.md` and
`../docs/adr/`.

## Fixed facts

- Commercial plan truth is `src/lib/billing-plans.ts` plus each tenant's
  persisted plan and amount. A pay link never implies a subscription.
- Origins: `strelva.com` (marketing, separate repo), `app.strelva.com` (app and
  `/api`), `admin.strelva.com` (operator console), customer custom domains.
- Legacy `REB_*`, `x-reb-*`, `reb:`, and `scaffold-web` names stay only where
  deployed wire, stored data, or client repos need them.

## Known gaps

- `gtm/` is referenced by [strategy/00-INDEX](./strategy/00-INDEX.md),
  [current-product-focus](./strategy/current-product-focus.md), and the roadmap,
  but doesn't exist in this repo.
- [client-dashboard-ia](./architecture/client-dashboard-ia.md) calls itself a
  historical compatibility map, but `AGENTS.md` still names it the owner.
- [design-kit](./design/design-kit.md) predates the Sept 18 Geist decision in
  `DESIGN.md`; tests still read it.
- Two applied migrations mention old doc paths in
  comments. Migrations are left unedited on purpose.

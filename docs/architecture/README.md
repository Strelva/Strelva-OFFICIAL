# Architecture

Updated: 2026-10-02

How the app is put together. For what each capability does and where its code
lives, see [capabilities](../capabilities/README.md).

## Two models, one app

| | Tenant model | Workspace model |
| --- | --- | --- |
| What it serves | The live managed-website business | Businesses and agencies running capabilities in a workspace |
| Code | `src/lib`, `src/components/dashboard` | `src/platform`, `src/products`, `src/experience` |
| Surfaces | `/dashboard`, `/admin`, `/api/v1` (client sites) | `/workspace`, `/api/workspace*`, `/api/bounded-work` |
| Identity | Tenant row (`src/lib/tenants.ts`), `stable_id` never changes | Workspace + membership (`src/platform/workspaces`) |
| Status | Live | In production since 2026-09-30, no authenticated production journey yet |

New capability goes on the workspace model. Managed sites reach a workspace
through `src/products/managed-presence`, which links tenant records without
copying them.

## Code layers

```
src/app          routes and API handlers (thin)
src/experience   UI for a capability or the shared frame (app-frame, workspace)
src/products     one folder per capability: contracts, server, domain logic
src/platform     shared layers every capability builds on
src/server       server-only wiring (executable capability definitions)
src/lib          tenant-model implementations awaiting extraction
src/proxy.ts     request gating
```

[`src/README.md`](../../src/README.md) has the boundary rules;
`pnpm check:ontology` and `pnpm check:boundaries` enforce them.

## Shared platform layers

| Layer | What it does |
| --- | --- |
| `workspaces/` | Workspaces, memberships, `saved_product_work`, handoffs, invitations, actor resolution |
| `business-record/` | One shared record per customer business: typed facts with provenance, services, people, deduplicated contacts, revision history with undo, and the tenant -> workspace conversion (`tenant_workspace_links`). Local only; migration `20261002120000` not applied to production |
| `capabilities/` | Executable capability contracts, qualification, registry factory |
| `products/` | Descriptive catalog and the workspace executable list. Grants no access |
| `bounded-work/` | Revisioned payload store shared by apps, scheduling, checks, websites |
| `work-execution/` | Responsibilities, steps, standing (scheduled) work |
| `work-context/` | Source grants, evidence, sensitive-field isolation |
| `work-participation/` | Who works on what; operational assignments |
| `work-economics/` | Budgets, allowances, entitlements, provider receipts, payer transitions |
| `agent-access/` | Scoped, hashed tokens for a person's own AI agent |
| `offerings/` | Installable offerings, provider delivery, agency draft grants |
| `service-requests/` | Customer requests, commands, delivery commitments |
| `relationships/` | Display status projection. Not authorization |
| `customers/` | Enterprise customers, Home Finder port (double-gated) |
| `public-continuations/` | Carry a public result into a workspace |
| `workspace-exit/`, `workspace-exports/` | Leaving a workspace and taking the data |
| `workspace-release.ts` | The `STRELVA_WORKSPACE_RELEASE` gate |

## Reference docs

| Doc | Owns |
| --- | --- |
| [persistence-boundaries](./persistence-boundaries.md) | Which store is authoritative for what; Redis exceptions; retention |
| [auth-tenancy](./auth-tenancy.md) | Supabase Auth, routing, memberships, tenant checks |
| [product-ontology](./product-ontology.md) | Domain vocabulary and maturity words (read by `ontology-contracts.test.ts`) |
| [GLOSSARY](../../GLOSSARY.md) | Workspace terms the ontology does not define |
| [deepening-2026-10-05](./deepening-2026-10-05/README.md) | Nine proposed deep modules for the workspace and inquiry code, with defects found and fixed |
| [custom-repo-delivery-model](./custom-repo-delivery-model.md) | Client-repo topology and the versioned storefront contract |
| [client-repo-build-standard](./client-repo-build-standard.md) | How client repos consume `/api/v1` |
| [feature-management](./feature-management.md) | Tenant feature registry and core lock |
| [ontology-phase1-tenant-decomposition](./ontology-phase1-tenant-decomposition.md) | TenantConfig sub-models |
| [ontology-phase2-governed-work](./ontology-phase2-governed-work.md) | Governed-work tables |
| [ontology-phase4-content-spine](./ontology-phase4-content-spine.md) | Content revision spine |
| [ontology-phase5-connections](./ontology-phase5-connections.md) | Connection status axes |
| [operator-command-center](./operator-command-center.md) | `admin.strelva.com` surfaces |
| [client-dashboard-ia](./client-dashboard-ia.md) | Tenant dashboard surfaces (compatibility map; inquiry-first supersedes parts) |

Contracts in code: `src/app/api/v1/`, `src/lib/scaffold-contracts.ts`,
`release-manifest.json`, `custom-repo-starter/`.

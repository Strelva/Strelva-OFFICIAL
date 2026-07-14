# Documentation status and authority

Updated: 2026-07-14

Strelva has accumulated implementation notes, migration plans, strategy research,
and live runbooks. They are not equal sources of truth. When two documents
conflict, use this order:

1. `AGENTS.md` for repository invariants and current operating constraints.
2. `product-ontology.md` for domain names and product boundaries.
3. `persistence-boundaries.md` for authority, cache, mirror, and retention.
4. Current code and contract tests for executable behavior.
5. Current operational runbooks listed below.
6. Historical plans only as decision context.

## Current and normative

| Document | Authority |
|---|---|
| `product-ontology.md` | Product/domain ontology, taxonomy, maturity vocabulary |
| `persistence-boundaries.md` | Store authority and migration boundaries |
| `auth-tenancy-architecture.md` | Supabase Auth, membership, and application-layer tenancy |
| `custom-repo-delivery-model.md` | Delivery topology and versioned storefront contract |
| `operator-command-center.md` | Current operator information architecture |
| `testing-and-ci.md` | Test layers and CI-faithful local verification |
| `production-readiness.md` | Current release and production verification runbook |
| `rollback.md` | Current code, content, schema, Redis, and provider recovery policy |
| `client-onboarding.md` | Current managed-client delivery workflow |
| `strategy/current-product-focus.md` | Active product-strategy experiment |

Commercial plan truth is `src/lib/billing-plans.ts` plus the selected plan and
monthly amount persisted on each tenant. Plan, capability, vertical, presence
profile, and delivery model are independent axes. One-off pay links never imply
a subscription.

The canonical public origins are:

- `https://strelva.com` — separate marketing property.
- `https://app.strelva.com` — client control plane and `/api` origin.
- `https://admin.strelva.com` — operator console.
- Customer custom domains — delivered Site Properties.

Legacy `REB_*`, `x-reb-*`, `reb:`, `scaffold-web`, and old capability aliases
remain only where deployed wire, persistent data, or repository compatibility
requires them.

## Current with scoped historical material

- `launch-blockers.md`: only Current/Waived Blockers and the current verification
  section are normative; the evidence log is historical.
- `domain-setup.md`: client-domain ownership and DNS instructions are current;
  old control-plane apex cutover examples are historical.
- `clerk-sanity-teardown-checklist.md`: historical execution record plus the
  remaining ops-only Sanity image URL cleanup.

## Historical or superseded

These files explain past decisions but must not drive new implementation:

- `supabase-migration-plan.md` and `post-cutover-runbook.md`
- `strelva-migration-plan.md` and `url-cutover-runbook.md`
- `first-time-production-secrets.md`
- `operating-model.md`, `platform-hardening.md`, and
  `mission-control-test-checklist.md`
- `docs/goals/**` state, runbooks, and completed goal notes
- `strategy/research/**` and dated strategy alternatives unless explicitly
  promoted by `strategy/current-product-focus.md`

Do not repair a historical plan by making current code match it. Promote an
intentional decision into a normative document and an executable contract test.

# Strelva — managed business-presence control plane

Strelva is transitioning toward a common conversational experience for Users,
Paid Users, Clients, and Enterprise accounts. The description below covers the
existing managed-client application. See [source ownership](src/README.md) for
the module boundaries and [the transition proposal](docs/strategy/2026-09-05-product-structure-and-agency-experiment.md)
for the account model and agency experiment. Existing client delivery remains
supported during the transition.

Strelva is a **managed business-presence service with a multi-tenant software control
plane**. Clients get proof that their presence is working and can ask Strelva to handle
updates in plain language ("add my new Saturday class"); operators run the portfolio from
an AI-assisted console. Each paid client's public Site Property is a separate hand-built
repository that pulls content from Strelva over a versioned contract.

> Internal note: wire-level `x-reb-*` headers and `reb:` Redis prefixes are
> intentionally frozen for compatibility. Every product and release surface is Strelva.

## Product version

The Strelva app and the separate `strelva-marketing` site release in lockstep.
Both are currently **v0.1.1**; v0.1.0 is the initial baseline and v0.1.1 adds
Strelva Labs. Run `pnpm version:check` with both sibling repositories present
before preparing a release. See [`VERSIONING.md`](./VERSIONING.md).

## Repository guidance

- [`AGENTS.md`](./AGENTS.md) defines repository invariants and verification commands.
- [`docs/README.md`](./docs/README.md) defines documentation authority and separates
  current runbooks from historical plans.
- [`docs/product-ontology.md`](./docs/product-ontology.md) defines product language;
  [`docs/persistence-boundaries.md`](./docs/persistence-boundaries.md) defines store
  authority and failure behavior.

## Architecture

```
 Marketing site (separate repo)
        │ lead
        ▼
 CONTROL PLANE  (this repo)
   proxy.ts ── host → tenant routing, Supabase auth, CSP
   /dashboard (owner) · /admin "Mission Control" (operator)
   AI agents + governance + risk engine
   /api/v1/*  ── frozen, additive-only contract
        │ pull (ISR 60s)        ▲ push (HMAC-signed revalidate)
        ▼                       │
 Supabase Postgres (source of truth) + Redis (cache + operational data)
        │
        ▼
 CUSTOM CLIENT REPOS — one per paid client, own domain, own Vercel project
```

- **Source of truth:** Supabase Postgres for identity, tenant configuration, domains,
  content, collections, drafts, audit, and activity. Upstash Redis is the cache for
  Postgres-backed domains and the authority for explicitly documented operational stores.
  Sanity code teardown is complete; only read-only legacy image URL compatibility remains.
  See [`docs/persistence-boundaries.md`](./docs/persistence-boundaries.md) for the
  per-domain authority map.
- **Sync contract (`/api/v1/*`):** client repos pull content (ISR) and receive
  HMAC-signed revalidation pushes. The contract is versioned (`v1`) and changed only
  additively — deployed client sites can't break.
- **Stack:** Next.js 16 (App Router, `proxy.ts` routing), React 19, TypeScript, Tailwind 4,
  Supabase Auth (multi-host), Supabase Postgres, Vercel AI SDK + Gemini, Stripe (billing
  live), Resend, Vercel Blob.

## The AI systems

Two agents, both governed — this is the applied-AI core of the product.

**Tenant content agent** (`/api/agent`) — the owner chats; the agent edits the site. Every
proposed change runs through:

- **Governance** (`ai-governance.ts`) — `publish` (factual fields) vs `review` (marketing
  copy / high-risk facts like prices, hours) vs `block` (structural).
- **Risk assessment** (`agent-risk.ts`) — classifies the operation (rewrite/add/delete/
  reorder/structural) and scores it; only low-risk minor edits auto-apply, everything else
  routes to human review.
- On publish: write authoritative content to Postgres through the storage boundary →
  populate the Redis cache → record version history, log activity, and HMAC revalidate the
  client repository → verify the change on the public read path.

**Operator agent** ("Mission Control", `/api/admin/agent`) — the operator runs the business
by talking to it. **Safe by construction:** it reads the entire portfolio (health,
revenue, ops, attention briefing, audit, pay links) but has **no mutation path** — for
consequential actions it returns a *confirmation proposal*; the console commits it by
calling the existing gated, audited endpoints on an explicit click. The LLM can never
target an arbitrary endpoint or mutate state on its own.

## Mission Control (operator layer)

- **Portfolio brain** — one cached cross-tenant aggregate of health, MRR, launch readiness.
- **Needs-Attention briefing** — prioritized "where to spend founder hours" (launch-blocked
  tenants, ops breakage, drafts, quiet tenants), on the overview + a daily Slack digest.
- **Guided onboarding** — provisions a tenant end to end (record + revalidation secret +
  seeded content + owner invite + Vercel project/env/domain) and hands back the client-repo
  env to paste; the site stays a hand-built repo.
- **Operator surfaces** — `admin.strelva.com` rewrites to the super-admin-only `/admin`
  console: triage at `/admin`, one client list at `/admin/clients`, one client detail at
  `/admin/clients/[id]`, plus leads, analytics, approvals, maintenance, ops, and audit.
  Navigation is a grouped desktop rail and matching mobile drawer. The authoritative map
  is [`docs/operator-command-center.md`](./docs/operator-command-center.md).
- **Email audiences** — `src/lib/email-enabled.ts` defines four independent policies:
  client lifecycle mail defaults OFF (`EMAIL_SENDING_ENABLED`), operator notifications
  default ON (`OPERATOR_EMAILS_ENABLED`), prospect audit reports default ON
  (`PROSPECT_EMAILS_ENABLED`), and end-customer transactional mail defaults OFF
  (`CUSTOMER_EMAIL_ENABLED`). The shared `src/lib/email/send.ts` transport maps an explicit
  audience to its policy.

## Development

```bash
pnpm install
pnpm dev            # local dev (localhost:3000); gldf.localhost:3000 routes a tenant
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest
pnpm build          # production build
pnpm check:prod     # production-readiness checklist
pnpm version:check  # confirm app and marketing versions match
pnpm provision-tenant   # CLI tenant provisioning
```

# Strelva — AI-managed website platform

Strelva is a **multi-tenant control plane** for local-business websites. Owners get a
dashboard that proves their site is working and an AI agent that handles updates in plain
language ("add my new Saturday class"); the founders run the whole portfolio from an
AI-driven operator console. Each client's public site is a separate hand-built repo that
pulls content from Strelva over a versioned contract.

> Internal note: wire-level `x-reb-*` headers and `reb:` Redis prefixes are
> intentionally frozen for compatibility. Every product and release surface is Strelva.

## Product version

The Strelva app and the separate `strelva-marketing` site release in lockstep.
Both are currently **v0.1.1**; v0.1.0 is the initial baseline and v0.1.1 adds
Strelva Labs. Run `pnpm version:check` with both sibling repositories present
before preparing a release. See [`VERSIONING.md`](./VERSIONING.md).

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

- **Source of truth:** Supabase Postgres for content/config/tenants (flipped 2026-06-20;
  Sanity teardown done 2026-07-10 — code reads no Sanity data; only two legacy
  `NEXT_PUBLIC_SANITY_*` env vars remain to resolve stored image asset URLs until a
  content-URL rewrite ops step); Upstash Redis as a write-through cache and the
  operational store (events, clicks, bookings, reviews, pay-links, rewards).
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
- On publish: write to Postgres → write-through Redis → HMAC revalidate the client repo →
  verify the change is actually live before claiming it.

**Operator agent** ("Mission Control", `/api/admin/agent`) — the founders run the business
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
- **Operator screens** — the whole console is served on the bare admin host `admin.strelva.com`
  (super-admin only; `proxy.ts` rewrites it onto `/admin`). A **"Needs you" overview** (leads /
  approvals / at-risk / signups, led ahead of MRR — no client table), **one client list**
  (`/admin/clients` — per-tenant pipeline stage, tags, notes, contacts, activity + SEO grade /
  launch % / at-risk) linking to **one merged detail** (`/admin/clients/[id]` — live pulse,
  health scan, review intel, visibility, domains, config, CRM; the old `/admin/tenants` routes
  now redirect here), a **Leads** board (`/admin/leads` — mark contacted / convert / dismiss),
  **Search + Analytics** (`/admin/analytics` — Search Console + GA4 per client), ops board (with
  live platform-dependency health), pay-links (mint + revoke, with paid tracking), draft diff
  review, and a portfolio-wide audit trail. Nav is five primary links + a "More" menu.
  See [`docs/operator-command-center.md`](./docs/operator-command-center.md) and
  [`docs/client-dashboard-ia.md`](./docs/client-dashboard-ia.md).
- **Operator vs client email** — two independent switches: operator notifications (new-signup,
  lead, payment-failed) default ON so the founders stay alerted, while all customer/prospect
  mail stays paused behind `EMAIL_SENDING_ENABLED` during the test-tenant phase.

## Development

```bash
pnpm install
pnpm dev            # local dev (localhost:3000); gldf.localhost:3000 routes a tenant
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest (~1983 tests)
pnpm build          # production build
pnpm check:prod     # production-readiness checklist
pnpm version:check  # confirm app and marketing versions match
pnpm provision-tenant   # CLI tenant provisioning
```

Agent guidance for contributors lives in [`AGENTS.md`](./AGENTS.md); the canonical operating
model and roadmap in [`docs/operating-model.md`](./docs/operating-model.md).

## Audit remediation (2026-07-30)

The 2026-07-30 deep audit's confirmed findings have been remediated — 139+ fixes
shipped and gated (typecheck + 1983 tests + build clean), `pnpm audit` down from
24 vulns (14 high) to 3 (1 high, 2 moderate) — the lone high is dev-only
(eslint's minimatch), not in the production runtime. The Next bump, tenant-isolation, SSRF, OAuth,
billing, and perf fixes are all landed. See the **Audit remediation status** in
[`AGENTS.md`](./AGENTS.md) for the fixed-vs-remaining split and
[`docs/audit-2026-07-30-deep-audit.md`](./docs/audit-2026-07-30-deep-audit.md)
for every finding with evidence.

All infra items from this audit are complete: orphaned Clerk/Sanity env vars
removed, `database.types.ts` regenerated from the live schema, and the
`noUncheckedIndexedAccess` strictness branch merged to `main`. The org-layer
phase-0 migration is applied to prod (tables live, dormant at the read level).
Next prod deploy picks up any pending branch work; no blocking ops items remain.

# Strelva app

For all output please read `OUTPUT.md` in this folder first EVERY TIME.

This repo is the Strelva product: the customer workspace, managed websites,
the website agent, the audit engine, billing, the operator console, and the
`/api/v1` API that every client site calls. Real clients depend on it today.

Other things live elsewhere:

- `strelva.com` marketing → `../strelva-marketing`
- Each paid client site → its own repo and Vercel project
- Company direction → `../CONTEXT.md` and `../docs/adr/`

## Where we're going

Strelva is where a business makes, runs and keeps reshaping its own systems.
A small business should be able to act on ideas that used to need its own
software team. Four nouns carry the product
([ADR 0011, proposed](../docs/adr/0011-organize-strelva-around-systems-connections-possibilities-versions.md)):

- **System:** something the business made in Strelva that works: a website,
  a proposal, a booking page, an intake flow, an internal app. Its identity
  survives changes to its content, data, logic and screens. Draft, Live or
  Paused, with health tracked separately.
- **Connection:** what a System works with: business facts, another System,
  a person, a Google account, a domain. Each one is typed (reads, acts,
  appears in, shares with, depends on, is triggered by).
- **Possibility:** a working alternative you can open and compare, across one
  or several Systems. **Make real** turns it on, and reports honestly when
  only part of it landed.
- **Version:** the same System adapted for another market, segment or agency
  client, with lineage back to its source. Not a release.

Example: a consultant's **proposal** System grows package selection, then
onboarding. It stays the same System the whole way, and a proposal the client
already accepted keeps its original terms.

Records, grants, operations, approvals and receipts stay underneath. A
customer hires Strelva to make and run their Systems and never has to build;
an agency makes and adapts them for clients
([ADR 0010](../docs/adr/0010-make-agencies-creators-and-channel-under-a-partner-charter.md));
a business can also change its own. The rules (identity, connection contracts,
isolation, pause and health) are in [CONTEXT.md](./CONTEXT.md#product-model).

Today the live business is managed websites for nine clients on the older
tenant model (`src/lib`). Those clients keep their service and move into
business workspaces, where each website becomes their first System. Build new
capability as Systems on the workspace model (`src/platform`, `src/products`,
`src/experience`), not as tenant-only features. The model is selected
direction, not a shipped runtime; [CONTEXT.md](./CONTEXT.md) has the evidence.

Customers who hire Strelva never have to build their own site. A native tool
never requires buying a website. A request for work is not an accepted job
until scope and deadline are agreed.

## Before you start

- Read [CONTEXT.md](./CONTEXT.md).
- For UI work, read `~/.codex/DESIGN.md`, [DESIGN.md](./DESIGN.md), and
  [docs/design/component-system.md](./docs/design/component-system.md).
- Run `git status`. Changes you didn't make belong to someone else.

## Building UI

- Compose from tokens and the existing components. If a component can't do what
  you need, fix the component. Don't restyle it in page CSS.
- Existing code isn't automatically approved design. The component inventory
  lists the legacy pieces not to copy.
- Check keyboard, focus, loading, error, empty, and permission states, on
  desktop and mobile.
- Use the `font-display` utility for display type. The arbitrary Tailwind font
  value breaks cold Turbopack dev builds.
- Marketing and app components are separate. Don't import across repos.
- When you change a component, update its entry in `docs/design/component-system.md`.

## Rules that protect live clients

**Frozen names.** `reb:` Redis keys, `x-reb-*` HMAC headers, and `REB_*` /
`SCAFFOLD_*` env and contract names are deployed. Renaming them needs a
versioned migration across every consumer. The product is called Strelva, never
Scaffold Web.

**The v1 API.** `/api/v1/*` changes are additive only. A breaking change gets a
new route family and a coordinated client rollout. Shared client-site behavior
goes into `custom-repo-starter/` first. Move it into this app only after two
client repos need it.

**Data.** Supabase Postgres owns identity, tenants, domains, content, drafts,
audit, and activity. Redis is a cache, except for the domains listed in
[docs/architecture/persistence-boundaries.md](./docs/architecture/persistence-boundaries.md). Sanity is
dead except for resolving old image URLs.

**Auth and tenants.** Supabase Auth is the only login. Request gating lives in
`src/proxy.ts`. Get the tenant from membership or trusted routing, then check it
with `requireTenantAccess` / `requireTenantPermission(s)`. The service-role
client skips RLS, so the app check is the real boundary.

**Tenant records.** `src/lib/tenants.ts` owns tenant rows. Keep `site_name`
and `created_at` on partial updates. `stable_id` never changes. Slug renames go
through `src/lib/tenant-rename.ts` so no Redis state is left under the old slug.

**One of each.** One scanner (`src/lib/scan.ts`, `scan-store.ts`). One set of
agent tools (`src/lib/agent-shared.ts`). One email path
(`src/platform/infra/email/send.ts`, gated by `email/enabled.ts`). One secrets
path (`src/platform/infra/crypto/secrets.ts`). Shared infrastructure lives in
`src/platform/infra`; the old `src/lib` paths only re-export it.
Extend these; don't build a second.

**Crons.** Declare in `vercel.json`, authenticate with `requireCronRequest`,
and register in `CRON_MAX_AGE_SECONDS` in `src/lib/heartbeat.ts`.

**Outside writes.** Content and Google changes go through
`src/lib/ai-governance.ts` and approval. The only exception is a tenant's
review-reply `auto` mode. Once a provider accepts a write, the approval is done.
If the read-back fails, record that separately. Never leave it retryable.

**Email domains.** `updates.strelva.com` for Strelva mail, `mail.strelva.com`
for client-branded mail. No root-domain sending, no per-client domains, no cold
outbound.

**Money.** Stripe is live. A pay link is not a subscription. Plan tiers are
packaging, not feature flags. `gldf` and `rohlax` are grandfathered, and
`/pay/rohlax` is a one-off deal, not a template.

**Secrets.** Real credentials never go in docs, fixtures, logs, or command output.

## Needs Jacob's yes

Production deploys, env var changes, database migrations, live email, Stripe
changes, Google writes, DNS or domain changes, and production data fixes.
Prepare and verify the exact action first, then ask. Env changes need a new
production deploy, not a redeploy. A production rollout also has to pass the
[release checklist](./docs/operations/horizontal-release-checklist-2026-09-11.md#september-21-production-preparation)
so existing client sites stay up.

No `Co-Authored-By` trailers on commits here.

## Commands

```bash
pnpm dev                     # localhost:3000; gldf.localhost:3000 is the gldf tenant
pnpm typecheck
pnpm test                    # Vitest
pnpm lint
pnpm build
pnpm check                   # lint + typecheck + test + build
pnpm check:ci                # what CI runs
pnpm smoke                   # public Playwright smoke
pnpm smoke:surfaces          # owner + operator surfaces with local fixtures
pnpm check:custom-repos      # client-repo compatibility
pnpm check:ontology          # persistence invariants
pnpm check:prod              # production readiness
pnpm version:check           # version matches strelva-marketing
```

The SQL checks need real Postgres binaries. They run in a throwaway local
cluster and never touch production:

```bash
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade
```

`CUSTOM_DOMAIN_MAP` routes custom domains locally.
[docs/operations/testing-and-ci.md](./docs/operations/testing-and-ci.md) explains when Redis,
Postgres, or bypass mode changes what a green run means.

## Done means proven

- Code: the test that covers the change, plus `pnpm typecheck`.
- API contract: contract tests plus `pnpm check:custom-repos`.
- Auth, tenants, persistence, crons, billing, email, governance, or outside
  writes: failure-path tests too.
- UI: look at the rendered page with realistic content, on desktop and mobile,
  in its empty, loading, error, and permission states.
- Docs only: links work, `git diff --check` is clean, and you've read the diff.
- Say where it was proven: local, preview, or production. Local proof is never
  a production claim.

## Where the details live

| Topic | Owner |
| --- | --- |
| Product model: Systems, Connections, Possibilities, Versions | [CONTEXT.md](./CONTEXT.md#product-model); the full ledger is `PRODUCT_MODEL.md` (untracked, main checkout only) |
| Capabilities: status, code, specs, flags | [docs/capabilities/README.md](./docs/capabilities/README.md) |
| Code layers and platform | [docs/architecture/README.md](./docs/architecture/README.md) |
| Workspace domain terms | [GLOSSARY.md](./GLOSSARY.md), under [product-ontology](./docs/architecture/product-ontology.md) |
| Data authority and retention | [docs/architecture/persistence-boundaries.md](./docs/architecture/persistence-boundaries.md) |
| CI and test modes | [docs/operations/testing-and-ci.md](./docs/operations/testing-and-ci.md) |
| Client dashboard | [docs/architecture/client-dashboard-ia.md](./docs/architecture/client-dashboard-ia.md) |
| Operator console | [docs/architecture/operator-command-center.md](./docs/architecture/operator-command-center.md) |
| Storefront contract | `src/app/api/v1/`, `src/lib/scaffold-contracts.ts`, `release-manifest.json`, `custom-repo-starter/` |
| Versioning | [VERSIONING.md](./VERSIONING.md) |
| Design | [DESIGN.md](./DESIGN.md), [docs/design/component-system.md](./docs/design/component-system.md) |

Put new rules in the owner above, not here. This file stays short.

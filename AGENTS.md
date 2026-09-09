# Strelva control plane

This repository is the Strelva Websites control plane. It owns the multi-tenant owner dashboard, operator console, governed website-management agent, audit engine, billing and operational integrations, and the versioned API consumed by client sites.

Production `strelva.com` marketing lives in the sibling `strelva-marketing` repository. Each paid client site is a separate custom repository and Vercel project. Do not move marketing presentation or client-specific frontend behavior into this control plane. Strelva's Custom Software division is not defined by this repository; do not turn the Websites product into a claim about that unresolved offering.

Read [CONTEXT.md](./CONTEXT.md) for current local scope, evidence state, and
release attention before changing product behavior.

## Product and compatibility boundaries

- The product, package, Vercel team, and control-plane project use the Strelva name. Do not call the product Scaffold Web.
- Deployed compatibility names are intentionally frozen: `reb:` Redis keys, `x-reb-*` HMAC headers, and existing `REB_*` and `SCAFFOLD_*` environment or contract symbols. Rename them only through a coordinated, versioned migration across every consumer.
- `package.json` in this repository and in `strelva-marketing` hold one shared product version. `VERSIONING.md` defines the release contract; `pnpm version:check` detects drift.
- `/api/v1/*` is the deployed storefront contract. Changes are additive within v1. A breaking wire change requires a new versioned route family and a coordinated client rollout.
- Reusable client-site behavior lands in `custom-repo-starter/` before it is propagated to client repositories. Client-specific booking, commerce, content, or presentation stays in that client's repository.
- Promote client-site behavior into the control plane only after at least two client repositories demonstrate the same need.
- Do not add `Co-Authored-By` trailers to commits in this repository.

## Architecture and sources of truth

The implementation and focused tests are the closest sources of truth. Use these maps when a change crosses a durable boundary:

| Concern | Source of truth |
| --- | --- |
| Production data authority and retention | `docs/persistence-boundaries.md` |
| CI layers, local data modes, and smoke-test gates | `docs/testing-and-ci.md` |
| Client dashboard surfaces and states | `docs/client-dashboard-ia.md` |
| Operator console routes and responsibilities | `docs/operator-command-center.md` |
| Storefront compatibility | `src/app/api/v1/`, `src/lib/scaffold-contracts.ts`, `release-manifest.json`, and `custom-repo-starter/` |
| Product versioning | both repositories' `package.json`, then `VERSIONING.md` |
| Visual and interaction decisions | `DESIGN.md`, `src/app/globals.css`, and the shipped components named there |

The live system has these non-negotiable boundaries:

- Next.js request routing and request-level access gating live in `src/proxy.ts`.
- Supabase Auth is the only authentication path. Clerk is removed.
- Supabase Postgres owns identity, tenant configuration, domains, content, collections, drafts, audit, and activity. Upstash Redis caches Postgres-backed data and remains authoritative only for the operational domains explicitly listed in `docs/persistence-boundaries.md`. The presence of a table or mirror does not transfer authority.
- Sanity is not a data source or rollback path. The remaining Sanity code resolves legacy CDN image references until those stored URLs are rewritten.
- Tenant isolation is enforced in the application. Derive the tenant from authenticated membership or trusted routing/configuration and use `requireTenantAccess`, `requireTenantPermission`, or `requireTenantPermissions`. The service-role Postgres client bypasses RLS, so RLS is defense in depth rather than the live authorization boundary.
- `src/lib/tenants.ts` owns tenant row mapping. Preserve `site_name` and `created_at` on partial updates, treat `stable_id` as immutable identity, and let the database trigger populate `tenant_stable_id` mirrors.
- Tenant slug renames must update every Redis-authoritative slug-keyed domain through the registry in `src/lib/tenant-rename.ts`. Caches may regenerate; authoritative operational state may not be stranded under the old slug.
- All crons are declared in `vercel.json`, authenticate through `requireCronRequest`, and are registered in `CRON_MAX_AGE_SECONDS` in `src/lib/heartbeat.ts`.
- `src/lib/scan.ts` and `src/lib/scan-store.ts` are the single audit and site-health write path. Do not create a parallel scanner, history store, or scoring engine.
- The streaming tenant agent and background executor share tool definitions and gates through `src/lib/agent-shared.ts`. Extend the shared factories rather than creating a second implementation.
- Use the `font-display` utility for display type. The equivalent arbitrary Tailwind family value breaks cold Turbopack development compilation even though production builds may pass.

## Consequential actions and trust boundaries

- Content and external-surface changes pass through `src/lib/ai-governance.ts` and the existing event/approval path. Google Business writes and review replies must not gain a direct publish path. The only standing exception is a tenant's explicit review-reply `auto` mode, including its existing delay and re-check before posting.
- For non-idempotent external writes, an accepted provider write resolves the approval. A failed read-back creates separate verification-failure evidence; it must not leave the approval retryable and risk a duplicate write.
- All application email goes through `src/lib/email/send.ts`, with an explicit audience and the switches in `src/lib/email-enabled.ts`. Provider errors throw; intentional suppression or a missing key returns `false`.
- `updates.strelva.com` is for Strelva mail and `mail.strelva.com` is for shared client-branded transactional mail. Do not verify the root `strelva.com` sending domain, create per-client sending domains, or route cold outbound through this system.
- Provider secrets use the encryption boundary in `src/lib/crypto/secrets.ts`. Do not write encrypted tenant columns or connection blobs through an alternate path, and never place real credentials in documentation, fixtures, logs, or command output.
- Stripe billing is live. A one-off pay link does not imply a subscription, and pricing tiers are packaging and build scope rather than code feature flags.
- `gldf` and `rohlax` are grandfathered from subscription enforcement. `/pay/rohlax` is a one-off historical agreement, including its no-monthly-fee commitment, and is not a template for new clients.
- A production deploy, environment change, database migration, live email, Stripe mutation, Google write, domain/DNS action, or production data repair requires explicit authority. Prepare and verify the exact action before requesting it. Do not use a redeploy to apply Vercel environment changes; a new production deployment is required after authorization.

## Commands

```bash
pnpm dev                 # Local Next.js server on localhost:3000
pnpm lint                # ESLint
pnpm typecheck           # TypeScript without emit
pnpm test                # Vitest suite
pnpm build               # Production build
pnpm check               # Lint, typecheck, tests, and build
pnpm check:ci            # CI-faithful local gate
pnpm smoke               # Public Playwright smoke tests, access bypass off
pnpm smoke:surfaces      # Owner and operator surface smoke tests with local fixtures
pnpm check:prod          # Production-readiness checks
pnpm check:custom-repos  # Executable custom-repository compatibility checks
pnpm check:ontology      # Persistence and lifecycle invariants
pnpm check:workspace-sql # Isolated PostgreSQL workspace and recovery migration checks
pnpm version:check       # App and marketing product-version parity
```

`gldf.localhost:3000` resolves the `gldf` tenant. Use `CUSTOM_DOMAIN_MAP` for local custom-domain routing. Follow `docs/testing-and-ci.md` when Redis, Postgres, bypass mode, or representative tenant data can change what a green result means.

## Proof requirements

- Documentation-only instruction changes require valid links, no active retired-harness references, `git diff --check`, and inspection of the complete diff.
- Code changes require the narrow test that exercises the changed behavior plus `pnpm typecheck`; run broader gates when the affected boundary warrants them.
- Storefront-contract changes require contract tests and `pnpm check:custom-repos` against representative consumers.
- Persistence, tenant identity, auth, cron, billing, email, governance, or external-write changes require focused failure-path tests as well as the normal success path.
- User-facing changes require rendered inspection of realistic content, relevant empty/loading/error/permission states, and the affected desktop and mobile journey. A build or screenshot alone is not proof of behavior.
- Never claim a production result from local evidence. State separately what was proven locally, in preview, and in production.

The workspace SQL check requires PostgreSQL server binaries (`postgres`, `initdb`,
`pg_ctl`, `psql`) on PATH; `libpq` alone is insufficient. On this workstation use
`PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH npm run check:workspace-sql`.
The script creates an isolated Unix-socket cluster, applies only the workspace
and recovery migrations, tests permissions and failure paths, and stops the cluster.
It does not connect to or migrate production.

# Strelva roadmap and current state

Status: **current execution record**

Updated: **2026-08-01**

This document answers “where are we and what happens next?” Product boundaries
remain authoritative in `product-ontology.md`; product experiments in
`strategy/current-product-focus.md`; GTM decisions and experiments in `gtm/`;
production verification in `production-readiness.md`.

## Current call

The control plane is not the bottleneck. The next proof is market and delivery:

1. finish the AI Visibility five-contact test before expanding that wedge;
2. run one triggered managed-presence cohort with a prepared correction after
   the scorecard result is known;
3. land and launch current client work;
4. unlock Managed Google Presence as wallet-share on existing clients without
   turning it into another speculative platform.

Do not answer weak market pull by adding platform surface area.

## Observed repository state

- `main` is synchronized with `origin/main` at `34a2e4f`.
- Local verification on 2026-08-01: typecheck passes; Vitest reports 246
  passing files, 2,013 passing tests, and one intentional skip. Lint is red with
  10 `no-explicit-any` errors in `scripts/inspect-tenant.ts` plus seven warnings.
  `pnpm check:ci` stopped at lint and did not reach surface smoke.
- `https://app.strelva.com/api/health` returned healthy on 2026-08-01, with
  Redis, Supabase, Stripe, and Gemini all reporting `ok`. This proves provider
  reachability at that moment, not that every route or the current commit is
  production-verified.
- GitHub Actions did not run the latest `main` checks. The newest Security and
  CI jobs stopped before receiving a runner because the GitHub account reported
  failed payments or an insufficient spending limit. Local green checks are not
  CI evidence until that external account block is cleared and a fresh run passes.

## Product state

The managed-presence loop is implemented end to end:

```text
acquire → qualify → deliver a Site Property → observe → govern → act → prove
```

Core implemented:

- AI Visibility result identity, shareability, monitoring-interest capture,
  and Delivery Lead promotion;
- bespoke custom-repository delivery through the additive `/api/v1` contract
  and signed revalidation;
- owner Today, Ask Strelva, Website, Analytics, Reports, Reviews, and Settings
  surfaces;
- governed content and provider actions, approval queues, versions, activity,
  reports, billing, and operator portfolio control;
- accounts and bundled billing for multi-site relationships through the live
  Redis account store, with the Postgres org schema retained as expand-only
  option value.

Conditionally operable:

- client lifecycle and end-customer mail, which remain paused unless their
  independent audience policies are enabled;
- Google Business Profile writes, which are built but depend on Google API
  approval, tenant authorization, and quota;
- production behavior that depends on live provider configuration or data.

Validation-gated:

- deeper AI Visibility monitoring and live citation probing;
- broad self-serve website building;
- vertical operating systems, workflow catalogs, and generalized Business
  Profiles without repeated paid or behavioral evidence.

## Commercial truth

- A client buys a quoted, paid custom build plus recurring management.
- Current recurring plan keys remain Presence `$99`, Growth `$199`, and Scale
  `$499` per month. The accepted plan and monthly amount are persisted per tenant.
- One-time pay links collect build payments or other invoices and never imply a
  subscription.
- Managed Google Presence is a sanctioned add-on at `$149/month/location`, with
  multi-location billing bundled at the account level. It is not ready to sell
  as a complete service until the external API gate and the proof layer below
  are complete.

## Active delivery

- **Twin Trees:** the repository record says the two-location account and bundled
  `$300/month` website plan exist. The two custom sites, live Stripe subscription,
  owner contact, and owner invite remain delivery/go-live work. Treat those as
  recorded operator state until rechecked in the live systems.
- **The Mooney Firm:** a local intake package, recommendation generator, and
  three-direction website prototype exist under `client-intake/sheri-mooney/`
  and `client-prototypes/sheri-mooney/`. They are local working assets, not part
  of the control plane and not evidence of a signed or live client.

## Market experiments

All six experiments in `gtm/EXPERIMENTS.md` remain queued. The immediate order is:

1. **E001:** send AI Visibility scorecards to five non-friends and measure
   forwarding, monitoring/fix requests, confusion, and managed-presence progress.
2. Prepare three golden prepared-change receipts without contacting the market.
3. **E006 C1:** run the 12-business seasonal home-services cohort as the only
   direct outbound cell. Do not add AI Visibility unless E001 proves it changes
   action.
4. Use returned evidence to choose the next single cell. Keep advisor or host
   recruitment bounded while C1 runs.
5. Run the Buffalo capability-release pilot and positioning interviews as
   separate experiments with their own success criteria. Do not blend their
   evidence into managed-presence conversion.

## Managed Google Presence launch path

The existing engine already covers review ingestion, reply governance, posts,
hours, photos, and read-back verification. The ordered launch path is:

1. confirm or obtain Google Business Profile API access and usable account quota;
2. add GBP Performance API evidence for calls, directions, views, and searches;
3. ingest an API-capable geogrid provider for map-pack proof;
4. add explicit multi-location account/location selection;
5. broaden governed profile fields and only then consider scheduling depth.

Do not call the add-on live because write code exists. Provider approval,
connection state, performance evidence, and geogrid are separate completion gates.

## Platform work that remains deliberately small

- Remove the `any` usage from `scripts/inspect-tenant.ts` so the authoritative
  lint and CI-faithful gates can run. Keep nested marketing/prototype build output
  outside the root ESLint traversal or add explicit workspace ignores before
  relying on `eslint .` in this combined local checkout.
- Clear the GitHub Actions billing/spending block and obtain fresh CI evidence.
- Move account reads to the Postgres org layer only when multi-site scale makes
  the live Redis account store the wrong authority.
- Replace remaining portfolio-wide Redis `KEYS` use in revenue reads before
  account volume makes it operationally expensive.
- Move heavy per-tenant cron fan-out to a real queue only when measured duration
  approaches the Vercel limit; `mapPool` is sufficient today.
- Re-run generated database types after every applied migration and keep the
  current CI/readiness checks authoritative.

## Documentation rule

This file records current state and priorities. Dated plans and audit finding
records remain evidence, not live backlog. When code closes a documented issue,
update the current owning document in the same change instead of leaving a
struck-through archaeology log.

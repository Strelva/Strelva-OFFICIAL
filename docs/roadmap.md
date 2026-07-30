# Strelva Roadmap + Current State

> The live "where are we / what's next" doc. `operating-model.md` is the
> historical roadmap (superseded); this is current. Last updated 2026-07-30.

## Where the platform is (2026-07-30)

**Mature and production-solid.** The control plane does what it needs to; the
work now is landing and launching clients, not building more platform.

Shipped today (all on `main`, deployed, health-verified):
- **Full security audit + remediation** — 28 high/critical fixed, deps CVEs
  cleared (0 high in the prod runtime), 48 docs refreshed. `noUncheckedIndexedAccess`
  on. See `docs/audit-2026-07-30-deep-audit.md`.
- **Lead spam gate** — content scorer on every public intake (`/api/access-request/intake`,
  `/api/v1/leads/[tenant]`) + all client email forms (cocard/mclears/orange-crate)
  + the scaffold starter. See `src/lib/lead-spam.ts`.
- **Operator controls** — per-client control of everything that was client-only /
  env-only / unsettable: report cadence, review reply mode, AI content autonomy,
  auto-approve threshold, Google/Yelp ids, visibility trade/towns, and a
  **per-client email override** (arm one verified client while the global switch
  stays paused, no redeploy). Plus create-only fields (`siteUrl`/`industry`/AI
  persona/business rules/capability manifest) now editable in `TenantEditor`.
- **Org layer LIVE** — accounts group multiple sites under one payer for bundled
  billing (`src/lib/accounts.ts` + `/admin/accounts`). First real account:
  **Twin Trees** (2 sites, $300/mo bundled). See AGENTS.md "Accounts / org layer".
- **Ops** — dropped `jacob@strelva.com` from operator email notifications.

## Active work

- **Twin Trees** (first multi-site account, landed): 2 locations (Fayetteville +
  Camillus), bundled at $300/mo ($150 each), websites only.
  - Account + both tenant records + bundled plan: **DONE** (pre-billing, tenants
    `trialing` for dashboard access).
  - **Noah is building the 2 repos** (the actual sites). Then: wire each to its
    tenant (revalidation secret, domain, capability manifest) from the client
    cockpit.
  - **Go-live:** create the live $300 bundled Stripe subscription (one customer,
    2 line items). The billing webhook then syncs it to the account + flips both
    tenants `active`. Set the account contact email when known + invite the owner.

## Platform next (small, demand-driven — build when a client needs it)

- **Go-live bundled billing** for Twin Trees (the Stripe sub above) — the only
  near-term platform touch, triggered by their launch.
- **Postgres org-layer read-flip** — the `accounts`/`subscriptions` tables are
  applied as option value; flip account-aware reads onto them only when scale
  (many multi-site accounts) makes the Redis store the wrong home. Not now.

## Strategic priority (the actual roadmap)

Per the Jun 17 Garrett plan: the priority is **OWSH sales — landing and launching
clients — not more platform.** The platform was never the bottleneck and now
demonstrably isn't. Highest-leverage next move is a signed/launched client
(Twin Trees now), then the next one. Resist building an eighth admin control;
point the energy at sales + launches. Dec fork holds (OWSH traction -> all-in;
else best job from the pipeline).

## Deliberate backlog (documented, low priority)

- Audit leftovers, all low/defense-in-depth: `reb:tenants:all` decrypted-cache
  (60s TTL), Sentry `withSentryConfig` org/project/auth-token wiring, the two
  remaining transitive moderate advisories (OTel via Sentry). Nothing blocking.
- Full `supabase gen types` is current as of 2026-07-30; re-run after any new
  migration (CI-ideal: fail if `database.types.ts` older than newest migration).

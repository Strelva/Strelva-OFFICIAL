# Strelva Operations — Where Things Live and the Rules That Keep It Clean

> **2026-06-22 update:** the auth + data backbone CUT OVER to **Supabase Auth +
> Postgres in production on 2026-06-20** (`scaffoldweb.com` live + healthy:
> Supabase auth active, content served from Postgres, RLS + the
> `handle_new_user` provisioning trigger live). Prod flags are ON
> (`CONTENT_SOURCE=postgres`, `TENANTS_SOURCE=postgres`, `DATA_SOURCE=postgres`).
> Sanity is still **dual-written** as a reversible rollback path but no migrated
> store *reads* it while the flags are on; Clerk is dead-pathed behind
> `isSupabaseAuthConfigured()` and pending teardown. The remaining destructive
> teardown (remove Sanity reads, lock the Sanity dataset, unwrap
> `clerkMiddleware` in `src/proxy.ts`) is a deliberate end-step and is NOT done
> yet — `core.ts` still touches Sanity as the content-store fallback. Sections
> below that still say "Sanity is the source of truth" describe the pre-cutover
> world; treat Postgres as the source of truth now and Sanity as the rollback
> mirror.

The architecture (org of per-client repos, one shared content store, one
Vercel team) is correct for our size. What rots agency platforms is not the
architecture — it's drift. These are the conventions that prevent it.
Adopted 2026-06-06 after the repo-sprawl cleanup (4 copies of the marketing
site, 22 dead branches, canonical repos invisible to one founder).

## Repo map (the only copies that matter)

| Repo | What | Canonical location |
| --- | --- | --- |
| `REB` (this repo) | Control plane: multi-tenant platform, AI agent, dashboard, `/api/v1` contract | → moving to `Scaffold-Web` org |
| `strelva-marketing` | strelva.com marketing site + `brand/` assets | → moving to `Scaffold-Web` org |
| `custom-repo-starter/` (in this repo) | The template every client storefront starts from | here |
| `rhm-innovations` | Client storefront | `Scaffold-Web` org |
| `greatlakesdriedfruits` | Client storefront | → moving to org |
| `rohlax-wellness` | Client storefront | → needs a remote in the org |
| `reb-contracts` | Shared `@reb/contracts` package | → needs a remote in the org |

Anything not in this table is a stale copy. Archive it, don't edit it.
Brand assets (logo SVGs, palette hex, usage rules) live in
`strelva-marketing/brand/BRAND.md` — never rebuild them by hand.

## The starter-first rule (the one that matters most)

**Reusable changes go to `custom-repo-starter` first, then propagate to
client repos. Never patch a client repo with anything another client could
need. Never fork client B from client A — always from the starter.**

Why this is the hill to die on: the day a client repo gets a hand-rolled
integration, we stop having one system with N instances and start having N
systems. That's the difference between "update all client sites" being one
job or six. Snowflake repos are how agency platforms die at client #15.

Client-specific code (their booking widget, their rewards program) belongs
in their repo. The test: "would a second client ever want this?" If yes →
starter.

## Client lifecycle

**Onboarding:** clone starter → 4 env vars → tenant in control plane →
Vercel project in the team → domain. No hand-built repos.

**Offboarding (do it the day they churn, not "later"):**
1. Archive the GitHub repo
2. Delete the Vercel project (export anything they're owed first)
3. Remove/disable the tenant in the control plane
4. Release DNS / transfer the domain to them
5. Revoke their integration tokens (GSC, reviews, social)

## Access policy

**Both founders are admin on everything: GitHub org, Vercel team,
Cloudflare, Supabase, Stripe, Resend, Google Search Console** (plus Clerk +
Sanity until they're decommissioned post-cutover). No
production surface lives under one person's personal account. This is not
about trust — it's bus factor. The 2026-06-06 cleanup happened because the
canonical marketing repo was invisible to half the company.

## Quarterly entropy pass (~30 min, calendar it)

- Branches: anything merged or >30 days stale gets deleted
- Postgres: list tenants — does each map to a paying client or a named
  experiment? Delete the rest. (Sanity holds the same data as the rollback
  mirror until it's decommissioned.)
- Vercel: every project maps to a live client or core property? Delete the rest
- This table: still accurate? Update it

## Database / content store

**Supabase Postgres is the source of truth** for tenant config + content +
operational data (flipped 2026-06-20; prod flags `CONTENT_SOURCE`,
`TENANTS_SOURCE`, `DATA_SOURCE` = `postgres`). Tenant isolation is a DB
guarantee via **RLS** (`supabase/migrations/*_rls.sql`). Upstash Redis remains
the write-through cache + ephemeral operational store (rate limits, locks);
operational data also dual-writes to Postgres. Sanity (`production` dataset) is
still dual-written as a reversible rollback mirror but is no longer read while
the flags are on — its teardown is the deliberate end-step (not done yet).
The standing rule still holds: **every read/write is scoped by tenant id derived
from auth or trusted config — never from request input** — and RLS now enforces
it at the DB layer for any path carrying a user JWT. Any new route that touches
tenant data gets that check in review.

## Observability (how we know it broke before a customer does)

- **Cron heartbeat.** Every cron records `reb:heartbeat:{cron}` on the
  success path (`src/lib/heartbeat.ts`). The watchdog `GET /api/cron/heartbeat`
  runs every 30 min and pages (deduped, 6h) on any cron stale past its
  interval. Max-ages live in `CRON_MAX_AGE_SECONDS` — **keep that registry in
  sync with `vercel.json` whenever a cron schedule changes.**
- **Mail log.** The weekly-report cron records every send to
  `reb:maillog:{tenant}`. `GET /api/admin/mail-logs` (super-admin) answers
  "why didn't tenant X get their report?". A run that fails >20% of attempted
  sends pages high.
- **Dependency health.** `GET /api/health` (and `getServiceHealth()`) probe
  Redis/Sanity/Clerk/Stripe/Gemini; the maintenance cron runs the same probe
  daily and pages if a core dependency is down/degraded. Point an external
  uptime monitor at `/api/health` (503 = core down).
- **Alerts.** `alert()` is the sync path (Slack+Sentry on high/critical only).
  `alertOnce()` dedups high/critical and rolls medium/low into
  `reb:alert-count:*` counters instead of dropping them.

## T004 — scaffoldweb.com → strelva.com rebrand (PARKED, needs go/no-go)

> **Note:** the **data + auth cutover** (Clerk+Sanity → Supabase Auth +
> Postgres) is DONE (2026-06-20) and is a separate thing from this rebrand. The
> rebrand below — renaming the *domain/brand* from `scaffoldweb.com` to
> `strelva.com` and splitting the repo — is still parked.

The full rebrand + repo split (`scaffoldweb.com` → `strelva.com`,
`strelva-marketing` + `strelva-app`) is specced in
`docs/strelva-migration-plan.md` — ~518 references across proxy host matching,
the tenant subdomain pattern, Resend domains, CSP, and copy. It is a
rebrand, not a DNS change, and is **half-migrated** (production strelva.com
marketing already serves from the separate repo; this control plane still
matches `*.scaffoldweb.com` hosts).

**Status: parked pending a Noah+Jacob go/no-go.** Do not execute piecemeal —
a partial host-matching change can break live tenant routing. When it's
greenlit: pick a date, freeze content changes during the window, follow the
migration-plan codemod order, and verify tenant + admin + custom-domain
routing on a preview before flipping production DNS. Until then, new code uses
`SCAFFOLD_*` env names (with `REB_*` fallbacks) and keeps `x-reb-*` wire
headers + `reb:` Redis prefixes frozen.

## Scale model (batch now, queue later)

The per-tenant cron fan-outs (weekly-report, visibility, polls, staleness,
maintenance) and `buildPortfolioSnapshot` run through `mapPool` (bounded
concurrency, `src/lib/concurrency.ts`) instead of a serial loop or an unbounded
`Promise.all`. This holds well into the low hundreds of tenants without new
infra. Two ceilings remain and the move at each is known:

- **Vercel 300s function timeout.** A cron that can't finish all tenants within
  300s even at concurrency 8 has outgrown in-process fan-out. The visibility
  cron already has a per-run tenant cap (`VISIBILITY_MAX_TENANTS_PER_RUN`,
  default 50) as a cost+time guard.
- **The queue-later move (~20+ paying clients / when a cron nears the timeout):**
  switch the heavy crons from "loop over tenants in one invocation" to
  **Upstash QStash** — the cron enqueues one message per tenant, and a worker
  route processes one tenant per invocation. This removes the single-function
  time ceiling entirely and gives per-tenant retries. Not built yet (no infra
  at this scale); `mapPool` is the bridge until then. Redis prefix stays `reb:`;
  the worker route would live under `/api/jobs/*`.

## Outage runbooks

Each dependency, what breaks, and the move.

- **Redis (Upstash) down.** Public content reads fall through to Postgres (the
  source of truth); custom-domain routing serves a stale in-memory map then the
  `CUSTOM_DOMAIN_MAP` env map (`getTenantByDomain`). Rate limits and locks
  fail-closed by design. *Move:* confirm via `/api/health`; Upstash status page;
  rotate the REST URL/token in Vercel if the instance was recreated. No data
  loss — Redis is a cache + operational store, not the source of truth.
- **Postgres (Supabase, source of truth) down.** Content/tenant/operational
  reads serve the Redis cache while it lasts; writes fail. *Move:* Supabase
  status page + `get_advisors`/`get_logs`; do NOT mass-retry writes (they'll
  stack). Once back, the next cron/edit re-warms the cache. (Rollback lever if
  Supabase itself is the problem: flip `*_SOURCE` flags back off + redeploy —
  Sanity is kept current via dual-write — see `docs/rollback.md`.)
- **Supabase Auth down = no dashboard login.** Public client sites are
  unaffected (they read `/api/v1/*`, no auth). *Move:* Supabase status page;
  there is no bypass by design (the dev-access path is local-only). An "auth
  temporarily unavailable" message is better than a stack trace — surface it on
  the sign-in route if this recurs. (Clerk is dead-pathed behind
  `isSupabaseAuthConfigured()` and no longer the live login path.)
- **Resend down / domain-reputation block.** Weekly reports fail; the mail log
  records each failure and the >20% alert fires. *Move:* check
  `/api/admin/mail-logs`; re-send manually via `workflow_dispatch` on the cron
  once Resend recovers (sends are idempotent per tenant-week at the report
  level — a duplicate report is acceptable, a missing one is not).

## Backup / restore (RTO / RPO)

- **What's backed up.** A daily full-site content snapshot per tenant
  (`createDailySiteSnapshot`, run by the maintenance cron) capturing all
  owner-editable sections. Since the 2026-06-20 cutover the source of truth is
  Postgres, which carries its own Supabase backups; the durable mirror is now
  the DB rather than Sanity. (Sanity also still receives dual-writes as the
  rollback path until its teardown.)
- **RPO ~24h** for content (daily snapshot). Operational Redis data
  (events/bookings) is best-effort, not snapshotted.
- **RTO minutes.** `restoreSiteSnapshot` is **crash-safe**: it captures current
  content before writing and rolls the site back to its pre-restore state if a
  mid-write fails, so a partial failure can't leave a half-restored site. A
  `pre_restore` snapshot is always taken first, so a restore is itself
  reversible.
- **Restore drill (do this quarterly):** on a throwaway/dev tenant, create a
  snapshot, mutate content, restore the snapshot, confirm content matches and a
  `pre_restore` snapshot exists.

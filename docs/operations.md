# Strelva Operations — Where Things Live and the Rules That Keep It Clean

> **Current-state note (2026-07-30):** Supabase Auth is the only auth path.
> Postgres owns identity, tenant configuration, content, collections, drafts,
> audit, and activity. Redis owns only the operational boundaries listed in
> `persistence-boundaries.md`. Clerk teardown is complete (2026-07-11, #146).
> Sanity code teardown is complete (2026-07-10); only legacy Sanity image URL
> cleanup remains (ops-only: rewrite stored `cdn.sanity.io` refs, then lock the
> dataset). The canonical control-plane origin is `app.strelva.com`; `strelva.com`
> is the separate marketing repo. The Vercel project is `strelva-admin` on the
> `strelva` team.

The architecture (org of per-client repos, one shared content store, one
Vercel team) is correct for our size. What rots agency platforms is not the
architecture — it's drift. These are the conventions that prevent it.
Adopted 2026-06-06 after the repo-sprawl cleanup (4 copies of the marketing
site, 22 dead branches, canonical repos invisible to one founder).

## Repo map (the only copies that matter)

| Repo | What | Canonical location |
| --- | --- | --- |
| `strelva-platform` (this repo; formerly `REB`) | Control plane: multi-tenant platform, AI agent, dashboard, `/api/v1` contract | canonical local control-plane workspace |
| `strelva-marketing` | strelva.com marketing site + `brand/` assets | separate production marketing workspace |
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

**Onboarding:** start from the reusable starter foundation → tenant in control
plane → hand-built client implementation → Vercel project → domain. Every paid
site is bespoke; reusable behavior lands in the starter first.

**Offboarding (do it the day they churn, not "later"):**
1. Archive the GitHub repo
2. Delete the Vercel project (export anything they're owed first)
3. Remove/disable the tenant in the control plane
4. Release DNS / transfer the domain to them
5. Revoke their integration tokens (GSC, reviews, social)

## Access policy

**Both founders are admin on everything: GitHub org, Vercel team,
Cloudflare, Supabase, Stripe, Resend, and Google Search Console.** No
production surface lives under one person's personal account. This is not
about trust — it's bus factor. The 2026-06-06 cleanup happened because the
canonical marketing repo was invisible to half the company.

## Quarterly entropy pass (~30 min, calendar it)

- Branches: anything merged or >30 days stale gets deleted
- Postgres: list tenants — does each map to a paying client or a named
  experiment? Archive or delete the rest through a reviewed operator flow.
- Vercel: every project maps to a live client or core property? Delete the rest
- This table: still accurate? Update it

## Database / content store

**Supabase Postgres is the source of truth** for identity, tenant configuration,
domains, content, collections, drafts, audit, and activity (flipped
2026-06-20; production flags `CONTENT_SOURCE`, `TENANTS_SOURCE`, and
`DATA_SOURCE` are `postgres`). Upstash Redis is the cache for those domains and
the authority for the explicitly operational domains in
[`persistence-boundaries.md`](./persistence-boundaries.md), including locks,
rate limits, queue indexes/bodies, and pre-tenant delivery state. A Postgres
mirror does not become authoritative until its read path is deliberately cut
over.

Tenant isolation is enforced at the **application boundary**: derive tenant id
from authenticated membership or trusted routing/configuration, then call the
appropriate access or permission gate. The service-role control plane bypasses
RLS, so RLS is defense in depth—not the live authorization boundary. Any new
tenant-data route must demonstrate this scope explicitly.

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
  Redis, Supabase, Stripe, and Gemini. In production, missing or failing Redis
  or Supabase is `down`; provider failures are `degraded`. The maintenance cron
  runs the same probe daily. Point an external uptime monitor at `/api/health`
  (503 = core down).
- **Alerts.** `alert()` is the sync path (Slack+Sentry on high/critical only).
  `alertOnce()` dedups high/critical and rolls medium/low into
  `reb:alert-count:*` counters instead of dropping them.

## Brand, origin, and compatibility boundary

The customer-facing brand and production origins are settled:

- `strelva.com` is the separate marketing repository.
- `app.strelva.com` is this control plane and public API origin.
- `admin.strelva.com` is the operator host.
- Paid client Site Properties live in separate custom repositories/domains.

The repo folder (`REB`), package name (`scaffold-web`), `SCAFFOLD_*` variables,
legacy `REB_*` aliases, `x-reb-*` headers, and `reb:` Redis keys are not product
ontology. They are implementation or compatibility names. New internal code
uses the canonical Strelva/domain vocabulary, while deployed wire and
persistent names stay frozen until a coordinated versioned rollout. The old
sequence is retained only as historical context in
[`strelva-migration-plan.md`](./strelva-migration-plan.md).

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

- **Redis (Upstash) down.** Public content reads fall through to Postgres;
  custom-domain routing serves a stale in-memory map then the
  `CUSTOM_DOMAIN_MAP` fallback. Redis-authoritative operational features are
  unavailable or fail-soft according to their contract, and locks/rate limits
  fail closed where safety requires it. *Move:* confirm via `/api/health`, check
  Upstash status, and rotate credentials if the instance was recreated. Do not
  claim zero data loss: queue/event bodies, locks, and other domains identified
  as Redis-authoritative have their own retention/recovery semantics.
- **Postgres (Supabase, source of truth) down.** Content/tenant/operational
  reads may serve an existing Redis cache where that domain explicitly supports
  it; authoritative writes fail. *Move:* Supabase status page +
  `get_advisors`/`get_logs`; do not mass-retry writes. Once back, normal reads
  and edits re-warm caches. Rollback is forward-only—there is no Sanity source
  to flip back to.
- **Supabase Auth down = no dashboard login.** Public client sites are
  unaffected (they read `/api/v1/*`, no auth). *Move:* Supabase status page;
  there is no bypass by design (the dev-access path is local-only). An "auth
  temporarily unavailable" message is better than a stack trace—surface it on
  the sign-in route if this recurs.
- **Resend down / domain-reputation block.** Weekly reports fail; the mail log
  records each failure and the >20% alert fires. *Move:* check
  `/api/admin/mail-logs`; re-send manually via `workflow_dispatch` on the cron
  once Resend recovers (sends are idempotent per tenant-week at the report
  level — a duplicate report is acceptable, a missing one is not).

## Backup / restore (RTO / RPO)

- **What's backed up.** A daily full-site content snapshot per tenant
  (`createDailySiteSnapshot`, run by the maintenance cron) capturing all
  owner-editable sections. Since the 2026-06-20 cutover the source of truth is
  Postgres, which also carries the configured Supabase backup policy. Sanity is
  not a backup or rollback path.
- **RPO ~24h** for the application-level content snapshot. Redis-authoritative
  domains are governed by their documented TTL, mirror, and recovery contracts;
  do not describe them collectively as durable backups.
- **RTO minutes.** `restoreSiteSnapshot` is **crash-safe**: it captures current
  content before writing and rolls the site back to its pre-restore state if a
  mid-write fails, so a partial failure can't leave a half-restored site. A
  `pre_restore` snapshot is always taken first, so a restore is itself
  reversible.
- **Restore drill (do this quarterly):** on a throwaway/dev tenant, create a
  snapshot, mutate content, restore the snapshot, confirm content matches and a
  `pre_restore` snapshot exists.

## Known issues / TODO

- **[HIGH][perf] `buildOpsReport` has a fully serial N+1 loop** (`src/lib/ops.ts:113-157`).
  Three sequential `for...of` loops, 3 awaits per tenant, no concurrency. Collapse
  into a single `mapPool(active, 8, async (tenant) => { ... })` call per the existing
  `concurrency.ts` pattern. The SMS and domain-drift loops produce independent state
  so ordering is not a constraint.
- **[MEDIUM][perf] Triple `pgMetricSummary` RPC per report** (`src/lib/storage/analytics-store.ts:166,302`
  and `src/lib/reports.ts:505-513`). Three identical DB calls where one would do.
  Hoist to a per-call memoizer so one Postgres round-trip feeds all three metric
  reads in a single report cycle.
- **[MEDIUM][perf] `read_revenue` uses blocking `redis.keys()`** (`src/lib/revenue.ts:34`).
  Degrades Redis under load. Replace with a set or sorted-set index.
- **[MEDIUM][perf] `listMembers` fires N sequential Upstash HTTP round-trips (N+1)**
  (`src/lib/rewards/memberRepositoryKv.ts:204`). Batch the member fetches.
- **[MEDIUM][perf] `list_drafts` agent tool issues one Postgres query per tenant
  sequentially** (`src/app/api/admin/agent/route.ts:228-239`). N+1 at portfolio scale;
  batch with `Promise.all` or a single query with `IN`.
- **[MEDIUM][bug] `poll-google-reviews` cron does not paginate** (`src/app/api/cron/poll-google-reviews/route.ts:116`).
  Reviews beyond the first API page are never ingested. Add pagination support.
- **[MEDIUM][bug] Monthly-report dev-mode run consumes the once-per-month dedup marker
  without sending** (`src/app/api/cron/monthly-report/route.ts:98-128`). A dev/test
  run burns the dedup key, suppressing the real send for the rest of the month.
- **[MEDIUM][bug] Booking list 'today' filter uses UTC instead of tenant timezone**
  (`src/app/api/booking/list/route.ts:21`). Use `zonedTodayIso` (same as the booking
  config/schedule read paths).
- **[MEDIUM][gap] `maxAdvanceBooking` config field is never enforced at booking creation**
  (`src/lib/booking.ts:17`). The field is stored but has no effect.
- **[MEDIUM][bug] GA4 cache can pin an 'unavailable' result indefinitely when `status:ok`
  is cached with zeroed data** (`src/lib/analytics.ts:297-382`). Only cache results
  where the data is actually non-zero, or add a separate staleness key.
- **[MEDIUM][tenant-isolation] `getTenantFromHeaders` silently falls back to 'demo' when
  `x-tenant` is absent** (`src/lib/tenant.ts:13`). Any route relying on this helper
  for tenant scoping will operate on the demo tenant when the header is missing.
  Callers that require a real tenant should treat a 'demo' fallback as an error.
- **[MEDIUM][tenant-isolation] `analytics GET` route falls back to DEFAULT_TENANT ('demo')
  on missing host** (`src/app/api/analytics/route.ts:8`). Same root cause as above.
- **[MEDIUM][tenant-isolation] `setEventStatus` Postgres shadow-write has no tenant filter**
  (`src/lib/db/repositories.ts:125`). It can update any event row by id. Add a
  `tenant = $2` WHERE clause.
- ~~**[MEDIUM][bug] `reb:tenants:all` Redis cache stores decrypted (plaintext) secrets.**~~ **FIXED 2026-07-30.** The 4 provider-secret fields are now re-enveloped on the Redis write and decrypted on read. No plaintext secret lives outside the Postgres at-rest boundary. In-memory cache remains decrypted (no-op without `SECRETS_ENC_KEY`).
- **[MEDIUM][security] Prompt injection via unsanitized `businessRules` and `personality`
  fields** (`src/lib/agent-prompt-shared.ts:342-339`). Wrap both in
  `sanitizePromptValue()` before interpolation. Also enforce a max-length cap on
  `businessRules` at write time (e.g. 1000 chars in the `TenantEditor` validator).
- **[MEDIUM][security] `Rohlax /api/pay/rohlax` builds origin from spoofable
  `x-forwarded` headers** (`src/app/api/pay/rohlax/route.ts:21-24`). Build
  success/cancel URLs from `NEXT_PUBLIC_APP_URL` or another trusted env var,
  not from the request headers.
- **[MEDIUM][bug] `PATCH /api/reviews` bypasses GBP publish path and permanently
  suppresses auto-reply backlog for Google reviews** (`src/app/api/reviews/route.ts:73`).
  Any direct PATCH marking a Google review as replied skips the governed
  `publishReviewReply` path. Audit callers and route through the governed path.
- **[MEDIUM][tech-debt] `gbp-replies.ts` contains a private duplicate of
  `refreshAccessToken`** (`src/lib/gbp-replies.ts:27`) that does not persist the
  refreshed token. Consolidate into `src/lib/google-token.ts`.
- **[MEDIUM][security] `Approve-link POST` route has no rate limiting**
  (`src/app/api/approve/route.ts:149`). Add rate limiting matching the other public
  endpoints.
- **[MEDIUM][bug] `contact.email` schema default is empty string but requires valid email**
  (`src/lib/schemas.ts:181` / `src/lib/defaults.ts:76`). A PUT with the default value
  fails validation on first use. Change the default to `undefined` or relax the schema
  to allow empty string.
- **[MEDIUM][bug] `setPgPageConfig` uses non-atomic delete-then-insert**
  (`src/lib/storage/page-config-store.ts:84-90`). There is a read window between the
  delete and the insert. Replace with an upsert.
- **[MEDIUM][gap] `section-analytics` route is a dead endpoint with fabricated trends**
  (`src/app/api/section-analytics/route.ts:35-87`). Either wire it to real data or
  remove it.

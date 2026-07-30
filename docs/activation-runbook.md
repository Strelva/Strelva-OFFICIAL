# Activation Runbook — light up Analytics + Today (per client)

**Owner:** Noah + Jacob (this is ops in the client repos + Google consoles — not a code task).
**Why:** the Analytics surface and the Today activity feed are well-built but read **zero** until two manual per-client steps happen. This is the highest-ROI work from the repo audit: it flips those surfaces from "Dark" to "Lit" and makes the product demonstrably work — without new code. Do this before any Analytics/Today *correctness* code fixes (those only pay off once data flows).

> The canonical control-plane origin is `https://app.strelva.com`. `strelva.com`
> is the separate marketing repo. Client repos set `NEXT_PUBLIC_SCAFFOLD_API_URL`
> to `https://app.strelva.com` in production (NOT `strelva.com`).

There are **two independent tracks** per client. Both are needed for a fully-lit dashboard, but they light up different things, so you can do them in either order.

---

## Track 1 — Tracking beacons (lights up: Today visitors, phone-clicks, "who reached out"; the weekly report's numbers)

Done in the client's **own custom repo** (Rohlax, GLDF, RHM, etc.). Reference: `docs/tracking-rollout.md`.

Per client repo:
1. Add `ScaffoldTracker.tsx` from `custom-repo-starter/` (page-view / booking-click / phone-click beacons → `POST /api/v1/track/[tenant]`).
2. Add `ScaffoldGA4.tsx` from `custom-repo-starter/` (the gtag pageview tag; no-op until its env var is set).
3. Set the env vars on the repo's Vercel project:
   - `NEXT_PUBLIC_SCAFFOLD_API_URL` — the control-plane API base (`https://app.strelva.com`, NOT `strelva.com` which is the marketing site).
   - `NEXT_PUBLIC_TENANT_ID` — the tenant subdomain (e.g. `gldf`).
   - `NEXT_PUBLIC_GA4_MEASUREMENT_ID` — the client's GA4 measurement id.
4. Redeploy the client site.
5. **Verify:** visit the live site, then check the tenant's dashboard Today + Analytics — visitor/beacon numbers should start moving within a few minutes.

## Track 2 — Google reporting access (lights up: Analytics GSC + GA4 panels, the 90-day milestone)

Done in the **client's Google consoles**. The control plane reads via a shared service account; it must be granted access per client.

Per client:
1. **Google Search Console** → the client's property → Settings → Users and permissions → add
   `strelva-reporting@strelva.iam.gserviceaccount.com` as a user (Full or Restricted read is fine).
2. **Google Analytics (GA4)** → the client's property → Admin → Property Access Management → add the same
   `strelva-reporting@strelva.iam.gserviceaccount.com` with **Viewer**.
3. **Verify:** the tenant's Analytics surface flips from "unavailable / 0" to live GSC + GA4 data (the reads are OAuth-first, service-account-fallback, so this grant is what unblocks non-OAuth tenants).

> Note: provisioning already writes the siteUrl-derived GSC property into `analytics:cfg` at tenant creation, so no config step is needed — just the access grant. If a client verified their site as a URL-prefix property (not a domain property), the derived `sc-domain:` property won't match; set the correct property via `POST /api/admin/tenants/[id]/analytics-config`.

---

## Per-client checklist

| Client | Tracker + GA4 tag | Env vars set | Redeployed | GSC access | GA4 access | Analytics live |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|
| gldf   | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| rohlax | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| rhm    | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| _(new clients)_ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

**"Done" =** the client opens their dashboard and Today shows real visitor/customer-action numbers, and Analytics shows live GSC + GA4 data (not "connect" / "0 / unavailable").

---

## Analytics-correctness code — BUILT (2026-07-08, Track B / B5). Just needs the data.

These were the "queued for after data flows" follow-ups; they are now **shipped in code** (branch `feat/track-b`). They read real data the moment Track 1 + Track 2 above are done — no more code needed, just the ops grants:
- **GSC property totals** — DONE. `getSearchConsolePerf` (+ cron twin `fetchSearchData`) now fires an un-dimensioned aggregate request for the TRUE property total; the top-20 query request is for the `topQueries` list only. No longer understates the long tail.
- **Real 90-day baseline** — DONE. `scanTenant` captures a durable set-once day-0 health anchor (`saveScanBaseline`/`getScanBaseline`, `reb:scan:baseline:{tenant}`); `milestone.ts` compares against it instead of the ~12-day ring buffer. Honest "tracking since" until a real anchor exists.
- **Cache the Google reads** — DONE. Read-through Redis cache around GSC/GA4 (`analytics:gsc/ga4:{tenant}:{days}`, ~15-min TTL; the short TTL is the staleness bound, no explicit bust on repoint). The dashboard/admin/weekly-cron callers no longer each re-hit Google live.
- **Real GA4 traffic in the dollar-impact** — DONE. `scanTenant` builds a real `TrafficProfile` (GA4 visitors + leads-based conversion) and threads it into `runAudit`/`impact.ts` for paying clients; the anonymous `/audit` keeps the generic prior. Fail-safe: no GA4 data → generic prior (so this is inert until Track 2 grants land).
- **GBP posts in the Today activity feed** — DONE. `event-actions.ts` logs a `gbp-*` activity entry on a successful approval-write; the feed shows them (lights up once Google Business is live).

---

## Known issues / TODO

- **[MEDIUM][bug] GA4 cache can pin an 'unavailable' result indefinitely** when
  `status:ok` is cached with zeroed data (`src/lib/analytics.ts:297-382`). A client
  whose GA4 property was misconfigured and then fixed may continue seeing zeroes until
  the cache TTL expires (up to 15 min). If numbers don't update, flush the
  `analytics:ga4:{tenant}:*` Redis keys and wait for the next cache fill.
- **[MEDIUM][bug] Booking list 'today' filter uses UTC instead of tenant timezone**
  (`src/app/api/booking/list/route.ts:21`). Affects any tenant not in UTC — Today's
  booking counts may be wrong by up to the timezone offset hours. Fix: use
  `zonedTodayIso` for the filter boundary.
- ~~**[MEDIUM][tech-debt] `database.types.ts` is stale.**~~ **FIXED 2026-07-30.** Regenerated from the live schema; `billing_type` and `account_id` are now in the generated Row types. Re-run `supabase gen types typescript --project-id <id> > src/lib/db/database.types.ts` after any future migration.
- **[MEDIUM][bug] `poll-google-reviews` cron does not paginate** (`src/app/api/cron/poll-google-reviews/route.ts:116`).
  Reviews beyond the first API page are never ingested. High-volume review clients
  will have incomplete review data until pagination is added.

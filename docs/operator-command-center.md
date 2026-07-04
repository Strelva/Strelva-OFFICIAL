# Operator Command Center

A concise map of the operator (Jacob + Noah) surfaces — where they live, what they
read/write, and the Redis keys behind them. This is the control-plane's internal
console, not anything a client sees. Everything here is **super-admin only**.

## Host + routing

The whole console is served under the `/admin` path but reached on the **bare admin
host** `admin.strelva.com` (and `admin.localhost[:port]` in dev). `src/proxy.ts`
rewrites the bare admin host root onto the `/admin` path:

- `isBareAdminHost(host)` — true only for the bare `admin.<root>` subdomain, where
  `<root>` is `.strelva.com` / `.localhost`. **NOT** `admin.<tenant>.strelva.com` —
  that is a client's own admin dashboard, handled by the tenant-resolution flow.
- `shouldRewriteBareAdminConsole(host, pathname)` — rewrites everything except
  already-`/admin` paths and the `/api`, `/_next`, `/auth` passthroughs.
- The rewrite is gated on super-admin; non-admins are redirected to the app-host
  `/sign-in` (a different host, so it can't re-enter the rewrite). The `/admin`
  layout re-checks `isSuperAdmin` as defense in depth.

Nav lives in `src/app/admin/NavLinks.tsx`.

## Surfaces

### "Needs you" overview — `/admin`
`src/app/admin/page.tsx` + `src/app/admin/TodayFeed.tsx`. The operator's landing
page. `TodayFeed` leads with the work waiting on Jacob, ahead of any financial
number: **new leads** (unworked delivery leads), **approvals** (pending drafts +
maintenance digests), **at-risk** tenants (from the churn signal), and **recent
signups** (last 7 days). MRR and the tenant table render below it.

### Operator CRM — `/admin/clients`
`src/app/admin/clients/page.tsx` + `ClientsCrm.tsx`, backed by
`src/lib/tenant-crm.ts`. A lightweight per-tenant client record:

- **stage** — pipeline: `lead` / `building` / `live` / `at_risk` / `churned`
- **tags** — free-form, deduped, capped
- **notes** — append-only log (author + timestamp)
- **contacts** — name / email / phone / role
- **activity** — timeline of `call` / `email` / `meeting` / `note` entries

Stored as one JSON blob per tenant in Redis (`crm:{tenantId}`), matching how leads
and pay-links persist — no DB migration, since this is internal operator metadata
for a handful of clients. Degrades to a default empty record without Redis.

CRUD: `GET/POST /api/admin/tenants/[id]/crm` (super-admin, audit-logged via
`logAuditEvent`). The page reads every tenant's record in one shot via
`getAllTenantCrm`.

### Search + Analytics — `/admin/analytics`
`src/app/admin/analytics/page.tsx` + `AnalyticsView.tsx`, backed by
`src/lib/analytics.ts`. Per-client **Search Console** + **GA4** performance
(clicks / impressions / CTR / position + top queries; users / sessions / pageviews +
top pages / sources).

- Per-tenant config (which GSC property + GA4 property id to read) in Redis at
  `analytics:cfg:{tenantId}`; the GSC property defaults to `sc-domain:<host>`
  derived from the tenant's `siteUrl` when unset.
- **Auth is OAuth-first, service-account-fallback.** Each read tries the tenant's
  own Google connection when they granted the matching read scope
  (`getGoogleScopeGrants` / `getGoogleAccessToken`, `src/lib/google-token.ts`),
  else falls back to the shared Strelva reporting service account (JWT signer +
  credential reused from `search-console.ts`). Service-account fallback requires
  that account to be added as a user on each client's GSC + GA4 property; the OAuth
  path needs no such grant.
- Reads are fail-soft: every read returns a status (`ok` / `unconfigured` /
  `unavailable`) and never throws.
- Config write: `POST /api/admin/tenants/[id]/analytics-config` (super-admin,
  audit-logged).

## Operator vs client email

Two independent switches in `src/lib/email-enabled.ts`:

- `emailSendingEnabled()` / `emailSendingPaused()` — the **client** kill-switch. All
  customer/prospect mail (weekly report, invites, lifecycle) is OFF unless
  `EMAIL_SENDING_ENABLED="true"`. Currently paused in prod during the test-tenant
  phase.
- `operatorEmailsEnabled()` — the **operator** switch. Notifications to Jacob + Noah
  (new-signup + payment-failed from the billing webhook, lead intake) **default ON**
  and are silenced only by an explicit `OPERATOR_EMAILS_ENABLED="false"`, so the
  founders stay alerted even while client mail is paused.

Client lifecycle emails (`sendWelcomeEmail` / `sendSiteLiveEmail` /
`sendReviewRequestEmail` in `src/lib/delivery-email.ts`) sit behind the client
`emailSendingPaused()` gate. These send functions exist but are not yet wired to a
live trigger surface.

## At-risk / churn signal

`src/lib/churn.ts` feeds the "at risk" column of the "Needs you" dashboard. The
`daily-summary` cron calls `recordDailyEngagement` to persist each tenant's daily
owner agent-engagement count into a 7-day rolling store; the module composes that
with inactivity (>21 days no owner activity) and subscription status into a single
verdict (`getTenantAtRisk` / `getAtRiskTenants`).

## Report cadence

`src/lib/report-cadence.ts` decides WHEN the `weekly-report` cron emails a tenant
(not what's in it). Tiers aren't a code signal, so cadence is a per-tenant Redis
override defaulting to `monthly`; an operator flips a high-touch client to `weekly`.
The cron gates each send on `isReportDue` and records `markReportSent`.

## Redis keys

| Key | Written by | Purpose |
|-----|-----------|---------|
| `crm:{tenantId}` | `src/lib/tenant-crm.ts` | Operator CRM record (stage, tags, notes, contacts, activity) |
| `reb:engagement:{tenantId}:{day}` | `daily-summary` cron → `src/lib/churn.ts` | Daily owner agent-engagement count (7-day rolling, ~10-day TTL) |
| `reb:report-cadence:{tenant}` | operator override | Per-tenant report cadence (`weekly` / `monthly`) |
| `reb:report-sent:{tenant}` | `weekly-report` cron | Last report-sent timestamp (cadence throttle) |
| `analytics:cfg:{tenantId}` | `src/lib/analytics.ts` | Per-tenant GSC property + GA4 property id |

(`reb:` is the frozen wire/persistent-data prefix — see AGENTS.md. `crm:` and
`analytics:cfg:` are new operator-only keys.)

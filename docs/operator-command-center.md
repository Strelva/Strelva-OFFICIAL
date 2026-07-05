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

Nav (`src/app/admin/NavLinks.tsx`) is grouped to **five primary links** — Overview,
Clients, Leads, Analytics, Ops — plus a **"More"** dropdown for the operator-technical
surfaces (Onboard, Pay Links, Maintenance, Drafts, Audit), so the top bar stays scannable.

## Consolidation (one list, one detail)

The console used to spread clients across **four** lists. That collapsed to **one client
list** (`/admin/clients`) + **one detail page** (`/admin/clients/[id]`). The old routes stay
only as thin redirects so bookmarks resolve:

- `/admin/tenants` → `redirect("/admin/clients")`
- `/admin/tenants/[id]` → `redirect("/admin/clients/{id}")`

The Overview no longer renders a client table at all — it's pure triage.

## Surfaces

### "Needs you" overview — `/admin`
`src/app/admin/page.tsx` + `src/app/admin/TodayFeed.tsx`. The operator's landing
page. `TodayFeed` leads with the work waiting on Jacob, ahead of any financial
number: **new leads** (unworked delivery leads), **approvals** (pending drafts +
maintenance digests), **at-risk** tenants (from the churn signal), and **recent
signups** (last 7 days). Portfolio attention flags fold into the same feed. Below the
feed: a single **"View all clients"** link into `/admin/clients`, the portfolio
roll-up StatTiles (Active / Collected / MRR / Drafts / Custom repos), a one-line
launch-readiness summary, and **Mission Control** demoted to a collapsed
ask-the-portfolio console. There is no tenant table.

### Operator CRM — client list — `/admin/clients`
`src/app/admin/clients/page.tsx` + `ClientsCrm.tsx`, backed by
`src/lib/tenant-crm.ts`. The single list for everyone we manage a site for — calm
rows that link to the detail page (`/admin/clients/[id]`). Each row carries the CRM
record plus the health signals that used to live in the Overview table (SEO grade,
launch %, at-risk reason), filterable/sortable by stage, tag, active, and at-risk.

The per-tenant CRM record:

- **stage** — pipeline: `lead` / `building` / `live` / `at_risk` / `churned`
- **tags** — free-form, deduped, capped
- **notes** — append-only log (author + timestamp)
- **contacts** — name / email / phone / role
- **activity** — timeline of `call` / `email` / `meeting` / `note` entries

Stored as one JSON blob per tenant in Redis (`crm:{tenantId}`), matching how leads
and pay-links persist — no DB migration, since this is internal operator metadata
for a handful of clients. Degrades to a default empty record without Redis.

CRUD: `GET/POST /api/admin/tenants/[id]/crm` (super-admin, audit-logged via
`logAuditEvent`). The list reads every tenant's record in one shot via
`getAllTenantCrm`.

### Client detail (merged cockpit) — `/admin/clients/[id]`
`src/app/admin/clients/[id]/page.tsx`. The one place to work a single client —
everything that used to be a separate tenant page now stacks here in one scroll:

- **KPI pulse** — visits/wk, booking clicks/wk, drafts waiting, last activity.
- **Site health** — `SiteScan` (grade/score/history + admin-only prioritized "fix
  first" issues), reading the shared `scan-store`.
- **Reviews** — `ReviewIntelPanel` (admin review intelligence: sentiment + urgent
  needs-a-reply queue), from `getAdminReviewIntelligence`.
- **Visibility** — `VisibilityPanel` (AI-visibility snapshot diagnosis + diff).
- **Domains** — `DomainManager` (domain claims for the tenant).
- **Tenant config** — `TenantEditor` (name, owner, domains, subscription, plan
  override, revalidation).
- **CRM** — `ClientCrmSections` (contacts / activity / notes for this tenant) +
  a recent-activity feed.

Header actions: invite owner, open the client dashboard, open the live site.

### Leads — `/admin/leads`
`src/app/admin/leads/page.tsx` + `LeadRows.tsx`, backed by
`src/lib/lead-workflow.ts`. The marketing-site leads (contact / discovery /
get-started submissions), newest first. Each lead gets an operator **workflow
status** — `new` / `contacted` / `converted` / `dismissed` — layered on top of the
lead record and keyed by its stable `statusToken` (Redis `lead-workflow:{token}`,
same read-modify-write blob pattern as the CRM; degrades to `new` without Redis).
The "unworked leads" count on the Overview reads this (`deliveryStatus === "received"`
and workflow status still `new`).

### Search + Analytics — `/admin/analytics`
`src/app/admin/analytics/page.tsx` + `AnalyticsView.tsx`, backed by
`src/lib/analytics.ts`. Per-client **Search Console** + **GA4** performance
(clicks / impressions / CTR / position + top queries; users / sessions / pageviews +
top pages / sources).

- Per-tenant config (which GSC property + GA4 property id to read) in Redis at
  `analytics:cfg:{tenantId}`; the GSC property defaults to `sc-domain:<host>`
  derived from the tenant's `siteUrl` when unset.
- **Auto-setup because we host.** Provisioning (`src/lib/provisioning.ts`) best-effort
  writes `analytics:cfg` at provision time with the siteUrl-derived GSC property, so a
  tenant has stored config from day one. GA4 auto-wires on the hosted site via the
  fail-silent `custom-repo-starter/ScaffoldGA4.tsx` tag (loads gtag.js only when
  `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is set) — the operator just sets the one env var.
  `registerHostedSiteWithSearchConsole` (`analytics.ts`) is GATED-OFF groundwork: never
  auto-invoked, no-ops unless `opts.allow === true`, and writes no verification token so it
  cannot fabricate a verified state. The supported grant path stays the manual "add the
  reporting service account as a GSC/GA4 user" step provisioning surfaces.
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

**Owner alert emails (client email, but wired to live triggers).** Two owner-facing
alerts, both behind the client `emailSendingPaused()` gate, deduped once per event
with a persistent NX marker that rolls back on suppression/failure (so a paused alert
reaches the owner the day client email is switched on):

- `sendReviewNeedsReplyEmail` — a genuinely-new review. Fired from the
  `poll-google-reviews` + `poll-yelp` crons via `maybeAlertNewReview`
  (`src/lib/review-alert.ts`, `reb:review-alert-sent:*`). The email carries the
  one-click **Approve / Not yet** links.
- `sendHealthRegressionEmail` — the site-health grade slipped. Fired from the
  `portfolio-scan` cron on a grade drop (`reb:health-alert-sent:{tenant}:{prev}>{cur}`).

**One-click approve-from-email — `GET /api/approve`** (`src/app/api/approve/route.ts`
+ `src/lib/approve-link.ts`). The review alert's Approve / Not yet links let the owner
resolve a pending review-reply without signing in. Each link is an HMAC-signed token
binding `{eventId, tenantId, action}` + a 14-day expiry (secret reuses the oauth-state
chain). Public route (token is the only auth), tenant-scoped twice (token binds tenant
+ `resolveEventAction` rejects `wrong_tenant`), idempotent (replay → "already handled"),
and resolves through the SAME governance spine as the dashboard — approve → "approved"
(performs the external write), not-yet → "dismissed".

**Order-triggered review requests — `order-review-request` cron**
(`src/app/api/cron/order-review-request/route.ts`). A few days after a storefront order
lands, emails the owner their Google review link (`sendReviewRequestEmail`) to forward
to the customer. Skips any tenant with no `reviewsConfig.googlePlaceId` (never invents a
link), respects the client email pause, dedupes per order
(`reb:order-review-request-sent:*`, rolled back on failure).

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
| `analytics:cfg:{tenantId}` | `src/lib/analytics.ts` (+ provision-time in `provisioning.ts`) | Per-tenant GSC property + GA4 property id |
| `reb:review-alert-sent:{tenantId}:{reviewId}` | `poll-google-reviews` / `poll-yelp` crons → `src/lib/review-alert.ts` | Dedup marker for the review-needs-reply owner alert (rolled back on suppress/fail) |
| `reb:health-alert-sent:{tenantId}:{prev}>{cur}` | `portfolio-scan` cron | Dedup marker for the health-regression owner alert (per grade transition) |
| `reb:order-review-request-sent:{tenantId}:{orderId}` | `order-review-request` cron | Dedup marker for the order-triggered review request (rolled back on suppress/fail) |

(`reb:` is the frozen wire/persistent-data prefix — see AGENTS.md. `crm:` and
`analytics:cfg:` are new operator-only keys.)

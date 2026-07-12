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

Nav is a **left rail** (`src/app/admin/AdminRail.tsx`) grouped by purpose — **Overview**,
then **Clients** (Clients / Leads / Onboard / Pay links / Analytics), **Review** (Actions /
Drafts / Maintenance), and **System** (Ops / Audit). Every tool is one click and always
visible; there is no "More" dropdown (the old `NavLinks.tsx` is gone). On a phone the rail
is hidden and `AdminMobileNav.tsx` gives a top-bar + slide-in drawer with the same nav. All
`/admin` surfaces share the design system in `src/app/admin/console.tsx`
(`Panel`/`Vital`/`Meter`/`Grade`/`ClientLogo`, verdict-first, sage + 3 status hues).

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
ask-the-portfolio console. There is no tenant table. When any client has a pending
approval the feed shows a **"Clear portfolio →"** link + count into `/admin/actions`.

### Portfolio actions — `/admin/actions`
`src/app/admin/actions/` — the operator's single "clear the whole portfolio" screen for
one operator managing many sites. Two stacked layers, both governed:

1. **Proactive "Ready to work"** (`portfolio-opportunities.ts` + `PortfolioOpportunitiesClient.tsx`).
   Scans every active client for latent, **not-yet-drafted** work, grouped by kind:
   - **unreplied reviews** — reviews with no owner reply (`getReviews`),
   - **sites gone quiet** — no owner AI activity for 30+ days (`getOwnerRetentionSignals`),
   - **health slipping** — a D/F site-health grade (`getScanSummaries` from `scan-store`).

   Each group's one-click **"Draft these"** fans the selected clients through an EXISTING
   governed draft path — `draftReviewReply` → a pending `review_reply_draft` event for
   reviews; `generateProactiveSuggestions` → pending suggestion cards for stale / low-health
   — so every draft lands PENDING for approval, **nothing is published**. Idempotent: skips a
   review that already has a pending draft; `generateProactiveSuggestions` never floods on a
   re-click. Per-tenant isolated (one client failing degrades that client, not the pass).

2. **Pending approvals** (`portfolio-actions.ts` + `PortfolioActionsClient.tsx`). Every
   PENDING approvable event across all active clients (content updates, GBP post/hours drafts,
   review-reply drafts, newsletter drafts — custom-build change requests and raw signal events
   are excluded), grouped by client, busiest client first. Bulk-approve resolves each item
   through the SAME governed spine as the dashboard (`bulkResolvePortfolioActions` →
   `resolveEventAction`), sequentially so concurrent external writes don't stampede an
   integration. **Honest partial failure**: a write that fails comes back `changed:false` with
   the reason and the item stays pending — never silently marked done.

Both reads degrade to empty (a backend blip can't 500 the overview). The server actions
(`actions.ts`) **re-verify super-admin independently** — the `/admin` layout gate does NOT
protect a server action's POST surface — then call the draft dispatcher / bulk resolver.

### Approval diffs (what you're approving)
`src/components/dashboard/QueuePage.tsx` (`QueueEventDetail`). A pending event now renders,
under its approve/skip card, the actual change it publishes — not just the title's label — so
an approver (especially one bulk-approving) sees the real thing:

- **content update** → a field-level before→after diff (`metadata.diffs`, from `generatePreviewDiffs`),
- **`gbp_post_draft`** → the drafted post text + CTA link ("What will be posted to Google"),
- **`gbp_hours_draft`** → the proposed hours in 12h format ("New hours for Google"; no invented
  before-column — the event only carries the proposed hours).

Read-only (the approve/skip actions are untouched). The same component backs the client Today
queue, so this renders on both the client side and any operator surface that shows the queue.

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

**Custom-repo capability manifest.** For a custom-repo tenant, the operator points
the tenant at the manifest its LIVE site publishes (the sections the AI is allowed
to edit) by setting `customRepo.capabilityManifestUrl` via
**`POST /api/admin/tenants/[id]/capability-manifest`** (body
`{ capabilityManifestUrl: string | null }`; super-admin, audit-logged). This is
now settable/updatable/clearable on EXISTING tenants — it was previously write-once
at tenant-create, so pre-existing tenants (gldf, rohlax) predate the field. A
non-empty value must be a public https URL that passes the same SSRF guard as the
control-plane fetch; the value merges into the `customRepo` blob (other fields
untouched) and null/`""` clears it. Once set, the control plane fetches + merges
the remote manifest so the agent edits the sections the live site actually renders.
See `docs/custom-repo-delivery-model.md`.

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
`emailSendingPaused()` gate. An operator triggers one for a specific client via
**`POST /api/admin/tenants/[id]/lifecycle-email`** (`type: "welcome" | "site-live" |
"review-request"`; super-admin, audit-logged). Contact + URLs resolve from the trusted
tenant config, never request input. A `false` return means either "paused" or "send
failed", so when a send returns false AND client email is paused the route returns
`200 { sent: false, paused: true }` — the UI reads it as an off-switch, not an error.

**CRM comms auto-log.** Every real send passes its `tenantId` to the sender, which logs
an `email` activity into the operator CRM timeline (`src/lib/tenant-crm.ts`
`addTenantActivity`, via `logSentEmailToCrm` in `delivery-email.ts`). It's a no-op when no
`tenantId` is passed and fail-soft (a CRM-log failure never breaks the send), and it fires
**only after a send actually goes out** — every sender returns early when paused or missing
a key, so a suppressed send is never recorded as sent. Wired from the lifecycle-email route
plus the review-alert, order-review-request, review-nudge, and portfolio-scan send sites.

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

# Client Dashboard IA

The information architecture of the owner-facing dashboard (`admin.{client-domain}` →
`/dashboard/*`). This is what a paying client sees. The operator console is a separate
surface — see [`operator-command-center.md`](./operator-command-center.md).

The IA cleanup is scoped in `dashboard-ia-scope-2026-06-28.md`; this doc is the current,
verified shape.

## The eight surfaces

The nav is a **conditional** surface set, not a fixed list. Seven surfaces are resolved by
`getDashboardSurfaces(tenant)` in `src/lib/dashboard-surfaces.ts`; the eighth, **Settings**,
is the always-present gear in the identity footer (not part of the resolver list).

| Surface | Route | Group | Shown when |
|---------|-------|-------|-----------|
| **Today** | `/dashboard` | manage | always |
| **Ask Strelva** | `/dashboard/chat` | manage | always |
| **Website** | `/dashboard/site` | presence | always (Store folds in as a sub-tab) |
| **Google Business** | `/dashboard/google` | presence | local/hybrid business type |
| **Analytics** | `/dashboard/analytics` | presence | always (LIVE/rolling; range selector + Health) |
| **Reports** | `/dashboard/reports` | presence | always (the written weekly + monthly recaps) |
| **Reviews** | `/dashboard/reviews` | presence | has a review source, or local (as a connect tab) |
| **Settings** | `/dashboard/settings` | footer | always |

Group labels come from `GROUP_LABELS` in `src/components/dashboard/surface-nav.ts`:
`manage` = "Manage", `presence` = "Your presence".

### Consolidations (what merged into what)

- **Analytics = LIVE/rolling + Health; Reports = the written recaps (split out 2026-07-11).**
  Analytics is now the live surface: a range selector (`Live · This week · This month · Custom`
  → `AnalyticsRangeSelector` → `?range=`) drives the headline verdict, tiles, and trend chart,
  all recomputed for the window from the daily metric series via `src/lib/analytics/period.ts`
  (`resolveRange` + `computePeriodStats` + `periodHeadline`), so the headline can never
  contradict the chart or anomaly. `AnalyticsLiveView` + `SiteHealthCard` in one scroll. The
  **written recaps moved to their own Reports surface** (`/dashboard/reports`, `WeeklyBriefClient`
  with a Weekly/Monthly toggle): the weekly brief + a monthly recap (`generateMonthlyRecap` +
  the `monthly-report` cron, stored period-tagged in the same recap store). `SURFACE_MATCH`
  lights **Analytics** for `/dashboard/analytics` + `/dashboard/health`, and **Reports** for
  `/dashboard/reports`. Analytics also carries the
  **90-day "prove it" milestone** (`MilestonePanel.tsx` + `src/lib/milestone.ts`, a stored-
  history then→now recap of traffic / reviews / rating / health, with a "building" state until
  there's enough history — the "then" site-health value compares against a durable, set-once,
  NO-TTL day-0 anchor (`saveScanBaseline` / `getScanBaseline` in `src/lib/scan-store.ts`, Redis
  key `reb:scan:baseline:{tenant}`), captured by `scanTenant` and seeded from the earliest
  retained point. It previously used the earliest point in the 12-point / 30-day scan-history
  ring buffer, which only ever reached back ~12 days, so an aging client never got a true 90-day
  health delta; the honest "tracking since {date}" still shows when there's no real earlier
  baseline) and the **AI-visibility scorecard** "You in AI answers"
  (`AiVisibilityScorecard.tsx` + `src/lib/ai-visibility-scorecard.ts`, built off the weekly
  visibility snapshot — probed answers only, never shames a gap). Both are honesty-railed:
  no fabricated baselines, only genuinely positive moves become headline copy. It also carries
  the **"Where your visitors come from" GA4 traffic panel** (`TrafficSourcesPanel.tsx`, rendered
  in `WeeklyBriefClient`'s `footerSlot`): top sources + landing pages from `getGa4Perf`
  (`src/lib/analytics.ts`), with a Connect-Google state when GA4 is unconfigured and a quiet
  "coming soon" when configured-but-empty — never an API error.
- **Store folds INTO Website.** Store is no longer a top-level tab. Website is the spine;
  Store appears as a sub-tab only when the tenant runs a storefront (`getWebsiteSections`
  returns a `store` section when `tenantHasStore` is true). A plain site shows no sub-nav
  strip (fewer than two sections → the caller hides it). `SURFACE_MATCH["website"]` covers
  `/dashboard/site`, `/collections`, `/content`, `/assets`, `/history`, `/store`.
- **Leads folded into Today.** No standalone Leads tab — inbound form submissions surface as
  "Who reached out" on Today.
- **Calls count as customer actions.** The tracker's `phone-click` beacon (tel: taps) folds into
  the "Customer actions" total on both Today and Analytics — honest "booked or called" copy — via
  an optional `phoneClicks` on `WeeklyBriefStats`. The booking-specific `bookingClicks` field is
  kept intact for `proof.ts` / `goals.ts`.
- **Reviews reputation header.** The Reviews surface leads with a verdict-first reputation summary
  (`ReputationHeader.tsx` + `src/lib/reviews/reputation.ts` `buildReputationSummary`): rating +
  response rate + review velocity + praise themes, built ONLY on the client-safe
  `getClientReviewSummary` (no admin intelligence). A low response rate reads as an opportunity
  ("reply to N waiting"), few reviews as "let's get more" — never shame. Plus a **"get more
  reviews" share action** (`ReviewsPanel.tsx`): a copyable Google review link from
  `reviewsConfig.googlePlaceId` (`buildGoogleReviewLink`) + a paste-ready share message, with an
  honest "connect your Google listing" state when there's no Place ID. A competitor star-rating
  benchmark was deliberately NOT built — no real local-average data exists, so it was omitted
  rather than fabricated.
- **"What Strelva did for you" activity feed on Today** (`ActivityFeed.tsx` +
  `src/lib/activity-feed.ts`). An owner-facing, past-tense timeline of the managed
  done-for-you work — the anti-churn proof surface. `selectStrelvaWork` scopes it to
  `actor:"ai"` + `actor:"admin"` (the team's work; from the client's side there's no
  AI-vs-human line) + posted review replies (`type:"review-reply"`) + published Google
  Business actions (`type` `gbp-post` / `gbp-hours` / `gbp-photo`), and **excludes the
  owner's own manual edits**. Only genuinely-live work shows (pending drafts and
  "dashboard only" reply drafts are skipped); honest empty state. GBP posts/hours/photos
  now appear once published — the previous "GBP posts aren't in the feed yet" gap is closed
  (`event-actions.ts` logs a `gbp-*` activity entry on a successful approval-write).
- **The assistant is "Strelva".** The chat tab is **"Ask Strelva"**, not "Ask AI". The agent
  refers to itself as Strelva — persona is set in the system prompt in
  `src/app/api/agent/route.ts` ("You are Strelva, the assistant that manages the website
  for …").

## The resolver: `getDashboardSurfaces`

`src/lib/dashboard-surfaces.ts`. Computed **server-side** in the dashboard layout and passed
to the nav via `DashboardSurfacesContext` — no client fetch, no flash. Consumed by
`HistorySidebar.tsx` (desktop sidebar) and `MobileNav.tsx` (phone bottom bar).

### Presence profile drives the local-only surfaces

`getPresenceProfile(tenantConfig)` returns `local | online | hybrid`:

- The owner's own answer wins: `settings.businessModel` (`"local"` / `"online"` / `"hybrid"`),
  set on day one by the first-run checklist ("Tell us how customers find you").
- `""` or unrecognized → infer from template: `food-brand` / `fashion-stylist` → `online`;
  `wellness` / `restaurant` / `trades` / `professional` → `local`; unknown → `local` (the ICP
  is overwhelmingly local; the cost of a wrong guess is an ignorable "connect Google
  Business" nudge, not a broken tab).

An online-only brand never sees Google Business, and never sees Reviews unless a review
source is configured — no local-SEO framing it can't use.

### Three surface states

Each resolved surface carries a `state` (`SurfaceState`):

- **`shown`** — connected/applicable; render as a normal tab.
- **`connect`** — applicable to this business but nothing wired yet; render a muted
  "connect to unlock" tab that lands on the surface's own connect pitch.
- **`hidden`** — not applicable to this business type; omitted entirely (`getVisibleSurfaces`
  drops these).

State rules per surface:

| Surface | shown | connect | hidden |
|---------|-------|---------|--------|
| Today, Ask Strelva, Website, Analytics, Reports | always | — | — |
| Google Business | local + Google connected | local, not connected | not local |
| Reviews | has review source | local, no review source | not local, no review source |

"Has a review source" = a configured `reviewsConfig.googlePlaceId` / `yelpBusinessId`, or a
connected Google (GBP) / Yelp account (`hasReviewsSource`).

### Mobile

`MobileNav.tsx` shows up to five `shown` surfaces on the bottom bar, ranked by a keep-priority
order, and surfaces the approval-queue badge on the phone.

## Design-system contract

The dashboard is one restrained dark product UI on a single sage color system. Token
definitions live in `src/app/globals.css` (the `[data-dashboard]` block) and are documented
in [`../DESIGN.md`](../DESIGN.md); the contract the IA depends on:

- **One sage color system.** `--accent = oklch(73% 0.07 145)` (brand sage; buttons, links,
  focus). `--success = oklch(72% 0.095 145)` — sage-family "go", deliberately **not** emerald,
  kept on-hue AND near the accent's low chroma so success reads as the same muted-sage family
  (it was 0.14 and read as a clashing saturated green on the health bars — dropped to 0.095).
- **One semantic status set** (the only status hues allowed): `--positive` (= `--success`),
  `--warning` (one amber, `#ca8a04`), `--critical` (one red, `--terra`), `--neutral` (gray).
  No off-brand blue/gold; do not add a fourth hue.
- **Type scale** (one hierarchy, display face dominates): page H1 `text-[28px] sm:text-[32px]
  font-medium`; section H2 `text-[15px] font-medium` (never out-weights H1); eyebrow
  `text-[11px] uppercase tracking-[0.14em]`; body 14px, meta 12px, **11px floor** (no 9/10px).
- **One primary button.** `bg-accent` paired with `text-on-accent` (dark green ink — white
  fails WCAG AA on the light sage accent, ~2:1; the ink clears AA at ~9:1). Secondary =
  glass/outline.
- **One content width.** `max-w-5xl` for content columns; full-width panels opt out.
- **One shared metric primitive.** `src/components/dashboard/StatTile.tsx` — the single stat
  tile (one padding, one 28px number, one eyebrow) rendered by both Today's stat grid and the
  weekly brief. Its `icon` prop is a **rendered `ReactNode` element** (`<Users className=… />`),
  **not** a component reference — server pages render this tile, and component functions can't
  cross the server→client boundary; elements can.

## Identity footer

Founder-feedback split (see `AGENTS.md` "What The Client Sees"): top-left = the **business**
(logo + name + domain); bottom-left = the **signed-in person** ("Hello, {name}", login
identity, Admin badge + "view as client" toggle for super-admins). Settings separates
**Account** (read-only login identity) from **Business info** (the editable business fields,
including the `businessModel` that drives the presence resolver).

## Settings structure

`src/app/dashboard/settings/page.tsx` is consolidated to **4 top-level sections**:
**Business · Account · Domains · Plan**. The previously-thin business/site sections
(Business info, Branding, Site config, Connected services, Shortcuts) **plus Ownership** now
render as labeled in-page bands stacked inside **Business** (`BUSINESS_SECTION_META` →
anchors `profile` / `branding` / `site-config` / `dependencies` / `utilities` / `ownership`).
`LEGACY_HASH_TO_SECTION` maps old settings hashes (deep links from `proxy.ts`, onboarding, the
ownership redirect) onto the new sections — a Business sub-hash resolves to the Business group
then scrolls to its anchor; `#billing` → Plan — so every existing link still lands.
**Account** is read-only login identity; **Business info** (the `profile` band) holds the
editable business fields including the `businessModel` that drives the presence resolver.

## Known issues / TODO

**[MEDIUM] `/dashboard/ownership` redirect ignores `clientFallbackRoot`** (`src/app/dashboard/ownership/page.tsx:4`): the ownership page redirects unconditionally rather than using the `clientFallbackRoot` helper. Clients who have a custom root may be sent to a wrong landing page.

**[MEDIUM] `BrandSection` and `NavigationFooterSection` ignore `readOnly` in demo mode** (`src/app/dashboard/settings/page.tsx:414,717`): these two settings sections allow editing even when `readOnly` is true (i.e. when a super-admin is inspecting a demo tenant). The other settings sections respect `readOnly` correctly.

**[MEDIUM] Google OAuth callback stores connection without re-verifying caller session** (`src/app/api/oauth/google/callback/route.ts:93`): the GET handler calls `saveConnection` before verifying the authenticated session and tenant access. A forged state parameter that passes the HMAC check could write a connection for an arbitrary tenant. Fix: call `verifyAuth()` + `requireTenantAccess(tenantId)` at the start of the callback handler, before writing.

**[MEDIUM] Google review poll does not paginate** (`src/app/api/cron/poll-google-reviews/route.ts:116`): only the first page of reviews from the Google API is ingested. Reviews beyond the first page are never stored and never trigger reply drafts or alerts.

**[MEDIUM] `PATCH /api/reviews` bypasses GBP publish path** (`src/app/api/reviews/route.ts:73`): patching a review directly (e.g. to mark it read) permanently suppresses the auto-reply backlog for that Google review rather than routing through the governed `resolveEventAction` path.

**[MEDIUM] `maxAdvanceBooking` config field is never enforced at booking creation** (`src/lib/booking.ts:17`): the field exists in the schema and config store but booking creation does not validate against it, so clients can create bookings beyond the configured advance limit.

**[MEDIUM] Booking list `today` filter uses UTC instead of tenant timezone** (`src/app/api/booking/list/route.ts:21`): the "today" date window is derived from UTC, not the tenant's configured timezone. For tenants in UTC-offset zones, "today" can show the wrong set of bookings.

**[MEDIUM] Approve-link POST route has no rate limiting** (`src/app/api/approve/route.ts:149`): the one-click email approve/not-yet endpoint has no rate limit. An attacker with a valid token (14-day expiry) could hammer it without restriction.

**[MEDIUM] `contact.email` schema default is empty string but field requires a valid email** (`src/lib/schemas.ts:181`, `src/lib/defaults.ts:76`): the default is `""` which fails the email validator. A PUT request on first use will fail validation unless the owner has set their contact email.

# Client Dashboard IA

The information architecture of the owner-facing dashboard (`admin.{client-domain}` →
`/dashboard/*`). This is what a paying client sees. The operator console is a separate
surface — see [`operator-command-center.md`](./operator-command-center.md).

The IA cleanup is scoped in `dashboard-ia-scope-2026-06-28.md`; this doc is the current,
verified shape.

## The seven surfaces

The nav is a **conditional** surface set, not a fixed list. Six surfaces are resolved by
`getDashboardSurfaces(tenant)` in `src/lib/dashboard-surfaces.ts`; the seventh, **Settings**,
is the always-present gear in the identity footer (not part of the resolver list).

| Surface | Route | Group | Shown when |
|---------|-------|-------|-----------|
| **Today** | `/dashboard` | manage | always |
| **Ask Strelva** | `/dashboard/chat` | manage | always |
| **Website** | `/dashboard/site` | presence | always (Store folds in as a sub-tab) |
| **Google Business** | `/dashboard/google` | presence | local/hybrid business type |
| **Analytics** | `/dashboard/analytics` | presence | always (merged Reports + Health) |
| **Reviews** | `/dashboard/reviews` | presence | has a review source, or local (as a connect tab) |
| **Settings** | `/dashboard/settings` | footer | always |

Group labels come from `GROUP_LABELS` in `src/components/dashboard/surface-nav.ts`:
`manage` = "Manage", `presence` = "Your presence".

### Consolidations (what merged into what)

- **Analytics = Reports + Health.** The old separate Reports and Health tabs are gone. One
  verdict-first surface: `WeeklyBriefClient` (the weekly report) + `SiteHealthCard` (the
  audit grade/score/detail) in one scroll. `SURFACE_MATCH["analytics"]` lights the tab for
  `/dashboard/analytics`, `/dashboard/reports`, and `/dashboard/health`. It also carries the
  **90-day "prove it" milestone** (`MilestonePanel.tsx` + `src/lib/milestone.ts`, a stored-
  history then→now recap of traffic / reviews / rating / health, with a "building" state until
  there's enough history) and the **AI-visibility scorecard** "You in AI answers"
  (`AiVisibilityScorecard.tsx` + `src/lib/ai-visibility-scorecard.ts`, built off the weekly
  visibility snapshot — probed answers only, never shames a gap). Both are honesty-railed:
  no fabricated baselines, only genuinely positive moves become headline copy.
- **Store folds INTO Website.** Store is no longer a top-level tab. Website is the spine;
  Store appears as a sub-tab only when the tenant runs a storefront (`getWebsiteSections`
  returns a `store` section when `tenantHasStore` is true). A plain site shows no sub-nav
  strip (fewer than two sections → the caller hides it). `SURFACE_MATCH["website"]` covers
  `/dashboard/site`, `/collections`, `/content`, `/assets`, `/history`, `/store`.
- **Leads folded into Today.** No standalone Leads tab — inbound form submissions surface as
  "Who reached out" on Today.
- **"What Strelva did for you" activity feed on Today** (`ActivityFeed.tsx` +
  `src/lib/activity-feed.ts`). An owner-facing, past-tense timeline of the managed
  done-for-you work — the anti-churn proof surface. `selectStrelvaWork` scopes it to
  `actor:"ai"` + `actor:"admin"` (the team's work; from the client's side there's no
  AI-vs-human line) + posted review replies (`type:"review-reply"`), and **excludes the
  owner's own manual edits**. Only genuinely-live work shows (pending drafts and
  "dashboard only" reply drafts are skipped); honest empty state. Known gap: GBP posts
  aren't in the feed yet.
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
| Today, Ask Strelva, Website, Analytics | always | — | — |
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
  focus). `--success = oklch(70% 0.14 145)` — sage-family "go", deliberately **not** emerald,
  kept on-hue so success and accent are one family.
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

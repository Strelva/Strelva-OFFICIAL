# Audit / Site-Health System

Strelva's audit/health system is one engine and one history store, shared across three surfaces: a free public lead-gen tool, the signed-in client's site-health card, and the super-admin portfolio overview. It scores any public URL 0-100 with a letter grade, breaks the score into eight weighted categories, attaches a plain-English "what this costs you" narrative to every issue, and persists a compact per-tenant summary + trend history.

This doc is the source of truth for that system. The older 6-category PageSpeed-centric design (web-vitals / seo / mobile / schema / ssl / a11y) it replaced is gone.

---

## Overview

- One scoring engine: `runAudit(url)` in `src/lib/audit/checks.ts`.
- One history store: `scan-store` (Redis) in `src/lib/scan-store.ts`, written only through `src/lib/scan.ts`.
- Eight categories. Six are pure single-fetch modules ported from the archived OWSH Systems product (`src/lib/audit/modules/*.ts`); two (Core Web Vitals, Mobile) come from a single optional Google PageSpeed call.
- Every failing/warning check carries an impact line + a conservative dollar/customer loss estimate (`src/lib/audit/impact.ts`).
- A `/guides` SEO blog (`src/lib/guides.ts`) repurposes the OWSH fix guides into articles that cross-link back to the audit categories they help fix.

The product framing: free scan = top of funnel (zero marginal cost, never a "free build"); the build is what gets sold. See `AGENTS.md` ("Do NOT Build" / the free-scan note).

---

## Architecture

### One engine

`runAudit(inputUrl)` (`src/lib/audit/checks.ts`) is the only audit engine. It:

1. Normalizes the URL (prepends `https://` when no scheme is given).
2. Runs SSRF protection (`validateUrlSafety`): rejects non-HTTP schemes, DNS-resolves the host forcing IPv4 (`family: 4`, closing the IPv6 SSRF bypass), and rejects private/reserved IP ranges via `isPrivateIP`.
3. Builds one shared `AuditContext` via `buildAuditContext`: a single homepage fetch (15s timeout, falls back HTTPS to HTTP) plus three well-known files fetched in parallel (`/robots.txt`, `/sitemap.xml`, `/llms.txt`). Any that miss come through as `null` so a module degrades a finding instead of throwing. After redirects it re-validates the final host against private IPs (DNS-rebinding guard).
4. Makes one optional Google PageSpeed Insights call (`fetchPageSpeedData`, 30s, mobile strategy, PERFORMANCE category only). The single response feeds both `checkWebVitals` and `checkMobile`.
5. Runs the six ported modules synchronously off the shared context, then assigns each category its weight from the central `WEIGHTS` map.
6. Calls `attachImpact` on every category to attach the impact narrative + fix priority.
7. Returns `CategoryResult[]`.

`runAudit` does not compute the overall score or persist anything; callers do. Types live in `src/lib/audit/types.ts` (`CheckResult`, `CategoryResult`, `AuditResult`, `LetterGrade`, `PageSpeedResult`).

### The AuditContext (`src/lib/audit/context.ts`)

The runner gathers everything once so each module stays pure (no module makes its own network call):

- `url` final URL after redirects (https-normalized)
- `html` raw homepage HTML
- `$` a cheerio handle parsed once and shared across modules
- `headers` homepage response headers (for the security-header checks)
- `robotsTxt`, `sitemapXml`, `llmsTxt` well-known file bodies, or `null`

### One store

`scan-store` (`src/lib/scan-store.ts`) is the single source of truth for per-tenant health history. It is Redis-backed (key prefix `reb:scan:`, 30-day TTL) and stores a compact record, not full per-check detail:

- `saveScanSummary` / `getScanSummary` / `getScanSummaries` the latest `ScanSummary` (overall grade/score + per-category scores) per tenant.
- `pushScanHistory` / `getScanHistory` a small ring buffer (max 12 points) of `{ scannedAt, overallScore, grade }` for trend lines / sparklines.

Nothing writes the store directly. Everything goes through `src/lib/scan.ts`:

- `scanTenant(tenantId)` resolves the tenant's live public URL, runs `runAudit`, computes the overall score + grade, persists the summary and a history point, and returns the full per-category detail (`ScanResult`) for the live UI.
- `scanAllTenants(concurrency = 6)` the portfolio version: scans every active tenant with a bounded worker pool (each scan is a ~35s external fetch + PageSpeed call, so a sequential loop would exhaust the cron budget), isolating per-tenant failures.

### The surfaces (one engine + store behind all of them)

| Surface | Entry point | Path through the system |
|---------|-------------|-------------------------|
| Free public audit | `POST /api/audit/scan` | `runAudit` directly (no tenant, no store); result cached 1h in Redis, rate-limited 3/day/IP |
| "Save as PDF" one-pager | `POST /api/audit/report` | pure transform of a caller-supplied `AuditResult` via `renderAuditReport` |
| Client site-health card | `GET /api/dashboard/site-audit` (+ `/history`) | `scanTenant` (writes scan-store), 24h cache; history reads `getScanHistory` |
| Admin per-tenant manual scan | `POST /api/admin/scan` | `scanTenant` (writes scan-store); also returns admin-only `prioritizedIssues` (`prioritizeIssues`) for the "Fix first" list |
| Admin portfolio overview | `src/app/admin/page.tsx` | reads `getScanSummary` + `getScanHistory` |
| Daily portfolio cron | `GET /api/cron/portfolio-scan` | `scanAllTenants` (writes scan-store for all tenants) |

The client `/dashboard/health` and the admin overview read the SAME scan-store data. See the consolidation invariant below.

---

## The modules

Eight categories. Weights are the central `WEIGHTS` map in `checks.ts` and sum to 1.0. The slug is what the module emits and what the weight map / impact map key on.

| Category | Slug | Weight | Source | What it checks |
|----------|------|--------|--------|----------------|
| AI Readability | `ai-readability` | 0.20 | `modules/ai-readability.ts` | The marquee "are you visible to AI search?" module. Structured-data present; business schema valid (per-type Google rich-result field validation); AI-answer content (FAQPage / HowTo / Article); entity authority (`sameAs` to Wikipedia/Wikidata/LinkedIn/etc.); plain-text readable by AI (SPA-shell / JS-render risk); single clear business name (cross-source ambiguity, placeholder "coming soon"); `llms.txt` present (the 2026 AI-agent signal, gentle warn when absent). |
| SEO Foundations | `seo` | 0.18 | `modules/seo-foundations.ts` | Crawl + index foundations: robots.txt present; crawlers allowed (no blanket `Disallow: /` for `*`/googlebot/bingbot/gptbot); XML sitemap present + valid; canonical tag; title tag (length-graded); meta description; H1 present + exactly one; server-rendered content (SPA shell with little server HTML warns). Schema is deliberately left to the AI-readability module. |
| Core Web Vitals | `web-vitals` | 0.15 | `checks.ts` (PageSpeed) | LCP, CLS, TBT, and the Lighthouse performance score, tiered good/needs-improvement/poor. |
| Security | `security` | 0.12 | `modules/security.ts` | HTTPS; weighted security response headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-XSS-Protection); no mixed content (active HTTP resources fail, passive warn); form security (HTTPS action + CSRF token presence); cookie-consent / GDPR notice. |
| Accessibility | `a11y` | 0.10 | `modules/accessibility.ts` | 13 WCAG 2.1 AA cheerio checks: document language, page title, image alt text, link text, form labels, heading structure, landmarks, skip-to-content link, button/control names, iframe titles, valid ARIA roles, data-table headers. |
| Mobile Responsiveness | `mobile` | 0.10 | `checks.ts` (PageSpeed) | Viewport meta, legible font sizes, tap-target sizing (from the same PageSpeed Lighthouse audits, no second API call). |
| Trust Signals | `trust` | 0.08 | `modules/trust.ts` | Secure connection; contact info visible (phone/address/hours); click-to-call; trust badges & credentials (BBB, licensed, insured, guarantees, awards, etc.); customer testimonials; privacy & terms pages; team/about transparency. |
| Content Quality | `content` | 0.07 | `modules/content.ts` | Main-content word count; heading structure; key pages linked (About/Services/Contact/Blog); readability (Flesch-Kincaid grade); internal links; image-alt coverage; organization with lists; clear calls to action. |

Notes:

- The six modules are pure: each takes the `AuditContext` and returns a `CategoryResult` with `weight: 0`; the runner overrides the weight from `WEIGHTS[slug]`. They make no network calls and were source-audited against the OWSH originals during a fidelity review.
- Several modules compute their category score with the OWSH module's own internal weighting (e.g. SEO's per-check raw weights, accessibility's severity model with a critical-issue cap at 60, trust's and content's /100 point models, AI-readability blending the OWSH AI-discovery score 50/50 with the flattened check average), falling back to a simple check average defensively. Individual `CheckResult` scores are always 0-100.
- PageSpeed is optional. When `GOOGLE_PAGESPEED_API_KEY` is unset (or the call fails), `checkWebVitals` and `checkMobile` return `weight: 0`, which excludes them from the overall grade (see scoring) rather than injecting a 50-point participation score. The other six categories run from the homepage fetch alone, so a URL-only run still grades honestly.

---

## Scoring + impact

### Overall score (`src/lib/audit/scoring.ts`)

`computeOverallScore` is a weighted average that redistributes proportionally when a category is excluded:

```
overallScore = round( sum(score * weight) / sum(weight) )
```

Because it divides by the sum of the weights actually present, a category emitted with `weight: 0` (an uninstrumented PageSpeed category) drops out cleanly and the remaining categories renormalize. `scoreToGrade`: 90+ A, 80+ B, 70+ C, 60+ D, else F. `averageCheckScores` is the shared helper modules use for check-average fallback.

### Impact narrative + quantified loss (`src/lib/audit/impact.ts`)

`attachImpact(category)` walks every non-passing check (informational "not measured / coming soon" placeholders are skipped) and attaches:

- `impact` a plain-English "what this costs you" line, matched by a keyword regex against the check name (`CHECK_IMPACT`), falling back to a per-category line (`CATEGORY_IMPACT`).
- `quantified` a conservative dollar/customer estimate (e.g. "~12 customers/mo" / "~$45/mo in conversions"), only for issue types where a figure is genuinely credible (`CHECK_QUANTIFIED`); otherwise omitted. Estimates use one generic, deliberately conservative single-profile metric set (`GENERIC_METRICS` = 500 monthly visitors, 3% conversion, $75 order value) ported from OWSH and collapsed to a single profile because Strelva's free audit has no vertical and no client analytics. Every line is prefixed "~".
- `priority` (`high` / `medium` / `low`) derived from status + how heavily the category counts.

`topFixes(categories, limit)` flattens all non-passing checks into a prioritized list (high to low, worst score first). It powers the "Fix these first" block on the public results page, the client health card, and the PDF one-pager.

`prioritizeIssues(audit)` (`src/lib/audit/prioritize.ts`) is the **admin-only** sibling of `topFixes`: a richer ranking that adds priority bands (`highCount`/`mediumCount`/`lowCount`) and a composite score (status × explicit `priority` × category weight × severity). `POST /api/admin/scan` returns it as `prioritizedIssues`, rendered as the "Fix first" list in the admin `SiteScan` view. It is a pure transform (no store/cron) and is kept separate from `topFixes` on purpose — the client sees `topFixes`; the raw ranked issue list stays admin-side. Ported/de-scoped from the OWSH issue-prioritization engine (revenue modeling omitted).

---

## The surfaces

### Free public audit tool (`/audit`)

- Route: `src/app/(marketing)/audit/page.tsx` (server component, metadata only) renders `src/components/marketing/AuditPage.tsx` (the client form + results UI). It lives in the `(marketing)` route group (public, no tenant dashboard layout).
- API: `POST /api/audit/scan` extracts the client IP, enforces a Redis per-IP rate limit (`MAX_SCANS_PER_DAY = 3`, 24h window via `isRateLimitedWindowedAsync`), normalizes + validates the URL, checks a 1h Redis result cache (`reb:audit:{url}`), calls `runAudit`, computes score + grade, caches, and returns an `AuditResult`. Failures are reported to Sentry (`feature: audit-scan`) and return a generic 500.
- UI: animated progress stepper while scanning; on completion a score ring + grade, a "Fix these first" priority list (via `topFixes`), collapsible per-category cards with per-check pass/warn/fail and the impact line, and a CTA to `/access-request?ref=audit`. No signup.
- "Save as PDF" one-pager: `handleDownloadReport` POSTs the current `AuditResult` to `POST /api/audit/report`, which validates the shape and returns a self-contained, print-friendly HTML document from `renderAuditReport` (`src/lib/audit/html.ts`). The report route does no data access (pure transform, nothing tenant-scoped to leak). The front-end opens it as a blob URL for the user to print/save.

### Client site-health (signed-in dashboard)

- Page: `src/app/dashboard/health/page.tsx` ("Site Health", access-gated) renders `src/components/dashboard/SiteHealthCard.tsx`.
- API: `GET /api/dashboard/site-audit` (auth-gated: `verifyAuth` + `requireTenantAccess`) resolves the tenant's best public URL and routes through `scanTenant`, so the client view writes to the SAME scan-store the admin overview reads. Result cached 24h per tenant (`reb:site-audit:{tenant}`); `?refresh=1` forces a re-scan. Returns the full per-category detail plus `topFixes`.
- History: `GET /api/dashboard/site-audit/history` reads `getScanHistory` (the same store the admin sparkline uses, populated by the daily cron) for the card's trend band.
- Card: score + grade ring, a re-scan button, a trend band (when >= 2 history points), the "Fix these first" list, and per-category bars (filtered to `weight > 0`).

### Admin (super-admin portfolio + per-tenant)

- Portfolio overview: `src/app/admin/page.tsx` loads each tenant's latest scan via `getScanSummary` + `getScanHistory` (no live scan on page load) and renders a per-tenant SEO/health grade pill plus a `Sparkline` of recent scores and a since-last-check delta. A `ScanAllButton` triggers the portfolio scan.
- Per-tenant detail: `src/app/admin/tenants/[id]/SiteScan.tsx` shows the stored `ScanSummary` and can run a fresh in-session scan via `POST /api/admin/scan` (which also routes through `scanTenant`, writing the store), exposing the full per-check breakdown for that run.
- Daily cron: `GET /api/cron/portfolio-scan` (scheduled `0 5 * * *` in `vercel.json`, `maxDuration: 300`, CRON_SECRET-gated at the proxy) runs `scanAllTenants`, records a heartbeat, and Slack-pings on failures. This is what keeps the overview grades and every tenant's trend history current without anyone clicking.

---

## The guides blog (`/guides`)

A marketing/SEO article library that funnels readers into the audit:

- Data: `src/lib/guides.ts` is the single read surface (`listGuides`, `getGuide`, `guidesByCategory`). Articles live in `src/content/guides/batch-1.ts` + `batch-2.ts` (two files so they can be authored in parallel) and are merged + sorted newest-reviewed-first.
- Each `GuideArticle` has a slug, title, excerpt, category, difficulty, reading time, pre-sanitized `bodyHtml`, optional `faq` (rendered as a FAQ section + FAQPage structured data), and an optional `fixesSlug` the audit category slug this guide helps fix.
- Routes: `src/app/(marketing)/guides/page.tsx` (index, grouped by category) and `src/app/(marketing)/guides/[slug]/page.tsx` (article, with an inline "Run a free audit" CTA).
- Purpose: these are repurposed from the OWSH Systems fix guides. Strelva manages and fixes client sites itself, so they are NOT a client self-serve deliverable. They exist to rank for the problems the free audit surfaces and route readers into `/audit`. `fixesSlug` is the cross-link back to the audit category.
- `fixesSlug` is WIRED (not just declared): the server-only `runAudit` (`src/lib/audit/checks.ts`) calls `guideRefsForCategory(cat.slug)` from `src/lib/guides.ts` for every category scoring under 80 and stores the matching `{ slug, title }` refs on `CategoryResult.guides`. `topFixes` (`src/lib/audit/impact.ts`) carries that field onto each fix, and the client UIs (`AuditPage`, `SiteHealthCard`) render "Fix it: <title>" links to `/guides/[slug]`. Bundle rule: only server-only modules import `guides.ts`; the `{ slug, title }` shape is intentionally light so no guide `bodyHtml` crosses to the browser — never import `@/lib/guides` from a client component or from `impact.ts`.

---

## Consolidation invariant (read before changing anything here)

There is ONE audit engine and ONE health-history store. Do not build a parallel one.

- The only engine is `runAudit` (`src/lib/audit/checks.ts`). The free tool, the client card, the admin manual scan, and the cron all run it (directly, or via `scanTenant` / `scanAllTenants`).
- The only health-history store is `scan-store` (`src/lib/scan-store.ts`), and the only writer is `src/lib/scan.ts` (`scanTenant` / `scanAllTenants`). The client `/dashboard/health` and the admin overview read the SAME scan-store records.
- A previous duplicate an `audit-history` events store plus a separate weekly cron was removed. Do not reintroduce a second store or a second scheduled scan.

Future work must go through `scan.ts` / `scan-store`, not a new store:

- New persisted health data: extend `ScanSummary` / `ScanHistoryPoint` and write it inside `scanTenant`.
- New audit signals: add a check to an existing module or a new module that reads only the `AuditContext`; add its slug to `WEIGHTS` (keep the map summing to 1.0) and wire it into `runAudit`.
- New surface: read `getScanSummary` / `getScanHistory`, or call `scanTenant`. Never write Redis scan keys directly and never stand up a second scan scheduler.

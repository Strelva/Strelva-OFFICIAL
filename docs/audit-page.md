# Audit Page Architecture

Free site health scoring tool at `/audit`. Top-of-funnel lead gen: visitor enters a URL, gets a 0-100 score with letter grade, sees where their site is weak, then hits the CTA to request a free Scaffold Web site.

No signup required. 3 scans per day per IP.

## Changed Files

```
package.json                                  # added cheerio dependency
src/lib/audit/types.ts                        # type definitions
src/lib/audit/scoring.ts                      # score computation + grade mapping
src/lib/audit/checks.ts                       # scoring engine (all 6 categories)
src/app/api/audit/scan/route.ts               # POST /api/audit/scan
src/app/(marketing)/audit/page.tsx            # server component (metadata only)
src/components/marketing/AuditPage.tsx        # client component (form + results UI)
```

## Route Structure

The page lives at `src/app/(marketing)/audit/page.tsx` inside the `(marketing)` route group. This group is for public-facing pages that do not use the tenant dashboard layout. The server component exports metadata and renders `<AuditPage />`.

The `marketing-site` branch may have its own `/audit` placeholder. When merging, this branch's implementation should win since it contains the full working feature.

---

## Scoring System

### Category Weights

| # | Category | Slug | Weight | Source |
|---|----------|------|--------|--------|
| 1 | Core Web Vitals | `web-vitals` | 0.30 | Google PageSpeed API |
| 2 | Basic SEO | `seo` | 0.25 | HTML parsing (cheerio) |
| 3 | Mobile Responsiveness | `mobile` | 0.20 | Google PageSpeed API |
| 4 | Schema / Structured Data | `schema` | 0.10 | HTML parsing (cheerio) |
| 5 | SSL Certificate | `ssl` | 0.10 | Protocol check + HTTPS fetch |
| 6 | Accessibility | `a11y` | 0.05 | HTML parsing (cheerio) |

Weights sum to 1.0.

### Overall Score Calculation

```
overallScore = round( sum(category.score * category.weight) / sum(category.weight) )
```

Implemented in `scoring.ts:computeOverallScore()`. Each category score is 0-100. The overall score is 0-100.

### Category Score Calculation

Each category contains multiple checks. Each check produces a score from 0 to 100. The category score is the simple average of its check scores:

```
categoryScore = round( sum(check.score) / checkCount )
```

Implemented in `scoring.ts:averageCheckScores()`.

### Letter Grade Mapping

| Score Range | Grade |
|-------------|-------|
| 90-100 | A |
| 80-89 | B |
| 70-79 | C |
| 60-69 | D |
| 0-59 | F |

Implemented in `scoring.ts:scoreToGrade()`.

---

## Individual Checks by Category

### 1. Core Web Vitals (`checkWebVitals`)

Uses PageSpeed Insights API data. If no API key or fetch fails, returns a single "warn" check scored at 50.

| Check | Good (100) | Needs Improvement (60) | Poor (20) |
|-------|-----------|----------------------|-----------|
| Largest Contentful Paint (LCP) | <= 2.5s | <= 4.0s | > 4.0s |
| Cumulative Layout Shift (CLS) | <= 0.1 | <= 0.25 | > 0.25 |
| Total Blocking Time (TBT) | <= 200ms | <= 600ms | > 600ms |
| Performance Score | >= 90 (pass) | >= 50 (warn) | < 50 (fail) |

Performance Score is the raw Lighthouse performance score scaled to 0-100.

### 2. Basic SEO (`checkSEO`)

Parses HTML with cheerio. All checks are synchronous.

| Check | Pass (100) | Warn | Fail (0) |
|-------|-----------|------|----------|
| Title Tag | 30-60 chars | < 30 chars (60) or > 60 chars (70) | Missing |
| Meta Description | 70-160 chars | < 70 chars (60) or > 160 chars (70) | Missing |
| H1 Tag | Exactly 1 | Multiple (60) | Missing |
| Canonical URL | Present (100) | Missing (40) | - |
| Robots Meta | Indexable (100) | noindex/none (30) | - |

### 3. Mobile Responsiveness (`checkMobile`)

Uses the same PageSpeed API response as Web Vitals (no second API call). Falls back to 50 if no API key.

| Check | Pass (100) | Warn/Fail |
|-------|-----------|-----------|
| Viewport Meta Tag | Lighthouse score = 1 | Missing/misconfigured (0) |
| Legible Font Sizes | Lighthouse score = 1 | Too small (40) |
| Tap Target Sizing | Lighthouse score = 1 | Too small/close (50) |

### 4. Schema / Structured Data (`checkSchema`)

Parses `<script type="application/ld+json">` blocks. Extracts `@type` from top-level objects and `@graph` arrays.

| Check | Pass (100) | Warn (50) | Fail (0) |
|-------|-----------|-----------|----------|
| Structured Data | Any JSON-LD types found | - | No JSON-LD found |
| Business Schema | LocalBusiness, Organization, or related subtype found | Schema exists but no business type | - |

Business Schema check only runs if at least one schema type was found. Recognized business types: LocalBusiness, Organization, Restaurant, Store, MedicalBusiness, LegalService, FinancialService, AutoRepair, HealthAndBeautyBusiness, HomeAndConstructionBusiness, ProfessionalService.

### 5. SSL Certificate (`checkSSL`)

| Check | Pass (100) | Warn (60) | Fail (0) |
|-------|-----------|-----------|----------|
| HTTPS | URL uses `https:` protocol | - | URL uses `http:` |
| HTTPS Available | - | HTTPS reachable but not default | HTTPS not reachable |

The "HTTPS Available" check only runs when the input URL is `http:`. It tries upgrading to `https:` with an 8-second timeout.

### 6. Accessibility (`checkAccessibility`)

| Check | Pass (100) | Warn/Fail |
|-------|-----------|-----------|
| Language Attribute | `<html lang="...">` present | Missing (0) |
| Image Alt Text | All images have `alt` attributes | Proportional score: `round((total - missing) / total * 100)`. >= 80% coverage = warn, < 80% = fail |

---

## Security

### SSRF Protection

`validateUrlSafety()` prevents the server from being used as a proxy to scan internal infrastructure.

1. Parse the user-supplied URL with `new URL()`
2. Reject if protocol is not `http:` or `https:`
3. DNS-resolve the hostname via `dns.promises.lookup()`
4. Check the resolved IP against private ranges via `isPrivateIP()`
5. Throw if private

**Blocked IP ranges:**

| Range | Reason |
|-------|--------|
| `10.0.0.0/8` | RFC 1918 private |
| `172.16.0.0/12` | RFC 1918 private |
| `192.168.0.0/16` | RFC 1918 private |
| `127.0.0.0/8` | Loopback |
| `169.254.0.0/16` | Link-local (AWS metadata at 169.254.169.254) |
| `0.0.0.0` | Non-routable |

Note: IPv6 addresses are not currently handled by `isPrivateIP()`. The function only splits on `.` and checks numeric octets. If `dns.promises.lookup()` returns an IPv6 address, it will pass the check. This is a known gap.

### Rate Limiting

Redis-backed, per-IP, 3 scans per 24-hour window.

Implementation in `route.ts:checkRateLimit()`:

1. Key format: `reb:audit-ratelimit:{ip}`
2. `INCR` the key on every request
3. If the count is 1 (first request), set `EXPIRE` to 86400 seconds (24 hours)
4. If count > 3, return 429 with `X-RateLimit-Remaining: 0`

IP is extracted from `x-forwarded-for` (first value) or `x-real-ip`, falling back to `"unknown"`.

### Client-Side URL Validation

In `AuditPage.tsx:handleScan()`:

1. If URL doesn't start with `http://` or `https://`, prepend `https://`
2. Validate with `new URL()` constructor
3. If invalid, show error and don't send request

---

## API Route

### `POST /api/audit/scan`

**Request:**

```json
{
  "url": "example.com",
  "businessName": "optional, unused currently",
  "location": "optional, unused currently"
}
```

Only `url` is required. `businessName` and `location` are accepted but not used by any checks yet (likely reserved for Phase 2 local SEO checks).

**Success Response (200):**

```json
{
  "url": "https://example.com",
  "scannedAt": "2025-05-20T12:00:00.000Z",
  "overallScore": 73,
  "grade": "C",
  "categories": [
    {
      "name": "Core Web Vitals",
      "slug": "web-vitals",
      "weight": 0.3,
      "score": 85,
      "checks": [
        {
          "name": "Largest Contentful Paint (LCP)",
          "status": "pass",
          "score": 100,
          "message": "LCP is 1.8s (good)"
        }
      ]
    }
  ]
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "Invalid request body." }` | JSON parse failure |
| 400 | `{ "error": "URL is required." }` | Missing or empty `url` |
| 400 | `{ "error": "Invalid URL format." }` | `new URL()` throws |
| 429 | `{ "error": "Rate limited. You can scan up to 3 sites per day." }` | > 3 scans from same IP in 24h |
| 500 | `{ "error": "Scan failed: {message}" }` | Any unhandled error (also reported to Sentry with tag `feature: audit-scan`) |

---

## PageSpeed Integration

### How It Works

`fetchPageSpeedData()` makes a single call to the Google PageSpeed Insights API v5:

```
GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed
  ?url={encodedUrl}
  &key={GOOGLE_PAGESPEED_API_KEY}
  &strategy=mobile
  &category=PERFORMANCE
```

- Timeout: 30 seconds
- Strategy is always `mobile`
- Only requests the `PERFORMANCE` category
- Returns `null` if no API key or if the request fails

### Data Sharing

The PageSpeed response is fetched once in `runAudit()` and passed to both `checkWebVitals()` and `checkMobile()` as the `psData` parameter. This avoids a duplicate API call. Both functions degrade gracefully to score 50 with a "warn" status when `psData` is null.

### Environment Variable

`GOOGLE_PAGESPEED_API_KEY` - Required for Web Vitals and Mobile categories to produce real scores. Without it, both categories return 50 with a warning. The audit still runs; other categories (SEO, Schema, SSL, Accessibility) work from the raw HTML fetch alone.

---

## Execution Flow

1. Client submits URL to `POST /api/audit/scan`
2. Route checks rate limit (Redis INCR)
3. Route normalizes URL (prepend `https://` if needed), validates format
4. `runAudit()` is called:
   a. Normalize URL again (belt-and-suspenders)
   b. `validateUrlSafety()` - DNS resolve + private IP check
   c. Fetch page HTML (15s timeout, falls back to HTTP if HTTPS fails)
   d. `fetchPageSpeedData()` - single API call (30s timeout)
   e. Run in parallel: `checkWebVitals`, `checkMobile`, `checkSSL`
   f. Run synchronously: `checkSEO`, `checkSchema`, `checkAccessibility`
   g. Return array of 6 `CategoryResult` objects
5. Route computes `overallScore` and `grade`
6. Route returns `AuditResult` JSON

---

## Phase 2 Stubs

Four placeholder functions are exported from `checks.ts` but not called by `runAudit()`. They all return `weight: 0` and `score: 0` with a "Coming soon" message.

| Stub | Slug | Blocker |
|------|------|---------|
| `stubGBPCompleteness()` | `gbp` | Requires Google Business Profile API integration |
| `stubNAPConsistency()` | `nap` | Requires cross-directory scraping |
| `stubReviewPresence()` | `reviews` | Requires Google/Yelp API |
| `stubLocalSEOGrid()` | `local-grid` | Requires DataForSEO integration |

These stubs are exported so they can be tested or wired in later without changing the engine. When activated, they need:
1. A non-zero weight added to the `WEIGHTS` constant (existing weights must be adjusted to still sum to 1.0)
2. Their function call added to `runAudit()`
3. Their result pushed into the returned array

---

## Adding New Checks

### Adding a check to an existing category

1. Open `checks.ts`, find the category function (e.g., `checkSEO`)
2. Push a new `CheckResult` onto the `checks` array:
   ```ts
   checks.push({
     name: "Open Graph Tags",
     status: hasOG ? "pass" : "warn",
     score: hasOG ? 100 : 40,
     message: hasOG ? "Open Graph tags found" : "Missing Open Graph tags",
   });
   ```
3. The category score auto-updates because it uses `averageCheckScores(checks.map(c => c.score))`
4. No weight changes needed. The new check is averaged equally with existing checks in that category.

### Adding a new category

1. **Define the weight.** Add an entry to the `WEIGHTS` constant in `checks.ts`. Adjust existing weights so they still sum to 1.0.

2. **Write the check function.** Follow the pattern of existing functions:
   ```ts
   function checkNewCategory(html: string): CategoryResult {
     const checks: CheckResult[] = [];
     // ... push CheckResult items ...
     return {
       name: "Category Name",
       slug: "category-slug",
       weight: WEIGHTS.newCategory,
       score: averageCheckScores(checks.map(c => c.score)),
       checks,
     };
   }
   ```
   - Use `async` if the check needs network access
   - Accept `html` for DOM-based checks, or `url`/`psData` for API-based checks

3. **Wire it into `runAudit()`.** Add the function call (parallel via `Promise.all` if async, or sequential if sync) and push the result into the returned array.

4. **Add an icon.** In `AuditPage.tsx`, add an entry to `categoryIcons` mapping the slug to a Lucide icon.

5. **Types are automatic.** `CategoryResult` and `CheckResult` are generic enough that no type changes are needed.

### Check scoring conventions

- **Binary pass/fail**: 100 or 0
- **Tiered**: Pick 2-3 thresholds, score 100 / 60 / 20 (or similar)
- **Proportional**: `round(ratio * 100)`, clamped 0-100
- **Status mapping**: score >= 80 = `pass`, >= 50 = `warn`, < 50 = `fail` (convention, not enforced)

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `cheerio` (^1.2.0) | HTML parsing for SEO, Schema, and Accessibility checks |
| `@upstash/redis` | Rate limiting (already in the project) |
| `@sentry/nextjs` | Error reporting on scan failures (already in the project) |

---

## Client Component Behavior

`AuditPage.tsx` manages four states: `idle`, `scanning`, `done`, `error`.

- **idle/error**: Shows the URL input form. Error state shows the error message above the form.
- **scanning**: Shows an animated progress stepper (8 steps, 2.8s interval). This is cosmetic; the actual scan runs as a single API call.
- **done**: Shows the score circle (with letter grade), expandable category cards, and a CTA linking to `/access-request?ref=audit`.

Each category card is collapsible. Clicking expands to show individual checks with pass/warn/fail icons.

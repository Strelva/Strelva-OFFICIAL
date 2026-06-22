# Platform Hardening

> **Status (2026-06-22): Production cutover completed 2026-06-20.** Strelva is live on Supabase Auth + Postgres (`CONTENT_SOURCE`/`TENANTS_SOURCE`/`DATA_SOURCE=postgres` on in prod, RLS + `handle_new_user` trigger live). This doc is retained for historical/runbook reference. The only remaining work is the deliberate destructive Sanity/Clerk teardown (remove Sanity reads, lock the dataset, unwrap `clerkMiddleware` in `src/proxy.ts`).

Production hardening for Strelva: observability, reliability, and security improvements.

**Branch:** `feat/platform-hardening`

---

## 1. Health Endpoint

**File:** `src/app/api/health/route.ts`
**Route:** `GET /api/health`

Checks five services concurrently with a 3-second timeout per check:

| Service | How it checks | Auth needed |
|---------|--------------|-------------|
| Redis | `redis.ping()` via Upstash REST client | Upstash token |
| Sanity | `count(*[_type == "siteSettings"])` query | Sanity API token |
| Clerk | `GET /.well-known/jwks.json` on the frontend API domain (decoded from publishable key) | None (public JWKS endpoint) |
| Stripe | `GET /v1/events?limit=1` | Stripe secret key (Bearer auth) |
| Gemini | `GET /v1beta/models?pageSize=1` | `x-goog-api-key` header |

### Response shape

```json
{
  "status": "healthy" | "degraded" | "down",
  "version": "0.1.0",
  "timestamp": "2025-05-20T12:00:00.000Z",
  "checks": {
    "redis":  { "status": "ok", "responseMs": 42 },
    "sanity": { "status": "ok", "responseMs": 180 },
    "clerk":  { "status": "ok", "responseMs": 95 },
    "stripe": { "status": "ok", "responseMs": 110 },
    "gemini": { "status": "ok", "responseMs": 200 }
  },
  "errors": []
}
```

Per-service `status` is `"ok"`, `"not configured"`, or `"error"`.

### Overall status logic

- **"down"** if Redis OR Sanity is `"error"`. Returns HTTP 503.
- **"degraded"** if any non-core service (Clerk, Stripe, Gemini) is `"error"`. Returns HTTP 200.
- **"healthy"** if everything is `"ok"` or `"not configured"`. Returns HTTP 200.

Services with missing env vars report `"not configured"` and do not drag status down.

### Wiring to monitoring

Point UptimeRobot or Better Stack at `https://strelva.com/api/health`. Alert on:
- HTTP 503 (core service down)
- JSON body `.status !== "healthy"` (degraded)
- Response time > 5s (individual check timeout is 3s, but network adds overhead)

---

## 2. Sentry Integration

### Setup files

| File | Purpose |
|------|---------|
| `sentry.server.config.ts` | Server-side init. DSN from `SENTRY_DSN`. Traces sample rate: 10% prod, 100% dev. |
| `sentry.edge.config.ts` | Edge runtime init. Same config as server. |
| `sentry.client.config.ts` | Browser init. DSN from `NEXT_PUBLIC_SENTRY_DSN`. Traces sample rate: 5% prod, 100% dev. |
| `instrumentation.ts` | Next.js instrumentation hook. Imports server or edge config based on `NEXT_RUNTIME`. |

### Context enrichment

**File:** `src/lib/sentry-context.ts`

`setSentryContext({ tenantId, userId, route })` sets Sentry tags on the current scope. Call at the top of API route handlers so every error is filterable by tenant and user.

`addSentryBreadcrumb(category, message, data)` adds breadcrumbs. Categories: `"content"`, `"agent"`, `"webhook"`, `"billing"`, `"auth"`.

### Where breadcrumbs are added

| Location | Category | Message |
|----------|----------|---------|
| `agent-executor.ts` (line 226) | `agent` | "Agent execution started" with tenantId and message length |
| `revalidate-client.ts` (line 80) | `webhook` | "Revalidation webhook delivery" with tenantId and paths |
| `storage/content-store.ts` (line 154) | `content` | "setContent: {section}" with tenant and section |

### Test endpoint

**File:** `src/app/api/admin/test-error/route.ts`
**Route:** `POST /api/admin/test-error`

Super-admin only (403 for everyone else). Fires a test error into Sentry with `tenantId=test-error`, `userId=super-admin`, `route=/api/admin/test-error`. Returns whether Sentry DSN is configured.

---

## 3. AI Model Fallback

**File:** `src/lib/ai-models.ts`

### Primary model

Google Gemini 2.5 Flash (`gemini-2.5-flash` via `@ai-sdk/google`). Always used first.

### Fallback trigger

When the primary model throws a transient error, the system retries once with the fallback model. `isTransientModelError()` returns true for:
- HTTP 429 / rate limit / quota errors
- HTTP 500, 502, 503, 504
- Timeout / timed out
- Network errors (ECONNREFUSED, ECONNRESET, fetch failed)
- Unknown non-Error exceptions (conservative: retry)

Non-transient errors (e.g. auth failures, bad requests) propagate immediately.

### Fallback configuration

| Env var | Purpose | Example |
|---------|---------|---------|
| `AI_FALLBACK_PROVIDER` | Provider name | `"anthropic"` or `"openai"` |
| `AI_FALLBACK_MODEL` | Model ID | `"claude-sonnet-4-20250514"` |

When both are set, the fallback model is initialized via dynamic require of `@ai-sdk/anthropic` or `@ai-sdk/openai`. When not set, the system operates in single-model mode (no fallback).

### Tracking

`AgentExecutionTrace.modelUsed` records which model produced the response (e.g. `"google/gemini-2.5-flash"` or `"anthropic/claude-sonnet-4-20250514"`). The fallback path logs a warning with the primary error details before retrying.

---

## 4. Auto-Approval System

**File:** `src/lib/ai-auto-approve.ts`

Tracks consecutive human approvals per tenant. When a tenant builds enough trust (a streak of approvals without rejection), low-risk AI changes skip the review queue.

### How it works

1. When a human approves an AI content_update event, `recordApproval(tenantId)` is called (in `event-actions.ts`). This runs `INCR` on Redis key `reb:auto-approve:streak:{tenantId}`.
2. When a human rejects an AI content_update event, `recordRejection(tenantId)` resets the key to 0.
3. On the next AI write, `maybeAutoApprove()` checks the streak against the tenant's `autoApproveThreshold`. If streak >= threshold and the section is low-risk, the governance decision is upgraded from `"review"` to `"publish"`.

### Configuration

`TenantConfig.autoApproveThreshold` (number or null). Set per tenant. `null` or `0` disables auto-approval.

### Low-risk sections

Only these sections qualify for auto-approval:
- `contact`
- `settings`
- `events`
- `providers`

Sections like `hero`, `services`, `story`, `testimonials` always go through review regardless of streak.

### Guard rails

- Only `"review"` decisions get upgraded. `"block"` stays blocked, `"publish"` is already approved.
- A single rejection resets the streak to zero. Trust must be rebuilt.
- Redis key TTL is 90 days, refreshed on each approval. Inactive tenants lose their streak naturally.
- If Redis is unavailable, streak reads return 0 (fail-closed, never auto-approves).

---

## 5. Revalidation Reconciliation Cron

**Cron route:** `src/app/api/cron/revalidation-reconcile/route.ts`
**Core logic:** `reconcileRevalidations()` in `src/lib/revalidate-client.ts`
**Schedule:** Every 6 hours (`0 */6 * * *` in `vercel.json`)

### Purpose

Detects custom-repo client sites that are out of sync with the control plane. This catches cases where a revalidation webhook failed (network issue, client site down, etc.) and the client site is serving stale content.

### How it works

1. Iterates all active tenants that have a `revalidateUrl` and `revalidationSecret`.
2. For each tenant, compares the latest content timestamp (`getSectionTimestamps`) against the last successful revalidation timestamp (`reb:revalidation:last-success:{tenantId}` in Redis).
3. If content is newer than the last revalidation (or no revalidation recorded), re-fires the HMAC-signed revalidation webhook via `revalidateClientSite()`.
4. The revalidation uses the same signed body (`x-reb-timestamp` + `x-reb-signature` headers) as real-time revalidation.
5. Retries up to 3 attempts (initial + 2 retries) with 1-second delays.

### Failure handling

- Failed revalidations are recorded in Redis sorted set `reb:revalidation:failures` (capped at 100 entries, 7-day TTL).
- On failure, a Slack notification is sent to `SLACK_WEBHOOK_URL` with tenant ID and error details.
- The cron response includes per-tenant results: `revalidated`, `failed`, `up_to_date`, `skipped`.

### Response shape

```json
{
  "total": 5,
  "revalidated": 1,
  "failed": 0,
  "upToDate": 3,
  "skipped": 1,
  "results": [...]
}
```

---

## 6. Dependency Changes

### Added

| Package | Version | Purpose |
|---------|---------|---------|
| `@ai-sdk/anthropic` | `3.0.78` | Anthropic provider for AI fallback |
| `@ai-sdk/openai` | `3.0.64` | OpenAI provider for AI fallback |

### Env vars added

| Var | Required | Purpose |
|-----|----------|---------|
| `SENTRY_DSN` | Yes (prod) | Server-side Sentry DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | Yes (prod) | Client-side Sentry DSN |
| `AI_FALLBACK_PROVIDER` | No | Fallback AI provider name |
| `AI_FALLBACK_MODEL` | No | Fallback AI model ID |

---

## Files changed on this branch

```
.env.example
package.json
pnpm-lock.yaml
instrumentation.ts
sentry.server.config.ts
sentry.edge.config.ts
sentry.client.config.ts
vercel.json
src/app/api/admin/test-error/route.ts
src/app/api/cron/revalidation-reconcile/route.ts
src/app/api/health/route.ts
src/lib/agent-executor.ts
src/lib/ai-auto-approve.ts
src/lib/ai-models.ts
src/lib/event-actions.ts
src/lib/revalidate-client.ts
src/lib/sentry-context.ts
src/lib/storage/content-store.ts
src/lib/types.ts
```

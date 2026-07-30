# Strelva — AI-managed website platform

Strelva is a **multi-tenant control plane** for local-business websites. Owners get a
dashboard that proves their site is working and an AI agent that handles updates in plain
language ("add my new Saturday class"); the founders run the whole portfolio from an
AI-driven operator console. Each client's public site is a separate hand-built repo that
pulls content from Strelva over a versioned contract.

> Internal note: the repo's legacy name is `reb`; wire-level `x-reb-*` headers and `reb:`
> Redis prefixes are intentionally frozen for back-compat. Product name is Strelva.

## Architecture

```
 Marketing site (separate repo)
        │ lead
        ▼
 CONTROL PLANE  (this repo)
   proxy.ts ── host → tenant routing, Supabase auth, CSP
   /dashboard (owner) · /admin "Mission Control" (operator)
   AI agents + governance + risk engine
   /api/v1/*  ── frozen, additive-only contract
        │ pull (ISR 60s)        ▲ push (HMAC-signed revalidate)
        ▼                       │
 Supabase Postgres (source of truth) + Redis (cache + operational data)
        │
        ▼
 CUSTOM CLIENT REPOS — one per paid client, own domain, own Vercel project
```

- **Source of truth:** Supabase Postgres for content/config/tenants (flipped 2026-06-20;
  Sanity teardown done 2026-07-10 — code reads no Sanity data; only two legacy
  `NEXT_PUBLIC_SANITY_*` env vars remain to resolve stored image asset URLs until a
  content-URL rewrite ops step); Upstash Redis as a write-through cache and the
  operational store (events, clicks, bookings, reviews, pay-links, rewards).
- **Sync contract (`/api/v1/*`):** client repos pull content (ISR) and receive
  HMAC-signed revalidation pushes. The contract is versioned (`v1`) and changed only
  additively — deployed client sites can't break.
- **Stack:** Next.js 16 (App Router, `proxy.ts` routing), React 19, TypeScript, Tailwind 4,
  Supabase Auth (multi-host), Supabase Postgres, Vercel AI SDK + Gemini, Stripe (billing
  live), Resend, Vercel Blob.

## The AI systems

Two agents, both governed — this is the applied-AI core of the product.

**Tenant content agent** (`/api/agent`) — the owner chats; the agent edits the site. Every
proposed change runs through:
- **Governance** (`ai-governance.ts`) — `publish` (factual fields) vs `review` (marketing
  copy / high-risk facts like prices, hours) vs `block` (structural).
- **Risk assessment** (`agent-risk.ts`) — classifies the operation (rewrite/add/delete/
  reorder/structural) and scores it; only low-risk minor edits auto-apply, everything else
  routes to human review.
- On publish: write to Postgres → write-through Redis → HMAC revalidate the client repo →
  verify the change is actually live before claiming it.

**Operator agent** ("Mission Control", `/api/admin/agent`) — the founders run the business
by talking to it. **Safe by construction:** it reads the entire portfolio (health,
revenue, ops, attention briefing, audit, pay links) but has **no mutation path** — for
consequential actions it returns a *confirmation proposal*; the console commits it by
calling the existing gated, audited endpoints on an explicit click. The LLM can never
target an arbitrary endpoint or mutate state on its own.

## Mission Control (operator layer)

- **Portfolio brain** — one cached cross-tenant aggregate of health, MRR, launch readiness.
- **Needs-Attention briefing** — prioritized "where to spend founder hours" (launch-blocked
  tenants, ops breakage, drafts, quiet tenants), on the overview + a daily Slack digest.
- **Guided onboarding** — provisions a tenant end to end (record + revalidation secret +
  seeded content + owner invite + Vercel project/env/domain) and hands back the client-repo
  env to paste; the site stays a hand-built repo.
- **Operator screens** — the whole console is served on the bare admin host `admin.strelva.com`
  (super-admin only; `proxy.ts` rewrites it onto `/admin`). A **"Needs you" overview** (leads /
  approvals / at-risk / signups, led ahead of MRR — no client table), **one client list**
  (`/admin/clients` — per-tenant pipeline stage, tags, notes, contacts, activity + SEO grade /
  launch % / at-risk) linking to **one merged detail** (`/admin/clients/[id]` — live pulse,
  health scan, review intel, visibility, domains, config, CRM; the old `/admin/tenants` routes
  now redirect here), a **Leads** board (`/admin/leads` — mark contacted / convert / dismiss),
  **Search + Analytics** (`/admin/analytics` — Search Console + GA4 per client), ops board (with
  live platform-dependency health), pay-links (mint + revoke, with paid tracking), draft diff
  review, and a portfolio-wide audit trail. Nav is five primary links + a "More" menu.
  See [`docs/operator-command-center.md`](./docs/operator-command-center.md) and
  [`docs/client-dashboard-ia.md`](./docs/client-dashboard-ia.md).
- **Operator vs client email** — two independent switches: operator notifications (new-signup,
  lead, payment-failed) default ON so the founders stay alerted, while all customer/prospect
  mail stays paused behind `EMAIL_SENDING_ENABLED` during the test-tenant phase.

## Development

```bash
pnpm install
pnpm dev            # local dev (localhost:3000); gldf.localhost:3000 routes a tenant
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest (700+ tests)
pnpm build          # production build
pnpm check:prod     # production-readiness checklist
pnpm provision-tenant   # CLI tenant provisioning
```

Agent guidance for contributors lives in [`AGENTS.md`](./AGENTS.md); the canonical operating
model and roadmap in [`docs/operating-model.md`](./docs/operating-model.md).

## Known issues / TODO (from audit, 2026-07-30)

These are confirmed open — not hypothetical. Fix before any public launch milestone.

**Security / HIGH**
- `upload_image` agent tool uses `uploadFile()` (unscoped) instead of `uploadTenantMedia()` (`src/app/api/agent/route.ts:568`). Files land in a flat shared Blob namespace with no tenant prefix. Fix: replace with `uploadTenantMedia(tenant, buffer, finalFilename, sniffedMime)`.
- `businessRules` tenant field is interpolated into the agent system prompt without sanitization (`src/lib/agent-prompt-shared.ts:342`). `personality` is already sanitized. Fix: wrap `tenantConfig.businessRules` in `sanitizePromptValue()`; add a max-length cap (e.g. 1000 chars) at the TenantEditor write path.
- `SECRETS_ENC_KEY` missing from `.env.example`, `.env.production.example`, and the production checklist (`scripts/production-checklist.ts`). If the key is removed, `loadTenants` throws on every decrypt and takes down the whole platform. Fix: add to both env files with a generation instruction (`openssl rand -hex 32`), add `checkEnvVar('SECRETS_ENC_KEY', true)` to the checklist, and wrap the per-row `rowToTenant` call in a per-row try/catch.
- `SUPABASE_URL` (private server-only, distinct from `NEXT_PUBLIC_SUPABASE_URL`) is missing from `.env.example`, `.env.production.example`, and the production checklist. Add it to both env files and add `checkEnvVar('SUPABASE_URL', true)` to the checklist.
- Next.js is pinned at `16.2.6` (`package.json`), which has four HIGH + three MODERATE unpatched CVEs. Bump to `16.2.12` (and `eslint-config-next` to match), then run `pnpm audit` to confirm the advisories clear. Deploy with `vercel --prod --yes --scope strelva` after the bump.
- Seven orphaned Clerk and Sanity secrets remain in Vercel environment after both teardowns (visible in `.vercel/.env.production.local`). Remove via `vercel env rm` for each across all environments.

**Tenant isolation / HIGH**
- Collections list and single-entry v1 routes (`src/app/api/v1/collections/[tenant]/[type]/route.ts` and `[slug]/route.ts`) are missing `Cache-Control: private` headers. Any CDN between the client site and the API can serve one tenant's collection data to another tenant's site. Fix: add `private, max-age=0, must-revalidate` to every successful `NextResponse.json()` in both routes.
- The `/api/upload` route stores files in a shared flat Blob namespace without a tenant prefix (`src/lib/storage/upload-store.ts:45`). Fix: prefix with the tenant slug matching the pattern in `media-store.ts`.

**Bugs / HIGH**
- GBP writes silently fail after a tenant rename because `google-meta:${t}` is absent from `authoritativePatterns` in `src/lib/tenant-rename.ts`. Also missing: `review-replies:recent:${t}`, `reb:review-nudge-sent:${t}`, `reb:order-review-request-sent:${t}:*`, `reb:review-reply-declined:${t}:*`.
- Fractional star delta causes an uncaught Redis error in `adjustStars` (`src/app/api/rewards/members/[email]/adjust/route.ts:35`). Add `Number.isInteger(delta)` to the validation guard.
- Calendly webhook uses `redis.keys()` (full-keyspace scan) in the synchronous handler path (`src/app/api/webhooks/calendly/route.ts:64`). Replace with a reverse index (`redis.set('calendly-user-uri:<userUri>', tenantId)`) written at connect time.
- `buildOpsReport` has a fully serial N+1 loop with no concurrency cap (`src/lib/ops.ts:113-157`). Collapse into a single `mapPool(active, 8, ...)` call.
- `database.types.ts` is stale — `billing_type` and `account_id` are missing from generated Row types. Run `supabase gen types typescript` and commit the updated file.

**Security / Medium**
- Proxy auth gate does not apply to subdomain-resolved tenant requests (`src/proxy.ts:636-647`). The `needsAuth` condition omits the `tenantFromSubdomain` case, making the proxy a non-functional first line of defense for the most common access pattern.
- Newsletter HTML sanitizer allows CSS expressions and `javascript:` URLs in `style` attributes (`src/lib/email-html.ts:23-33`). Remove `'style'` from `ALLOWED_ATTR`.
- SSRF: AI-visibility scorer fetches user-supplied URLs without pre-validation (`src/lib/ai-visibility/score.ts:80-95`). Import and call `validateUrlSafety(url)` from `src/lib/audit/checks.ts` before the `fetchText` calls.
- `INTERNAL_API_SECRET` is used as the domain-map auth key, OAuth state secret fallback, AND approve-link signing fallback. Key compromise has a wider blast radius than documented. Add explicit dedicated secrets (`APPROVE_LINK_SECRET`, `OAUTH_STATE_SECRET`) and remove the fallback chain.
- `reb:tenants:all` Redis cache stores decrypted (plaintext) secrets (`src/lib/tenants.ts:206-210`), placing them outside the at-rest encryption boundary. Consider re-encrypting before caching or storing only non-secret fields.

# AGENTS.md

Canonical repo guidance for all coding agents (Claude Code, Codex). `CLAUDE.md` imports this file so there is one source of truth.

**Naming**: Product is "Strelva". Repo folder path is legacy lowercase `reb` (internal). Package name is `scaffold-web`.

## Commands

```bash
pnpm dev                          # Local dev server (localhost:3000)
pnpm build                        # Production build
pnpm lint                         # ESLint
pnpm test                         # Run all Vitest tests
pnpm test src/__tests__/core.test.ts  # Single test file
pnpm smoke                        # Playwright (public smoke; bypass OFF)
pnpm smoke:surfaces               # Ungated admin/owner console smoke (bypass ON + fixture)
pnpm typecheck                    # tsc --noEmit
pnpm provision-tenant             # Create new tenant
pnpm check:prod                   # Production readiness checklist
pnpm check:custom-repos           # Verify sibling custom-repo workspaces (executable conformance, not string-grep)
pnpm check:ontology               # Ontology invariants gate (file-size ceiling + lifecycle CHECK constraints; runs in check:ci)
npx tsx scripts/ai-visibility.ts "<Business>" --site=x.com --category="HVAC" --city="Buffalo, NY" [--html] [--out=<dir>]
                                  # AI-visibility scorecard (door-opener artifact; --html writes a sendable one-pager, --out=<dir> sets where)
```

For subdomain testing: `gldf.localhost:3000` routes to tenant `gldf`. Custom domain routing is exercised via `CUSTOM_DOMAIN_MAP` in `.env`.

**Test + CI layout** (vitest layers, the two Playwright bypass modes, the CI jobs, and the CI-faithful local sim — blank Redis + data sources, or a green local run lies): [docs/testing-and-ci.md](./docs/testing-and-ci.md).

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind 4 + TypeScript
- Routing/middleware lives in **`src/proxy.ts`** (Next 16 renamed `middleware.ts` to `proxy.ts`)
- **Supabase Auth** for auth (`auth.uid()`, Google OAuth + magic-link; see `src/lib/auth.ts`). **Clerk is fully removed (2026-07-11, #146)** — the `@clerk/nextjs` dep is gone from `package.json`/lockfile, `auth.ts` is Supabase-only (the dual-path `isSupabaseAuthConfigured()` branches collapsed; all exported signatures + invariants — verified-email gate, last-owner guard, super-admin, dev-bypass — preserved), and `proxy.ts` replaced `clerkMiddleware` + `createRouteMatcher` with a hand-rolled auth gate (`gateRequest`, **fail-closed**) + route matcher (`isPublicRoute`/`isCronRoute`, path-normalized against encoded/`//` bypass). No `@clerk` imports remain; the Clerk CSP entries are gone. The **Sanity code teardown is DONE (2026-07-10)** — all data-source reads/writes removed, `@sanity/client`/`next-sanity`/`sanity` deps dropped; the only residual is `sanityImageUrl` (+ `@sanity/image-url` + `cdn.sanity.io` in CSP/`next.config`) for legacy content-image asset refs, retained until the content-URL rewrite ops step, after which the Sanity dataset is locked.
- **Supabase Postgres is the source of truth for identity, tenant configuration, domain claims, content, collections, drafts, audit, and activity in production** (flipped 2026-06-20). Some operational workflows remain Redis-authoritative with a Postgres mirror; do not infer authority from `DATA_SOURCE` or the existence of a table. The canonical per-domain map is `docs/persistence-boundaries.md`. **No store reads or writes Sanity anymore.** **Tenant isolation is enforced at the APPLICATION layer** — every API route derives the tenant from trusted auth/headers and gates it with `requireTenantAccess` (membership) OR `requireTenantPermission`/`requireTenantPermissions` (`src/lib/auth.ts`). The permission gates already enforce membership, so a route that has a permission check does not need a duplicate access check. The control plane talks to Postgres via a service-role client that BYPASSES row-level security. RLS policies are defense-in-depth, not the live enforcement boundary.
- **Upstash Redis** is a cache for Postgres-backed content/config and the authority for explicitly listed ephemeral or operational stores such as locks, rate limits, the event queue, and the pre-tenant delivery lifecycle. A Postgres mirror does not become authoritative until its read path is deliberately cut over; see `docs/persistence-boundaries.md`.
- Vercel Blob for image uploads
- Vercel AI SDK v6 + Google Gemini for the agent
- Stripe for live three-tier subscription billing. The selected plan and monthly amount are persisted on the tenant; one-off pay links never imply a subscription.
- Resend for email (weekly reports, invites, lead/prospect/transactional). **All email renders through the shared design system `src/lib/email/layout.ts`** — `renderEmailHtml`/`renderEmailText`; callers pass content (heading, paragraphs, rows, button, footer), never markup. Light card, brand sage `#447a4f`, real hosted cairn logo (`EMAIL_LOGO_URL` → strelva.com/brand/logo-full-light.png). Do NOT hand-roll email HTML — extend the layout. **Global kill-switch: `emailSendingPaused()` (`src/lib/email-enabled.ts`) — NO customer/prospect email sends unless `EMAIL_SENDING_ENABLED=true`** (guards all send sites; currently paused in prod during the test-tenant phase). `RESEND_DOMAIN`=updates.strelva.com; operator lead notifications go to `LEAD_NOTIFY_EMAILS`. **Email sends split across THREE independent switches** (all in `email-enabled.ts`): (1) **client lifecycle** — `emailSendingPaused()` (`EMAIL_SENDING_ENABLED`), **DEFAULTS OFF/paused**; guards `sendWelcomeEmail`/`sendSiteLiveEmail`/`sendReviewRequestEmail` + the report/review/health senders in `delivery-email.ts`, newsletter, invites, and the report crons. Stays paused until client lifecycle email is deliberately switched on. (2) **operator** — `operatorEmailsEnabled()` (`OPERATOR_EMAILS_ENABLED`), **DEFAULTS ON**, silenced only by `="false"`; new-signup / lead-intake / payment-failed alerts to Noah + Jacob. (3) **prospect** — `prospectEmailsEnabled()` (`PROSPECT_EMAILS_ENABLED`), **DEFAULTS ON**, silenced only by `="false"`; the audit-report scorecard (`sendAuditReportEmail`, `audit-report-email.ts`) sent to someone who ran the free `/audit` tool. Operator + prospect default-on so real mail flows to warm the sending domain while client lifecycle stays paused (Noah, 2026-07-13). `RESEND_DOMAIN`=updates.strelva.com; operator lead notifications go to `LEAD_NOTIFY_EMAILS`. **All `delivery-email.ts` senders route through the single transport boundary `sendEmail()` (`src/lib/email/send.ts`)**, which owns the audience→switch mapping (`client`→`emailSendingPaused`, `operator`→`operatorEmailsEnabled`, `customer`→`customerEmailPaused`) + the Resend call — so a new sender can't accidentally gate the wrong audience. Don't re-inline the gate/Resend call in a sender; pass an `audience` to `sendEmail`.

> **Migration FLIPPED + live (2026-06-20); Sanity teardown DONE (2026-07-10):** identity, tenant configuration, content, and the CMS backbone are on Supabase Postgres. Operational-store authority is intentionally mixed and documented in `docs/persistence-boundaries.md`; the historical migration sequence in `docs/post-cutover-runbook.md` is not a current architecture reference. **Rollback from Sanity is forward-only.** Remaining Sanity work is OPS-only: rewrite legacy content-image URLs, lock the dataset and unset `SANITY_*`, then delete the residual image resolver. **Clerk teardown is DONE (2026-07-11, #146).**

## Multi-tenant architecture

Strelva is the **control plane**. Each paid client site is a separate **custom repo** that pulls content/config from the control plane over a versioned API.

**Naming note:** the project rename from "reb" → "scaffoldweb" is ongoing. New code uses `SCAFFOLD_*` env vars, `SCAFFOLD_CONTRACT_VERSION`, `scaffoldRoutes`, etc. Legacy `REB_*` names are kept as deprecated aliases so deployed custom repos (Rohlax, GLDF) keep working. HMAC headers (`x-reb-timestamp`/`x-reb-signature`) and Redis key prefixes (`reb:`) are intentionally **not** renamed — those are wire-level or persistent-data details that require coordinated rollout to change. The full `scaffoldweb.com` → `strelva.com` rebrand + split into two repos (`strelva-marketing` + `strelva-app`) is planned, not yet executed — see `docs/strelva-migration-plan.md`. **Production strelva.com marketing is already served from the separate `~/strelva-marketing` repo** — marketing-site copy/pricing changes go there, not here (this repo's `(marketing)` pages serve legacy/scaffoldweb hosts per `MARKETING_DOMAINS`).

- Host → tenant resolution in `src/proxy.ts`: subdomain (`gldf.strelva.com`, `admin.gldf.strelva.com`), then `/client/{tenant}/...` path fallback, then custom-domain map (Redis/Postgres-backed via `/api/internal/domain-map`), then `?tenant=` query.
- The public storefront contract is **`/api/v1/*`** — owned directly (no `@/app/api/public/*` re-export layer). The v1 routes are the canonical wire shape consumed by client repos. Change them only by versioning (add a v2 sibling).
- Custom-repo wiring: `src/lib/custom-repos.ts`, `src/lib/revalidate-client.ts` (signed HMAC revalidation), `custom-repo-starter/` (drop-in scaffold), `scripts/custom-repo-workspace-check.ts`, `release-manifest.json`.
- **Capability manifest (which sections the AI may edit):** a custom repo can PUBLISH a manifest declaring the sections its live site actually renders — drop `custom-repo-starter/site-capabilities-route.ts` in at `app/api/capabilities/route.ts` (built from `content-defaults` via `buildSiteCapabilityManifest`), then set the tenant's `customRepo.capabilityManifestUrl` via `POST /api/admin/tenants/[id]/capability-manifest` (super-admin). The control plane fetches + merges it (`src/lib/site-capabilities.ts`, SSRF-guarded, Zod-validated) so the agent edits what the live site renders, not just the template default. Commerce/rewards go in the manifest's `customOnlyFeatures` (AI requests, doesn't edit).
- `DEFAULT_DELIVERY_MODEL` is `"custom_repo"`. Every paid client is a separate hand-built repo. The `platform_template` value still exists in the type for legacy tenant records but should not be used for new tenants. The self-serve backend was **deleted** (2026-06-10; `/onboard` redirects to `/access-request` preserving `?ref=`) — the only lead path is `/access-request`, Jacob builds the repo.
- **Client-site traffic tracking**: custom repos send page-view/booking-click beacons to `POST /api/v1/track/[tenant]` (additive v1 route; rate-limited, fail-silent tracker in `custom-repo-starter/ScaffoldTracker.tsx`, needs `NEXT_PUBLIC_SCAFFOLD_API_URL` + `NEXT_PUBLIC_TENANT_ID`). This feeds the weekly report's numbers — rollout steps for live repos in `docs/tracking-rollout.md`. **Beacon counters increment atomically via the Postgres `increment_site_metric(tenant, metric, day)` RPC** (`pgIncrementMetric` in `src/lib/storage/analytics-store.ts`; migration `20260713194947`), NOT a read-then-upsert — concurrent view/click beacons can't overwrite each other. The RPC is service-role-only. Do NOT revert to select-then-upsert (it dropped concurrent increments); the migration must be applied for tracking to record (a missing function fails silent — fire-and-forget).
- **Conversion capture (additive v1)**: the same beacon carries an `order` event (validated, idempotent on `externalId`) into `src/lib/orders.ts` — powers the Store pillar's revenue/orders/best-sellers. Native form submissions POST to `/api/v1/leads/[tenant]` (validated, deduped, rate-limited) into `src/lib/leads.ts` — surfaced as "Who reached out" on Today. Both stores set a dedup lock that is **released on a write failure** so a retried beacon is never silently swallowed. v1 stays additive-only; change by versioning.

## Content system

- Typed schemas in `src/lib/types.ts` (`HeroContent`, `ServicesContent`, …) and Zod validators in `src/lib/schemas.ts`.
- Authenticated CRUD via `/api/content/[section]` (PUT validates with Zod, writes versions + activity).
- Public reads via `/api/v1/content/[tenant]/[section]` — goes Redis cache first, falls through to Postgres (prod) or the dev file (local). Writes are write-through: `setContent` updates the source of truth, then populates Redis.
- Templates in `src/components/templates/` define which sections each tenant type uses.

## AI agent

- `src/lib/agent-executor.ts` uses Vercel AI SDK + `gemini-2.5-flash`. The streaming
  chat endpoint is `src/app/api/agent/route.ts`; it emits `__TOOL__<label>` status,
  text deltas, `__RESULT__<json>`, and `__CARD__<json>` (rich inline tool cards) —
  ChatPanel + DesignPropertiesPanel both consume the same protocol.
- Content tools: `read_section`, `update_section`, `undo_last_change`, `get_suggestions`,
  `create_suggestion`, `create_blog_post`, `list_blog_posts`, `draft_newsletter`.
  Inline-display tools return `{ __inlineTool, ... }` → streamed as `__CARD__`
  (e.g. `show_report`, `show_content`).
- **Two agent paths, one set of tool definitions.** The streaming chat route
  (`src/app/api/agent/route.ts`) and the background executor (`src/lib/agent-executor.ts`,
  run when an owner approves a suggestion in `event-actions.ts`) MUST behave identically.
  The shared gates + tool factories live in **`src/lib/agent-shared.ts`**:
  `resolveGbpWriteAllowed`, `resolveEditableSections`, **`buildGbpTools`**, **`buildUndoTool`**.
  Each path passes its own post-queue side-effect hooks (route → streamed result card via
  `recordActionResult`; executor → Slack ping) but the tool schema/metadata/return shape are
  shared, so the two can't drift. Do NOT hand-roll a second copy of a GBP tool or undo in the
  executor — extend the factory. (The executor previously LACKED `upload_gbp_photo` and undo,
  and its `create_gbp_post` schema had drifted; the factories closed that gap.)
- `undo_last_change` (`buildUndoTool` in `src/lib/agent-shared.ts`, used by both paths) is the
  **governed revert** — "undo that" / "put it back" restores the previous section version (or a
  named `versionId` from history) through the SAME `applySectionUpdate` path as any edit, but
  with the additive `forceReview: true` knob so a revert **always drafts into the approval queue
  and never auto-publishes**, even a low-risk one. It no-ops honestly when there's no earlier version.
- Google Business tools (`create_gbp_post`, `update_business_hours`, `upload_gbp_photo` — all
  three from `buildGbpTools`) NEVER write to Google directly — they queue a `status:"pending"`
  event (`metadata.kind` of `gbp_post_draft` / `gbp_hours_draft` / `gbp_photo_draft`); the real
  write happens on owner approval in `src/lib/event-actions.ts`, which leaves the event pending
  if the write fails and, on a SUCCESSFUL write, logs a `gbp-*` activity entry to the owner's
  "What Strelva did" feed. Review replies follow the same governed path (`review_reply_draft` →
  `publishReviewReply`). This is the safety invariant — do not add a tool that publishes to an
  external surface without queuing for approval first.
  - **Resolve on `success`, NOT on `verified`.** These external writes are NON-idempotent
    (a re-posted GBP update / review reply duplicates), so approval resolution gates on the
    write being *accepted* (`success`/`published`), not on the read-back confirmation
    (`verified`). When a write is accepted but the read-back can't confirm it, the write
    function emits a separate `change_verify_failed` event to surface the gap — keeping the
    approval pending instead would let a re-approval create a duplicate. Don't "fix" this to
    gate on `verified`.
- Governance: `src/lib/ai-governance.ts` decides publish vs review-queue vs block.
- The assistant's persona is **"Strelva"** — the system prompt in `src/app/api/agent/route.ts` opens "You are Strelva, the assistant that manages the website for …" and instructs it to refer to itself as Strelva. The client nav labels the chat "Ask Strelva".
- The system prompt is cached per tenant keyed on section timestamps (`buildSystemPrompt` in `agent-executor.ts`) — prevents thundering-herd Redis reads on concurrent chat turns.
- Changes trigger Slack notifications and signed revalidation to the client site.

## Operating conventions

Repo map, the starter-first rule, client lifecycle, access policy, and the quarterly entropy pass live in **[docs/operations.md](./docs/operations.md)**. Two rules agents enforce in any change: (1) reusable client-site code goes to `custom-repo-starter` first, never patched into one client's repo; (2) every tenant-data read/write is scoped by a tenant id derived from auth or trusted config, never from request input.

## Operational systems

- Event queue: `src/lib/events.ts` — `UnifiedEvent` in Redis sorted sets; powers the dashboard review queue, weekly brief, activity log. `event:{id}` bodies carry a 90-day TTL; `addEvent` prunes the per-tenant index zset by score on every write so the index can't outgrow the record TTL (dangling members would otherwise dilute the recency window `getEvents`/`getOpenChangeRequest` scan).
- **Governed-work Postgres mirror (Phase 2 ontology):** the governed-work lifecycle ALSO shadows into normalized Postgres tables `proposals` / `decisions` / `execution_attempts` / `outcomes` (`src/lib/governed-work/`, migration `20260714210000`). Two flags in `src/lib/db/dual-write.ts`: **`GOVERNED_WORK_DUAL_WRITE` — LIVE in prod** (best-effort shadow-writes on `addEvent`/resolve/execute via `shadow.ts`; flag-off = zero writes), and **`GOVERNED_WORK_READ_PG` — LIVE in prod** (`getEvents`/`getEvent` hydrate ALL governed events — the full `isGovernedScopeEvent` set — from Postgres via the `proposalToEvent` reverse-mapper in `read.ts`; flag-off = byte-identical Redis path, and any reconstruction miss falls back to the Redis event). **Redis stays authoritative** — the tables are a verified shadow, not the source of truth; **reads are non-authoritative + fail-soft**, and membership/status-filtering/index/ordering stay Redis-authoritative so `getOpenChangeRequest`/`getQueueCount` can't be corrupted. Parity VERIFIED (`scripts/governed-work-parity.ts` → 97/97). **Gap #3 CLOSED (2026-07-15):** custom `change_request` workflow states (triaged/quoted/shipped/declined) move through `resolveEventAction`→`updateEvent` (no decision row) — now shadowed via `shadowChangeRequestWorkflow` (re-syncs the proposal's status + payload) and reconstructed from `metadata.workflowStatus` (shipped→approved, declined→dismissed; resolvedAt recovered from `workflowUpdatedAt`, which shares one timestamp with resolvedAt). Historical CRs re-synced by `scripts/backfill-change-request-workflow.ts`. So change_request is no longer excluded from the read flip. Only `proposals` is tenant-scoped (children FK-cascade); it's in the `deprovision-tenant.ts` sweep. WRITES/authority remain Redis (the writes-flip is the remaining, harder-to-reverse step).
- Crons in `src/app/api/cron/` (source of truth is `vercel.json`): attention-digest, daily-summary, heartbeat, maintenance, maintenance-digest, monthly-report, ops-digest, order-review-request, poll-google-reviews, poll-instagram, poll-yelp, portfolio-scan, portfolio-snapshot, revalidation-reconcile, review-auto-post, review-nudge, search-console, staleness, visibility, weekly-report. (Every cron must also be in `CRON_MAX_AGE_SECONDS` in `src/lib/heartbeat.ts` or the heartbeat watchdog won't monitor it.) **Cron auth is defense-in-depth: every cron handler calls `requireCronRequest(request)` (`src/lib/cron-auth.ts`) as its first line, on TOP of the proxy's `CRON_SECRET` gate.** The shared policy (`validateCronRequest`, also re-exported from `src/proxy.ts`) requires an exact `Bearer <CRON_SECRET>` match and fails closed on a missing secret. `scripts/production-checklist.ts` (`checkCronAuthCoverage`) asserts every `vercel.json` cron route contains the handler guard — do NOT add a cron without it.
- Owner alert emails: `sendReviewNeedsReplyEmail` (a genuinely-new review) + `sendHealthRegressionEmail` (site-health grade slipped) in `src/lib/delivery-email.ts`. Both are **client** email (behind `emailSendingPaused()`, fail-soft) and **deduped once per event** via a persistent NX marker that is **rolled back on suppression/failure**, so a paused alert reaches the owner the day client email is switched on rather than being lost. Triggers: the review-needs-reply alert fires from the `poll-google-reviews` + `poll-yelp` crons via the shared `maybeAlertNewReview` (`src/lib/review-alert.ts`, `reb:review-alert-sent:*`); the health-regression alert fires from the `portfolio-scan` cron on a grade drop (`reb:health-alert-sent:{tenant}:{prev}>{cur}`).
- Done-for-you review replies (client sees replies handled, NOT a "draft it yourself" to-do): a per-tenant **`ReplyVoice`** (`src/lib/reviews/reply-voice.ts`, Redis `reb:reply-voice:{tenant}`) sets **mode** (`off` / `approve` / `auto`) + a plain "how you sound" guidance line + an example reply per review type. The owner edits it via the "How Strelva answers your reviews" panel on `/dashboard/reviews` (`GET/PUT /api/dashboard/reply-voice`). `draftReviewReply` (`src/lib/review-replies.ts`) folds the voice into its prompt so drafts mirror the owner's tone (empty voice ⇒ unchanged behaviour). The pollers respect the mode: `off` skips drafting; `approve` queues a pending `review_reply_draft`; `auto` ALSO stamps `metadata.autoPostAt = now + 12h` (`AUTO_POST_DELAY_MS`). The **`review-auto-post` cron** (every 3h) runs `draftReplyBacklog` (drafts unreplied reviews that predate the client turning replies on, capped per tenant) then `runDueAutoPosts` (`src/lib/reviews/auto-reply.ts`) — publishes any auto draft whose window elapsed through the SAME governed `resolveEventAction("approved")` path a manual approval uses (NO new external-write path; re-checks the live mode so a switch off "auto" cancels a stamped draft; an edited/dismissed draft never fires). The reviews page shows each review's pre-drafted reply (with the auto-post countdown or "approve to post") instead of a draft-it button; undrafted-but-mode-on reviews read "Strelva is writing a reply…". **This is the one place the "never auto-publish external without approval" invariant is deliberately relaxed — only for a client's explicit `auto` opt-in, and only after the 12h safety window.**
- One-click approve-from-email: `GET /api/approve` (`src/app/api/approve/route.ts` + `src/lib/approve-link.ts`). The review-needs-reply email carries "Approve" / "Not yet" links the owner clicks without signing in. Each link is an **HMAC-signed token** binding `{eventId, tenantId, action}` + a 14-day expiry (secret reuses the oauth-state chain: `APPROVE_LINK_SECRET` → `OAUTH_STATE_SECRET` → `INTERNAL_API_SECRET`). The route is public (token is the only auth), **tenant-scoped twice** (token binds the tenant + `resolveEventAction` rejects a `wrong_tenant` mismatch), **idempotent** (a replayed/double-clicked link hits an already-resolved event → friendly "already handled" page), and resolves through the SAME governance spine as the dashboard (`resolveEventAction`: approve → "approved" which performs the external write, not-yet → "dismissed"). No new external-write path — it drives the existing governed one.
- Order-triggered review requests: `src/app/api/cron/order-review-request/route.ts` (schedule in `vercel.json`). A few days after a storefront order lands (via the `/api/v1/track` beacon → `src/lib/orders.ts`), emails the OWNER their Google review link (`sendReviewRequestEmail`) to forward to the customer. Guards mirror the review-nudge cron: **skips any tenant with no derivable review URL** (no `reviewsConfig.googlePlaceId` ⇒ no request — never invents a link), respects the client email pause, and **dedupes per order** with a bounded delay window (`REVIEW_REQUEST_DELAY_DAYS`, default 3) + a rolled-back-on-failure `reb:order-review-request-sent:*` marker.
- Integrations registry: `src/lib/integration-registry.ts` (UI metadata) + `src/lib/connections.ts` (live API access).
- Weekly brief: `src/lib/weekly-brief.ts` + `src/lib/reports.ts` (per-tenant error isolation; deterministic claims-safe fallback when Gemini fails; Resend errors are counted, not swallowed). The win column pulls the positive `getClientReviewSummary` (new 5-star, praise themes) — admin-only review signal never enters the owner's report.
- Pay links: `src/lib/pay-links.ts` + `/pay/[slug]` + super-admin `POST/GET /api/admin/pay-links` — per-client payment-before-work links (Redis `reb:paylink:*`). Submitted amounts are **whole dollars** (number or string) on the public API. `/pay/rohlax` is a grandfathered one-off (her deal is one-time, "no monthly fees ever" — never use it as the template).
- Build payments: the Stripe webhook records every completed `mode:"payment"` session as a durable no-TTL `reb:build-payment:{sessionId}` record + Slack ping (tenant events alone prune at 90 days).
- One-active-request gate: `getOpenChangeRequest` in `src/lib/events.ts` — one open custom change request per tenant, enforced on both the dashboard route (409) and the agent's `request_custom_change` tool; offboarding handoff requests are excluded by `metadata.kind`.
- Operator command center: the whole operator surface lives under the `/admin` path and is served on the **bare admin host** `admin.strelva.com` (and `admin.localhost`) — `src/proxy.ts` (`isBareAdminHost`/`shouldRewriteBareAdminConsole`) rewrites the bare admin host root onto `/admin`, gated on super-admin (non-admins bounce to the app-host `/sign-in`). NOT to be confused with `admin.<tenant>.strelva.com`, which is a client's own admin dashboard. Surfaces: the **"Needs you" overview** (`src/app/admin/page.tsx` + `TodayFeed.tsx` — leads / approvals / at-risk / recent signups, led ahead of MRR; **no client table** — a "View all clients" link + portfolio roll-ups + a collapsed Mission Control console sit below), **ONE client list** at `/admin/clients` (`ClientsCrm.tsx` — calm rows carrying stage + SEO grade + launch % + at-risk, each linking to the detail page) and **ONE merged detail** at `/admin/clients/[id]` (the cockpit: KPI pulse, `SiteScan` health, `ReviewIntelPanel`, `VisibilityPanel`, `DomainManager`, `TenantEditor`, `ClientCrmSections`, activity), **Leads** at `/admin/leads` (`LeadRows.tsx`, backed by `src/lib/lead-workflow.ts`), and **Search + Analytics** at `/admin/analytics`. The old 4 separate lists collapsed to this one list + one detail; `/admin/tenants` and `/admin/tenants/[id]` are now thin **redirects** to the `/admin/clients` routes. **Nav** is a left rail (`src/app/admin/AdminRail.tsx`) grouped by purpose — **Overview**, then **Clients** (Clients / Leads / Onboard / Pay links / Analytics), **Review** (Actions / Drafts / Maintenance), **System** (Ops / Audit); no "More" dropdown, and `NavLinks.tsx` is gone. On mobile the rail is `hidden md:block` and `src/app/admin/AdminMobileNav.tsx` provides a top-bar + slide-in drawer (same grouped nav). **Dense list rows reflow to flex on phones and use their fixed `grid-cols-[…]` only at `md+`** (`ClientsCrm.tsx`, `SiteAuditsBoard.tsx`) — never a fixed-px grid at the base breakpoint, since the reserved tracks (even under `hidden md:block` cells) crush the identity column and overlap the name with the trailing control; name+action card headers stack under `sm` (`MaintenanceDigests.tsx`); wide tables sit in `overflow-x-auto` (`LeadRows.tsx`); `Chip` is `shrink-0 whitespace-nowrap`. Verify mobile by *scrolling* at 390px — the client dashboard scrolls in an inner container, so a `fullPage` shot / overflow check misses everything below the fold. All `/admin` surfaces render through the shared design system in **`src/app/admin/console.tsx`** (`Panel`/`Vital`/`Chip`/`Grade`/`LaunchBar`/`Meter`/`ClientLogo` — verdict-first, one sage family + 3 status hues, real logos not colored dots), with `src/components/dashboard/Sparkline.tsx` for the KPI trend lines. Status hues map through `src/lib/status-colors.ts` to the `positive`/`warning`/`critical` design tokens (never raw Tailwind palette). **`/admin/audit` is "Site audits"** — a portfolio board to run a health+SEO scan on any client (`POST /api/admin/scan`, worst-score-first, grade/score/issue counts) with the operator **action log** as a second "Operator activity" section below. Full map: `docs/operator-command-center.md`.
- Super-admin inspect mode: `src/lib/inspect-mode.ts` + `GET /api/admin/inspect` (toggle) let a super-admin pull up ANY client's feature-gated dashboard surface as a read-only PREVIEW, so the operator can see exactly what a client sees without that client's login. **`isInspecting()` is fail-closed** — true only when the `strelva_inspect` cookie is set AND `isSuperAdmin()` re-verifies (re-checked at every enforcement point); the cookie is INTENT only and authorizes nothing. `requireDashboardFeature` (`src/lib/dashboard-feature-guard.ts`) now returns `{ tenant, preview? }`: a tenant missing the feature 404s for a real client, but renders the surface with an `<InspectPreviewBanner>` (and an "OFF" tag in nav + an "Inspecting {tenant}" strip in `HistorySidebar`) for an inspecting super-admin. `preview` is **display-intent only, NOT read-only enforcement** (a super-admin already has full tenant write access via `hasTenantAccess`). The toggle is open-redirect-safe (`safeRelativePath` rejects scheme/`//`/backslash) and the intent cookie is httpOnly + sameSite-lax + secure-in-prod, session-scoped.
- Vertical-set dashboard surfaces: **schedule / roster / members** (the wellness/booking set) and the **store** sub-tab (ecom) are now REAL read surfaces (no longer `ComingSoon` stubs), gated by the tenant's `features[]` via `getSetSurfaces` (`src/lib/dashboard-surfaces.ts`) + `requireDashboardFeature`. Roster/Schedule read `getBookings`/`getBookingConfig` and **anchor "today" to the tenant timezone via `zonedTodayIso`** (`src/lib/booking.ts`) — a UTC date rolled past ~8pm ET and hid that evening's classes; booking config/date-overrides persist in the Redis booking-store. Members reads the KV-gated membership store and honestly renders "not set up" on `KvNotConfiguredError` rather than a fake promise. All fail-soft to an empty/default surface on a backend blip.
- Portfolio actions: `/admin/actions` (`src/app/admin/actions/`) — the operator's single "clear the whole portfolio" screen for the operator managing many sites, two stacked layers. (1) **Proactive "Ready to work"** (`portfolio-opportunities.ts`): scans every active client for latent, not-yet-drafted work — unreplied reviews, sites gone quiet 30+ days (`getOwnerRetentionSignals`), D/F health (`scan-store`) — grouped by kind. Each group's one-click **"Draft these"** routes the selected clients through an EXISTING governed draft path (`draftReviewReply` → pending `review_reply_draft` for reviews; `generateProactiveSuggestions` → pending suggestion cards for stale/low-health) so drafts land PENDING, never auto-published; idempotent (skips a review that already has a pending draft; `generateProactiveSuggestions` never floods). (2) **Pending approvals** (`portfolio-actions.ts`): every PENDING approvable event across all clients, grouped by client, bulk-approved through the SAME governed spine as the dashboard (`bulkResolvePortfolioActions` → `resolveEventAction`) — an external write that fails leaves its item pending and is reported as honest partial failure, never silently marked done. Both reads degrade to empty (a backend blip can't 500 the overview). The server actions (`actions.ts`) **re-verify super-admin independently** — the `/admin` layout gate does NOT protect a server action's POST surface. Linked from the admin nav "More" + a count on the Overview "Needs you" feed ("Clear portfolio →").
- Approval diffs (`src/components/dashboard/QueuePage.tsx` `QueueEventDetail`): a pending event now shows what's being approved, not just its title — a `content_update` renders a field-level before→after diff (`metadata.diffs`, from `generatePreviewDiffs`); a `gbp_post_draft` shows the actual post text + CTA link ("What will be posted to Google"); a `gbp_hours_draft` shows the proposed hours in 12h format ("New hours for Google", no invented before-column since the event only carries the proposed hours). Read-only detail under the existing approve/skip card, so a bulk-approver reads the real thing. Renders on both the client Today queue and the operator side (the same component backs both).
- CRM comms auto-log: real email sends log into the operator CRM activity timeline (`src/lib/tenant-crm.ts` `addTenantActivity`, kind `email`) via `delivery-email.ts`'s opt-in `tenantId` param (`logSentEmailToCrm`, no-op when no `tenantId`, fail-soft — a CRM-log failure never breaks the send). Logged **only after a real send goes out** (every sender returns early when paused/missing a key, so a suppressed send is never recorded). Wired from the lifecycle-email route + the review-alert / order-review-request / review-nudge / portfolio-scan send sites.
- Lead workflow: `src/lib/lead-workflow.ts` — operator status (`new` / `contacted` / `converted` / `dismissed`) layered ON TOP of the migration-sensitive lead record, keyed by the lead's `statusToken` in Redis (`lead-workflow:{token}`; same read-modify-write blob pattern as the operator CRM, degrades to a `new` default without Redis). Drives the `/admin/leads` board and feeds the "unworked leads" count on the "Needs you" overview.
- Operator CRM: `src/lib/tenant-crm.ts` — a lightweight per-tenant client record (pipeline `stage` = lead/building/live/at_risk/churned, `tags`, `notes`, `contacts`, `activity` timeline) as one JSON blob in Redis at `crm:{tenantId}` (same pattern as leads/pay-links; no DB migration — internal operator metadata for a handful of clients, read-modify-write, degrades to a default record without Redis). Super-admin CRUD via `GET/POST /api/admin/tenants/[id]/crm` (audit-logged); the `/admin/clients` page reads all records via `getAllTenantCrm`.
- At-risk / churn signal: `src/lib/churn.ts` — persists each tenant's daily owner agent-engagement count into a 7-day rolling Redis store (`reb:engagement:{tenantId}:{day}`, ~10-day TTL) written by the `daily-summary` cron via `recordDailyEngagement`, and composes it with inactivity (>21 days no owner activity) + subscription status into a single at-risk verdict (`getTenantAtRisk`/`getAtRiskTenants`) that the operator "Needs you" dashboard reads.
- Report cadence: `src/lib/report-cadence.ts` — decides WHEN the weekly-report cron emails a tenant (not what's in it). Per-tenant override in Redis (`reb:report-cadence:{tenant}`, default `monthly`; last-sent throttle at `reb:report-sent:{tenant}`); tiers aren't a code signal, so an operator flips a high-touch client to `weekly`. The `weekly-report` cron gates each send on `isReportDue`.
- Client lifecycle emails: `sendWelcomeEmail`/`sendSiteLiveEmail`/`sendReviewRequestEmail` in `src/lib/delivery-email.ts` (all behind the client `emailSendingPaused()` gate, fail-soft). Wired to an operator "send" surface: `POST /api/admin/tenants/[id]/lifecycle-email` (`type: "welcome" | "site-live" | "review-request"`; super-admin, audit-logged) resolves the tenant's contact + URLs from trusted tenant config (never request input) and calls the matching sender. Because a `false` return means either "paused" or "send failed", when a send returns false AND client email is paused the route returns `200 { sent: false, paused: true }` so the UI reads it as an off-switch, not an error. Each sender also passes its `tenantId` so a real send auto-logs to the operator CRM timeline (see CRM comms auto-log above).
- Search Console + GA4 analytics: `src/lib/analytics.ts` — per-tenant analytics config (which GSC property + GA4 property to read) in Redis at `analytics:cfg:{tenantId}` (GSC default derived from the tenant's siteUrl); fail-soft reads that always return a status (`ok`/`unconfigured`/`unavailable`) and never throw. **Auth is OAuth-first, service-account-fallback** — each read tries the tenant's own Google connection when they granted the matching scope (`getGoogleScopeGrants`/`getGoogleAccessToken` in `src/lib/google-token.ts`), else falls back to the shared Strelva reporting service account (JWT signer reused from `search-console.ts`). Admin view at `src/app/admin/analytics/`; config write via `POST /api/admin/tenants/[id]/analytics-config` (super-admin, audit-logged).
  - **GSC property totals** are the TRUE property aggregate: `getSearchConsolePerf` fires TWO reads — an un-dimensioned request for the real totals (clicks/impressions/ctr/position) and the `dimensions:["query"], rowLimit:20` request for the `topQueries` list only. (It previously summed the top-20 rows, which understated any long tail.) The cron twin `search-console.ts` `fetchSearchData` does the same. **Do NOT go back to summing the query rows for totals.**
  - **Reads are cached read-through in Redis** (`analytics:gsc:{tenant}:{days}` / `analytics:ga4:{tenant}:{days}`, ~15-min TTL, only `status:"ok"` results cached) — the dashboard, admin view, and weekly-report cron each call the reads independently, so without the cache a single dashboard load minted a token + hit Google 2-4× live. There is no explicit cache bust on a property repoint: the short TTL is the single staleness bound (numbers self-heal within it). A per-window invalidation list was tried and removed — it drifted from its callers (a `days=30` caller was silently missed). Fail-open when Redis is null.
  - **Auto-setup because we host** (the "analytics wires itself up" promise): (1) GA4 pageview tag `custom-repo-starter/ScaffoldGA4.tsx` — a self-contained, fail-silent, CSP-friendly drop-in (mirrors `ScaffoldTracker`) that loads gtag.js only when `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is set and is a complete no-op when unset; the operator just sets the one env var. (2) Provision-time analytics config: `src/lib/provisioning.ts` best-effort `setAnalyticsConfig` writes `analytics:cfg` with the siteUrl-derived GSC property (`deriveScDomain`) so a tenant has stored config from day one. (3) `registerHostedSiteWithSearchConsole` in `analytics.ts` is **GATED-OFF groundwork** — never auto-invoked, no-ops unless `opts.allow === true`, writes no verification token so it **cannot fabricate a verified state** (the Sites:add call only succeeds if the reporting service account is already a verified owner). The supported grant path is still the manual "add the reporting service account as a GSC/GA4 user" step provisioning surfaces.
- Visibility cron gating (`src/app/api/cron/visibility/route.ts`): derives the probe `trade` from the tenant's `industry` field when no `visibility.trade` is hand-set (a real field, not a guess) so a tenant that never had a `visibility` block still collects wedge data — instead of silently skipping. `towns` are never invented; a tenant missing a real trade/town is recorded as `missing_*` and surfaced to an operator (deduped `alertOnce`), never a silent no-op.
- Site health / audit: `src/lib/scan.ts` (`scanTenant`/`scanAllTenants`) wraps the audit engine (`src/lib/audit/checks.ts` `runAudit`) and is the ONLY writer to `scan-store` (`src/lib/scan-store.ts`, Redis) — the single source of truth for per-tenant health + history. The daily `portfolio-scan` cron (`0 5 * * *`) populates every tenant; the client `/dashboard/health` and the admin overview grade/score/sparkline read the SAME store. **Do NOT add a parallel audit-history store or cron** — a duplicate was built and removed; all health work goes through `scan.ts`/`scan-store`. ⚠️ **AUDIT REPO BOUNDARY — read before touching any `/audit` code.** This engine's real job is the **client** audits: `scan.ts` → the admin `/admin/audit` scan + the client `/dashboard/health`. This repo ALSO renders an `/audit` page + `/api/audit/scan` + `/api/audit/lead` (rate-limited), but those serve the **legacy scaffoldweb.com hosts, NOT strelva.com**. The **live public free audit at strelva.com/audit is a SEPARATE, self-contained 5-check engine in the `~/strelva-marketing` repo** (`src/lib/tools/` + `/api/tools/scan`), which the 4 Chrome extensions (`~/strelva-tools`) deep-link to. **Public-audit / lead-magnet / marketing-facing audit features belong in `~/strelva-marketing`, not here.** (The two engines have diverged — this one is deeper: 8 categories incl. AI-readability + granular per-check findings; marketing's is 5 shallow checks. Consolidation is an open decision — see the vault `1-projects/scaffold-web/audit-tools-final-2026-07-11.md`.) Sendable one-pager for the client audit: `src/lib/audit/html.ts` + `/api/audit/report`; agent/batch CLI: `scripts/full-audit.ts` (`pnpm audit:full`) on `src/lib/lead-audit.ts`. The admin scan (`POST /api/admin/scan`) also returns `prioritizedIssues` (via `src/lib/audit/prioritize.ts`) — the ranked "fix first" list rendered admin-side in the tenant `SiteScan` view; the client only ever sees grade/score. `scanTenant` **persists** a capped `prioritizedIssues` list AND the true severity counts (`prioritizedCounts` = high/medium/low across ALL open issues, not just the capped 8) into `scan-store`, so `SiteScan` shows the fix-first verdict **on load** (not null-until-rescan) and the "N high · N medium · N low" badge stays accurate even when a site has more than 8 issues (legacy records without counts fall back to counting the capped list). Full: `docs/audit-page.md`.
  - **Real GA4 in the dollar-impact:** `scanTenant` sources a `TrafficProfile` (real GA4 monthly visitors + a leads-based conversion rate over the same 30-day window) and threads it into `runAudit(url, { traffic })` → `attachImpact`. Paying clients get dollar/customer estimates computed from their real traffic (labeled "based on your traffic"); the anonymous `/audit` tool passes nothing and keeps the generic 500-visitor prior (labeled "estimated"). Any GA4 read that isn't `ok`/has 0 users → generic prior, so pre-activation tenants are unaffected.
  - **90-day baseline anchor:** `scanTenant` captures a durable, set-once, NO-TTL day-0 health snapshot (`saveScanBaseline`/`getScanBaseline` in `scan-store`, `reb:scan:baseline:{tenant}`) seeded from the earliest retained point. `milestone.ts` compares "then" health against this anchor instead of the 12-point / 30-day ring buffer (which only ever reached back ~12 days). Honest "tracking since" still shows when there's no real earlier baseline.

## Key lib files

- `src/lib/tenants.ts` — tenant config lookup (Postgres `tenants` via `TENANTS_SOURCE`, dev-file fallback for local, Redis 60s cache); the `rowToTenant`/`tenantToRow` mapper is the 45-column spine. **`tenantToRow` always emits `site_name` + `created_at`** (the generated Insert type requires `site_name`), so `updateTenant` backfills both from the existing row before upserting — a partial update (e.g. an admin setting `customRepo`) must NOT blank the name or reset `created_at`, which feeds `milestone.ts`'s 90-day baseline. Don't "simplify" that backfill away. **Identity spine (#6, 2026-07-15):** `tenants.id`/`subdomain` is the mutable routing slug; `tenants.stable_id` (uuid) is the immutable identity, now hydrated onto `TenantConfig.stableId` by `rowToTenant`. Host→slug parsing lives in ONE Edge-safe place, `src/lib/tenant-host.ts` (`parseTenantHost`); `proxy.ts` `extractTenantFromHost` + `tenant.ts` `getTenantFromHost` both delegate to it (do not re-add a second parser). EXPAND is LIVE: every tenant-scoped table has a `tenant_stable_id` uuid mirror of its slug FK, kept in sync by the `set_tenant_stable_id()` trigger — **nothing reads it yet** (routing/keys/RLS still on the slug); it exists for the future CONTRACT flip. Don't hand-write `tenant_stable_id`; the trigger derives it.
- `src/lib/crypto/secrets.ts` — **at-rest envelope encryption (AES-256-GCM) for provider secrets.** `encryptSecret`/`decryptSecret` wrap the 4 secret columns at the `rowToTenant`/`tenantToRow` boundary (`slack_webhook_url`, `google_search_console_key`, `instagram_access_token`, `revalidation_secret`) and the `accessToken`/`refreshToken`/`apiKey` fields in `connections.ts`. **ACTIVE in prod as of 2026-07-15** — `SECRETS_ENC_KEY` is set in Vercel and `scripts/backfill-secret-encryption.ts` has been run, so existing secrets are `enc:v1:`-enveloped at rest (verified: round-trips cleanly). Reads are dual-mode: a legacy plaintext value (no `enc:v1:` prefix) still passes through, an enveloped value is decrypted, so a mixed table reads correctly — and local/dev with no key set stays fully plaintext (keyless-safe). To re-run activation elsewhere: set `SECRETS_ENC_KEY` (any passphrase; sha256'd to the key) → run the backfill (idempotent, refuses without the key). Every write of those secrets routes through `upsertTenant`/`tenantToRow` or `saveConnection`, so activation fully covers them; do NOT write those columns/Redis connection blobs by any other path. Residual: the `reb:tenants:all` Redis list cache holds a decrypted copy (60s TTL) — correct for reads but outside the at-rest boundary; optional defense-in-depth.
- `src/lib/storage/content-cache.ts` — Redis read-through/write-through cache for the public content path
- `src/lib/storage/content-store.ts` — Postgres `content` (via `CONTENT_SOURCE`) with dev-file fallback; `src/lib/db/repositories.ts` + `src/lib/db/source-flags.ts` back the path. `transformSanityImages` + `sanityImageUrl` are retained (only) to resolve legacy Sanity-CDN image asset refs still stored in pg rows, until the content-URL rewrite ops step
- `src/lib/auth.ts` — Supabase Auth (`auth.uid()`) + per-tenant roles via the `memberships` table + super-admin via `super_admins`. Supabase-only as of #146 (the Clerk dual-path is gone); `src/proxy.ts` owns the request-level auth gate + `isPublicRoute`/`isCronRoute` matcher (hand-rolled, fail-closed). Route gates: `requireTenantAccess` (membership), `requireTenantPermission(tenant, perm)`, and `requireTenantPermissions(tenant, perms)` (multi-permission, e.g. tenant-settings) — the permission gates resolve the role once and 403 on non-membership, so they subsume `requireTenantAccess`.
- `src/lib/db/middleware-client.ts` — the proxy's Supabase client. `applyMiddlewareSupabaseResponse(req, response)` (called first in `applySecurityHeaders`) writes any refreshed session cookies onto the outgoing proxy response — don't drop it or refreshed tokens are lost.
- `src/lib/template-manifests.ts` — `getTemplateManifestForTenant` gives lib/server code the template's shape (`contentSections`, editable set) WITHOUT importing `@/components/templates/registry`; prefer it over `getTemplateForTenant` in non-component code (agent prompt, needs-you, content-section validation all use it).
- `src/lib/cron-auth.ts` — shared cron `CRON_SECRET` policy: `validateCronRequest` (exact `Bearer` match, fail-closed) + `requireCronRequest(request)` handler guard. Every cron uses the guard (see Operational systems).
- `src/lib/site-capabilities.ts` — capability manifest builder (merged with the optional remote manifest a custom repo publishes at `customRepo.capabilityManifestUrl`, SSRF-guarded + Zod-validated). The manifest URL is settable on EXISTING tenants via `POST /api/admin/tenants/[id]/capability-manifest` (super-admin) — not just at create. The agent's editable-section set (`resolveEditableSections` in `agent-shared.ts`) adds sections the remote manifest declares beyond the template (excluding component render-keys), so the AI edits what the LIVE custom site renders. A custom repo publishes its manifest via `custom-repo-starter/site-capabilities-route.ts` + `buildSiteCapabilityManifest` (`scaffold-client.ts`).
- `src/lib/scaffold-contracts.ts` — versioned route helpers + HMAC revalidation signing/verification (legacy `REB_*` symbol aliases are still exported for back-compat)
- `src/lib/audit/*` — the site-health audit engine: `checks.ts` (`runAudit`), `context.ts` (one-fetch `AuditContext`), `modules/*` (6 checks ported + fidelity-reviewed from the archived OWSH Systems product: ai-readability/seo-foundations/security/accessibility/trust/content), `impact.ts` ("what this costs you" + dollar-quantified narrative + `topFixes`; the quantified estimates multiply against a `TrafficProfile` — a paying client's real GA4/leads numbers threaded from `scan.ts`, or the generic prior for the anonymous audit), `prioritize.ts` (`prioritizeIssues` — ranks an `AuditResult`'s failing/warning checks into one admin-only "fix first" list; **pure transform, no store/cron**; ported/de-scoped from OWSH, revenue modeling intentionally omitted), `scoring.ts`. Always consumed via `src/lib/scan.ts` -> `src/lib/scan-store.ts` (see Operational systems).
- `src/lib/reviews/*` — dependency-free review intelligence (ported from the OWSH `sentiment-analyzer`): `sentiment.ts` (negation/intensifier-aware lexicon scoring + topic/keyword/urgency/emotion), `intelligence.ts` (the **admin-vs-client split** — `getClientReviewSummary` = positive owner-facing numbers only; `getAdminReviewIntelligence` = sentiment breakdown + urgent-first needs-a-reply queue + concerns + at-risk). Synchronous, no model call. Surfaces: client → `weekly-brief.ts` + `ReviewsPanel`; admin → the tenant page `ReviewIntelPanel` + `GET /api/admin/tenants/[id]/reviews-intel`. Product rule: issues are admin-side, the client sees good numbers as good numbers. Full: `docs/features/review-engine.md`.
- `src/lib/review-replies.ts` — filter-safe review-reply drafting (anti-boilerplate lint from the 12,752-reply rejection dataset, near-duplicate check, deterministic fallback, always queued for approval). Enriched with a sentiment/topic hint from `reviews/sentiment` so drafts name the reviewer's actual concern/praise.
- `src/lib/guides.ts` + `src/content/guides/batch-*.ts` — the `/guides` SEO blog (articles repurposed from the OWSH fix guides; each `fixesSlug` links an article to the audit category it addresses)

---

# Strelva — AI Website Management Platform

## Brand structure (founder decision, 2026-06-01)
Strelva is **one brand with two divisions**, not a single product:
- **Websites** — the managed-website product described in this doc (paid custom build + AI-managed updates + weekly report). Well-defined; **this repo is its control plane.**
- **Custom Software** — workflow software / custom apps / automations built for businesses (the higher-ACV arm). Its definition, ICP, naming, offering, and proof model are **not finalized** (founder: "workflows, and we're gonna need to do research") — do **not** ship hard claims for this division.

Everything below describes the **Websites** division.

## What This Is
A control plane for local-business websites. Owners see a dashboard with what's happening on their site (visitors, clicks, reviews) and chat with an AI that handles updates. The public website lives in a separate **custom repo** (a per-client Vercel project) that pulls content from Strelva's `/api/v1/*` contract.

## One-Liner
"See what's working. Tell the AI what to change."

## The Model (founder decision, 2026-06-26 — 3-tier subscription, billing LIVE)
Pivoted 2026-06-26 from the two-door build-fee offer (`docs/strategy/website-offer-two-door.md`, now **superseded**) to a **pure monthly subscription, no upfront fee** — building is fast now, so the goal is low-friction sign-on. Three tiers, differentiated by **capability** (not page count):
- **Presence — $99/mo:** one-page lander (get found, click-to-call/booking, local-SEO foundations).
- **Growth — $199/mo:** full multi-page site + **transact** (online booking or basic ecom). The anchor/"most popular" tier; `STRIPE_SCAFFOLD_PRICE_ID` defaults to it.
- **Scale — $499/mo:** everything in Growth + the **content engine** (blog/SEO content the AI writes and we review), multi-location, integrations, priority done-with-you management.
- **Shared across all:** custom site (never a template), update-by-chat AI, weekly report, hosting; **you own your domain + content, leave anytime** (the wedge + the no-contract trust signal).
- **Tiers are packaging + build-scope, NOT code-enforced feature flags** — the platform serves whatever's built into the client's repo; the Stripe price just sets the charge. No engineering needed to "support tiers."
- **Ownership is the positioning spine**: domain in the client's name from day one, content export anytime (see `docs/repo-transfer-runbook.md`, `docs/domain-setup.md`).
- **Billing is LIVE (2026-06-26)** on the new standalone Strelva Stripe account (`acct_1Tmc5dA4gUnh4arE`). `isBillingEnabled()` (`src/lib/subscription.ts`) is true (`STRIPE_SCAFFOLD_PRICE_ID` = the Growth price). `STRIPE_BILLING_GRANDFATHER_TENANTS=gldf,rohlax` keeps existing clients active; `check:prod` enforces the grandfather-list-or-402 rule.
- ⚠️ **To change any Stripe/billing env var you MUST do a fresh `vercel deploy --prod --yes --scope scaffold-web`. `vercel redeploy` REUSES the target deployment's env snapshot and will NOT apply env changes.**
- **gldf + rohlax are grandfathered** (no subscription; protected via the list). New clients subscribe at a tier price.
- **Offer hook = "free to build" (founder decision, 2026-06-26):** no build fee, no upfront/setup cost. We **build first**, the client approves, and the **monthly subscription starts at go-live** ("pay when you're happy"). This is a deliberate low-friction growth hook — we accept the risk of an occasional unpaid build as the cost of frictionless sign-on. Marketing says "free to build / pay when happy" on purpose; do NOT "correct" it to a pay-first framing.
- Canonical pricing/Stripe-setup detail (account, live price IDs, branding): vault `1-projects/scaffold-web/pricing-and-billing.md`.
- Agency channel (wholesale resell) was researched and parked (2026-06-09); not built.

## Value Hypothesis
Local-business owners will pay for a dashboard that proves their website is working + an AI that handles updates — IF the dashboard shows clear value, the AI actually makes changes when asked, and the weekly report lands before the bill recurs.

## ICP
- Local businesses with 1–10 people who have a website problem they've stopped trying to solve.
- Has a bad website, uses LinkTree + booking platform, or just left an agency.
- Wants more clients, not a dashboard (but the dashboard proves value).
- Talks to the AI like texting a person: "add my new yoga class on Saturdays."
- Verticals served so far: wellness, food-brand, restaurant, trades, professional, fashion-stylist. (Sites are hand-built custom repos — don't anchor design work to `src/components/templates/`; that track is legacy.)
- Pitch order (ICP research, 2026-06-09): sell the **chat** ("tell it what to change") and the **weekly report** ("proof it's working") — the dashboard is supporting evidence, never the headline. For trades, open with money leaking ("customers are looking; you're not there"), never "your website." Never promise lead counts — we own the work and the proof, not a guaranteed result.

## What The Client Sees
1. **Custom website** built by Jacob, hosted in a separate per-client repo, served on the client's own domain.
2. **Business OS Dashboard** at `admin.{client-domain}` (dark monochrome). The nav is a
   **conditional 8-surface set** (Today · Ask Strelva · Website · Google Business ·
   Analytics · Reports · Reviews · Settings) resolved by `getDashboardSurfaces(tenant)`
   (`src/lib/dashboard-surfaces.ts`) and rendered by `HistorySidebar.tsx` / `MobileNav.tsx`
   via `surface-nav.ts`. Full map: **[docs/client-dashboard-ia.md](./docs/client-dashboard-ia.md)**.
   - **Manage** — **Today** (`/dashboard`, at-a-glance + next action; inbound leads fold in
     here as "Who reached out"; **phone-call taps count as customer actions** — the tracker's
     `phone-click` beacon folds into the "Customer actions" total (honest "booked or called"
     copy) on both Today and Analytics via an optional `phoneClicks` on `WeeklyBriefStats`;
     the booking-specific `bookingClicks` field stays intact for `proof.ts`/`goals.ts`; the
     **"What Strelva did for you" activity feed**
     (`ActivityFeed.tsx` + `src/lib/activity-feed.ts`) — an owner-facing, past-tense timeline
     of the managed done-for-you work, the anti-churn proof surface. `selectStrelvaWork`
     scopes it to `actor:"ai"` + `actor:"admin"` + posted review replies (`type:"review-reply"`)
     + published Google Business actions (`type` `gbp-post`/`gbp-hours`/`gbp-photo`) and
     **excludes the owner's own manual edits**; only genuinely-live work is shown
     (pending drafts / "dashboard only" reply drafts are skipped), with an honest empty state.
     GBP posts/hours/photos now appear once published — `event-actions.ts` logs a
     `gbp-*` activity entry (actor `admin`) on a SUCCESSFUL approval-write only), **Ask
     Strelva** (`/dashboard/chat`, the agent chat).
   - **Your presence** — **Website** (spine; Site + Content/Assets/**History**/Store as
     sub-tabs — History holds the change log + revert-to-last-good; **Store folds in** as a
     sub-tab only when the tenant runs a storefront, never a top-level tab), **Google
     Business**, **Analytics** (the **LIVE / rolling** surface — a range selector
     `Live · This week · This month · Custom` (`AnalyticsRangeSelector` → `?range=`) drives
     every number; the headline verdict, tiles, and chart are all computed live for the
     selected window from the daily metric series via `src/lib/analytics/period.ts`
     (`resolveRange` + `computePeriodStats` + `periodHeadline`), so the headline can never
     contradict the chart or the anomaly. `AnalyticsLiveView` + `SiteHealthCard`. **The written
     recaps live on the separate Reports surface** — `/dashboard/reports` renders the weekly
     brief + the monthly recap (`WeeklyBriefClient` with a Weekly/Monthly toggle; the monthly
     recap = `generateMonthlyRecap` + the `monthly-report` cron, stored period-tagged in the
     same recap store). Analytics also carries
     the **90-day "prove it" milestone** (`MilestonePanel.tsx` + `src/lib/milestone.ts`) — a
     real then→now recap (traffic, review count + rating, health grade) built only from stored
     history; the "then" health compares against a durable set-once day-0 anchor
     (`getScanBaseline`), not the 12-point/30-day ring buffer, so an aging client gets a true
     90-day delta; "tracking since {date}" when a metric has no baseline, a forward-looking
     "building" state until enough history — and the **AI-visibility scorecard** "You in AI
     answers" (`AiVisibilityScorecard.tsx` + `src/lib/ai-visibility-scorecard.ts`) which reuses
     the weekly visibility snapshot, counts only probed answers, and never shames a gap; plus
     a **"Where your visitors come from" GA4 traffic panel** (`TrafficSourcesPanel.tsx`,
     rendered in the Analytics `footerSlot`) — top sources + landing pages from `getGa4Perf`,
     with a Connect-Google state when GA4 is unconfigured),
     **Reviews** (verdict-first **reputation header** — `ReputationHeader.tsx` +
     `src/lib/reviews/reputation.ts` `buildReputationSummary`: rating + response rate +
     review velocity + praise themes, built ONLY on the client-safe `getClientReviewSummary`
     — a low response rate reads as an opportunity ("reply to N waiting"), few reviews as
     "let's get more", never shame; plus a **"get more reviews" share action** in
     `ReviewsPanel.tsx` — a copyable Google review link from `reviewsConfig.googlePlaceId`
     (`buildGoogleReviewLink`) + a paste-ready share message, with an honest "connect your
     Google listing" state when there's no Place ID. A competitor star-rating benchmark was
     deliberately NOT built — no real local-average data exists, so it was omitted rather
     than fabricated).
     Each presence surface has a `state` (`shown` / `connect` / `hidden`): Google Business +
     Reviews resolve by business type (`getPresenceProfile` → local/online/hybrid) plus
     connections, so an online-only brand never sees local-SEO framing it can't use, and a
     local business with no review source yet sees a "connect" tab instead of a dead one.
     The first-run checklist (`/api/dashboard/onboarding-status`) leads with "Tell us how
     customers find you" so business type is set on day one — `settings.businessModel` drives
     it (`""` = infer from template).
   - **Settings** — the always-present seventh surface (gear in the identity footer, not in
     the resolver list). Consolidated to **4 top-level sections** (`Business` · `Account` ·
     `Domains` · `Plan`, `src/app/dashboard/settings/page.tsx`): the previously-thin
     business/site sections (Business info, Branding, Site config, Connected services,
     Shortcuts) **plus Ownership** now fold into `Business` as labeled in-page bands, with a
     legacy-hash map (`LEGACY_HASH_TO_SECTION`) so old deep links (`#profile`, `#ownership`,
     `#billing`, …) still land. Ownership/handoff is recovered as the `ownership` band.
   - Identity split (founder feedback): top-left = the **business** (logo + name + domain);
     bottom-left = the **signed-in person** ("Hello, {name}", login identity, with an Admin
     badge + a "view as client" toggle for super-admins). Settings separates **Account**
     (read-only login identity) from **Business info** (the editable business fields).
   - The assistant is **"Strelva"** — the agent's persona (system prompt in
     `src/app/api/agent/route.ts`) refers to itself as Strelva. Nav label is "Ask Strelva".
3. **AI Agent** that manages the site ongoing (updates, blog, social drafts).
4. **Weekly report** by email.

> Dashboard UI conventions: accent buttons pair `bg-accent` with `text-on-accent` (dark
> ink — white fails WCAG AA on the light sage accent). `text-warm-black` / `text-gray-muted`
> are theme-aware and render light on the dark dashboard. **Display (heading) font: use the
> `font-display` `@utility` (`src/app/globals.css`), NEVER the arbitrary
> `font-[family-name:var(--font-display)]` class — Turbopack DEV mis-serializes that inline
> arbitrary value on a cold compile (RSC payload bleeds into the CSS parse) and crashes the
> dev server / breaks CI, even though the prod build compiles it fine.**

## What You See (Jacob)
- Slack notifications for every AI change
- Admin dashboard: all clients, draft queue, launch readiness, DNS health
- **Portfolio actions** (`/admin/actions`): one screen to clear the whole portfolio — a proactive "Ready to work" layer (latent work across all clients, one-click "Draft these" into the governed draft path) above a bulk-approve queue of every pending approval, grouped by client. Every pending item shows its before→after diff / the exact Google post + hours it publishes before you approve. See Operational systems.
- Override capability on any AI change
- Escalation system: auto-approve factual changes, review new copy, block structural/code changes (see `src/lib/ai-governance.ts`)

## Customer Language (USE THIS)
- "See what's working" NOT "analytics dashboard"
- "Tell the AI what to change" NOT "conversational CMS"
- "47 people found you this week" NOT "unique visitors: 47"
- "Your weekly report" NOT "automated insights"

## Do NOT Build
- Drag-and-drop visual editor (AI handles content; Jacob handles quality).
- Client-facing code editor (never).
- A checkout / payment engine in the control plane. The client repo (or its commerce
  provider) owns the cart and the charge. The control plane **surfaces** commerce:
  the Store pillar reads products, and orders arrive over the `/api/v1/track` beacon
  (`order` event) into `src/lib/orders.ts` for the revenue/orders/best-seller view.
  This is the "basic ecom" of the Growth tier (founder decision 2026-06-26) — capture
  and visibility, not a storefront we build.
- Tiered pricing UI.
- A `/api/public/*` re-export shell of the v1 contract (v1 owns the contract directly now).
- Self-serve onboarding/provisioning (backend deleted 2026-06-10; don't resurrect without a founder decision).
- Copy implying the ONGOING service is free. "Free to build" (no build fee) and the free audit tool are the only "free" — the monthly subscription ($99/$199/$499) is always paid. Don't say "free site/free hosting/free forever."

## Execution Rules
- NEVER add "Co-Authored-By" lines to commits. (Intentional — this repo's commits read
  human-authored; this rule deliberately overrides any harness/tooling default that would
  add an AI co-author trailer. Do not "reconcile" it by re-enabling the trailer.)
- The user and project owner is Jacob Rhinehart. Address the user as Jacob when a name is needed.
- Promote a feature from "custom repo" to the platform only when at least two repos prove the same need (per `docs/future-codebase-integration.md`).

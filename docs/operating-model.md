# Strelva Operating Model + Solidification Roadmap

> **Status: historical roadmap, superseded 2026-07-14.** Use
> `product-ontology.md`, `persistence-boundaries.md`, and `operations.md` for
> current decisions. The dated progress and punch list below are preserved as
> context, not current state.
>
> **As of 2026-07-30 both teardowns are complete:**
> - **Supabase Auth + Postgres cutover: DONE (2026-06-20).** Postgres is the
>   source of truth for tenant + content + operational data (prod flags
>   `CONTENT_SOURCE`/`TENANTS_SOURCE`/`DATA_SOURCE` = `postgres`); RLS enforces
>   tenant isolation; `handle_new_user` trigger provisions users.
> - **Clerk teardown: DONE (2026-07-11, PR #146).** `@clerk/nextjs` dep removed,
>   `auth.ts` is Supabase-only, `proxy.ts` uses hand-rolled `gateRequest` (fail-
>   closed). No `@clerk` imports remain. Any remaining Clerk env vars in Vercel are
>   orphaned and should be removed via `vercel env rm`.
> - **Sanity teardown: DONE (2026-07-10).** All data-source reads/writes removed;
>   `@sanity/client`/`next-sanity`/`sanity` deps dropped. The only residual is
>   `sanityImageUrl` (+ `@sanity/image-url` + `cdn.sanity.io` in CSP) for legacy
>   content-image asset refs, retained until the content-URL rewrite ops step. No
>   code path reads or writes Sanity data.
>
> Punch-list items that reference Clerk/Sanity/`isSupabaseAuthConfigured()` below
> are historical — do not act on them. Read the per-section corrections inline.

Authoritative source for **how Strelva operates as a whole** and the punch list to
lock it. Written 2026-06-13 from a full code-level audit of the admin portal, the
client portal, and the platform architecture. Supersedes scattered notes; update
this file as items ship.

Status legend: `[ ]` open · `[~]` in progress · `[x]` done · `(N)` = Noah · `(J)` = Jacob

---

## 1. Canonical operating model (locked)

Strelva is a **control plane**, not a website host.

- **Supabase Postgres** is the source of truth for content + tenant config +
  operational data (cut over 2026-06-20; prod flags `CONTENT_SOURCE`/
  `TENANTS_SOURCE`/`DATA_SOURCE` = `postgres`). RLS enforces tenant isolation.
  **Sanity teardown is complete (2026-07-10) — no data is read from or written to
  Sanity.** Only two legacy `NEXT_PUBLIC_SANITY_*` env vars remain to resolve stored
  image asset URLs; remove after the content-URL rewrite ops step.
- **Redis (Upstash)** is a write-through cache **and** still an operational
  store (events, bookings, clicks, reviews, pay-links, rewards, rate limits) —
  operational data now also dual-writes to Postgres.
- The **owner dashboard + AI agent** are the only write surfaces.
- Every paid client gets **one hand-built custom repo** on their own domain that
  **pulls** content from `/api/v1/*` (ISR, 60s) and **receives** HMAC-signed
  revalidation pushes (`x-reb-*` headers).
- The wire contract is **v1, frozen, additive-only**. `x-reb-*` header names and
  `reb:` Redis prefixes are **permanently frozen** — values migrate (point at
  `app.strelva.com`), names never do. A breaking change is a v2 sibling.
- **Marketing** (`strelva.com`) is a separate static repo (`~/strelva-marketing`).
- **Billing is off** until the grandfather list (`STRIPE_BILLING_GRANDFATHER_TENANTS`)
  ships in the same deploy that sets `STRIPE_SCAFFOLD_PRICE_ID`.

## 2. Locked decisions (founder, 2026-06-13)

1. **Site delivery = custom repos only.** The in-repo template registry
   (`src/components/templates/`) is **legacy**. Archive it to a clearly-labeled
   folder (do not delete — may be revived), **after** verifying no live tenant
   still renders through it (see 4.C — `jada` likely uses `fashion-stylist`).
2. **Operational-data durability = Postgres (DONE 2026-06-20).** The durable
   operational store this decision called for "before ~15 tenants" shipped early:
   Supabase Postgres is now the source of truth and operational data dual-writes
   to it (`DATA_SOURCE=postgres`). Redis remains the write-through cache +
   ephemeral state. The maintenance-cron snapshot remains as a content backup
   path; Supabase's own backups now cover the durable store.
3. **One agent core.** Collapse the two divergent agent implementations into a
   single shared core (one tool registry, one prompt builder, one governance+risk
   pipeline). Entry points differ only in `generateText` vs `streamText`.
4. **Provisioning stays manual for now**, but the launch-validity gaps get fixed
   (revalidation secret, generic seed path). Full automation is a growth-stage build.

## 3. Architecture at a glance

```
strelva.com (marketing, separate repo)
   │ lead → /access-request
   ▼
CONTROL PLANE (this repo, → app.strelva.com)
   proxy.ts (host→tenant routing, Supabase Auth, CSP; hand-rolled gateRequest — fail-closed)
   /dashboard (owner) · /admin (Jacob+Noah)
   AI agent + ai-governance.ts
   /api/v1/* (content · page-config · site-capabilities · track) — frozen v1 contract
   │ pull (ISR 60s) ▲        ▼ push (HMAC revalidate)
   ▼                         │
 Postgres (truth, RLS) + Redis (cache+ops)   CUSTOM CLIENT REPOS (1 per client, own domain)
External: Supabase(auth+db) · Stripe(billing live) · Resend(updates.strelva.com) · Gemini · Vercel Blob · Slack · Yelp/Google/IG/GSC · PageSpeed
          (Clerk removed 2026-07-11 · Sanity removed 2026-07-10)
```

Key files: `src/proxy.ts`, `src/lib/scaffold-contracts.ts`, `src/lib/revalidate-client.ts`,
`src/lib/agent-executor.ts` + `src/app/api/agent/route.ts`, `src/lib/ai-governance.ts`,
`src/lib/storage/content-{cache,store}.ts`, `src/lib/tenants.ts`, `src/lib/events.ts`,
`src/lib/auth.ts`, `src/app/api/v1/**`, `src/app/api/cron/**`, `custom-repo-starter/`.

## Progress (updated 2026-06-14)

**Mission Control — the operator layer — is built** on `feat/platform-solidify`
(typecheck + prod build green, 725 tests, PR rhinehart514/REB#55). New since this
doc was written:

- **Operator agent** (`/api/admin/agent`) — super-admin-gated, reads the whole
  portfolio (portfolio brain, ops, attention briefing, audit, pay links, revenue,
  per-tenant) and *proposes* consequential actions (pay link, assign, draft
  approve/reject, tenant update). It never mutates; the console commits a proposal
  to the existing gated+audited endpoints. Tested gate + the console action map.
- **Portfolio brain** (`src/lib/portfolio.ts`) — cached cross-tenant aggregate,
  off-peak refresh cron, `GET /api/admin/portfolio`.
- **Needs-Attention briefing** (`src/lib/attention.ts`) — prioritized "where to
  spend founder hours," surfaced on the overview, as an agent tool, and a daily
  Slack digest cron.
- **Operator screens** (off curl) — Mission Control console, ops board, pay-links
  (mint + **revoke**), tenant detail/edit + assign, draft diff, **audit trail**.
- **Guided onboarding** (`/admin/onboard`) — tenant + revalidation secret +
  **seeded content baseline** + owner invite + Vercel project/env/domain, live
  checklist + manual remainder. Tested orchestrator + route.
- **Revenue reader** (`src/lib/revenue.ts`) — the build-payment money trail now
  has a reader + agent tool.
- **Client onboarding** — first-run checklist on the owner dashboard driven by
  real progress (replaces the dead `?welcome=1` banner).
- **Hardening** — done from the list below: super-admin all-emails, dev-bypass
  `check:prod` guard, operator audit logging, admin error/loading boundaries,
  loud Slack alerts on invite-email failure, pay-link door bug fixed.
- **Platform health** — `src/lib/health.ts` (Redis/Stripe/Gemini)
  surfaced on the ops board + a `read_health` agent tool. (Sanity/Clerk checks removed with their teardowns.)
- **Rich tenant pages** — live pulse (visits/clicks/drafts) + activity history,
  linked from the overview.
- **Pay-link paid tracking** — cross-references the build-payment trail (badge +
  agent), plus revoke.
- **Control-plane URL fix** — onboarding baked `strelva.com` (now marketing);
  fixed to `scaffoldweb.com`, env-driven via `CONTROL_PLANE_API_URL`.
- **Test hardening** — locked the AI auto-publish safety gate (`agent-risk`, was
  zero coverage), input validation (`request-body`), offer-terms copy, and the
  portfolio/ops/attention/revenue/provisioning logic. Added a `README`.

**Still open (the honest remainder):** agent unification (B), delivery-model
cleanup + dead-code deletion (C — has a test, needs a deliberate call),
owner-notification on async approval (D), email-mismatch hard stop (A),
durability backup + cron de-stampede (G), and the cutover (H, Jacob's).

## Progress (updated 2026-07-04) — operator command center

The operator layer grew a dedicated **command center** on the bare admin host
`admin.strelva.com` (super-admin only; `proxy.ts` `isBareAdminHost` /
`shouldRewriteBareAdminConsole` rewrites the host root onto `/admin`). New since
the 2026-06-14 note:

- **"Needs you" overview** (`src/app/admin/page.tsx` + `TodayFeed.tsx`) — leads /
  approvals / at-risk / recent signups, surfaced ahead of MRR.
- **Operator CRM** (`/admin/clients`, `src/lib/tenant-crm.ts`) — per-tenant
  pipeline stage (lead/building/live/at_risk/churned), tags, notes, contacts, and
  an activity timeline. Redis `crm:{tenantId}`; super-admin CRUD via
  `/api/admin/tenants/[id]/crm` (audit-logged). Closes part of §E.
- **At-risk / churn signal** (`src/lib/churn.ts`) — persists daily owner
  agent-engagement (`reb:engagement:*`, written by the `daily-summary` cron) into a
  7-day rolling store, composed with inactivity + subscription status into the
  at-risk verdict the "Needs you" dashboard reads.
- **Search + Analytics** (`/admin/analytics`, `src/lib/analytics.ts`) — per-tenant
  Search Console + GA4 reads (`analytics:cfg:*`), OAuth-first with a shared
  service-account fallback; config write via `/api/admin/tenants/[id]/analytics-config`.
- **Operator vs client email split** (`operatorEmailsEnabled()` in
  `src/lib/email-enabled.ts`) — operator notifications (new-signup + payment-failed
  from the billing webhook, lead intake) default ON, independent of the client
  `emailSendingPaused()` gate. Client lifecycle sends
  (`sendWelcomeEmail`/`sendSiteLiveEmail`/`sendReviewRequestEmail`) plus per-tenant
  report cadence (`src/lib/report-cadence.ts`, `reb:report-cadence:*`) exist behind
  the client pause; the lifecycle sends are not yet wired to a live trigger.

Full surface map: `docs/operator-command-center.md`.

## 4. Solidification punch list

### A. Correctness / security (do first)
- [x] **Invite lockout bug** (N) — DONE. _(2026-06-13)_
- [x] **Clerk teardown** (N) — DONE 2026-07-11 (#146). `@clerk/nextjs` dep gone,
  `auth.ts` Supabase-only, `proxy.ts` hand-rolled `gateRequest`. Super-admin email
  check now uses Supabase `auth.users` directly (no Clerk email-list edge case).
- [ ] **Dev bypass guard** (N/J) — add a `check:prod` assertion that
  `REB_DEV_UNGATED_ACCESS` is unset on every preview/prod deploy.
- [ ] **Operator audit log** (N) — `logAuditEvent` on tenant create/update,
  `tenants/assign`, and pay-link create (only draft approve/reject log today).
- [ ] **Email-mismatch hard stop** (N) — lock the sign-up email to the invited
  address or block the claim on mismatch with a clear "sign in with X" message.

### B. The agent core (highest architectural value)
- [ ] **Unify the two agents** (N) — extract one shared core from
  `agent-executor.ts` (8 tools, cached prompt, no risk engine) and
  `api/agent/route.ts` (20 tools, risk engine + manifest gating). They have
  drifted; the event/suggestion path lacks the risk engine the chat path has.
  Single tool registry + `buildSystemPrompt` (with the per-tenant cache) + one
  governance/risk pipeline; two thin entry points.

### C. Delivery model cleanup
- [ ] **Verify tenant→template usage** (J) — confirm which of `demo / gldf / rohlax / jada`
  (and any others) still render via the in-repo registry vs a custom repo. Sanity is no
  longer a reference point; check tenant `deliveryModel` in Postgres. **Blocks the archival below.**
- [ ] **Archive the template registry** (N) — once C-verify is clear, move
  `src/components/templates/` → `src/components/templates/_archive/` (clearly
  labeled, revivable), starting with the dead-weight forks `food-brand` (17 files)
  and `fashion-stylist` (`JadaIveySite` one-off). Any tenant still on the registry
  migrates to a custom repo first, or the registry stays until it does.
- [ ] **Delete dead dashboard code** (N) — the unreachable `design/` visual-editor
  subtree (on the "Do NOT Build" list), `ContentViewToggle`, the rollback
  `AISection`/`PublishingSection` in settings, and the orphan Vegaro 501 route.

### D. Client onboarding (weakest real-client surface)
- [ ] **First-run onboarding checklist** (N) — persistent, dismissible, decoupled
  from the billing `?welcome=1` gate: connect Google Business, add 3 photos, make
  one AI edit. A new client currently lands on an empty all-zeros dashboard.
- [ ] **Seed the demo dashboard** (N) — `scripts/seed-demo-engagement.ts` (built,
  branch `feat/demo-engagement-seed`) so the product demos like it's alive.
  **Now superseded by `scripts/seed-demo-tenant.ts`** (`pnpm tsx scripts/seed-demo-tenant.ts
  [tenant-id]`, default `summit`) — the full sales-demo seeder. It provisions a coherent
  90-day story for **Summit Heating & Cooling** (a Buffalo HVAC business, summithvacwny.com)
  across every dashboard store — content, reviews, traffic trend, "what Strelva did for you"
  activity, leads, a few "Needs you" items, an AI-visibility scorecard, an improving health
  grade — tuned for the milestone + scorecard + activity-feed surfaces. Re-runnable (clears
  the demo tenant's operational data first); writes straight to prod Postgres/Redis when run
  with the prod env, isolated by tenant id so it never touches a paying client.
  `seed-demo-engagement.ts` fills the operational stores for an existing tenant; this one
  provisions the tenant first.
- [ ] **Owner notification on async approval** (N) — email/in-app when a queued
  change is approved/published (today the owner gets only a passive badge). The
  `sendUpdateLiveEmail` path in `delivery-email.ts` already exists — wire it.
- [ ] **Loud invite-send failures** (N) — Slack-alert Jacob when `emailSent:false`;
  add a "resend invite" admin action.

### E. Operator surface (stop running the business by curl)
- [ ] **Pay-links UI** (N) — `/admin/pay-links` over the existing POST/GET. This is
  a revenue action that is curl-only today.
- [ ] **Ops dashboard UI** (N) — `/admin/ops` rendering `GET /api/admin/ops`
  (queues, revalidation failures, webhook failures, domain drift).
- [ ] **Tenant-edit + user-assign UI** (N) — wire `PATCH /api/admin/tenants` and
  `tenants/assign` (backends exist, no UI).
- [ ] **Admin polish** (N) — `admin/error.tsx` + `admin/loading.tsx`; unify
  `zinc-*` colors to design tokens; surface the draft diff pre-decision.

### F. Provisioning
- [ ] **Close the revalidation-secret gap** (N) — have tenant creation (form/API)
  generate + persist `revalidationSecret`, so UI-created tenants are launch-valid
  without hand-editing.
- [ ] **Generic seed path** (N) — drive `seed-tenant.ts` from a per-tenant data
  file / template selection instead of hardcoded `TENANT_DEFAULTS` (3 tenants).

### G. Durability + scale
- [ ] **Real operational backup** (N) — extend the maintenance cron snapshot into a
  restorable backup of Redis operational data; document restore.
- [ ] **De-stampede crons** (N) — stagger the four `0 6 * * *` jobs; batch the
  per-tenant loops before 50 tenants.
- [ ] **Cache the admin overview fan-out** (N) — it runs 5+ reads per tenant on
  every load (O(N)); precompute a per-tenant summary or batch.
- [ ] **Second alerting channel** (N/J) — Slack is the only error channel and most
  crons fire-and-forget it.
- [x] **Durable operational store** (N) — the "soon" from decision 2; SHIPPED
  2026-06-20 (Supabase Postgres, `DATA_SOURCE=postgres`, RLS). _(was: revisit at ~15 tenants)_

### H. Cutover (Jacob's lane — external dashboards)
> The **auth/data cutover** (Clerk+Sanity → Supabase+Postgres) is DONE
> (2026-06-20). What remains here is the **domain/brand rebrand**
> (`scaffoldweb.com` → `strelva.com`), which is independent. Auth is no longer
> on Clerk, so the "Clerk session-domain logs everyone out" risk is gone — the
> equivalent step is now Supabase Auth's redirect-URL allowlist.
- [ ] **T004 infra** (J) — Cloudflare DNS → Vercel domains → **Supabase Auth
  redirect-URL allowlist** → Resend/Stripe/OAuth → 301 scaffoldweb→strelva.
  Runbook: `docs/goals/strelva-cutover/runbook.md` + `docs/url-cutover-runbook.md`.
- [ ] **T005 tenant flip** (J) — point each tenant's `REB_API_URL` value at
  `app.strelva.com`. Auto-unblocks after T004.
- [ ] **Single-source the v1 version constant** (N) — `SCAFFOLD_CONTRACT_VERSION` is
  duplicated in 3+ files that must agree; extract to one module.

## 5. What's already solid (do not "fix")

The owner dashboard, the AI content-edit loop (ask → governance → Postgres write →
HMAC revalidate → verify), RBAC enforcement across 55+ write routes, the receipt
pipeline (per-tenant isolation, Resend error checks, deterministic fallback), and
the frozen v1 custom-repo contract are real and shipped. Solidification is seam
work, not a rebuild.

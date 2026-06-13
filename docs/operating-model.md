# Strelva Operating Model + Solidification Roadmap

Authoritative source for **how Strelva operates as a whole** and the punch list to
lock it. Written 2026-06-13 from a full code-level audit of the admin portal, the
client portal, and the platform architecture. Supersedes scattered notes; update
this file as items ship.

Status legend: `[ ]` open · `[~]` in progress · `[x]` done · `(N)` = Noah · `(J)` = Jacob

---

## 1. Canonical operating model (locked)

Strelva is a **control plane**, not a website host.

- **Sanity** is the source of truth for content + tenant config.
- **Redis (Upstash)** is a write-through cache **and** the operational store
  (events, bookings, clicks, reviews, pay-links, rewards, rate limits).
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
2. **Operational-data durability = Redis + backup now, durable store soon.**
   Accept Redis-only at current scale; make the maintenance cron's snapshot a real
   restorable backup. Stand up a durable operational store (Postgres/Supabase)
   before ~15 tenants — tracked, not yet built.
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
   proxy.ts (host→tenant routing, Clerk auth, CSP)
   /dashboard (owner) · /admin (Jacob+Noah) · /studio (Sanity)
   AI agent + ai-governance.ts
   /api/v1/* (content · page-config · site-capabilities · track) — frozen v1 contract
   │ pull (ISR 60s) ▲        ▼ push (HMAC revalidate)
   ▼                         │
 Sanity (truth) + Redis (cache+ops)   CUSTOM CLIENT REPOS (1 per client, own domain)
External: Clerk · Stripe(off) · Resend · Gemini · Vercel Blob · Slack · Yelp/Google/IG/GSC
```

Key files: `src/proxy.ts`, `src/lib/scaffold-contracts.ts`, `src/lib/revalidate-client.ts`,
`src/lib/agent-executor.ts` + `src/app/api/agent/route.ts`, `src/lib/ai-governance.ts`,
`src/lib/storage/content-{cache,store}.ts`, `src/lib/tenants.ts`, `src/lib/events.ts`,
`src/lib/auth.ts`, `src/app/api/v1/**`, `src/app/api/cron/**`, `custom-repo-starter/`.

## 4. Solidification punch list

### A. Correctness / security (do first)
- [x] **Invite lockout bug** (N) — `clerk/webhook/route.ts` consumed the invite
  before assigning the tenant; a transient assign failure permanently destroyed
  it. Fixed: read non-destructively, assign, consume only on success. _(2026-06-13)_
- [ ] **Super-admin email check** (N) — `isSuperAdmin()` (`auth.ts:161`) matches only
  the user's *first* Clerk email; match **all** emails (mirror the claim path).
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
- [ ] **Verify tenant→template usage against prod Sanity** (J) — confirm which of
  `demo / gldf / rohlax / jada` (and any others) still render via the in-repo
  registry vs a custom repo. **Blocks the archival below.**
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
- [ ] **Durable operational store** (N/J) — the "soon" from decision 2; revisit at ~15 tenants.

### H. Cutover (Jacob's lane — external dashboards)
- [ ] **T004 infra** (J) — Cloudflare DNS → Vercel domains → **Clerk session-domain
  (before the next client; it logs everyone out)** → Resend/Stripe/OAuth → 301
  scaffoldweb→strelva. Runbook: `docs/goals/strelva-cutover/runbook.md`.
- [ ] **T005 tenant flip** (J) — point each tenant's `REB_API_URL` value at
  `app.strelva.com`. Auto-unblocks after T004.
- [ ] **Single-source the v1 version constant** (N) — `SCAFFOLD_CONTRACT_VERSION` is
  duplicated in 3+ files that must agree; extract to one module.

## 5. What's already solid (do not "fix")

The owner dashboard, the AI content-edit loop (ask → governance → Sanity write →
HMAC revalidate → verify), RBAC enforcement across 55 write routes, the receipt
pipeline (per-tenant isolation, Resend error checks, deterministic fallback), and
the frozen v1 custom-repo contract are real and shipped. Solidification is seam
work, not a rebuild.

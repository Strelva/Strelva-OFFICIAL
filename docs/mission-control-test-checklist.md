# Mission Control — test checklist

> **Status: historical QA record for PR #55. SEVERAL ITEMS BELOW ARE NOW STALE.**
> Routes, navigation, auth providers, and setup steps below are snapshots from the
> `feat/platform-solidify` sprint. The current operator surface is documented in
> `operator-command-center.md`; the current smoke commands are in `AGENTS.md`.
>
> Key changes since this checklist was written:
> - Auth is Supabase-only (Clerk removed 2026-07-11, #146). No Clerk setup needed.
> - Sanity is fully removed as a data source (2026-07-10). Ignore "Sanity:" labels below.
> - Dev server is `pnpm dev` on **localhost:3000** (not 3100).
> - Vercel scope is `strelva` (not `scaffold-web`). Pull env with `vercel env pull .env.local --scope strelva`.
> - `SCAFFOLD_API_URL` references are `strelva.com` / `app.strelva.com` now, not `scaffoldweb.com`.
> - `CONTROL_PLANE_API_URL` should point to `app.strelva.com` (the T004 cutover is done).
> - `/admin/tenants` and `/admin/tenants/[id]` redirect to `/admin/clients` and `/admin/clients/[id]`.
> - The operator overview no longer renders a tenant table; it is a "Needs you" feed.
> - Mission Control command bar is COLLAPSED below the queue on the overview, not at the top.
> - `/admin/onboard` → `/admin/clients` workflow (the self-serve backend was deleted 2026-06-10).

QA script for the `feat/platform-solidify` branch (PR rhinehart514/REB#55). Work
top to bottom; each item says what to do and what "right" looks like.

## Setup (CURRENT — use these steps, not the stale ones above)
1. `cd ~/strelva-platform && git checkout main && git pull`
2. `pnpm install`
3. `vercel env pull .env.local --scope strelva` — needed for real data.
4. `pnpm dev` → open `http://localhost:3000`. Sign in as a super-admin email
   (one in `SUPER_ADMIN_EMAILS`).
5. `pnpm typecheck`, `pnpm test`, `pnpm build` all green (~1983 passing tests as of 2026-07-30).

## Setup (HISTORICAL — stale, for reference only)
1. `cd ~/strelva-platform && git checkout feat/platform-solidify && git pull`
2. `pnpm install`
3. ~~`vercel env pull .env.local` (scope scaffold-web)~~ — scope is now `strelva`.
4. `pnpm dev` → open `http://localhost:3000`. Sign in as a super-admin email.
5. ~~Sanity~~ (word used as a noun here, not the CMS): `pnpm typecheck`, `pnpm test`
   (expect 688 passing at the time of PR #55), `pnpm build` all green.

## Admin overview (`/admin`) — CURRENT
- [ ] Loads with the left rail nav: Overview · Clients · Leads · Onboard · Pay links · Analytics (Clients group) · Actions · Drafts · Maintenance (Review group) · Ops · Audit (System group).
- [ ] **"Needs you" feed** renders at the top (new leads, pending approvals, at-risk tenants, recent signups). No tenant table.
- [ ] A **"Clear portfolio →"** link + count appears when any pending approval exists.
- [ ] Below the feed: portfolio roll-up stat tiles (Active / Collected / MRR / Drafts / Custom repos).
- [ ] **Mission Control console** (command bar) is COLLAPSED below the queue by default, labelled "Mission Control" with an expand toggle.
- [ ] On mobile: left rail is hidden; `AdminMobileNav.tsx` shows a top-bar + slide-in drawer.

## Admin overview (`/admin`) — HISTORICAL (PR #55 shape, stale)
- [ ] ~~Loads with the nav: Overview · Onboard · Pay Links · Ops · Drafts · Audit.~~
- [ ] ~~Mission Control console (command bar) renders at the top.~~
- [ ] ~~Tenant table renders (launch readiness, access, ops, activity).~~

## The operator agent (the marquee)
Type these into the command bar:
- [ ] "What needs attention across the portfolio?" → reads + summarizes blocked
      tenants, breakage, drafts. No errors; a status line flashes while it works.
- [ ] "What broke overnight?" → reads ops, lists failures (or says it's clean).
- [ ] "How much have we collected?" → reads revenue, gives a total.
- [ ] "Show recent operator actions" → reads the audit trail.
- [ ] **Confirm flow:** "Mint a $1,500 build link for Acme Coffee, slug acme-coffee"
      → it does NOT create it; a **confirmation card** appears. Click **Confirm** →
      it commits and shows the `/pay/acme-coffee` URL. Verify the link exists on
      `/admin/pay-links`.
- [ ] "Approve the hero draft for <tenant>" (pick a tenant with a draft) →
      confirmation card → Confirm → draft clears.
- [ ] Sanity: the agent never mutates without a confirm click.

## Pay links (`/admin/pay-links`)
- [ ] Mint a fixed link (slug, client, **door = Build or Managed**, amount). It
      appears in the list. **Door "Managed" must work** (the old `managed` bug).
- [ ] **Copy URL** copies `/pay/<slug>`.
- [ ] **Revoke** removes it (confirm dialog → gone from the list).

## Ops board (`/admin/ops`)
- [ ] Six metric cards (webhook/revalidation/AI-write failures, stale SMS,
      pending queue, domain drift). Non-zero bad counts render red.
- [ ] Revalidation-failure + domain-drift lists render (or "None").

## Onboarding (`/admin/onboard`) — STALE
> The self-serve onboarding backend was **deleted 2026-06-10**. `/onboard` redirects
> to `/access-request`. Jacob provisions tenants manually via `pnpm provision-tenant`.
> The Vercel project + env-var block below refers to the old automated flow.
> Current provisioning: `pnpm provision-tenant` → follow the CLI prompts.
> The client repo env block now references **strelva.com** (not `scaffoldweb.com`).

- [ ] ~~Fill a throwaway subdomain...~~ — use `pnpm provision-tenant` instead.
- [ ] Confirm `SCAFFOLD_API_URL` points to **strelva.com** (not `scaffoldweb.com`) in
      any newly provisioned client repo env block.

## Client detail (`/admin/clients/[id]`) — CURRENT route
- [ ] Edit owner email / subscription / active → **Save** → "Saved ✓".
- [ ] **Grant access** (assign an existing user) and **Resend owner invite** both work.
- [ ] KPI pulse, `SiteScan` health, `ReviewIntelPanel`, `VisibilityPanel`, `DomainManager`, `TenantEditor`, `ClientCrmSections`, and activity feed all render.
- [ ] `/admin/tenants/[id]` redirects to `/admin/clients/[id]` (backward-compat redirect).

## Tenant detail — HISTORICAL (stale route `/admin/tenants/[id]`)
- [ ] ~~`/admin/tenants/[id]`~~ — now `/admin/clients/[id]`.

## Drafts (`/admin/drafts`)
- [ ] Pending drafts show a **before/after diff** (red strikethrough → green),
      falling back to a field dump for brand-new sections.

## Audit (`/admin/audit`)
- [ ] Every action you just took (pay link, revoke, tenant edit, provision) shows
      newest-first, action-tinted, with actor + tenant.

## Client dashboard (owner view)
- [ ] As an owner (or via a tenant subdomain), the **first-run onboarding
      checklist** appears with real progress (connect a source / make an AI change
      / see a report). Dismiss persists; it auto-hides once all three are done.

## Demo (when ready)
- [ ] Run `npx tsx scripts/seed-demo-engagement.ts` against the demo tenant so
      `demo.strelva.com`'s dashboard shows live activity + a receipt.

## Config to confirm (CURRENT)
- [ ] `CONTROL_PLANE_API_URL` — should be `app.strelva.com` (the T004 cutover is done; the `scaffoldweb.com` default is stale).
- [ ] `VERCEL_API_TOKEN` set (confirmed) → provisioning Vercel steps run for real.
- [ ] `SECRETS_ENC_KEY` set in Vercel prod (at-rest AES-256-GCM secret encryption active since 2026-07-15; missing = full platform outage on tenant load when encrypted rows exist). **NOT yet in `pnpm check:prod` — see production-readiness.md Known issues.**
- [ ] `SUPABASE_URL` (private, server-side) set — distinct from `NEXT_PUBLIC_SUPABASE_URL`; checked in `src/lib/db/client.ts:29` but NOT yet in the production checklist script or env examples. **See production-readiness.md Known issues.**
- [x] No orphaned Clerk or Sanity secrets in Vercel env — DONE 2026-07-30. All 11 orphaned vars removed (CLERK_* x7, SANITY_API_TOKEN, SANITY_WEBHOOK_SECRET, REVALIDATION_SECRET, CORS_ORIGINS). NEXT_PUBLIC_SANITY_* kept for legacy image-URL resolution. If re-checking: `vercel env ls --scope strelva` and confirm no CLERK_* remain.

## Known not-done (don't flag as bugs)
- app.strelva.com cutover (T004) — still Jacob's dashboard work.
- Agent unification (3 surfaces), template archival (pending Jacob's renderer
  check), dead-code deletion — all deliberately deferred.

## Decisions to make this session (not just QA)
1. **Template-renderer check (with Jacob)** — which live tenants still render via
   the in-repo template registry (jada?). Unblocks the approved archival.
2. **Agent unification** — go/no-go on collapsing the 3 agent surfaces into one
   core. It's a refactor of the live tenant-facing chat, so decide to do it
   together (and when).
3. **Dead-code deletion** — the `design/` visual-editor subtree (has a test).
   Delete + drop the test, or keep.
4. **Merge plan for PR #55** — after QA passes: Jacob reviews then merge to main,
   or merge now and iterate.

## After QA passes
- Merge `feat/platform-solidify` → main (and `strelva-marketing#1`).
- Run the demo seed against the prod demo tenant.
- Nudge Jacob on the T004 cutover; once app.strelva.com is live, set
  `CONTROL_PLANE_API_URL` and re-onboard / re-point.

## Troubleshooting
- Empty data everywhere → `.env.local` not pulled. `vercel env pull --scope strelva` (scope is `strelva`, not `scaffold-web`).
- Provisioning Vercel steps "skipped" → `VERCEL_API_TOKEN` missing in the pulled env.
- Operator agent errors on every message → `GOOGLE_GENERATIVE_AI_API_KEY` missing.
- 403 on `/admin/*` → your signed-in email isn't in `SUPER_ADMIN_EMAILS`.
- Auth loops / sign-in broken → confirm no Clerk env vars are present in Vercel (Clerk is fully removed as of #146; all CLERK_* and orphaned Sanity secrets were removed 2026-07-30 — verify with `vercel env ls --scope strelva` if regression suspected).

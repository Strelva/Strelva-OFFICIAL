# Mission Control — test checklist

> **Status: historical QA record for PR #55.** Routes, navigation, providers,
> and setup steps below are snapshots. Use `operator-command-center.md` and the
> current smoke commands in `AGENTS.md`.

QA script for the `feat/platform-solidify` branch (PR rhinehart514/REB#55). Work
top to bottom; each item says what to do and what "right" looks like.

## Setup
1. `cd ~/strelva-platform && git checkout feat/platform-solidify && git pull`
2. `pnpm install`
3. `vercel env pull .env.local` (scope scaffold-web) — needed for real data.
4. `pnpm dev` → open `http://localhost:3000`. Sign in as a super-admin email
   (one in `SUPER_ADMIN_EMAILS`).
5. Sanity: `pnpm typecheck`, `pnpm test` (expect 688 passing), `pnpm build` all green.

## Admin overview (`/admin`)
- [ ] Loads with the nav: Overview · Onboard · Pay Links · Ops · Drafts · Audit.
- [ ] **Mission Control console** (command bar) renders at the top.
- [ ] If anything's wrong in the portfolio, a **"Needs attention"** panel appears
      (high = red, medium = amber), each row links to the right screen.
- [ ] Summary cards include **Collected** (build payments) next to MRR.
- [ ] The tenant table still renders (launch readiness, access, ops, activity).

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

## Onboarding (`/admin/onboard`) — the big one
- [ ] Fill a **throwaway** subdomain (e.g. `qa-test-1`), site name, owner name,
      industry; leave production domain blank first.
- [ ] Run it. The **live checklist** shows: tenant created, content seeded
      (9 sections), owner invite (skipped if no email), Vercel project + env
      created (**should be real — VERCEL_API_TOKEN is set**), domain skipped.
- [ ] The "Still needs a human" list shows DNS + connect-the-repo steps.
- [ ] A **"Client repo env"** block appears with copy-all — confirm
      `SCAFFOLD_API_URL=https://scaffoldweb.com` and a 64-char `REVALIDATION_SECRET`
      (this is what Jacob pastes into the hand-built repo).
- [ ] Open the tenant → it exists with a revalidation secret. Check the created
      Vercel project (`qa-test-1-site`) and that its env vars point at
      **scaffoldweb.com** (the control plane), not strelva.com.
- [ ] Clean up the throwaway tenant after.

## Tenant detail (`/admin/tenants/[id]`)
- [ ] Edit owner email / subscription / founder-comp / active → **Save** → "Saved ✓".
- [ ] **Grant access** (assign an existing user) and **Resend owner invite** both work.

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

## Config to confirm
- [ ] `CONTROL_PLANE_API_URL` — onboarding defaults to scaffoldweb.com; set this
      env to flip to app.strelva.com once the cutover (T004) lands.
- [ ] `VERCEL_API_TOKEN` set (confirmed) → onboarding's Vercel steps run for real.

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
- Empty data everywhere → `.env.local` not pulled. `vercel env pull` (scope scaffold-web).
- Onboarding Vercel steps "skipped" → `VERCEL_API_TOKEN` missing in the pulled env.
- Operator agent errors on every message → `GOOGLE_GENERATIVE_AI_API_KEY` missing.
- 403 on `/admin/*` → your signed-in email isn't in `SUPER_ADMIN_EMAILS`.

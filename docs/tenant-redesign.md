# Redesigning a Tenant Site

How to redesign a client storefront, end to end. Goal: a redesign is a scoped
**presentation** task, not a migration. (Companion to `docs/goals/strelva-cutover/`.)

## The model
Every paid client is a separate **custom repo** (its own Vercel project, on the
client's own domain) that pulls content/config from the Strelva control plane over
the versioned `/api/v1/*` contract. The control plane owns **content + data**; the
tenant repo owns **presentation**. So a redesign almost never touches data, it
restyles and re-lays-out the components that render that data.

## Where they live
- **Web folder:** `/Users/laneyfraass/websites/`
  - `gldf` → greatlakesdriedfruit.com (Next 16, pnpm, `src/lib/reb-contracts.ts`, `REB_API_URL`)
  - `rohlax-wellness` → rohlaxwellness.com (Next 16, npm, `src/lib/storage.ts`, `REB_API_URL`/`SCAFFOLD_API_URL`)
  - more clients land here over time.
- **Control plane:** `~/REB` (canonical). Its `src/app/(public)` + `src/components/public/SectionRenderer`
  + `src/components/templates/*` are the *platform-rendered* storefront (the legacy/dev
  path); the custom repos are the production per-client path.

## Anatomy of a tenant repo
- **Next 16 App Router + React 19 + Tailwind 4** (same stack as the platform).
- `src/lib/*-contracts.ts` / `src/lib/storage.ts` — the typed client that fetches
  content from `REB_API_URL` (the control plane) on the `/api/v1/*` contract.
- `src/components/*` — the storefront UI (hero, sections, nav, footer, etc.). **This
  is what a redesign edits.**
- `src/app/*` — the routes (home, services, about, contact, blog, shop, etc.).
- `src/proxy.ts` — host routing + admin/dashboard handoff to the control plane.
- `next.config.ts` — CSP allowlist (must include the control-plane domain it fetches from).
- `.env` — `REB_API_URL` (content source), `REB_DASHBOARD_URL` (admin redirect),
  `REVALIDATE_SECRET`, tenant id.

## What a redesign actually touches
**Presentation only:**
- The components + their Tailwind classes / tokens.
- Page composition / section order (per the layout archetypes in
  `strelva-marketing/DESIGN-KIT.md` §8).
- Type, color, motion for **the client's identity** (not Strelva's brand).

**Leave alone unless you mean it:**
- The contract client (`*-contracts.ts` / `storage.ts`) and the content shapes.
- `proxy.ts` routing, the CSP control-plane domain, `REB_*` env *names* (wire-level
  back-compat, see the control plane's `AGENTS.md`).

## Prerequisites
1. **Control plane reachable.** The tenant fetches from `REB_API_URL`. Locally,
   point it at the running control plane (`pnpm dev` in `~/REB`) or the live API.
   *Note:* until the Strelva infra cutover (`strelva-cutover` goal T004), the live
   API is still `scaffoldweb.com` — don't flip the tenant's API/CSP domain to
   `strelva.com` until the control plane actually serves there.
2. Node + the repo's package manager (gldf = pnpm, rohlax = npm).

## Workflow
1. `cd /Users/laneyfraass/websites/<tenant>` and `git status` (commit/stash any
   pre-existing work first — these repos can carry uncommitted changes).
2. Branch: `git checkout -b redesign/<area>`.
3. Set `.env` `REB_API_URL` to a reachable control plane; `pnpm dev` / `npm run dev`.
4. Redesign the **components** for the client's brand. Reuse the *craft* from the
   Strelva design kit (glass-on-rich-backdrop only, italic-emphasis serif discipline,
   one orchestrated load, the layout archetypes) but with **the client's** palette,
   type, and imagery, not Strelva's sage/cairn.
5. Verify against real content (the tenant renders live control-plane content, so
   check long titles, missing fields, empty sections).
6. `pnpm build` / `npm run build` green; smoke the key routes.
7. Commit (stage only your files if the tree had pre-existing changes), push, deploy
   the tenant's Vercel project; confirm on the client domain.

## Design system: Strelva craft vs client identity
The `strelva-marketing` DESIGN-KIT is **Strelva's** brand language. Tenant sites carry
**the client's** brand. Borrow the kit's *system and craft* (tokens-not-literals,
elevation/motion discipline, composition archetypes, accessibility baseline,
proof/artifact patterns where relevant) and re-skin per client. Don't paint a client
site sage-and-cairn.

## Checklist
- [ ] Pre-existing uncommitted work handled (stash/commit) before starting.
- [ ] On a `redesign/*` branch.
- [ ] `REB_API_URL` points at a reachable control plane; content renders.
- [ ] Components restyled to the client's identity; edge cases (long/empty content) hold.
- [ ] `build` green; key routes smoke-checked; a11y baseline (contrast, focus, reduced-motion).
- [ ] Did NOT change `REB_*` wire names / CSP control-plane domain (unless cutover is done).
- [ ] Committed (your files only), pushed, deployed, confirmed on the client domain.

## Gotchas
- **Don't flip `scaffoldweb.com` → `strelva.com` in tenant CSP/proxy/env until T004**
  (the control plane is live on `app.strelva.com`). It's functional, not branding.
- Tenant repos may carry uncommitted work; never `git add -A` blindly.
- Content lives in the control plane, edit it there (or via the dashboard/AI), not in the tenant repo.

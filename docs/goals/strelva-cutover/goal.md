# Complete the Strelva Cutover: Tenant-Redesign Ready

## Original Request
"We have a web folder for repos. Create a /goal of getting everything completed
over to Strelva so I'm set up to easily redesign tenant sites."

## Interpreted Outcome
Move the whole ecosystem onto the Strelva brand/domain/contract, one canonical
control plane plus the marketing site plus every client tenant site, and leave the
tenant repos clean, building, and pointed at `app.strelva.com`. Endstate: redesigning
a tenant site is a fast, repeatable task, not a migration archaeology dig.

## Repo Facts Found (2026-06-04)
- **Web folder:** `/Users/laneyfraass/websites/` holds the repos.
- **The control plane is duplicated 3× (source-of-truth risk):**
  - `~/REB` is **canonical**: has `src/lib/brand.ts`, the Strelva rebrand, newest
    commit (2026-06-02), branch `redesign/strelva-two-division`. *It is not inside
    the web folder.*
  - `websites/reb` is **stale**: package name `scaffold-web`, no `brand.ts`, 43
    `scaffoldweb` refs, branch `codex/rohlax-payment-handoff`, last 2026-05-19.
  - `websites/reb-launch-readiness-clean` is another `scaffold-web` copy.
  - `websites/reb-contracts` is the `@reb/contracts` package.
- **Tenant storefronts (the redesign targets) are still on OLD naming, zero `strelva` refs:**
  - `websites/gldf` (Next 16.1, git `master`, 2026-05-11): `REB_API_URL`,
    `src/lib/reb-contracts.ts`, 23 `reb-/REB_` files, 1 `scaffoldweb` ref.
  - `websites/rohlax-wellness` (Next 16.2, git `main`, 2026-05-14): both
    `REB_API_URL` and `SCAFFOLD_API_URL` (partial), 21 `reb-/REB_` files, 3 `scaffoldweb` refs.
- **Marketing:** `~/strelva-marketing` has the full dark-glass redesign from this
  session, builds green, but is **uncommitted**.
- **Control-plane rename:** code rename ~done in `~/REB` (brand.ts, `strelva.com`,
  0 `scaffoldweb` in `src/`). **Remnants:** 7 stale smoke-test assertions
  ("Scaffold Web"); `brand.ts` is not yet imported (dead code). Infra cutover
  (Vercel/Clerk/Resend/Stripe/DNS) NOT done. Full plan: `docs/strelva-migration-plan.md`.
- **Intentional (do not "fix"):** `x-reb-*` HMAC headers, `reb:` Redis prefixes,
  and `REB_*` env-var *names* are kept as back-compat aliases so deployed tenants
  keep working. Migrate their *values* (point at `app.strelva.com`) and brand copy,
  not the wire-level names.

## Plan (sequenced)
- **T001 — Canonicalize.** One control plane in the web folder; archive the stale
  `reb` / `reb-launch-readiness-clean` copies. Everything else depends on this.
- **T002 — Finish + verify the rename** in the canonical control plane: fix the 7
  stale smoke assertions; wire or delete `brand.ts`; `pnpm check` green.
- **T003 — Commit `strelva-marketing`** so the design pass isn't lost; confirm build.
- **T004 — External cutover (Jacob):** Vercel domains, Clerk `clerk.strelva.com`,
  Resend SPF/DKIM, Stripe webhook, OAuth, DNS + 301s, Search Console (plan §5–6).
  Do the Clerk session-domain flip BEFORE onboarding Chelsea (it logs everyone out).
- **T005 — Migrate each tenant** (`gldf`, `rohlax-wellness`, + any others): set the
  `REB_API_URL` value to `https://app.strelva.com`, clean `scaffoldweb`/"Scaffold Web"
  brand refs, confirm on the current `CONTRACT_VERSION`, `pnpm build` green, redeploy.
- **T006 — Redesign-ready:** confirm each tenant builds against live `app.strelva.com`,
  then document the "redesign a tenant" workflow (storefront structure + DESIGN-KIT)
  so a redesign is scoped, not a migration.

## Completion Proof
- One canonical control plane; stale `reb` copies archived/removed.
- Canonical control plane: `pnpm check` green, rename verified (smoke green, no "Scaffold Web").
- `strelva-marketing` committed + building.
- Control plane live on `app.strelva.com`; `scaffoldweb.com` 301-redirects.
- `gldf` + `rohlax-wellness` build green, point at `app.strelva.com`, load on their
  own domains, no `scaffoldweb` brand refs.
- A `docs/tenant-redesign.md` describing how to redesign a tenant end-to-end.

## Likely Misfire To Avoid
- Renaming the wire-level `REB_*` env names / `reb:` Redis prefixes / `x-reb-*`
  headers (back-compat by design). Change values + brand copy only.
- Working in a stale `reb` copy instead of the canonical one (always confirm `brand.ts` present).
- Cutting Clerk over after onboarding Chelsea (logs her out).
- Big-bang. Do it repo-by-repo, verifying each builds before the next.

## Relationship to existing docs
Extends `docs/strelva-migration-plan.md` (control plane + marketing split + cutover)
by adding repo-canonicalization and the per-tenant migration the plan doesn't cover.
Supersedes the open items in the `reb-full-completion` goal that are Strelva-cutover-shaped.

## Starter Command
`/goal Follow docs/goals/strelva-cutover/goal.md.`

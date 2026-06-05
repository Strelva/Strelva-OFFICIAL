# Strelva Cutover Runbook (T004 + T005)

Executable checklist for the two gated tasks. Part A is Jacob's account work; Part B
is the exact per-tenant edits, pre-staged so they're mechanical once Part A is verified.
Strategy/context: `docs/strelva-migration-plan.md`. Sequencing/state: `state.yaml`.

**Golden rule:** change env/CSP/routing **values** (point at `app.strelva.com`), never
the wire-level **names** (`REB_*` env vars, `reb:` Redis prefixes, `x-reb-*` headers).

---

## Part A — Infra cutover (T004, Jacob, in order)

### A0. Prep
**Grounded inventory (verified 2026-06-05 via authed `vercel` CLI):**
- Vercel team = **`scaffold-web`**. Projects there: **`scaffold-web`** (control plane,
  currently serves `scaffoldweb.com` → this is the project that gets `app.strelva.com`),
  **`rohlax-wellness`** (live, rohlaxwellness.com), **`greatlakesdriedfruits`**
  (greatlakesdriedfruit.com), `rhm-innovations`.
- Domain *registrations* sit under the **personal** team (`rhinehart514-gmailcoms-projects`):
  `scaffoldweb.com`, `rohlaxwellness.com`, `greatlakesdriedfruit.com` (Vercel NS), etc.
- ⛔ **`strelva.com` is NOT in Vercel at all**, and it's on **Cloudflare nameservers**
  (`cleo.ns.cloudflare.com` / `teresa.ns.cloudflare.com`). **The gating action is at
  Cloudflare, not Vercel** — point `strelva.com` records at Vercel (or move NS to Vercel).
  No CLI/agent path to this from the repo; it needs the Cloudflare dashboard.
- ❓ **`strelva-marketing` is not a project under the `scaffold-web` team** — confirm
  whether it's under the personal team or still needs creating/connecting on Vercel.
- [ ] Inventory current Vercel env vars for the `scaffold-web` project (`vercel link` then
      `vercel env ls --scope scaffold-web`) and copy them.
- [ ] Decide: marketing (`strelva-marketing`) and app (`scaffold-web`) are separate Vercel projects.

### A1. Vercel
- [ ] Marketing project (`strelva-marketing`): assign `strelva.com` + `www.strelva.com`.
- [ ] App project (`~/REB`): assign `app.strelva.com`, `*.strelva.com`, `admin.*.strelva.com`.
- [ ] Set per-project env vars (`NEXT_PUBLIC_SITE_URL=https://strelva.com`,
      `NEXT_PUBLIC_APP_URL=https://app.strelva.com`, `RESEND_DOMAIN=updates.strelva.com`, etc.).
- Verify: both projects build + resolve on their new hosts.

### A2. Clerk  ⚠️ session-domain change logs EVERYONE out
- [ ] Add `strelva.com` + `app.strelva.com` to allowed origins.
- [ ] Set `clerk.strelva.com` CNAME; update OAuth redirect URLs.
- [ ] **Do this BEFORE giving Chelsea dashboard access** (else she gets logged out / re-invited).
- Verify: sign-in/sign-up works on `app.strelva.com`.

### A3. Resend
- [ ] Verify `strelva.com` / `updates.strelva.com` (SPF + DKIM); warm the domain.
- Verify: a transactional email sends and lands (not spam) from the new domain.

### A4. Stripe + OAuth providers
- [ ] Stripe webhook endpoint → `https://app.strelva.com/api/...`; update branding.
- [ ] Google / Yelp / Calendly / Instagram / Vegaro: update redirect/callback URLs to `app.strelva.com`.
- Verify: a Stripe checkout + webhook round-trips on the new domain; each OAuth login succeeds.

### A5. DNS cutover + redirects
**Cloudflare records for `strelva.com`** (Vercel's standard records — the same `76.76.21.21`
apex IP this repo already cites in `docs/launch-blockers.md`; confirm against what Vercel
shows after you add each domain to the project, and set Cloudflare proxy to **DNS-only/grey-cloud**):

```text
# After adding strelva.com (marketing) + app.strelva.com / *.strelva.com (app project) in Vercel:
A      @       76.76.21.21              ; strelva.com apex  -> marketing project
CNAME  www     cname.vercel-dns.com     ; www.strelva.com   -> marketing project
CNAME  app     cname.vercel-dns.com     ; app.strelva.com   -> control plane (scaffold-web project)
CNAME  *       cname.vercel-dns.com     ; <tenant>.strelva.com wildcard -> control plane
```

- [ ] Add the records above in Cloudflare (grey-cloud / DNS-only so Vercel terminates TLS).
- [ ] Add the domains in Vercel first (`strelva.com`+`www` → marketing project; `app.strelva.com`
      + `*.strelva.com` → `scaffold-web` project) so Vercel issues certs once DNS resolves.
- [ ] Add **301s**: `scaffoldweb.com/*` → `strelva.com/*`, `<tenant>.scaffoldweb.com` → `<tenant>.strelva.com`.
- [ ] Keep `scaffoldweb.com` alive purely to redirect (≥30 days for SEO/email).
- Verify: `dig +short app.strelva.com` returns a Vercel target; `scaffoldweb.com/x` 301s to `strelva.com/x`.

### A6. Search Console
- [ ] Verify `strelva.com`; submit the new sitemap (marketing repo owns SEO).

### A7. Acceptance (Part A done when all true)
- [ ] Marketing loads at `strelva.com`; app sign-in works at `app.strelva.com`.
- [ ] `scaffoldweb.com/*` 301s; email + Stripe round-trip on new domain; OAuth logins succeed.
- [ ] Cron + agent runs still fire; Sentry receiving events.
- [ ] `app.strelva.com/api/v1/*` serves the contract (tenants depend on this for Part B).

---

## Part B — Tenant flip (T005, ONLY after Part A is verified)

For each tenant in `/Users/laneyfraass/websites/`: stash/commit any pre-existing work
first (gldf had 3, rohlax had 35 uncommitted files), branch `redesign/strelva-cutover`,
make the edits below, `build` green, redeploy, confirm on the client domain.

### B1. gldf  (greatlakesdriedfruit.com, pnpm)
- [ ] `next.config.ts` CSP: `https://scaffoldweb.com` → `https://app.strelva.com` in
      both `img-src` (line ~8) and `connect-src` (line ~10). (Leave `reb-studio.vercel.app`
      unless the Sanity studio also moves.)
- [ ] `.env` (Vercel): `REB_API_URL` value → `https://app.strelva.com` (keep the var name).
- [ ] `release-manifest.json` / `production-checklist.ts`: update `REB_API_URL` value refs.
- Verify: `pnpm build` green; site loads on greatlakesdriedfruit.com; images + content fetch (no CSP blocks in console); admin redirect works.

### B2. rohlax-wellness  (rohlaxwellness.com, npm)
- [ ] `src/proxy.ts`: `CANONICAL_REB_DASHBOARD_URL` (line ~5) and the `url.hostname ===
      "scaffoldweb.com"` check (line ~18) → `app.strelva.com`.
- [ ] `.env` (Vercel): `REB_API_URL` / `SCAFFOLD_API_URL` and `REB_DASHBOARD_URL` values
      → `https://app.strelva.com` / `https://app.strelva.com/client/rohlax/dashboard`.
- [ ] `.env.example` + README/AGENTS/CLAUDE: update the example values and "Scaffold Web"
      → "Strelva" brand mentions (cosmetic, do with the functional flip).
- Verify: `npm run build` green; site loads on rohlaxwellness.com; content fetch + dashboard redirect work.

### B3. Any other client repos in `websites/`
- Verified 2026-06-05: scanned every repo in `~/websites/` for control-plane refs
  (`REB_API_URL` / `SCAFFOLD_API_URL` / `scaffoldweb` / `reb-contracts` / `app.strelva`).
  **Only `gldf` and `rohlax-wellness` are tenants** — `federal-meats-website`,
  `dropintools`, `nhlgame`, etc. are NOT control-plane tenants. So B1 + B2 are the
  complete tenant set; nothing else to flip today.
- [ ] If a new tenant repo is added later, repeat the B-pattern (search `scaffoldweb` /
      `REB_API_URL` value, flip to `app.strelva.com`, build, deploy).

### B4. Tenant acceptance
- [ ] Each tenant: build green, loads on its own domain, fetches content from
      `app.strelva.com` with no CSP/console errors, admin/dashboard handoff works.

---

## Goal completion (strelva-cutover done when)
- [ ] One canonical control plane; stale `reb` copies archived (T001).
- [ ] Control plane live on `app.strelva.com`; `scaffoldweb.com` 301s (A).
- [ ] `gldf` + `rohlax-wellness` (+ others) on `app.strelva.com`, building, live on their domains (B).
- [ ] `strelva-marketing` deployed at `strelva.com`.
- [ ] A tenant redesign trialed end-to-end per `docs/tenant-redesign.md`.

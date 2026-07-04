# Strelva Migration Plan

**Status:** Draft for approval — no code moved yet (this is the **domain/brand
rebrand**, still parked)
**Author:** generated from a full read of `main` (post release-branch merge, commit `5967494`)
**Date:** 2026-06-01

> **2026-06-22 — scope clarification.** This plan covers ONLY the
> `scaffoldweb.com` → `strelva.com` **domain rebrand + repo split**. It is
> *separate from* the **auth + data backbone cutover** (Clerk+Sanity → Supabase
> Auth + Postgres), which is **DONE in production (2026-06-20)** — see
> `docs/supabase-migration-plan.md` / `docs/post-cutover-runbook.md`. Concretely
> that changes two assumptions in §5 below: the **Clerk** cutover step is moot
> (auth is Supabase now, dead-pathed Clerk), and the **Supabase** "if used" note
> is now "in use, primary." The **Resend sender domain is also already
> re-pointed** — `RESEND_DOMAIN=updates.strelva.com` is live in prod (was
> `updates.scaffoldweb.com`). Everything else here (the 518-literal rebrand, the
> repo split, Stripe/OAuth re-pointing) is still pending and accurate.

## Locked decisions

| Decision | Choice |
|---|---|
| Domain | **strelva.com** (S-T-R-E-L-V-A) — standardize everywhere; retire `scaffoldweb.com` |
| Brand | **Full rename**: "Scaffold Web" → "Strelva" everywhere |
| Topology | **Two separate repos**: `strelva-marketing` + `strelva-app` |
| First step | This plan, approved before any code moves |

## Open decisions still needed (flagged in §8)

- Exact subdomain map (recommended below — confirm or adjust)
- Whether the **audit tool** is a marketing lead-gen surface or an app-only feature
- API placement: colocated under `app.strelva.com/api` (recommended) vs a dedicated `api.strelva.com`
- Cutover style: hard switch vs dual-run with 301 redirects (recommended)

---

## 1. Current state (what we're migrating from)

One Next.js 16 codebase, multi-tenant, **host-routed** via `src/proxy.ts` + `src/lib/marketing-hosts.ts`. A single Vercel deployment serves four roles by hostname:

| Hostname today | Route group / path | Role |
|---|---|---|
| `scaffoldweb.com`, `www.` | `src/app/(marketing)` | Product marketing site |
| `<tenant>.scaffoldweb.com` + custom domains | `src/app/(public)` | Customer business websites |
| `admin.<tenant>.scaffoldweb.com`, `/dashboard`, `/admin`, `/studio` | dashboard/admin | The app |
| `/api/*` | `src/app/api` | Backend |

`scaffoldweb.com` / "Scaffold Web" is wired into **~518 references** across source, config, and docs — proxy host matching, the tenant subdomain pattern `<tenant>.scaffoldweb.com`, Clerk (`clerk.scaffoldweb.com`), Resend (sender domain now re-pointed — `RESEND_DOMAIN=updates.strelva.com` is live in prod, was `updates.scaffoldweb.com`), CSP headers, env defaults, and marketing copy. This is a rebrand, not a DNS change.

---

## 2. Target architecture (two repos)

### `strelva-marketing` — the marketing site
- Standalone Next.js app, its own Vercel project, its own deploy.
- Serves `strelva.com` + `www.strelva.com`.
- Pure content surface: home/landing, pricing, privacy, terms, blog/case studies. Static-first, SEO-owning.
- No auth, no tenant logic, no database writes.

### `strelva-app` — backend + dashboard + tenant sites
- Everything else from the current repo: `(public)` tenant sites, dashboard, admin, `/api`, proxy host routing, content store, agent/AI, cron, webhooks.
- Serves the app subdomain + all tenant hostnames.
- This is the "backend code on a subdomain" repo you described. Tenant customer sites render here too (they're produced by the app), so they stay in this repo — not a third codebase.

### Recommended subdomain / DNS map for strelva.com

| Hostname | Points to | Repo |
|---|---|---|
| `strelva.com`, `www.strelva.com` | Marketing Vercel project | `strelva-marketing` |
| `app.strelva.com` | App Vercel project (authenticated dashboard + `/api`) | `strelva-app` |
| `<tenant>.strelva.com` | App project (host-routed `(public)`) | `strelva-app` |
| `admin.<tenant>.strelva.com` | App project (admin views) | `strelva-app` |
| customer custom domains | App project (via `CUSTOM_DOMAIN_MAP`) | `strelva-app` |
| `clerk.strelva.com` | Clerk (CNAME) | infra |
| `send.strelva.com` (or `updates.`) | Resend (SPF/DKIM) | infra |

**API placement (recommended):** keep the API colocated at `app.strelva.com/api`. A separate `api.strelva.com` adds CORS + cross-subdomain cookie/auth complexity for no real benefit at this stage. Revisit only if a non-web client appears.

---

## 3. Marketing extraction — coupling audit

The `(marketing)` route group is **not** a clean lift. Actual contents and dependencies:

| File | Verdict | Why |
|---|---|---|
| `(marketing)/home/page.tsx` | ✅ Move to marketing | Pure content; only needs `@/lib/pricing` (portable) + `HeroWordRotator` |
| `(marketing)/privacy/page.tsx` | ✅ Move to marketing | Static legal copy |
| `(marketing)/terms/page.tsx` | ✅ Move to marketing | Static legal copy |
| `(marketing)/account/page.tsx` | ⛔ Stays in app | Imports `@/lib/auth`, `@/lib/dev-access`, `UseInvitedEmailButton` — authenticated |
| `(marketing)/audit/page.tsx` + `components/marketing/AuditPage.tsx` | ⚠️ Decision | Interactive tool that calls `/api/audit`. Either keep app-only, or expose it on marketing by calling the app API (see §8) |
| `components/marketing/HeroWordRotator.tsx` | ✅ Move to marketing | Presentational |
| `components/marketing/AccessRequestPage.tsx` | ⛔ Stays in app | Auth/access flow |
| `src/lib/pricing.ts` | 🔁 Copy to marketing | Shared pricing source; duplicate (or extract to a shared package later) |

**Salvage, don't merge:** the `feat/strelva-marketing-site` branch has reusable design (Next 16, Fraunces + Inter, light/dark, 3-tier $99/$199/Enterprise) but is stale (pre-dates the platform-v1/client-experience work now on main; its diff *removes* current files). Lift the design/markup, not the branch.

---

## 4. Rebrand blast radius (`scaffoldweb` → `strelva`)

Do **not** hand-edit ~518 literals. First centralize, then codemod:

1. **Introduce one source of truth** in `strelva-app` (e.g. `src/lib/brand.ts`): `BRAND_NAME`, `ROOT_DOMAIN`, derived URLs. Replace hardcoded literals with these where it's logic (proxy, tenant URLs, CSP, emails).
2. **Codemod the rest** (copy, metadata, mailto): `"Scaffold Web"` → `"Strelva"`, `scaffoldweb.com` → `strelva.com`.
3. **Specific hotspots to handle deliberately:**
   - `src/lib/marketing-hosts.ts` — `DEFAULT_MARKETING_HOSTS`. Once marketing is its own repo, the app only needs apex for redirect logic, not rendering.
   - `src/proxy.ts` — `.endsWith(".scaffoldweb.com")` → `.strelva.com`; tenant + admin extraction; **CSP header** allowlist (`clerk.scaffoldweb.com`, etc.).
   - `CUSTOM_DOMAIN_MAP` seed (`gldf.scaffoldweb.com`) and any `<tenant>.scaffoldweb.com` assumptions.
   - Env: `NEXT_PUBLIC_SITE_URL`, `MARKETING_DOMAINS`, `RESEND_DOMAIN`, `STRIPE_SCAFFOLD_PRICE_ID` (rename), email addresses (`jacob@scaffoldweb.com`).

---

## 5. External services cutover checklist

Each references the domain and/or brand and must be re-pointed:

- **Supabase Auth** (replaced Clerk; live since 2026-06-20) — add `strelva.com` + `app.strelva.com` to the redirect-URL allowlist + Site URL, update Google OAuth redirect URLs. No custom auth CNAME and no forced logout (the Clerk session-domain logout risk no longer applies).
- ~~**Clerk**~~ — *obsolete: auth is Supabase now; Clerk is dead-pathed pending teardown. Skip.*
- **Resend** — verify `strelva.com` / `send.strelva.com` (SPF + DKIM), update `RESEND_DOMAIN`, warm up the new sending domain.
- **Stripe** — update account branding, webhook endpoint → `app.strelva.com/api/...`, rename `STRIPE_SCAFFOLD_PRICE_ID`.
- **OAuth providers** (Google, Yelp, Calendly, Instagram, Vegaro) — update redirect/callback URLs to `app.strelva.com`.
- **Supabase** — in use as the primary auth + data backbone; update auth redirect/allowed URLs to the new host (this is the auth gate for the rebrand).
- **Sanity** — *being decommissioned post-cutover (dual-write rollback mirror only).* If still present at rebrand time, point the webhook URL → app subdomain; dataset unchanged.
- **Sentry** — update allowed domains / DSN project settings.
- **Google Search Console** — verify `strelva.com`, submit new sitemap (marketing repo owns SEO).
- **Vercel** — two projects, domains assigned per §2, env vars set per project.

---

## 6. Phased execution sequence

**Phase 0 — Prep (no code).** Lock subdomain map (§8). Inventory current Vercel envs. Acquire `strelva.com` ✅. Create the two empty repos + Vercel projects.

**Phase 1 — Centralize brand/domain in the current repo.** Add `brand.ts`, replace logic-level literals with config, verify `pnpm check` stays green. This de-risks everything downstream (domain becomes a variable, not 518 strings).

**Phase 2 — Stand up `strelva-marketing`.** New repo. Port `home`/`privacy`/`terms`, salvage design from the stale strelva branch, copy `pricing.ts`. Deploy to a preview URL. Decide audit-tool treatment (§8).

**Phase 3 — Reshape `strelva-app`.** Remove the 3 pure-marketing pages (keep `account`, `audit` per decision). Add apex→marketing redirect for any stray apex hit. Codemod `scaffoldweb.com` → `strelva.com` in proxy/tenant/CSP. Deploy to `app.strelva.com` + `<tenant>.strelva.com`.

**Phase 4 — External services cutover (§5).** Do Clerk/Resend/OAuth in a staging-style pass; verify auth + email end-to-end before DNS flip.

**Phase 5 — DNS cutover + redirects.** Point `strelva.com` → marketing, `app.`/`<tenant>.` → app. Add **301s** `scaffoldweb.com/*` → `strelva.com/*` and `<tenant>.scaffoldweb.com` → `<tenant>.strelva.com`. Keep the old domain alive purely to redirect.

**Phase 6 — Verify + decommission.** Run the §7 checklist. After a redirect-soak period (suggest ≥30 days for SEO/email), retire `scaffoldweb.com` infra.

---

## 7. Cutover verification checklist

- [ ] Marketing site loads at `strelva.com`; `www` + apex both resolve
- [ ] `scaffoldweb.com/*` 301s to `strelva.com/*`
- [ ] Sign-in / sign-up works on `app.strelva.com` (Supabase Auth)
- [ ] OAuth provider logins succeed (new callback URLs)
- [ ] A tenant site renders at `<tenant>.strelva.com`; old `<tenant>.scaffoldweb.com` redirects
- [ ] Customer custom domains still resolve (`CUSTOM_DOMAIN_MAP`)
- [ ] Transactional email sends + lands (Resend, new domain, not spam)
- [ ] Stripe checkout + webhook round-trip on the new domain
- [ ] Cron jobs + agent runs still fire
- [ ] `pnpm check` green in both repos; Sentry receiving events

---

## 8. Decisions to confirm before Phase 1

1. **Subdomain map** — accept §2 as-is, or change (`app.` vs `dashboard.`, dedicated `api.`?).
2. **Audit tool** — app-only feature, or a marketing lead-gen surface that calls the app API?
3. **Cutover style** — recommended dual-run + 301 redirects, or a hard switch?
4. **Shared code** — accept light duplication (`pricing.ts`, brand tokens) between repos for now, or set up a shared package from day one?

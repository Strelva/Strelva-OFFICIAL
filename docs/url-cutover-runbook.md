# Clean-URL Cutover Runbook (admin/client login on strelva.com)

> **2026-06-22 — auth is now Supabase, not Clerk.** Prod cut over to **Supabase
> Auth + Postgres on 2026-06-20**. The "one gate: Clerk satellite domain"
> framing below is superseded: the auth gate is now **Supabase Auth's
> redirect-URL allowlist** (Supabase dashboard → Authentication → URL
> Configuration), not a Clerk satellite domain. The DNS + Vercel steps (2-3) are
> unchanged and still correct. Read step 1 as "add the new origins to Supabase
> redirect URLs"; ignore the Clerk CNAME/satellite mechanics. Clerk is
> dead-pathed behind `isSupabaseAuthConfigured()`.

**Goal:** operators (Noah + Jacob) log in at a clean Strelva URL; clients log in on their own brand. **The code already routes this** — `src/proxy.ts` resolves `admin.strelva.com` (no tenant → operator console), `admin.<tenant>.strelva.com` / custom admin domains (client dashboard), and `<tenant>.strelva.com` (client public site). This is infra only.

## URL scheme (decided)

| URL | Who | Routes to |
|---|---|---|
| `admin.strelva.com` | **Noah + Jacob** (operator console) | sign-in → `/admin` (super-admin, all clients) |
| `admin.<client-domain>` | each **client owner** (white-label) | their dashboard, their site only |
| `<tenant>.strelva.com` | the public | client public websites |
| `app.strelva.com` | optional | redirect front door (skippable) |

Note: Vercel only supports single-level wildcards (`*.strelva.com`). `admin.<tenant>.strelva.com` (two levels) would need per-host domains, so clients go white-label on their own domain instead.

## Current state (verified 2026-06-18)

- App project `strelva` (scaffold-web team) serves the merged `main` at **scaffoldweb.com** (publicly, `/sign-in` + `/api/health` = 200, all health checks green). **Auth is Supabase Auth + content is Postgres as of the 2026-06-20 cutover.**
- DNS on **Cloudflare**. `strelva.com` (marketing) + `scaffoldweb.com` (app) are both team domains.
- Auth = **Supabase Auth** (Google OAuth consent screen published / "In production" + magic link). Clerk is dead-pathed, pending teardown.
- `admin.strelva.com` does not resolve yet.

## The one gate: Supabase Auth redirect URLs

`admin.strelva.com` will *serve* the app the moment DNS + Vercel are done, but **login fails until Supabase Auth knows the origin** (it rejects redirect URLs not on the allowlist). The fix is one dashboard setting: in the Supabase dashboard → Authentication → URL Configuration, add `https://admin.strelva.com` (and `https://app.strelva.com` if used) to the **redirect URL allowlist** + set/keep the Site URL. Reversible; nobody is forced out. _(Pre-cutover this step was a Clerk satellite domain — no longer applicable.)_

## Steps (in order)

### 1. Supabase Auth — add the redirect URLs (the gate; do first)
In the Supabase dashboard → **Authentication → URL Configuration** → add `https://admin.strelva.com` (and `https://app.strelva.com` if used) to the **redirect URL allowlist**, and set the **Site URL** to the canonical app host. No new CNAME is needed for auth (Supabase Auth is hosted on the Supabase project, not a custom auth subdomain). _(Pre-cutover this step added a Clerk satellite domain + `clerk.strelva.com` CNAME — both obsolete now.)_

### 2. Vercel — attach the domains to the app project
Run as the logged-in CLI (Noah, scaffold-web scope):
```bash
cd ~/strelva-platform
vercel domains add admin.strelva.com strelva --scope scaffold-web
# optional front door:
vercel domains add app.strelva.com strelva --scope scaffold-web
# client public sites wildcard:
vercel domains add "*.strelva.com" strelva --scope scaffold-web
```
Vercel will print the DNS target to add in Cloudflare (a CNAME to `cname.vercel-dns.com`, or the apex/A record it specifies).

### 3. Cloudflare — add the DNS records
For each domain Vercel asks for, add a record in Cloudflare, **DNS-only (grey cloud, not proxied)** — Cloudflare's proxy fights Vercel's SSL:
- `admin` → CNAME → `cname.vercel-dns.com` (DNS-only)
- `app` → CNAME → `cname.vercel-dns.com` (DNS-only) [if used]
- `*` → CNAME → `cname.vercel-dns.com` (DNS-only) [client sites]

(No auth CNAME is needed anymore — Supabase Auth doesn't require a custom subdomain. The old Clerk satellite CNAME from the pre-cutover step is gone.)

### 4. Env — make redirects land on the new host
Set on the strelva Vercel project (Production), then redeploy:
```bash
vercel env add NEXT_PUBLIC_SITE_URL production   # https://app.strelva.com (or admin.strelva.com)
```
(The proxy's `buildTenantFallbackUrl` defaults to `https://strelva.com`; point it at the app host.)

### 5. Verify
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://admin.strelva.com/api/health   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://admin.strelva.com/sign-in       # 200, Supabase sign-in loads
```
Then actually sign in at `https://admin.strelva.com` → should land on `/admin` (super-admin). Confirm an existing session on `scaffoldweb.com` is still valid (no logout = redirect URLs done right).

### 6. Per client (white-label, when ready)
For each client with a custom domain: add `admin.<their-domain>` in Vercel + Cloudflare (or their DNS) + add the origin to the **Supabase Auth redirect URL allowlist**, and set the tenant's `adminDomain`. Their dashboard then lives on their own brand. (Note: the long-term auth architecture in `docs/auth-tenancy-architecture.md` moves the dashboard to a single host `app.strelva.com/{tenant}` and removes white-label admin domains — confirm direction before building per-client admin domains.)

## Rollback
Every step is reversible: `vercel domains rm <domain>`, delete the Cloudflare record, remove the Clerk satellite/origin. Nothing here is destructive; the app keeps serving on `scaffoldweb.com` throughout.

## Interaction with the rebrand / Supabase migration
- This cutover is independent of the data/auth migration, which is **already DONE** (Supabase Auth + Postgres, live 2026-06-20).
- Because auth is now Supabase, the gate is Supabase Auth's redirect-URL allowlist (step 1, already corrected above), not a Clerk satellite domain. The DNS + Vercel steps (2-3) are unchanged.
- `app.strelva.com` becoming the canonical app host is also the T004 rebrand target (`docs/strelva-migration-plan.md`); this runbook is the first concrete step of it.

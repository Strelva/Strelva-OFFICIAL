# Clean-URL Cutover Runbook (admin/client login on strelva.com)

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

- App project `strelva` (scaffold-web team) serves the merged `main` at **scaffoldweb.com** (publicly, `/sign-in` + `/api/health` = 200, all health checks green).
- DNS on **Cloudflare**. `strelva.com` (marketing) + `scaffoldweb.com` (app) are both team domains.
- Clerk = live instance `clerk.scaffoldweb.com` (`ins_3CM6mPmG0ZepPkSte62gDzGCf4r`).
- `admin.strelva.com` does not resolve yet.

## The one gate: Clerk

`admin.strelva.com` will *serve* the app the moment DNS + Vercel are done, but **login fails until Clerk knows the origin** (it rejects unknown origins by design). The fix is one dashboard setting: add `strelva.com` as a **satellite domain** on the existing instance. Done this way, **nobody is logged out** and it's reversible. Needs Clerk dashboard access (likely Jacob's account — get Noah added, or Jacob does this one step).

## Steps (in order)

### 1. Clerk — add the satellite domain (the gate; do first)
In dashboard.clerk.com → the scaffoldweb instance → **Domains** → add `strelva.com` (and `admin.strelva.com`) as a **satellite domain**. Add `https://admin.strelva.com` (and `https://app.strelva.com` if used) to **allowed origins / redirect URLs**. Keep `clerk.scaffoldweb.com` as the primary (do NOT change it — that's the logout-causing move). Clerk will give a CNAME for the satellite (e.g. `clerk.strelva.com` → Clerk) — add it in Cloudflare (DNS-only).

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
- the Clerk satellite CNAME from step 1 (DNS-only)

### 4. Env — make redirects land on the new host
Set on the strelva Vercel project (Production), then redeploy:
```bash
vercel env add NEXT_PUBLIC_SITE_URL production   # https://app.strelva.com (or admin.strelva.com)
```
(The proxy's `buildTenantFallbackUrl` defaults to `https://strelva.com`; point it at the app host.)

### 5. Verify
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://admin.strelva.com/api/health   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://admin.strelva.com/sign-in       # 200, Clerk loads
```
Then actually sign in at `https://admin.strelva.com` → should land on `/admin` (super-admin). Confirm an existing session on `scaffoldweb.com` is still valid (no logout = satellite done right).

### 6. Per client (white-label, when ready)
For each client with a custom domain: add `admin.<their-domain>` in Vercel + Cloudflare (or their DNS) + add the origin to Clerk allowed origins, and set the tenant's `adminDomain`. Their dashboard then lives on their own brand.

## Rollback
Every step is reversible: `vercel domains rm <domain>`, delete the Cloudflare record, remove the Clerk satellite/origin. Nothing here is destructive; the app keeps serving on `scaffoldweb.com` throughout.

## Interaction with the rebrand / Supabase migration
- This cutover is independent of the Supabase migration — do it whenever Clerk access lands.
- If the Supabase migration swaps Clerk → Supabase Auth (see `supabase-migration-plan.md` Decision 2), the satellite-domain step is replaced by Supabase Auth's redirect-URL allowlist, but the DNS + Vercel steps are identical. So steps 2-3 are not throwaway either way.
- `app.strelva.com` becoming the canonical app host is also the T004 rebrand target (`docs/strelva-migration-plan.md`); this runbook is the first concrete step of it.

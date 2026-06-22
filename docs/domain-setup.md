# Domain Setup Checklist

> **2026-06-22:** tenant records (incl. `productionDomain`/`adminDomain`) now
> live in **Postgres** (`tenants` table) as the source of truth since the
> 2026-06-20 cutover — not Sanity. The DNS/Vercel/Cloudflare steps below are
> unaffected.

## Step 0 — The domain belongs to the client, from day one

This is a contract promise (see `docs/strategy/website-offer-two-door.md`): "the domain is in YOUR name from day one, and you leave with everything." Do not register a client's domain inside Strelva's registrar or Cloudflare account.

1. **Buy the domain in the client's own account.** The client creates (or already has) their own registrar / Cloudflare account and purchases the domain there. If they're not comfortable doing it solo, do a ~10-minute screen-share and walk them through it — but it stays under *their* login and *their* payment method.
2. **Strelva gets a member role, not ownership.** The client invites Strelva to their Cloudflare account with a **DNS-edit member role only** (Cloudflare: Members → Invite → role "DNS"). That's enough to add the Vercel records below and manage routing; it is not account ownership and is trivially revoked at handoff.
3. **Record who owns what.** Note in the tenant record / handoff notes that the registrar + DNS account is client-owned and Strelva is a delegated member. This is what makes the repo-transfer runbook's "DNS is already theirs" step true.

> **Existing clients — confirm and migrate.** Some early domains were set up before this rule. **Rohlax (`rohlaxwellness.com`) DNS lives in Cloudflare** — confirm whether that Cloudflare account is the client's or Strelva's. If it's in a Strelva-owned account, migrate the zone to a client-owned Cloudflare account (or transfer the registrar to the client) and re-add Strelva as a DNS-edit member. Until that's done, the ownership promise isn't actually backed by access reality.

## Adding a new tenant's custom domain

1. Confirm the domain was purchased in the **client's** account per Step 0, and that Strelva has the DNS-edit member role.
2. Add to the Vercel project (`scaffold-web`):
   ```
   vercel domains add yourbusiness.com
   vercel domains add www.yourbusiness.com
   vercel domains add admin.yourbusiness.com
   ```
3. Configure DNS per Vercel instructions:
   ```
   A     yourbusiness.com        76.76.21.21
   CNAME www.yourbusiness.com    cname.vercel-dns.com
   CNAME admin.yourbusiness.com  cname.vercel-dns.com
   ```
4. Update env on `scaffold-web`:
   ```
   CUSTOM_DOMAIN_MAP={"yourbusiness.com":"tenantid"}
   ```
   `www.` and `admin.` are resolved from the bare-domain entry by the proxy.
5. Update the tenant's `productionDomain` to `yourbusiness.com` (in the Postgres `tenants` table — the source of truth since the 2026-06-20 cutover; edit via the admin tenant-edit UI / `PATCH /api/admin/tenants`, not Sanity); set `adminDomain` only if it is not `admin.yourbusiness.com`.
6. Verify a Resend domain for `updates.yourbusiness.com` if using newsletter.
7. Pull production env and verify:
   ```
   vercel env pull .env.production.local --environment=production
   pnpm check:prod
   ```

## strelva.com (platform + wildcard subdomains)

1. Domain is already added to Vercel project `scaffold-web` with wildcard support:
   ```
   vercel domains add strelva.com
   vercel domains add *.strelva.com
   ```
2. Configure DNS. With Porkbun-managed DNS, Vercel currently recommends:
   ```
   A     strelva.com    76.76.21.21
   CNAME *.strelva.com  cname.vercel-dns.com
   ```
   Alternatively, switch nameservers to:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```
3. Remove any Porkbun/l.ink forwarding. `strelva.com/api/health` must not redirect to `scaffoldweb-com.l.ink`.
4. Update env var:
   ```
   MARKETING_DOMAINS=strelva.com,www.strelva.com
   ```
5. Wildcard enables `{tenant}.strelva.com` routing via proxy subdomain extraction.
6. Verify:
   ```
   vercel domains inspect strelva.com
   dig +short strelva.com A
   dig +short strelva.com NS
   dig +short '*.strelva.com' CNAME
   curl -I -L https://strelva.com/api/health
  pnpm check:prod
  ```

## Rohlax Wellness Cloudflare DNS

`rohlaxwellness.com` uses Cloudflare nameservers (`dax.ns.cloudflare.com`, `vivienne.ns.cloudflare.com`). Keep the Vercel domain entries in place and add the records Vercel recommends inside Cloudflare:

```
A www.rohlaxwellness.com 76.76.21.21
A admin.rohlaxwellness.com 76.76.21.21
```

Current Vercel evidence:

- `rohlaxwellness.com` is attached to project `rohlax-wellness`.
- `admin.rohlaxwellness.com` is attached to project `scaffold-web`.
- `www.rohlaxwellness.com` is found under the account but still reports as not configured; confirm it is attached to the intended Vercel project if Vercel continues warning after the Cloudflare A record propagates.
- On May 13, 2026, `www` and `admin` expose the CNAME `931bd7b36e7b2348.vercel-dns-017.com.`, but `dns.resolve4(...)` and `curl` still return `ENOTFOUND`. Treat that as partial DNS, not launch-ready routing.

Verify:

```
vercel domains inspect rohlaxwellness.com
vercel domains inspect www.rohlaxwellness.com
vercel domains inspect admin.rohlaxwellness.com
dig +short www.rohlaxwellness.com CNAME
dig +short admin.rohlaxwellness.com CNAME
dig +short www.rohlaxwellness.com A
dig +short admin.rohlaxwellness.com A
curl -I -L https://rohlaxwellness.com
curl -I -L https://admin.rohlaxwellness.com
pnpm check:prod
```

## Verification

- [ ] `yourbusiness.com` shows the tenant's public site
- [ ] `admin.yourbusiness.com` redirects root traffic to `/dashboard`
- [ ] `admin.yourbusiness.com/sign-in` and `/sign-up` render the tenant auth flow
- [ ] `strelva.com` shows marketing page
- [ ] `strelva.com/api/health` returns Vercel health JSON and does not redirect to `scaffoldweb-com.l.ink`
- [ ] `strelva.com/access-request` shows the private-beta access request
- [ ] `tenantid.strelva.com` is treated only as a fallback/platform route, not the customer-facing URL

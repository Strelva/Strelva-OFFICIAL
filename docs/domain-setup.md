# Domain Setup Checklist

## Adding a new tenant's custom domain

1. Purchase domain (Porkbun, Namecheap, Google Domains, etc.)
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
5. Update the tenant's `productionDomain` in Sanity to `yourbusiness.com`; set `adminDomain` only if it is not `admin.yourbusiness.com`.
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

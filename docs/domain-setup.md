# Domain Setup Checklist

## Adding a new tenant's custom domain

1. Purchase domain (Porkbun, Namecheap, Google Domains, etc.)
2. Add to the Vercel project (`reb-studio`):
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
4. Update env on `reb-studio`:
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

## scaffoldweb.com (platform + wildcard subdomains)

1. Domain is already added to Vercel project `reb-studio` with wildcard support:
   ```
   vercel domains add scaffoldweb.com
   vercel domains add *.scaffoldweb.com
   ```
2. Configure DNS. With Porkbun-managed DNS, Vercel currently recommends:
   ```
   A     scaffoldweb.com    76.76.21.21
   CNAME *.scaffoldweb.com  cname.vercel-dns.com
   ```
   Alternatively, switch nameservers to:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```
3. Remove any Porkbun/l.ink forwarding. `scaffoldweb.com/api/health` must not redirect to `scaffoldweb-com.l.ink`.
4. Update env var:
   ```
   MARKETING_DOMAINS=scaffoldweb.com,www.scaffoldweb.com,reb-studio.vercel.app,reb.studio,www.reb.studio
   ```
5. Wildcard enables `{tenant}.scaffoldweb.com` routing via proxy subdomain extraction.
6. Verify:
   ```
   vercel domains inspect scaffoldweb.com
   dig +short scaffoldweb.com A
   dig +short scaffoldweb.com NS
   dig +short '*.scaffoldweb.com' CNAME
   curl -I -L https://scaffoldweb.com/api/health
   pnpm check:prod
   ```

## Verification

- [ ] `yourbusiness.com` shows the tenant's public site
- [ ] `admin.yourbusiness.com` redirects root traffic to `/dashboard`
- [ ] `admin.yourbusiness.com/sign-in` and `/sign-up` render the tenant auth flow
- [ ] `scaffoldweb.com` shows marketing page
- [ ] `scaffoldweb.com/api/health` returns Vercel health JSON and does not redirect to `scaffoldweb-com.l.ink`
- [ ] `scaffoldweb.com/access-request` shows the private-beta access request
- [ ] `tenantid.scaffoldweb.com` is treated only as a fallback/platform route, not the customer-facing URL

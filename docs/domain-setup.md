# Domain Setup Checklist

## Adding a new tenant's custom domain

1. Purchase domain (Namecheap, Google Domains, etc.)
2. Add to the Vercel project (`scaffold-web`):
   ```
   vercel domains add yourbusiness.com
   vercel domains add www.yourbusiness.com
   ```
3. Configure DNS per Vercel instructions (A record + CNAME for www)
4. Update env on `scaffold-web`:
   ```
   CUSTOM_DOMAIN_MAP={"yourbusiness.com":"tenantid","www.yourbusiness.com":"tenantid"}
   CORS_ORIGINS=https://yourbusiness.com,https://www.yourbusiness.com
   ```
5. Update the tenant's `siteUrl` in Sanity to `https://yourbusiness.com`
6. Verify a Resend domain for `updates.yourbusiness.com` if using newsletter

## scaffoldweb.com (platform + wildcard subdomains)

1. Purchase domain
2. Add to Vercel project `scaffold-web`:
   ```
   vercel domains add scaffoldweb.com
   vercel domains add *.scaffoldweb.com
   ```
3. Configure DNS: A record for root, wildcard CNAME for *.scaffoldweb.com
4. Update env var:
   ```
   MARKETING_DOMAINS=scaffoldweb.com,www.scaffoldweb.com,scaffold-web.vercel.app,localhost
   ```
5. Wildcard enables `{tenant}.scaffoldweb.com` routing via middleware subdomain extraction

## Verification

- [ ] `yourbusiness.com` shows the tenant's public site
- [ ] `yourbusiness.com/dashboard` redirects to platform dashboard
- [ ] `scaffoldweb.com` shows marketing page
- [ ] `scaffoldweb.com/onboard` shows chat onboarding
- [ ] `tenantid.scaffoldweb.com` shows the tenant's public site (via subdomain routing)

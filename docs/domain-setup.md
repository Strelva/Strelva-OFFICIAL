# Domain Setup Checklist

## rohlaxwellness.com (Chelsea's site)

1. Purchase domain (Namecheap, Google Domains, etc.)
2. Add to Vercel project `rohlax-wellness`:
   ```
   vercel domains add rohlaxwellness.com --project rohlax-wellness
   vercel domains add www.rohlaxwellness.com --project rohlax-wellness
   ```
3. Configure DNS per Vercel instructions (A record + CNAME for www)
4. Set env var on `scaffold-web`:
   ```
   CUSTOM_DOMAIN_MAP={"rohlaxwellness.com":"rohlax","www.rohlaxwellness.com":"rohlax"}
   CORS_ORIGINS=https://rohlaxwellness.com,https://www.rohlaxwellness.com,https://rohlax-wellness.vercel.app
   ```
5. Update rohlax tenant `siteUrl` in Sanity to `https://rohlaxwellness.com`
6. Verify Resend domain for `updates.rohlaxwellness.com`

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

- [ ] `rohlaxwellness.com` shows Chelsea's public site
- [ ] `rohlaxwellness.com/dashboard` redirects to platform dashboard
- [ ] `scaffoldweb.com` shows marketing page
- [ ] `scaffoldweb.com/onboard` shows chat onboarding
- [ ] `rohlax.scaffoldweb.com` shows Chelsea's public site (via subdomain routing)

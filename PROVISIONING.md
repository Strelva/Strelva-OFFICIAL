# Provisioning a New Client

End-to-end guide for spinning up a new Scaffold Web tenant and its custom repo.

## Overview

Every paid client gets:
1. A **tenant record** in Scaffold Web (Sanity in prod, `dev-tenants.json` locally)
2. A **custom repo** (separate Next.js project) that serves the public website
3. **Signed revalidation** so content edits in the dashboard push to the live site
4. **Clerk auth** so the client can log into their admin dashboard
5. **Seed content** matching their industry template

## Prerequisites

- Access to the Scaffold Web repo (`~/Projects/REB`)
- Node.js 20+ and pnpm installed
- For production: Vercel account, Clerk dashboard access, domain registrar access

## Step 1: Provision the Tenant

### Dry run first

```bash
pnpm provision-tenant --dry-run \
  --id "buffalo-barber" \
  --subdomain "buffalo-barber" \
  --siteName "Buffalo Barber Co" \
  --ownerName "Mike" \
  --industry "trades" \
  --ownerEmail "mike@buffalobarber.com" \
  --features "booking,newsletter" \
  --bookingProvider "Square" \
  --bookingUrl "https://squareup.com/appointments/book/buffalo-barber" \
  --productionDomain "buffalobarber.com"
```

Review the summary output. When satisfied, run again without `--dry-run`.

### What the script does

1. Validates all inputs (ID format, email, industry)
2. Generates a 256-bit `revalidationSecret` for HMAC webhook signing
3. Derives `siteUrl` and `revalidateUrl` from the production domain (or subdomain fallback)
4. Writes the tenant to `dev-tenants.json`
5. Optionally creates a Vercel project if `VERCEL_TOKEN` is set
6. Prints env vars, Vercel CLI commands, and a next-steps checklist

### Interactive mode

Run without arguments for guided prompts:

```bash
pnpm provision-tenant
```

### Valid industries

`wellness`, `food-brand`, `restaurant`, `trades`, `professional`, `fashion-stylist`

### Valid features

`booking`, `newsletter`, `blog`, `events`, `shop`, `products`, `rewards`, `providers`, `instagram`, `reviews`

## Step 2: Create the Client Repo

Copy the starter scaffold into a new repo:

```bash
mkdir ~/Projects/buffalo-barber-site
cp -r custom-repo-starter/* ~/Projects/buffalo-barber-site/
cd ~/Projects/buffalo-barber-site
```

The starter includes:
- **`scaffold-client.ts`** -- typed fetch client for all Scaffold Web API endpoints
- **`revalidate-route.ts`** -- Next.js route handler with HMAC signature verification
- **`content-defaults.ts`** -- fallback content for all 15 section types
- **`README.md`** -- setup and ship checklist

### Set up the Next.js project

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir
cp scaffold-client.ts lib/
cp content-defaults.ts lib/
mkdir -p app/api/v1/revalidate
cp revalidate-route.ts app/api/v1/revalidate/route.ts
```

### Wire up content fetching

```typescript
// app/page.tsx
import { fetchScaffoldContent } from "@/lib/scaffold-client";
import { defaultHero, defaultServices } from "@/lib/content-defaults";

export default async function Home() {
  const hero = await fetchScaffoldContent("hero", defaultHero);
  const services = await fetchScaffoldContent("services", defaultServices);
  // ... render sections
}
```

### Environment variables

```bash
# .env.local (development)
TENANT_ID=buffalo-barber
SCAFFOLD_API_URL=http://localhost:3000
REVALIDATION_SECRET=<from provisioning output>

# Production (set via Vercel CLI or dashboard)
TENANT_ID=buffalo-barber
SCAFFOLD_API_URL=https://scaffoldweb.com
REVALIDATION_SECRET=<from provisioning output>
```

## Step 3: Seed Content

Back in the Scaffold Web repo:

```bash
pnpm seed-tenant buffalo-barber
```

This writes all 15 content sections to the storage backend (Sanity in prod, dev files locally).

## Step 4: Configure Clerk Auth

1. Go to Clerk dashboard
2. Find or create the client's user account
3. Set `publicMetadata`:
   ```json
   { "tenants": ["buffalo-barber"], "role": "owner" }
   ```
4. The admin dashboard at `admin.buffalobarber.com` will now authenticate this user

## Step 5: Deploy

### Client repo

```bash
cd ~/Projects/buffalo-barber-site
vercel link
vercel env add TENANT_ID production <<< "buffalo-barber"
vercel env add SCAFFOLD_API_URL production <<< "https://scaffoldweb.com"
vercel env add REVALIDATION_SECRET production <<< "<secret>"
vercel domains add buffalobarber.com
vercel domains add www.buffalobarber.com
vercel domains add admin.buffalobarber.com
vercel deploy --prod
```

### DNS configuration

- `buffalobarber.com` -- A record to `76.76.21.21` (or CNAME to `cname.vercel-dns.com`)
- `www.buffalobarber.com` -- CNAME to `cname.vercel-dns.com`
- `admin.buffalobarber.com` -- CNAME to `cname.vercel-dns.com`

## Step 6: Verify

### Verification checklist

- [ ] Site renders at production URL with seeded content
- [ ] Admin dashboard loads at admin subdomain
- [ ] Client can log in via Clerk
- [ ] Content edit in dashboard appears on live site within seconds
- [ ] Revalidation webhook returns 200 with valid signature
- [ ] Revalidation webhook returns 401 with invalid signature
- [ ] Site renders fallback content when `SCAFFOLD_API_URL` is unreachable

## Wire Format Reference

### Revalidation webhook

Scaffold Web POSTs to the client repo's `/api/v1/revalidate` endpoint.

**Headers:**
- `Content-Type: application/json`
- `x-reb-timestamp` -- Unix timestamp in milliseconds (string)
- `x-reb-signature` -- HMAC-SHA256 hex digest of `{timestamp}.{body}`

**Body (JSON):**
```json
{
  "tenant": "buffalo-barber",
  "paths": ["/"],
  "tags": ["content"],
  "all": true
}
```

**Signature verification:**
```
expected = HMAC-SHA256(secret, "{timestamp}.{body}")
valid = timingSafeEqual(provided, expected) && abs(now - timestamp) < 300000ms
```

The header names `x-reb-timestamp` and `x-reb-signature` are part of the v1 wire format.

### Content API

- `GET /api/v1/content/{tenant}/{section}` -- fetch a content section
- `GET /api/v1/page-config/{tenant}` -- fetch page structure
- `GET /api/v1/site-capabilities/{tenant}` -- fetch capability manifest

## Architecture

```
[Client Browser]
       |
       v
[Custom Repo (Vercel)]  <--- serves public website
       |                       |
       | fetchScaffoldContent  | POST /api/v1/revalidate
       v                       ^
[Scaffold Web (Vercel)]  ------|
       |
       v
[Sanity CMS] <-> [Redis Cache]
```

## Troubleshooting

**Revalidation returns 401:** Check `REVALIDATION_SECRET` matches between Scaffold Web tenant config and the client repo. Ensure system clocks are within 5 minutes.

**Content shows fallback instead of real data:** Verify `SCAFFOLD_API_URL` is set and reachable. Check `TENANT_ID` matches exactly. Verify content was seeded.

**Client can't log into admin dashboard:** Verify Clerk `publicMetadata.tenants` includes the tenant ID. Check that `admin.domain.com` resolves to the Scaffold Web Vercel project.

**Revalidation failures in Slack:** Check `reb:revalidation:failures` in Redis. The reconciliation cron auto-retries stale revalidations.

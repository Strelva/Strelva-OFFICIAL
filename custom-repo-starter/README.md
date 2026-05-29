# Scaffold Custom Repo Starter

Use this folder as the contract scaffold for every paid-client custom site repo.
Scaffold Web remains the control plane; the custom repo is the public website runtime.

## Files

| File | Purpose |
|------|---------|
| `scaffold-client.ts` | Typed fetch client for Scaffold Web's `/api/v1/*` contract |
| `revalidate-route.ts` | Next.js App Router POST handler with HMAC signature verification |
| `content-defaults.ts` | Fallback content for all 15 section types + full type definitions |
| `README.md` | This file |

## Quick Start

```bash
# 1. Create a new Next.js project
npx create-next-app@latest my-client-site --typescript --tailwind --app

# 2. Copy starter files into the project
cp scaffold-client.ts my-client-site/lib/
cp content-defaults.ts my-client-site/lib/
mkdir -p my-client-site/app/api/v1/revalidate
cp revalidate-route.ts my-client-site/app/api/v1/revalidate/route.ts

# 3. Set environment variables
cd my-client-site
cat > .env.local << EOF
TENANT_ID=client-slug
SCAFFOLD_API_URL=https://scaffoldweb.com
REVALIDATION_SECRET=<from-provision-tenant-output>
EOF
```

## Required Environment

```bash
TENANT_ID=client-slug                           # Required
SCAFFOLD_API_URL=https://scaffoldweb.com         # Required (or legacy REB_API_URL)
REVALIDATION_SECRET=shared-secret-from-scaffold  # Required
```

`scaffold-client.ts` also accepts the legacy `REB_API_URL` env var. New repos
should set `SCAFFOLD_API_URL`; existing repos can migrate without breakage by
setting both during cutover.

## Usage

### Fetching content

```typescript
import { fetchScaffoldContent, fetchScaffoldPageConfig } from "@/lib/scaffold-client";
import { defaultHero, defaultServices, defaultContact } from "@/lib/content-defaults";

const hero = await fetchScaffoldContent("hero", defaultHero);
const services = await fetchScaffoldContent("services", defaultServices);
const contact = await fetchScaffoldContent("contact", defaultContact);
```

Content is cached via Next.js ISR (`revalidate: 60`) and tagged for on-demand
revalidation when Scaffold Web pushes updates.

### Preview mode

Pass `{ preview: true }` to bypass caching and fetch draft content:

```typescript
const hero = await fetchScaffoldContent("hero", defaultHero, { preview: true });
```

### Revalidation endpoint

The revalidation route handler at `/api/v1/revalidate`:

1. Reads `x-reb-timestamp` and `x-reb-signature` headers
2. Verifies the HMAC-SHA256 signature against `REVALIDATION_SECRET`
3. Rejects requests older than 5 minutes
4. Calls `revalidatePath()` and `revalidateTag()` to bust Next.js cache
5. Ignores payloads where `tenant` doesn't match this repo's `TENANT_ID`

## Required Contract

- Use `fetchScaffoldContent`, `fetchScaffoldPageConfig`, and `fetchScaffoldSiteCapabilities` to read tenant data.
- Expose `POST /api/v1/revalidate` and verify `x-reb-timestamp` + `x-reb-signature` headers.
- Keep local defaults (via `content-defaults.ts`) so the site renders when Scaffold Web is unavailable.

## Content Sections

| Section | Type | Description |
|---------|------|-------------|
| `hero` | `HeroContent` | Hero banner with headline, CTA, background image |
| `services` | `ServicesContent` | Service listings with pricing and booking |
| `story` | `StoryContent` | About/story section with stats and quote |
| `testimonials` | `TestimonialsContent` | Client testimonials |
| `events` | `EventsContent` | Upcoming events calendar |
| `providers` | `ProvidersContent` | Recommended providers network |
| `contact` | `ContactContent` | Contact info, hours, location |
| `settings` | `SiteSettings` | Site-wide settings (name, tagline, SEO) |
| `faq` | `FaqContent` | FAQ accordion |
| `shop` | `ShopContent` | Shop/picks with external links |
| `products` | `ProductsContent` | Product listings with Stripe links |
| `theme` | `ThemeContent` | Color palette and font configuration |
| `rewardsConfig` | `RewardsConfigContent` | Loyalty/rewards program settings |
| `navigation` | `NavigationContent` | Menu items and CTA button |
| `footer` | `FooterContent` | Footer columns, social links, copyright |

## Ship Checklist

- [ ] `pnpm build` passes
- [ ] Primary CTA works
- [ ] Scaffold Web content fallback works without `SCAFFOLD_API_URL`
- [ ] `?preview=true` fetches draft content/page config without caching
- [ ] Signed revalidation rejects invalid signatures
- [ ] Signed revalidation accepts a valid request for this `TENANT_ID`
- [ ] DNS configured: production domain, www subdomain, admin subdomain
- [ ] Vercel env vars set: `TENANT_ID`, `SCAFFOLD_API_URL`, `REVALIDATION_SECRET`

## Full Documentation

See `PROVISIONING.md` in the Scaffold Web repo root for the complete provisioning guide.

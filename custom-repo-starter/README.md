# Scaffold Custom Repo Starter

Use this folder as the contract scaffold for every paid-client custom site repo.
Scaffold Web remains the control plane; the custom repo is the public website runtime.

## Files

| File | Purpose |
|------|---------|
| `scaffold-client.ts` | Typed fetch client for Scaffold Web's `/api/v1/*` contract |
| `ScaffoldTracker.tsx` | Client-side analytics beacon → `/api/v1/track/{tenant}` (powers the weekly report) |
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
TENANT_ID=client-slug                              # Required (server-side content fetch)
SCAFFOLD_API_URL=https://scaffoldweb.com            # Required (or legacy REB_API_URL)
REVALIDATION_SECRET=shared-secret-from-scaffold     # Required

# Tracking beacon (browser) — required only if you mount <ScaffoldTracker />:
NEXT_PUBLIC_TENANT_ID=client-slug                   # Same slug as TENANT_ID
NEXT_PUBLIC_SCAFFOLD_API_URL=https://scaffoldweb.com # Same URL as SCAFFOLD_API_URL
```

`scaffold-client.ts` also accepts the legacy `REB_API_URL` env var. New repos
should set `SCAFFOLD_API_URL`; existing repos can migrate without breakage by
setting both during cutover.

The two `NEXT_PUBLIC_*` vars exist because the tracking beacon runs in the
browser, where Next.js only inlines `NEXT_PUBLIC_*` env vars. They mirror the
server-side `TENANT_ID` / `SCAFFOLD_API_URL`. If they are unset, the tracker
fails silent (no events) and the site still renders normally.

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

### Analytics tracking (powers the weekly report)

The owner's weekly report ("47 people found you this week", booking clicks,
top services) is driven by events this site sends to the control plane's public
`POST /api/v1/track/{tenant}` contract. Without this, a real client site reports
near-zero, because the legacy in-platform tracker only runs on the control
plane's own preview — not on the deployed client repo.

Copy `ScaffoldTracker.tsx` into the repo and mount it once in the root layout:

```bash
cp ScaffoldTracker.tsx my-client-site/components/ScaffoldTracker.tsx
```

```tsx
// app/layout.tsx
import { ScaffoldTracker } from "@/components/ScaffoldTracker";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ScaffoldTracker />
      </body>
    </html>
  );
}
```

Record booking-CTA clicks from the button itself (pass the service id when the
click maps to a specific service so the report's "top services" breakdown
fills in):

```tsx
import { trackBookingClick } from "@/components/ScaffoldTracker";

<a href={bookingUrl} onClick={() => trackBookingClick(service.id)}>Book</a>
// generic CTA with no service:
<a href={bookingUrl} onClick={() => trackBookingClick()}>Book now</a>
```

The tracker fails silent, is non-blocking (`sendBeacon` / `keepalive` fetch),
skips in development, and respects `prefers-reduced-data`. It never throws, so a
network error or missing env var can never break the client site.

See `docs/tracking-rollout.md` in the Scaffold Web repo for the exact steps to
roll this into the live GLDF and Rohlax repos plus how to verify the report
picks it up.

## Required Contract

- Use `fetchScaffoldContent`, `fetchScaffoldPageConfig`, and `fetchScaffoldSiteCapabilities` to read tenant data.
- Mount `<ScaffoldTracker />` and wire `trackBookingClick` so the weekly report has real numbers.
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
- [ ] `<ScaffoldTracker />` mounted in the root layout; a production page load posts a `page-view` to `/api/v1/track/{tenant}`
- [ ] Booking CTA calls `trackBookingClick(serviceId)`
- [ ] DNS configured: production domain, www subdomain, admin subdomain
- [ ] Vercel env vars set: `TENANT_ID`, `SCAFFOLD_API_URL`, `REVALIDATION_SECRET`, `NEXT_PUBLIC_TENANT_ID`, `NEXT_PUBLIC_SCAFFOLD_API_URL`

## Full Documentation

See `PROVISIONING.md` in the Scaffold Web repo root for the complete provisioning guide.

# Scaffold Custom Repo Starter

Use this folder as the contract scaffold for every paid-client custom site repo.
Scaffold Web remains the control plane; the custom repo is the public website runtime.

## Files

| File | Purpose |
|------|---------|
| `scaffold-client.ts` | Typed fetch client for Scaffold Web's `/api/v1/*` contract |
| `ScaffoldTracker.tsx` | Client-side analytics beacon → `/api/v1/track/{tenant}` (powers the weekly report) |
| `ScaffoldGA4.tsx` | Fail-silent GA4 tag → sends pageviews to the client's GA4 property (auto-wires from one env var) |
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
SCAFFOLD_API_URL=https://app.strelva.com
REVALIDATION_SECRET=<from-provision-tenant-output>
EOF
```

## Required Environment

```bash
TENANT_ID=client-slug                              # Required (server-side content fetch)
SCAFFOLD_API_URL=https://app.strelva.com            # Required (or legacy REB_API_URL)
REVALIDATION_SECRET=shared-secret-from-scaffold     # Required

# Tracking beacon (browser) — required only if you mount <ScaffoldTracker />:
NEXT_PUBLIC_TENANT_ID=client-slug                   # Same slug as TENANT_ID
NEXT_PUBLIC_SCAFFOLD_API_URL=https://app.strelva.com # Same URL as SCAFFOLD_API_URL

# GA4 (browser) — the ONLY var needed to turn on Google Analytics. Set it and
# <ScaffoldGA4 /> auto-sends pageviews; leave it unset and the tag is a no-op:
NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-XXXXXXXXXX          # GA4 Measurement ID
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

### Google Analytics (GA4)

The internal beacon above powers the weekly report; GA4 is the client's own
industry-standard analytics. Because Strelva hosts the site, turning GA4 on is
**one env var** — no per-build hand-wiring.

Copy `ScaffoldGA4.tsx` into the repo and mount it once, next to the tracker:

```bash
cp ScaffoldGA4.tsx my-client-site/components/ScaffoldGA4.tsx
```

```tsx
// app/layout.tsx
import { ScaffoldTracker } from "@/components/ScaffoldTracker";
import { ScaffoldGA4 } from "@/components/ScaffoldGA4";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ScaffoldTracker />
        <ScaffoldGA4 />
      </body>
    </html>
  );
}
```

Set `NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-XXXXXXXXXX` and GA4 pageviews start
flowing on the next deploy. Leave it unset and `<ScaffoldGA4 />` is a complete
no-op (renders nothing, loads nothing). It renders `null` on both server and
client (no hydration mismatch) and injects only the external
`googletagmanager.com` loader — no inline script. Under a strict CSP, allow
`https://www.googletagmanager.com` in `script-src` (required by any GA4 install).

**Reporting service account (control-plane reads):** the Strelva dashboard's
Search + Analytics panel reads the client's GSC/GA4 data using a shared
reporting service account. To grant it, add
`strelva-reporting@strelva.iam.gserviceaccount.com` as a user on the client's
Search Console property (Settings → Users and permissions) and on the GA4
property. Provisioning prints this as a one-time manual step — it is intentionally
manual so nothing can mis-verify a property.

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

## Commerce (optional — for storefront clients)

Drop-in module under `commerce/` for a client that sells online. Proven on RHM +
GLDF, promoted here per the build-at-2-repos rule. Reads the canonical Model B
product catalog from Strelva; checkout is **rock solid by construction** — prices
come from the catalog server-side (never the browser), sold-out items are
rejected, and a completed order fires the Strelva `order` beacon so the owner's
dashboard Store shows revenue/orders in real time.

| File | Drop into | What it does |
|------|-----------|--------------|
| `commerce/catalog.ts` | `src/lib/catalog.ts` | Fetches the canonical product catalog (`/api/v1/collections/{tenant}/product`) |
| `commerce/cart-context.tsx` | `src/contexts/cart-context.tsx` | localStorage cart, cross-tab synced; UI prices only |
| `commerce/shipping.ts` | `src/lib/shipping.ts` | One source of truth for flat-rate shipping |
| `commerce/rate-limit.ts` | `src/lib/rate-limit.ts` | Per-IP limiter for the checkout route |
| `commerce/checkout-route.ts` | `src/app/api/checkout/route.ts` | Validates stock + re-prices server-side, returns a Stripe embedded client secret |
| `commerce/stripe-webhook-route.ts` | `src/app/api/webhooks/stripe/route.ts` | Verifies the signature, fires the Strelva order beacon |

Setup: set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, point a Stripe webhook
at `/api/webhooks/stripe` for `checkout.session.completed`, and render Stripe's
embedded checkout with the returned `clientSecret`. The webhook itemizes the
order beacon (best-sellers populate) and sends an order-confirmation email when
`RESEND_API_KEY` + `ORDER_EMAIL_FROM` (a verified Resend sender) are set — both
best-effort, neither can fail the webhook. Address-based shipping rates
(Shippo/USPS) replace `shipping.ts` when a client needs them.

## Full Documentation

See `PROVISIONING.md` in the Scaffold Web repo root for the complete provisioning guide.

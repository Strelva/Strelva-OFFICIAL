# Strelva Custom Repo Starter

Use this folder as the contract scaffold for every paid-client custom site repo.
Strelva remains the control plane; the custom repo is the public website runtime.

> **Onboarding an existing client site?** Point that repo's coding agent at
> [`AGENT-PLAYBOOK.md`](./AGENT-PLAYBOOK.md) — the step-by-step to wire a client
> repo to Strelva and get it to audit grade A. The operator-side journey
> (provision → domain → billing) is in [`../docs/client-onboarding.md`](../docs/client-onboarding.md).

## Files

| File | Purpose |
|------|---------|
| `scaffold-client.ts` | Typed fetch client for Scaffold Web's `/api/v1/*` contract |
| `ScaffoldTracker.tsx` | Client-side analytics beacon → `/api/v1/track/{tenant}` (page views, booking clicks, **phone-call taps**, orders — powers the weekly report) |
| `ScaffoldLeadForm.tsx` | Self-contained contact/quote form → `/api/v1/leads/{tenant}` (captures real people into the dashboard's "Who reached out") — the **platform-integrated** form path (Strelva tenants) |
| `StrelvaInquiryForm.tsx` + `inquiry-client.ts` | Fixed inquiry renderer and versioned transport for the inquiry-first release. Reads only the published form; submissions retain its capability ID and version. |
| `StrelvaBookingForm.tsx` + `booking-client.ts` | Fixed native booking renderer and versioned transport. Reads published slots and uses the control plane's governed calendar path for reservation, change, and cancellation receipts. |
| `StrelvaInquiryBookingForm.tsx` | Optional composition that mounts the explicit inquiry and native booking connections together. |
| `form-route.template.tsx` | Drop-in `app/api/contact/route.ts` — the **standalone Formspree replacement**: emails the owner every submission via Resend on the shared `mail.strelva.com` domain, clearly labeled (site + form + all fields). No platform tenant needed. Config: `RESEND_API_KEY` / `SCAFFOLD_FORM_FROM` / `SCAFFOLD_FORM_TO` / `SCAFFOLD_SITE_NAME` |
| `scaffold-forms.ts` | Pure helpers behind `form-route.template.tsx` (`normalizeSubmission`, `renderFormEmailHtml/Text`, in-memory rate limit) — turn any form payload into a clean owner-notification email |
| `ScaffoldLocalBusinessSchema.tsx` | Server-rendered LocalBusiness JSON-LD `<script>` (the schema our audit engine grades sites on) |
| `ScaffoldGA4.tsx` | Fail-silent GA4 tag → sends pageviews to the client's GA4 property (auto-wires from one env var) |
| `ScaffoldReviews.tsx` | Server-rendered review-showcase grid (stars + source badge) — puts the 4.9★ social proof ON the live site |
| `ScaffoldFAQ.tsx` | Server-rendered FAQ block **+ FAQPage JSON-LD** — the audit's #1 recurring gap (AI-answer content). Renders visible `<details>` Q&A and emits the FAQPage schema AI assistants/Google quote. Returns null with no real pairs. |
| `scaffold-headers.ts` | `scaffoldSecurityHeaders()` — the security headers the audit grades, for `next.config.ts`'s `headers()`. Five always-safe by default; CSP is opt-in (site-specific). |
| `llms-route.template.tsx` | Drop-in for `app/llms.txt/route.ts` — serves an `llms.txt` (built via `buildLlmsTxt`) so AI assistants can read the site. Recurring gap across builds; keep it `force-static` and never-throw. |
| `ScaffoldMap.tsx` | Server-rendered, keyless, lazy Google Maps embed (address / place query / lat-lng) |
| `ScaffoldBooking.tsx` | Server-rendered, lazy booking iframe (Calendly inline or any iframe-embeddable scheduler) |
| `scaffold-seo.ts` | Pure `buildMetadata` / `buildSitemap` / `buildRobots` / `buildLlmsTxt` mappers → Next.js `<head>` + sitemap + robots + llms.txt |
| `revalidate-route.ts` | Next.js App Router POST handler with HMAC signature verification |
| `content-defaults.ts` | Fallback content for all 15 section types + full type definitions |
| `PageRenderer.tsx` | Config-driven section renderer — turns a page's `PageSectionConfig[]` into rendered sections so page layout is DATA, not code |
| `dynamic-page-route.template.tsx` | Template for `app/[...slug]/page.tsx` — renders ANY page from the platform's page config (new pages become a data op, no per-page code) |
| `vitest.config.ts` + `__tests__/` | Scoped Vitest suite for the pure helpers (`npx vitest run --config custom-repo-starter/vitest.config.ts`) |
| `README.md` | This file |

## Versioned inquiry capability

Copy `StrelvaInquiryForm.tsx` and `inquiry-client.ts` together into the client
repository. Install the component in the agreed page location:

```tsx
<StrelvaConnectedInquiryForm
  baseUrl="https://app.strelva.com"
  tenant="your-tenant"
  capabilityId="the-approved-capability-id"
/>
```

The component reads `GET /api/v1/inquiries/{tenant}?capabilityId=...` and posts
the displayed version to `POST /api/v1/leads/{tenant}`. A stale version returns
409; an unavailable store must not produce a success message. Form loading and
submission errors remain visible. Public configuration contains no routing
recipient, private records, provider credentials, or responsibility policy.

This path requires the inquiry migration, release gate, approved capability,
and a deployed client component. Adding these starter files alone does not
install the form on an existing client site. Existing lead forms keep their
current contract. Verify both representative consumers with
`pnpm check:custom-repos` before an authorized rollout.

## Native booking capability

Copy `StrelvaBookingForm.tsx` and `booking-client.ts` together into a client
repository when the control plane has published a native booking capability for
that tenant:

```tsx
<StrelvaConnectedBookingForm
  baseUrl="https://app.strelva.com"
  tenant="your-tenant"
  capabilityId="the-approved-booking-capability-id"
  range={{ from: "2026-10-01T00:00:00.000Z", to: "2026-10-08T00:00:00.000Z" }}
/>
```

The public contract returns only the displayed schedule, provider name,
timezone, and an opaque reservation management token. Workspace, work, and
provider event identifiers never cross into the client site. A successful
reservation is returned only after the native calendar path has made its
provider readback decision; a pending result is labeled as pending and offers
Check booking status without repeating the reservation. A confirmed receipt
can request a time change or cancellation. Request identifiers persist across
form remounts so retrying an interrupted submission reuses its original claim.

For a page that offers both paths, copy `StrelvaInquiryBookingForm.tsx` with
the two renderer pairs and pass the published inquiry capability, booking
capability, and bounded booking range. The booking path records its visitor
inquiry before it asks the connected native calendar to confirm the selected
time.

This component does not turn `ScaffoldBooking.tsx` into a native calendar
integration. `ScaffoldBooking.tsx` remains the legacy external iframe for sites
that still use an independently hosted scheduler. A native form requires a
published capability, a bound native schedule, a connected calendar, and the
release gate. Adding these starter files alone does not create that binding or
send a provider write.

## Generated website capability runtime

The website generator can include the same inquiry and booking protocol in a
static export when the control plane supplies a server-validated published
projection. The projection contains only the public API origin, tenant slug,
capability ids, published versions, and a bounded booking range. It never comes
from the website brief and never contains workspace, provider, grant, or event
identifiers. In that case the export includes
`website-generation/capability-runtime.mjs`; it mounts the forms from the
`data-strelva-capability` sections and supports inquiry submission plus booking
reserve, change, and cancellation. Without the projection, the export stays a
static site and contains no capability runtime script.

## Forms (contact / quote / booking) — the Formspree replacement

Two ways to handle form submissions; pick per site:

1. **Platform-integrated legacy lead** — `ScaffoldLeadForm.tsx` → `/api/v1/leads/{tenant}`.
   For a full Strelva **tenant**: leads land in the dashboard "Who reached out" and the
   owner gets the platform's lead email. This path has no published inquiry capability
   version, so it does not enter the governed reply/follow-up workspace. Use the
   versioned `StrelvaInquiryForm.tsx` path below when the owner needs that record and
   responsibility history.
2. **Standalone email** — `form-route.template.tsx` + `scaffold-forms.ts`. The drop-in
   **Formspree replacement** for ANY site (Studio sites, or any repo not wired as a
   tenant): the form POSTs, the owner is emailed the submission directly via Resend.
   No dashboard, no tenant.

### Wiring the standalone handler
1. Copy `form-route.template.tsx` → `src/app/api/contact/route.ts` and
   `scaffold-forms.ts` → `src/lib/scaffold-forms.ts`.
2. Point the site's form at `POST /api/contact` with JSON. Recommended body:
   ```json
   { "formName": "Contact", "email": "visitor@x.com", "website": "", "name": "…", "phone": "…", "message": "…" }
   ```
   - `website` = hidden honeypot (real people leave it empty).
   - `email` becomes the **Reply-To** so the owner replies straight to the visitor.
   - Every other field is rendered in the email, labeled and in submit order — one route
     serves a contact form, a quote form, a booking inquiry, whatever the site posts.
3. Set env on the site's Vercel project:
   ```
   RESEND_API_KEY=re_…                          # send-scoped key from the STRELVA Resend account
   SCAFFOLD_FORM_FROM=McLear's Cottage <forms@mail.strelva.com>
   SCAFFOLD_FORM_TO=owner@theirbiz.com          # comma-separated for multiple recipients
   SCAFFOLD_SITE_NAME=McLear's Cottage
   ```
   If the mail settings are missing, the handler returns a setup error instead of claiming the owner received the message.

**Sending model:** every client site sends from the ONE shared `mail.strelva.com` domain,
branded per-site by the `SCAFFOLD_FORM_FROM` display name + Reply-To. **No per-client sending
domain, ever** — adding a client is a from-name + a recipient, zero new DNS.

## Dynamic pages (layout as data)

The platform serves page config as `SitePageConfig` (a map of page slug → `{ sections, seo }`),
so a site's pages and their section layout are **data, not code** — the AI/operator can add a
page, reorder sections, or toggle one without a repo change. To turn that on in a client repo:

1. Copy `dynamic-page-route.template.tsx` to `src/app/[...slug]/page.tsx`.
2. Provide the two client-specific imports it needs:
   - a `sitePageConfigFallback` (your typed fallback `SitePageConfig` for offline/build render), and
   - a `sectionRegistry: SectionRegistry` mapping each section `type` to its component
     (`{ hero: HeroSection, services: ServicesSection, ... }`) — this is where your repo's real
     section designs live. `PageRenderer` renders visible sections in `order`, and skips a section
     type the registry doesn't have a component for yet.

New pages then require zero code — they're a config entry. The one thing that still needs code is a
**new section _type_** (a novel component your repo doesn't ship); until then the registry is the
ceiling. Keep components as dumb renderers of `config.props` + fetched content so the platform can
keep doing more without touching the repo.

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

**Phone-call taps are tracked automatically.** Mounting `<ScaffoldTracker />`
installs one global click listener that fires a `phone-click` event whenever a
visitor taps any `<a href="tel:...">` link — the #1 local conversion, and
invisible before this. No per-link wiring: any tel: anchor anywhere on the site
is counted. For a "call us" control that isn't a tel: anchor (e.g. a button that
dials via JS), call `trackPhoneClick()` from its `onClick`:

```tsx
import { trackPhoneClick } from "@/components/ScaffoldTracker";

<button onClick={() => { trackPhoneClick(); window.location.href = "tel:+17165550100"; }}>
  Call us
</button>
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

### Lead capture (Who reached out)

Analytics only ever shows anonymous clicks. `ScaffoldLeadForm` captures real
submissions — name, email, phone, message — and POSTs them to the control
plane's public `POST /api/v1/leads/{tenant}` contract, so the dashboard shows
actual people under "Who reached out" with zero hand-wiring.

Copy it in and render it wherever a contact/quote form belongs:

```bash
cp ScaffoldLeadForm.tsx my-client-site/components/ScaffoldLeadForm.tsx
```

```tsx
import { ScaffoldLeadForm } from "@/components/ScaffoldLeadForm";

<ScaffoldLeadForm
  source="contact-form"          // where it came from (shows in the dashboard)
  showPhone                       // default true
  showMessage                     // default true
  requireEmail={false}
  submitLabel="Send message"
  successMessage="Thanks — we'll be in touch shortly."
  className="my-form"             // style with your own classes
/>
```

**Env:** uses the same two browser vars as the tracker —
`NEXT_PUBLIC_TENANT_ID` and `NEXT_PUBLIC_SCAFFOLD_API_URL`. If either is unset,
submit fails soft with a friendly retry message (the site never crashes).

**Props:** `source`, `showPhone`, `showMessage`, `requireEmail`, `submitLabel`,
`successMessage`, `errorMessage`, per-field `labels`, and class hooks
(`className`, `fieldClassName`, `labelClassName`, `buttonClassName`).

Behavior:

- **Fail-soft.** A network error or non-2xx response shows an inline message and
  lets the visitor retry — it never throws or blanks the page.
- **Success state.** On a 2xx the form is replaced with the thank-you message.
- **Honeypot.** A hidden `company` field gives basic, dependency-free spam
  resistance: if a bot fills it, we fake success and POST nothing. No captcha.
- **Phone field note.** The v1 leads contract validates `name` / `email` /
  `message` / `source` and has no top-level `phone`. An entered phone is folded
  into the message as a `Phone: ...` line so it still lands in "Who reached out"
  without changing the shared contract. Turn it off with `showPhone={false}`.

### LocalBusiness structured data (JSON-LD)

`ScaffoldLocalBusinessSchema` renders a single
`<script type="application/ld+json">` LocalBusiness schema. Local-business sites
that emit it get richer Google results (name, phone, hours, map pin) — and
Strelva's own audit engine grades a site DOWN for missing it, so every
local-business build should include it.

It is **server-rendered** (no `"use client"`), so there is no hydration
mismatch and no client JS is shipped. Drop it into a server component — the root
layout or a page:

```bash
cp ScaffoldLocalBusinessSchema.tsx my-client-site/components/ScaffoldLocalBusinessSchema.tsx
```

```tsx
import { ScaffoldLocalBusinessSchema } from "@/components/ScaffoldLocalBusinessSchema";

<ScaffoldLocalBusinessSchema
  name="Green Leaf Dental"
  type="Dentist"                 // optional; defaults to "LocalBusiness"
  url="https://greenleafdental.com"
  phone="+1-716-555-0100"
  priceRange="$$"
  address={{ streetAddress: "12 Main St", addressLocality: "Buffalo",
             addressRegion: "NY", postalCode: "14201", addressCountry: "US" }}
  geo={{ latitude: 42.8864, longitude: -78.8784 }}
  hours={["Mo-Fr 09:00-17:00", "Sa 10:00-14:00"]}
  sameAs={["https://facebook.com/greenleaf", "https://instagram.com/greenleaf"]}
/>
```

**Props:** `name` (required), `type`, `url`, `phone`, `email`, `description`,
`image` (one URL or an array), `priceRange`, `address`, `geo`, `hours` (an array
of schema.org `openingHours` strings), `sameAs`.

**Honesty rule:** any prop you don't pass is omitted from the output — it never
emits an empty string, a placeholder, or a fabricated value. No CSP change is
needed (it is a static JSON-LD block, not an executable script).

### Reviews showcase (social proof on the live site)

The dashboard shows the client their reviews; `ScaffoldReviews` puts them on the
public site — the "4.9★ · 40 reviews" proof a stranger sees before they book.

It is **prop-driven**: there is no public reviews endpoint in the v1 contract
today (the control plane's `/api/reviews` is authenticated/admin-side), so you
pass the reviews in. The `ScaffoldReview` shape mirrors the control plane's
`ReviewItem` (`author` / `rating` / `text` / `date` / `source`), so a future
public feed drops straight in.

It is **server-rendered** (no `"use client"`) — no hydration mismatch, no client
JS, no CSP change.

```bash
cp ScaffoldReviews.tsx my-client-site/components/ScaffoldReviews.tsx
```

```tsx
import { ScaffoldReviews } from "@/components/ScaffoldReviews";

<ScaffoldReviews
  title="What our clients say"
  reviews={[
    { author: "Dana R.", rating: 5, text: "Best haircut in Buffalo.",
      date: "2024-05-01", source: "google" },
  ]}
/>
```

**Props:** `reviews` (required), `title`, `showSummary` (default true — the
aggregate `4.9 ★ · N reviews` line), `maxItems`, `emptyMessage`, and class hooks
(`className`, `titleClassName`, `summaryClassName`, `gridClassName`,
`cardClassName`, `starsClassName`, `textClassName`, `authorClassName`,
`sourceClassName`).

**Fail-silent / honesty:** a non-array or empty `reviews` never throws; with no
reviews AND no `emptyMessage` it renders **nothing** (a fresh site never
advertises that it has no reviews yet). Ratings are clamped to 0–5. Dates render
as a deterministic `Month Year` (no locale/timezone hydration drift). The pure
helpers `summarizeReviews`, `starParts`, and `clampRating` are exported for reuse
and are unit-tested.

### Map embed (find us)

`ScaffoldMap` renders a lazy, responsive Google Maps embed with **no API key**
(the keyless `maps.google.com/maps?...&output=embed` iframe). Server-rendered,
self-contained.

```bash
cp ScaffoldMap.tsx my-client-site/components/ScaffoldMap.tsx
```

```tsx
import { ScaffoldMap } from "@/components/ScaffoldMap";

<ScaffoldMap address="12 Main St, Buffalo, NY 14201" />
<ScaffoldMap lat={42.8864} lng={-78.8784} zoom={15} height={360} />
```

**Props:** `address`, `query`, `lat` + `lng` (coordinates win over address, which
wins over query), `zoom` (default 14), `title`, `aspectRatio` (default 16/9),
`height` (fixed px instead of an aspect ratio), `className`.

**Fail-silent:** with no address, query, or coordinate pair it renders
**nothing** — never a broken map. The pure `buildMapEmbedUrl` helper is exported
and unit-tested.

**CSP:** allow `https://maps.google.com` (and `https://www.google.com`) in
`frame-src`. No `script-src` change needed.

### Booking embed (book online)

`ScaffoldBooking` wraps a scheduler in a lazy, responsive iframe — Calendly or
any iframe-embeddable booking URL (Acuity, Cal.com, SavvyCal, …). This is the
Growth-tier "transact" surface. Server-rendered, self-contained.

It embeds via **iframe, not the provider's widget script** — so there is no extra
`script-src` to allow and nothing to load-and-init on the client. For Calendly it
adds `embed_type=Inline` (and hides the GDPR banner) for you.

```bash
cp ScaffoldBooking.tsx my-client-site/components/ScaffoldBooking.tsx
```

```tsx
import { ScaffoldBooking } from "@/components/ScaffoldBooking";

<ScaffoldBooking url="https://calendly.com/green-leaf/cleaning" />
<ScaffoldBooking provider="iframe"
  url="https://app.acuityscheduling.com/schedule.php?owner=123" />
```

**Props:** `url` (required to render), `provider` (`"calendly"` | `"iframe"`;
inferred from the url host when omitted), `title`, `height` (default 700),
`hideGdprBanner` (Calendly, default true), `hideEventTypeDetails` (Calendly),
`className`.

**Fail-silent:** with no `url` — or a non-`http(s)` url — it renders **nothing**.
The pure `buildBookingEmbedUrl` / `resolveBookingProvider` helpers are exported
and unit-tested.

**CSP:** allow the provider host in `frame-src` (e.g. `https://calendly.com`). No
`script-src` change needed.

### SEO helpers (head, sitemap, robots)

`scaffold-seo.ts` is pure, IO-free mappers from a Scaffold-shaped SEO config to
Next.js metadata primitives — so every repo builds its `<head>`, `sitemap.ts`,
and `robots.ts` the same way. The `ScaffoldSeoConfig` is a superset of the
control plane's `PageConfig.seo` (`{ title, description, ogImage }`) plus
`canonical` / `url` / `siteName` / `noindex`, so a fetched page config feeds
straight in.

```bash
cp scaffold-seo.ts my-client-site/lib/scaffold-seo.ts
```

```tsx
// app/page.tsx (or generateMetadata)
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/scaffold-seo";

export const metadata: Metadata = buildMetadata({
  title: "Green Leaf Dental",
  description: "Family dentistry in Buffalo.",
  ogImage: "https://greenleafdental.com/og.jpg",
  canonical: "https://greenleafdental.com/",
  siteName: "Green Leaf Dental",
});
```

```ts
// app/sitemap.ts
import type { MetadataRoute } from "next";
import { buildSitemap } from "@/lib/scaffold-seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(
    [{ url: "/", priority: 1 }, { url: "/services", changeFrequency: "weekly" }],
    { baseUrl: "https://greenleafdental.com" },
  );
}
```

```ts
// app/robots.ts
import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/scaffold-seo";

export default function robots(): MetadataRoute.Robots {
  return buildRobots({ disallow: ["/admin"], sitemap: "https://greenleafdental.com/sitemap.xml" });
}
```

**Honesty rule:** every mapper OMITS any field you don't provide — no empty
strings, no fabricated defaults. `buildMetadata` emits `openGraph` only when an
OG-relevant field is set and `robots: { index:false }` only when `noindex` is
passed. `buildSitemap` absolutizes path urls against `baseUrl`, clamps
`priority` to 0–1, drops empty urls, and de-dupes. `buildRobots` defaults the
user-agent to `*` and supports a `disallowAll` staging switch. All three are
unit-tested.

## Required Contract

- Use `fetchScaffoldContent`, `fetchScaffoldPageConfig`, and `fetchScaffoldSiteCapabilities` to read tenant data.
- Mount `<ScaffoldTracker />` and wire `trackBookingClick` so the weekly report has real numbers.
- Expose `POST /api/v1/revalidate` and verify `x-reb-timestamp` + `x-reb-signature` headers.
- Keep local defaults (via `content-defaults.ts`) so the site renders when Scaffold Web is unavailable.
- **Publish your capability manifest.** Drop `site-capabilities-route.ts` in at
  `app/api/capabilities/route.ts` (it builds the manifest from `content-defaults`
  via `buildSiteCapabilityManifest`), then have the operator point the tenant's
  `customRepo.capabilityManifestUrl` at its public URL (super-admin →
  `POST /api/admin/tenants/{id}/capability-manifest`). The control plane fetches +
  merges it, so the AI edits the sections THIS site actually renders — declare
  only the sections you mount, and list commerce/rewards in `customOnlyFeatures`.

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

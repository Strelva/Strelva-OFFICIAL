# Client Onboarding Checklist

The one master checklist for taking a new client from **signed lead → live managed client**. Each step names its **owner**, how to **verify** it, and links the deep runbook where one exists. Work top to bottom; a phase isn't done until its Verify passes.

**Owner: you (Noah) run all of it.** The only steps that need the **client** are the ones on their own accounts — the Google Search Console / GA4 grants and the DNS records — because you can't grant yourself access to their Google or their registrar. `Auto` = the provision script does the step for you.

**Tiers (packaging, not code flags):** Presence $99/mo (one-page) · Growth $199/mo (multi-page + booking/basic ecom, the anchor) · Scale $499/mo (+ content engine, multi-location). Building is free; the subscription starts at go-live ("pay when you're happy").

---

## Phase 0 — Sale & handoff (You)

- [ ] Tier agreed and written down (Presence / Growth / Scale).
- [ ] Client came through `/access-request` (the only lead path — do not resurrect self-serve).
- [ ] Collected the build inputs: business name, what they do, current site URL (the "before"), domain they'll use, logo/brand assets, services/products, hours, phone, address, socials, Google Business listing, any booking/commerce provider.
- [ ] **Baseline audit of their CURRENT site** — `pnpm audit:full <their-current-site>`. Save the grade; it's the "before" for the case study and the proof for the pitch.

**Verify:** you can describe the client in one line and know their tier, domain, and current-site grade.

---

## Phase 1 — Provision the tenant (Auto, run by you)

- [ ] `pnpm provision-tenant` — creates the tenant record, seeds default content, invites the owner, creates the Vercel project, sets env, attaches the subdomain, and writes the analytics config (GSC property derived from the site URL). Idempotent + forward-recovery: on a mid-flow failure, fix the cause and re-run (do NOT hand-rollback).
- [ ] Note the returned `clientEnv` — the `TENANT_ID` / API secret the client repo's Vercel project needs.

**Verify:** the returned `steps[]` are all `ok`/`skipped` (none `failed`); `{subdomain}.strelva.com` resolves the seeded tenant.

---

## Phase 2 — Build the custom repo (You)

Every client is a separate hand-built repo (never a template). Reusable pieces go into `custom-repo-starter/` first, never patched into one client's repo.

- [ ] Site built: real content, brand, all sections. Custom, not generic.
- [ ] Drop in `custom-repo-starter/ScaffoldTracker.tsx` (page-view / booking-click / phone-click beacons → `POST /api/v1/track/[tenant]`).
- [ ] Drop in `custom-repo-starter/ScaffoldGA4.tsx` (gtag pageview tag; no-op until its env var is set).
- [ ] Publish the capability manifest so the AI edits what the live site renders: `custom-repo-starter/site-capabilities-route.ts` at `app/api/capabilities/route.ts`, then set the tenant's `customRepo.capabilityManifestUrl` (`POST /api/admin/tenants/[id]/capability-manifest`, super-admin).
- [ ] **Build-QA audit — `pnpm audit:full <the-vercel-build-url>`. Target grade A before launch.** The recurring gaps to close on every build (see the portfolio audit): an **FAQ section**, a working **`llms.txt`**, `sameAs` social profiles in the Org schema, a Team/About link, trust/credentials, security headers, labeled form fields. Fix these in `custom-repo-starter` once so future builds inherit them.

**Verify:** the build's audit grade is A and the site renders real content server-side (not a JS shell).

---

## Phase 3 — Activation (You for beacons, Client for grants)

The two tracks that light up the dashboard. Full detail: [activation-runbook.md](./activation-runbook.md).

**Track 1 — Tracking beacons** (lights up Today visitors, phone-clicks, "who reached out", the weekly report numbers):
- [ ] Set on the repo's Vercel project: `NEXT_PUBLIC_SCAFFOLD_API_URL` (strelva.com), `NEXT_PUBLIC_TENANT_ID` (the subdomain, e.g. `gldf`), `NEXT_PUBLIC_GA4_MEASUREMENT_ID` (the client's GA4 id).
- [ ] Redeploy the client site.

**Track 2 — Google reporting access** (lights up Analytics GSC + GA4 panels + the 90-day milestone). ⚠️ This is the **long pole** — it's a client-side grant we can't script:
- [ ] **GSC:** client adds the `strelva-reporting@strelva.iam.gserviceaccount.com` service account to their Search Console property (Settings → Users and permissions).
- [ ] **GA4:** client adds the same service account to their GA4 property (Admin → Property Access Management).

**GBP (Google Business):** gated on Google API approval — Google Business writes + live reviews stay dark until then. Not a launch blocker; wire it when approval lands.

**Verify:** open the tenant dashboard — Today shows real visitor/customer-action numbers, and Analytics shows live GSC + GA4 data (not "connect" / "0 / unavailable").

---

## Phase 4 — Domain & DNS (Client sets records, you attach)

Domain in the **client's name** from day one (ownership is the positioning spine). Full detail: [domain-setup.md](./domain-setup.md).

- [ ] Attach the production domain + `admin.<domain>` to the client's Vercel project.
- [ ] Client adds the DNS records (Vercel A `76.76.21.21` for apex, or the CNAME Vercel shows; same for `www` and `admin`).
- [ ] Wait for propagation.

**Verify:** `curl -sI https://<domain>` and `https://admin.<domain>` both return `200` from Vercel (`server: Vercel`) — not `ENOTFOUND`. `vercel domains inspect <domain>` confirms the attachment.

---

## Phase 5 — Set the launch fields on the tenant (You)

The fields `pnpm check:prod` gates go-live on:
- [ ] `productionDomain` (or a `customDomains` entry).
- [ ] `adminDomain`, or a derivable `admin.<productionDomain>`.
- [ ] `revalidateUrl` + `revalidationSecret` (signed HMAC revalidation to the client site).

**Verify:** `pnpm check:prod` passes for this tenant (no client-domain / admin-domain / revalidation failures).

---

## Phase 6 — Cutover (You)

Only if replacing an existing site (like RHM's old Apache site → the Strelva build). Full detail: [url-cutover-runbook.md](./url-cutover-runbook.md) + [post-cutover-runbook.md](./post-cutover-runbook.md).

- [ ] Point the live domain at the Strelva build; confirm old URLs redirect / resolve.
- [ ] Run the post-cutover verification (analytics still flowing, no broken routes).

**Verify:** the client's real domain serves the Strelva build (`server: Vercel`), and tracking/analytics keep moving after the switch.

---

## Phase 7 — Billing on (You)

- [ ] Start the Stripe subscription at go-live (the tier price). Building was free; the monthly starts now ("pay when you're happy").
- [ ] Grandfathered clients (gldf, rohlax) stay on `STRIPE_BILLING_GRANDFATHER_TENANTS` — no subscription.

**Verify:** the client is active in Stripe at the agreed tier (or on the grandfather list), and `check:prod`'s grandfather-or-402 rule passes.

---

## Phase 8 — Hand the client the keys (You)

- [ ] Client signs in to `admin.<domain>` and completes the first-run checklist — the "Tell us how customers find you" step sets `settings.businessModel` (drives which presence surfaces show).
- [ ] Send the welcome / site-live email (`lifecycle-email` route). ⚠️ Client lifecycle email is **paused** (`EMAIL_SENDING_ENABLED`) until deliberately switched on — until then the email no-ops and you walk them through it directly.
- [ ] Move the tenant's CRM stage to **live** (`/admin/clients/[id]`).

**Verify:** the client can log in, sees their real numbers on Today, and knows they can chat with Strelva to make changes.

---

## Per-client tracker

Copy a row per new client. (The activation-only version lives in [activation-runbook.md](./activation-runbook.md); this one is the full journey.)

| Client | 0 Sale | 1 Provision | 2 Build (audit B+) | 3 Beacons | 3 Google grants | 4 Domain/DNS | 5 Launch fields | 6 Cutover | 7 Billing | 8 Live |
|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| _(new client)_ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

**"Fully onboarded" =** their real domain serves the Strelva build, `check:prod` is green, the dashboard shows live numbers, and billing is active (or grandfathered).

# Client Onboarding Checklist

The one master checklist for taking a new client from **signed lead → live managed client**. Each step names its **owner**, how to **verify** it, and links the deep runbook where one exists. Work top to bottom; a phase isn't done until its Verify passes.

**Owner: the Strelva operator runs all of it.** The only steps that need the
**client** are the ones on their own accounts, such as Google Search Console / GA4
grants and DNS records, because Strelva cannot grant itself access. `Auto` means
the provision script performs the step.

**Tiers (packaging, not code flags):** Custom builds are scoped, quoted, and paid separately before work starts. Ongoing management begins at go-live: Presence $99/mo (one-page) · Growth $199/mo (multi-page + booking/basic ecom, the anchor) · Scale $499/mo (+ content engine, multi-location).

---

## Variant — onboarding an EXISTING live site (e.g. RHM, Jul 18)

The phases below assume a **greenfield** build. When the site is already built + live (repo + Vercel project already exist), the flow diverges — don't run the greenfield steps blindly:

- **Phase 1 provision still runs** — it only registers the tenant (record, subdomain, revalidation secret, analytics config). It does NOT touch the existing repo or domain; with `VERCEL_TOKEN` unset it just prints the env commands instead of creating a project (you already have one). **No email is sent.** Set `delivery_model=custom_repo`; if the vertical has no template, pass any real `--template` (unused for custom_repo).
- **Skip Phase 2's "create client repo" + `seed-tenant`** — the site already exists and serves its own content; seeding fallback content is greenfield-only.
- **Beacon wiring — check for an existing GA4 loader FIRST.** Drop in `ScaffoldTracker` (the control-plane beacon the site lacks). But many built sites already load GA4 via their own component/env — if so, **do NOT also add `ScaffoldGA4`** (double-tag). Strelva reads GA4 via the reporting service-account grant regardless of the client tag.
- **Env + go-live:** set `NEXT_PUBLIC_SCAFFOLD_API_URL` + `NEXT_PUBLIC_TENANT_ID` + the revalidation secret on the existing Vercel project, then redeploy. If the custom-domain cutover is separate/pending, the redeploy is invisible to live visitors until DNS flips.
- **Owner email:** if you're not ready to loop the owner in, provision with your own email as a placeholder (provision fires no mail regardless) and swap to the real owner via the tenant editor later — that doesn't email them either.
- **Billing:** grandfather the tenant (add its id to `STRIPE_BILLING_GRANDFATHER_TENANTS` + redeploy) OR start a subscription, before the dashboard's subscription gate is hit.

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

**Verify:** the build's audit grade is A and the site renders real content server-side (not a JS shell). If it's capped below A by genuinely-absent real data (no phone — some businesses just don't have one, no testimonials yet, no socials), that's a "go get the real data" item, NOT a "fabricate to pass" one — never invent a phone/social/testimonial to hit the grade.

---

## Phase 2b — Workspace conformance (You)

Every custom repo must satisfy the shared **baseline** so `pnpm check:custom-repos` stays green as clients are added. The inventory is manifest-driven — see [custom-repo-delivery-model.md](./custom-repo-delivery-model.md) "Adding a client repo".

- [ ] Baseline package scripts present: `dev`, `build`, `typecheck`, `test`, `check`.
- [ ] Baseline files present: `README.md`, `.env.example`, `src/lib/reb-contracts.ts`, `src/lib/storage.ts`, `src/app/api/reb-capabilities/route.ts`, `src/app/api/v1/revalidate/route.ts`, `release-manifest.json`.
- [ ] The repo's own `release-manifest.json` sets `"contractVersion": "v1"` and lists env `REB_API_URL`.
- [ ] Register the repo in the platform inventory — one entry in `release-manifest.json` → `customRepoWorkspace.repos`: `{ "tenant": "<slug>", "localPath": "../<repo-dir>", "compatibleCommit": "<git sha>" }`. Adding a repo is a manifest entry, never a checker edit.

**Verify:** with the repo checked out next to `strelva-platform` (or `CUSTOM_REPO_WORKSPACE_ROOT` set), `pnpm check:custom-repos` is green for this tenant (no `FAIL`).

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

- [ ] Confirm the build invoice is paid according to the accepted quote, then start the selected Stripe management subscription at go-live.
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

---

## Current verification note

- **Env example gaps (DONE 2026-07-30):** `SUPABASE_URL`, `SECRETS_ENC_KEY`, `SUPER_ADMIN_EMAILS`, and `APPROVE_LINK_SECRET` are all documented in `.env.example` and validated in `scripts/production-checklist.ts`. No outstanding env gaps.
- **Orphaned Vercel secrets (DONE 2026-07-30):** All 11 orphaned vars removed from prod + preview + dev: `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `CLERK_DOMAIN`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_DOMAIN`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `SANITY_API_TOKEN`, `SANITY_WEBHOOK_SECRET`, `REVALIDATION_SECRET`, `CORS_ORIGINS`. Kept: `NEXT_PUBLIC_SANITY_DATASET` + `NEXT_PUBLIC_SANITY_PROJECT_ID` (legacy image-URL resolution).
- **Upload tenant isolation (DONE 2026-07-30):** `upload_image` now calls `uploadTenantMedia()` with a tenant-prefixed Blob path. Fixed in `src/app/api/agent/route.ts`.
- **Prompt injection (DONE 2026-07-30):** `businessRules` is now wrapped in `sanitizePromptValue` in `src/lib/agent-prompt-shared.ts` (same path as `personality`).

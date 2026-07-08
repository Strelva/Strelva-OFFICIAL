# Activation Runbook — light up Analytics + Today (per client)

**Owner:** Noah + Jacob (this is ops in the client repos + Google consoles — not a code task).
**Why:** the Analytics surface and the Today activity feed are well-built but read **zero** until two manual per-client steps happen. This is the highest-ROI work from the repo audit: it flips those surfaces from "Dark" to "Lit" and makes the product demonstrably work — without new code. Do this before any Analytics/Today *correctness* code fixes (those only pay off once data flows).

There are **two independent tracks** per client. Both are needed for a fully-lit dashboard, but they light up different things, so you can do them in either order.

---

## Track 1 — Tracking beacons (lights up: Today visitors, phone-clicks, "who reached out"; the weekly report's numbers)

Done in the client's **own custom repo** (Rohlax, GLDF, RHM, etc.). Reference: `docs/tracking-rollout.md`.

Per client repo:
1. Add `ScaffoldTracker.tsx` from `custom-repo-starter/` (page-view / booking-click / phone-click beacons → `POST /api/v1/track/[tenant]`).
2. Add `ScaffoldGA4.tsx` from `custom-repo-starter/` (the gtag pageview tag; no-op until its env var is set).
3. Set the env vars on the repo's Vercel project:
   - `NEXT_PUBLIC_SCAFFOLD_API_URL` — the control-plane API base (strelva.com).
   - `NEXT_PUBLIC_TENANT_ID` — the tenant subdomain (e.g. `gldf`).
   - `NEXT_PUBLIC_GA4_MEASUREMENT_ID` — the client's GA4 measurement id.
4. Redeploy the client site.
5. **Verify:** visit the live site, then check the tenant's dashboard Today + Analytics — visitor/beacon numbers should start moving within a few minutes.

## Track 2 — Google reporting access (lights up: Analytics GSC + GA4 panels, the 90-day milestone)

Done in the **client's Google consoles**. The control plane reads via a shared service account; it must be granted access per client.

Per client:
1. **Google Search Console** → the client's property → Settings → Users and permissions → add
   `strelva-reporting@strelva.iam.gserviceaccount.com` as a user (Full or Restricted read is fine).
2. **Google Analytics (GA4)** → the client's property → Admin → Property Access Management → add the same
   `strelva-reporting@strelva.iam.gserviceaccount.com` with **Viewer**.
3. **Verify:** the tenant's Analytics surface flips from "unavailable / 0" to live GSC + GA4 data (the reads are OAuth-first, service-account-fallback, so this grant is what unblocks non-OAuth tenants).

> Note: provisioning already writes the siteUrl-derived GSC property into `analytics:cfg` at tenant creation, so no config step is needed — just the access grant. If a client verified their site as a URL-prefix property (not a domain property), the derived `sc-domain:` property won't match; set the correct property via `POST /api/admin/tenants/[id]/analytics-config`.

---

## Per-client checklist

| Client | Tracker + GA4 tag | Env vars set | Redeployed | GSC access | GA4 access | Analytics live |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|
| gldf   | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| rohlax | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| rhm    | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| _(new clients)_ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

**"Done" =** the client opens their dashboard and Today shows real visitor/customer-action numbers, and Analytics shows live GSC + GA4 data (not "connect" / "0 / unavailable").

---

## Queued for AFTER the data flows (in-repo code, separate follow-up — NOT this runbook)

Once tracking + grants are live and the surfaces read real data, these correctness fixes become worth doing (they polish surfaces that are dark today):
- **GSC property totals** — query the property total, not just the top-20 queries (today's numbers understate real search traffic).
- **Real 90-day baseline** — persist a start-of-relationship scan anchor so the "first 90 days" health delta isn't secretly a ~12-day delta (ring-buffer horizon).
- **Cache the Google reads** — the Analytics page does 2 live Google round-trips per load; cache them.
- **Real GA4 traffic in the dollar-impact** — swap the generic constants for the client's actual traffic on the authenticated health card.
- **GBP posts in the Today activity feed** — its one known gap (once Google Business is live).

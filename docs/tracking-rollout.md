# Tracking rollout — wire real client sites to the weekly report

**Why this exists.** The weekly report's headline numbers ("47 people found you
this week", booking clicks, top services) are built by `src/lib/reports.ts` from
counters written via `trackClick(event, tenant)` in
`src/lib/storage/analytics-store.ts`. Those counters were only ever fed by the
control plane's internal `/api/track` + `PageViewTracker` — the legacy
in-platform preview path. **The real client websites are separate deployed
repos** (GLDF, Rohlax) that never called that path, so their reports showed
≈ zero. This is the pipe that fixes it.

Note: Rohlax's Vercel git auto-deploy has been dead since Jun 18. Deploy Rohlax manually via the Vercel CLI (`vercel --prod --scope strelva` from the rohlax repo) after any change — do not rely on a push-to-deploy triggering automatically.

The control plane now exposes a public beacon:

```
POST /api/v1/track/{tenant}
```

It validates the tenant, rate-limits per IP+tenant, and writes the **same**
storage shapes as `/api/track`, so `reports.ts` needs no changes. The custom
repo posts to it from the browser via `ScaffoldTracker.tsx`.

This doc is the copy-paste rollout for the two live repos. Do it once per repo.

---

## What the endpoint accepts

`POST {SCAFFOLD_API_URL}/api/v1/track/{tenant}` with a JSON body:

| Field | Required | Notes |
|-------|----------|-------|
| `event` | yes | `"page-view"` or `"booking-click"` |
| `serviceId` | no | only with `booking-click`; `^[a-z0-9][a-z0-9_-]{0,79}$`. Records the per-service breakdown for "top services". |

- Cross-origin: the endpoint answers CORS preflight and returns
  `Access-Control-Allow-Origin: *`. It is **write-only** (never returns tenant
  data), so the wildcard is safe.
- No secrets. This is a public, non-sensitive beacon — never put a signing
  secret in the browser.
- Returns `{ "ok": true }` on success; `400` for a bad event/serviceId, `404`
  for an unknown/inactive tenant, `429` when rate-limited.

A `page-view` increments `page-view`. A `booking-click` increments
`booking-click`; if `serviceId` is present it **also** increments
`booking-click:{serviceId}` (which is what `getClickCountsByPrefix` reads for
"top services").

---

## Roll into a live repo (GLDF: tenant `gldf`, Rohlax: tenant `rohlax`)

These repos already pull content from the control plane, so they already have
`SCAFFOLD_API_URL` (or legacy `REB_API_URL`) and `TENANT_ID` set. You only add
the browser-side equivalents and the tracker component.

### 1. Copy the tracker component

From this repo's `custom-repo-starter/`:

```bash
cp custom-repo-starter/ScaffoldTracker.tsx <client-repo>/components/ScaffoldTracker.tsx
```

It imports `getPublicScaffoldBaseUrl`, `getPublicTenantId`, and `scaffoldRoutes`
from `@/lib/scaffold-client`. If the client repo's `scaffold-client.ts` predates
this change, also re-copy it (it is additive — existing exports are unchanged):

```bash
cp custom-repo-starter/scaffold-client.ts <client-repo>/lib/scaffold-client.ts
```

### 2. Add the two browser env vars

The content fetchers run on the server and read `TENANT_ID` / `SCAFFOLD_API_URL`.
The tracker runs in the **browser**, where Next.js only inlines `NEXT_PUBLIC_*`
vars, so add public mirrors with the **same values** the repo already uses:

```bash
# .env.local  (and Vercel → Project → Settings → Environment Variables)
NEXT_PUBLIC_TENANT_ID=gldf                     # rohlax for the Rohlax repo
NEXT_PUBLIC_SCAFFOLD_API_URL=https://<same-host-as-SCAFFOLD_API_URL>
```

Set both in Vercel for **Production** (and Preview if you want preview tracking).
Redeploy after adding env vars — `NEXT_PUBLIC_*` values are baked in at build
time.

### 3. Mount the tracker in the root layout

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

### 4. Wire the booking CTA(s)

On every "Book"/"Book now" button or link, call `trackBookingClick`. Pass the
service id when the click maps to a specific service so the report's "top
services" breakdown fills in:

```tsx
import { trackBookingClick } from "@/components/ScaffoldTracker";

// service-specific:
<a href={bookingUrl} onClick={() => trackBookingClick(service.id)}>Book</a>

// generic CTA (no service):
<a href={bookingUrl} onClick={() => trackBookingClick()}>Book now</a>
```

The `serviceId` must match the service `id` the control plane knows (the same id
used in the `services` content section), or the report can't map it to a name.

### 5. Deploy

Commit and deploy the client repo as usual. The tracker is a no-op in
development and when env vars are missing, so nothing breaks if a step is
skipped — it just records nothing.

---

## Verify it works (do this in production)

The tracker intentionally **does nothing in development** (to avoid inflated
counts), so verify against the deployed site.

### A. Confirm the beacon reaches the endpoint

1. Open the deployed client site in a browser.
2. Open DevTools → Network, filter for `track`.
3. Reload the page. You should see a `POST` to
   `https://<host>/api/v1/track/gldf` returning `204`/`200`.
4. Click a booking CTA. You should see a second `POST` with body
   `{"event":"booking-click",...}`.

If you see no request: check that the two `NEXT_PUBLIC_*` vars are set in
Production and that you redeployed after adding them (they are build-time
inlined). If you see a `404`: the tenant slug is wrong. If `429`: you're being
rate-limited (120/min per IP) — wait a minute.

### B. Confirm the control plane stored it

From the control-plane repo (this repo), the counters land where the report
reads them. Quickest check — the dashboard analytics for that tenant
(`getDailyMetrics` / overview) should show today's page views tick up. Or hit
the authenticated metrics path the dashboard uses for that tenant and confirm
`page-view` increased.

You can also force a real request to the endpoint to prove the path end-to-end:

```bash
curl -i -X POST "https://<control-plane-host>/api/v1/track/gldf" \
  -H "Content-Type: application/json" \
  -d '{"event":"page-view"}'
# expect: HTTP/.. 200  and  {"ok":true}

curl -i -X POST "https://<control-plane-host>/api/v1/track/gldf" \
  -H "Content-Type: application/json" \
  -d '{"event":"booking-click","serviceId":"intro-call"}'
# expect: 200 {"ok":true}  -> increments booking-click AND booking-click:intro-call

# unknown tenant -> 404
curl -i -X POST "https://<control-plane-host>/api/v1/track/does-not-exist" \
  -H "Content-Type: application/json" -d '{"event":"page-view"}'
```

> Note: a `curl` from your machine inflates that tenant's real numbers. Use a
> throwaway/staging tenant for load-bearing testing, or do it once and note it.

### C. Confirm the weekly report picks it up

The weekly report runs on a cron (see `vercel.json` → `weekly-report`) and reads
`getClickCounts("page-view", tenant)`, `getClickCounts("booking-click", tenant)`,
and `getClickCountsByPrefix("booking-click:", tenant)`. Because the v1 endpoint
writes those exact keys, any event recorded above flows into the next report
with no code change.

To preview without waiting for the cron, trigger the report path for that tenant
(the same way the cron does) and confirm the rendered numbers reflect the events
you generated. The "people found you this week" line should be non-zero once
real visits land.

---

## Rollback

The tracker fails silent and the endpoint is additive. To stop tracking for a
repo, remove `<ScaffoldTracker />` from its layout (or unset the
`NEXT_PUBLIC_*` vars) and redeploy. The control-plane endpoint can stay — it
simply receives nothing.

---

## Known issues / TODO

All previously-tracked issues for this subsystem are closed as of 2026-07-30:

- Triple `pgMetricSummary` RPC per report collapsed to a single `getMetricsBatch` call in `reports.ts`. (DONE 2026-07-30)
- Calendly webhook `findTenantByUserUri` is now an O(1) `redis.get` on `calendly-user-uri:<userUri>` (written at connection time, removed at disconnection). (DONE 2026-07-30)
- Calendly `startTime` guarded: `startTime ? new Date(startTime).toLocaleString() : "time TBD"`. (DONE 2026-07-30)
- Calendly `addEvent` wrapped in try/catch — returns 200 on failure so Calendly does not retry. (DONE 2026-07-30)
- `buildOpsReport` N+1 collapsed to `mapPool(active, 8, ...)`. (DONE 2026-07-30)

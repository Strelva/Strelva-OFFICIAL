# Provisioning a New Client

End-to-end guide for spinning up a new Strelva tenant and its custom repo.

The **primary path is the super-admin onboard UI** at `/admin/onboard`, which
runs the same orchestrator (`provisionTenant()`) used everywhere. A local
scriptable path (`pnpm provision-tenant`) still exists for dev work — see the
bottom of this doc.

## Overview

Every paid client gets:
1. A **tenant record** in Postgres (the source of truth since the 2026-06-20
   cutover; Sanity dual-write was removed as part of the Sanity teardown in 2026-07-10).
2. A **custom repo** (separate Next.js project) that serves the public website —
   hand-built by Jacob, connected to a per-client Vercel project.
3. **Signed revalidation** so content edits in the dashboard push to the live site.
4. **Supabase Auth** so the client can log into their admin dashboard (Clerk is
   removed from the auth UI; see AGENTS.md).
5. **Seeded starter content** (9 sections) so the dashboard starts from real,
   editable documents.

> **What provisioning does NOT do:** it does not generate or deploy the website.
> That stays Jacob's hand-built repo, connected to the Vercel project that
> provisioning creates.

## Prerequisites

- Super-admin access to the Strelva dashboard (the onboard route is gated by
  `isSuperAdmin()` — non-super-admins get a 403).
- For the 3 Vercel automation steps to run, **`VERCEL_API_TOKEN`** (or the
  fallback `VERCEL_TOKEN`) **+ `VERCEL_TEAM_ID`** must be set. Without a token,
  the Vercel project/env/domain steps are silently **skipped** (the tenant,
  content seed, and invite still complete; the steps[] result says `skipped:
  VERCEL_API_TOKEN not set`).
- For production Postgres writes, `TENANTS_SOURCE=postgres` (on in prod). With it
  unset locally, the tenant is written to the dev file path instead.

## Primary path: the `/admin/onboard` UI

1. As a super-admin, open **`/admin/onboard`** (`src/app/admin/onboard/page.tsx`).
2. Fill the form:
   - **Subdomain** *(required)* — 2-63 lowercase letters/numbers/hyphens, no
     leading/trailing hyphen (e.g. `acme-hvac`). This becomes the tenant id.
   - **Site name** *(required)* — e.g. `Acme HVAC`.
   - **Owner name** *(required)* — e.g. `Jane Doe`.
   - **Owner email** *(optional)* — enables the owner invite step.
   - **Industry** — select; defaults to `trades`. (See the known gap below: the
     seed step ignores this value today.)
   - **Production domain** *(optional)* — e.g. `acmehvac.com`. Supplying it
     triggers the Vercel domain-attach step and derives `siteUrl` /
     `admin.acmehvac.com`. Omit it and the tenant uses the
     `{subdomain}.strelva.com` fallback.
3. Submit. The UI POSTs to **`/api/admin/provision`** and renders the live
   checklist returned in `steps[]`.

### What `/api/admin/provision` does

(`src/app/api/admin/provision/route.ts`)

1. Rejects non-super-admins (403).
2. Validates `subdomain`/`siteName`/`ownerName`/`industry` and the subdomain
   format; rejects a subdomain already in use (409).
3. Calls `provisionTenant()`.
4. Writes a `tenant.provision` **audit row** (`logAuditEvent`) recording each
   step's key + status.
5. Returns the full `ProvisionResult` JSON: `steps[]`, `manualNext[]`, `siteUrl`,
   `tenantId`, and `clientEnv` (the env vars the hand-built client repo needs,
   including the generated `REVALIDATION_SECRET`).

### The 6 steps `provisionTenant()` runs

(`src/lib/provisioning.ts` — every step is **best-effort** and reported in
`steps[]` as `ok` / `failed` / `skipped`. The whole thing is **idempotent /
resume-safe**: re-running treats an existing tenant/env/domain as success, so you
recover from a partial failure by fixing the cause and re-running — there is no
auto-rollback.)

1. **Create tenant record** — the hard prerequisite (the only step that bails the
   whole run on failure). Generates a 256-bit `revalidationSecret`, derives
   `siteUrl`/`revalidateUrl`, and writes the row to Postgres
   (`TENANTS_SOURCE=postgres`). The Sanity dual-write was removed as part of the
   Sanity teardown (2026-07-10). If the tenant already exists, the run resumes
   the remaining steps.
2. **Seed starter content** — upserts **9 sections** (`hero`, `services`,
   `story`, `testimonials`, `events`, `providers`, `contact`, `settings`,
   `faq`) via `setContent`. Idempotent (overwrites, never duplicates). A
   shortfall (<9) is reported as `failed` with the per-section reason.
3. **Create owner invite** — `createInvite()` writes the invite to **Redis**
   (`reb:invites:*`) **and** the Postgres **`invites`** table (load-bearing for
   Supabase-auth first sign-in). Skipped if no owner email was supplied.
4. **Create Vercel project** — `POST /v9/projects` (named `{tenantId}-site`).
   Skipped if Vercel isn't configured.
5. **Set Vercel env vars** — `POST /v10/projects/{id}/env` with `clientEnv`.
   Skipped if step 4 produced no project.
6. **Attach production domain** — `POST /v10/projects/{id}/domains`. Only runs
   when a project exists **and** a production domain was supplied.

The returned `manualNext[]` lists the human follow-ups (point DNS at Vercel,
connect the hand-built repo to the `{tenantId}-site` project and deploy,
customize the seeded content, send the owner invite).

### Known gaps (read before relying on this)

- **No deprovision / teardown script exists.** Because provisioning is
  forward-recovery (not transactional), an aborted or partial onboard leaves
  orphaned rows across **Postgres + Sanity + Redis** (and possibly a created
  Vercel project). To clean up a failed test tenant you must do it by hand:
  deactivate the tenant (`active:false`), remove the Postgres/Sanity rows and any
  Redis invite, and delete the Vercel project via the dashboard/CLI. The returned
  `steps[]` tells you exactly what was created.
- **Seed content ignores `industry`.** Step 2 always writes the generic
  `defaults` for each section — the `industry` field is stored on the tenant but
  does not currently pick an industry-specific content template.

## Create the client repo

Copy the starter scaffold into a new repo:

```bash
mkdir ~/Projects/acme-hvac-site
cp -r custom-repo-starter/* ~/Projects/acme-hvac-site/
cd ~/Projects/acme-hvac-site
```

The starter includes:
- **`scaffold-client.ts`** — typed fetch client for the Strelva `/api/v1/*` endpoints
- **`revalidate-route.ts`** — Next.js route handler with HMAC signature verification
- **`content-defaults.ts`** — fallback content for all section types
- **`ScaffoldTracker.tsx`** — fail-silent page-view/booking-click beacons
- **`README.md`** — setup and ship checklist

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

### Environment variables for the client repo

Use the `clientEnv` block the onboard result hands you (it already contains the
correct values, including the revalidation secret):

```bash
# .env.local (development)
TENANT_ID=acme-hvac
SCAFFOLD_API_URL=http://localhost:3000
REVALIDATION_SECRET=<from the onboard result>

# Production
TENANT_ID=acme-hvac
SCAFFOLD_API_URL=https://scaffoldweb.com   # control plane; NOT strelva.com (marketing)
REVALIDATION_SECRET=<from the onboard result>
```

> **Control-plane host:** the client repo fetches `/api/v1/*` from
> **`scaffoldweb.com`** (the code default in `src/lib/provisioning.ts`, overridable
> via `CONTROL_PLANE_API_URL`). `strelva.com` is the marketing site and does **not**
> serve the v1 contract.

> **Note:** the revalidation route handler accepts both `REVALIDATION_SECRET` and
> the legacy `REVALIDATE_SECRET` name. Existing deployed repos may use the older
> name.

## Configure auth (Supabase)

Provisioning's owner-invite step seeds the invite in Redis + the Postgres
`invites` table. The owner signs into the admin dashboard via **Supabase Auth**
(Google OAuth / magic-link); their tenant membership is provisioned on first
sign-in. There is no Clerk `publicMetadata` step anymore — the Clerk auth UI was
removed (#83, 2026-06-22).

## Deploy

Connect the hand-built `{tenant}` repo to the `{tenant}-site` Vercel project
(git integration) and deploy. If provisioning created the project and set its env
vars, those are already in place; otherwise add them via `vercel env`.

### DNS configuration

- `acmehvac.com` — A record to `76.76.21.21` (or CNAME to `cname.vercel-dns.com`)
- `www.acmehvac.com` — CNAME to `cname.vercel-dns.com`
- `admin.acmehvac.com` — CNAME to `cname.vercel-dns.com`

## Verify

- [ ] Site renders at production URL with the seeded content
- [ ] Admin dashboard loads at the admin subdomain
- [ ] Owner can sign in via Supabase Auth
- [ ] Content edit in the dashboard appears on the live site within seconds
- [ ] Revalidation webhook returns 200 with a valid signature, 401 with an invalid one
- [ ] Site renders fallback content when `SCAFFOLD_API_URL` is unreachable

## Wire Format Reference

### Revalidation webhook

Strelva POSTs to the client repo's `/api/v1/revalidate` endpoint.

**Headers:**
- `Content-Type: application/json`
- `x-reb-timestamp` — Unix timestamp in milliseconds (string)
- `x-reb-signature` — HMAC-SHA256 hex digest of `{timestamp}.{body}`

**Body (JSON):**
```json
{
  "tenant": "acme-hvac",
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

The header names `x-reb-timestamp` / `x-reb-signature` are part of the v1 wire
format and are intentionally not renamed.

### Content API

- `GET /api/v1/content/{tenant}/{section}` — fetch a content section
- `GET /api/v1/page-config/{tenant}` — fetch page structure
- `GET /api/v1/site-capabilities/{tenant}` — fetch capability manifest

## Architecture

```
[Client Browser]
       |
       v
[Custom Repo (Vercel)]  <--- serves public website
       |                       |
       | fetchScaffoldContent  | POST /api/v1/revalidate
       v                       ^
[Strelva control plane: scaffoldweb.com (Vercel)]
       |
       v
[Supabase Postgres]  (+ Redis cache; Sanity dual-write during transition)
```

## Secondary path: the `pnpm provision-tenant` CLI

`scripts/provision-tenant.ts` is the older scriptable/local path. It is **not**
the production flow — it writes to the local **`dev-tenants.json`** file (not the
prod Postgres/Sanity store) and still prints the legacy `strelva.com` URLs.
Useful for local-dev tenant setup; for real clients use `/admin/onboard`.

```bash
# Dry run first — shows what would be created, writes nothing
pnpm provision-tenant --dry-run \
  --id "acme-hvac" \
  --subdomain "acme-hvac" \
  --siteName "Acme HVAC" \
  --ownerName "Jane" \
  --industry "trades" \
  --ownerEmail "jane@acmehvac.com" \
  --productionDomain "acmehvac.com"

# Run interactively with no args for guided prompts
pnpm provision-tenant
```

Env it reads: `VERCEL_TOKEN` (creates a Vercel project if set), `VERCEL_TEAM_ID`.

To seed content for a CLI-created tenant:

```bash
pnpm seed-tenant acme-hvac
```

### Valid industries

`wellness`, `food-brand`, `restaurant`, `trades`, `professional`, `fashion-stylist`

## Known issues / TODO

- **[HIGH][bug] GBP writes silently fail after tenant rename.** `google-meta:${t}`,
  `review-replies:recent:${t}`, `reb:review-nudge-sent:${t}`,
  `reb:order-review-request-sent:${t}:*`, and `reb:review-reply-declined:${t}:*`
  are missing from `authoritativePatterns` in `src/lib/tenant-rename.ts`. A renamed
  tenant's GBP posts/review state silently stays under the old slug. Add these
  patterns and update the completeness unit test.
- **[HIGH][bug] Fractional star delta causes uncaught Redis error in `adjustStars`**
  (`src/app/api/rewards/members/[email]/adjust/route.ts:35`). Add
  `Number.isInteger(delta)` to the validation guard and a library-level guard in
  `adjustStars` itself before the first `hincrby` call.
- **[HIGH][bug] Missing `SECRETS_ENC_KEY` causes full platform outage via `loadTenants`**
  (`src/lib/tenants.ts:205-208`). Wrap the `rowToTenant` call in a per-row
  try/catch so one bad/unreadable row does not kill all tenant loads. Add
  `SECRETS_ENC_KEY` to `scripts/production-checklist.ts`.
- **[MEDIUM][tech-debt] `database.types.ts` is stale** — `billing_type` and
  `account_id` missing from generated Row types, causing shadow casts in
  `rowToTenant`/`tenantToRow`. Run `supabase gen types typescript --project-id <id>
  > src/lib/db/database.types.ts` and add a CI staleness check.
- **[HIGH][tenant-isolation] `upload_image` agent tool uses unscoped `uploadFile()`**
  (`src/app/api/agent/route.ts:568`). Replace with `uploadTenantMedia(tenant, buffer,
  filename, mimeType)` to namespace uploads under the tenant slug. This also fixes
  the AVIF rejection bug — `uploadTenantMedia` accepts any MIME type that
  `sniffImageType` returns.
- **[MEDIUM][tenant-isolation] Upload route stores files in shared flat Blob namespace**
  (`src/lib/storage/upload-store.ts:45`). Replace `uploadFile(file)` in
  `src/app/api/upload/route.ts` with a tenant-prefixed wrapper, matching the pattern
  in `src/lib/storage/media-store.ts`.
- **[MEDIUM][security] Google OAuth callback stores connection without re-verifying session**
  (`src/app/api/oauth/google/callback/route.ts:93`). Add `verifyAuth()` and
  `requireTenantAccess(tenantId)` at the start of the GET handler, before
  `saveConnection`.

## Troubleshooting

**Vercel steps show `skipped`:** `VERCEL_API_TOKEN` (or `VERCEL_TOKEN`) isn't set
in the Strelva environment. Set it (+ `VERCEL_TEAM_ID`) and re-run provision —
it's idempotent.

**Seed shows fewer than 9/9 sections:** the `steps[]` detail names the failed
sections and the reason. Re-run provision to retry (safe; the seed overwrites).

**Revalidation returns 401:** `REVALIDATION_SECRET` doesn't match between the
tenant config and the client repo, or clocks are >5 minutes apart.

**Content shows fallback instead of real data:** verify `SCAFFOLD_API_URL` points
at `scaffoldweb.com` (not `strelva.com`), `TENANT_ID` matches exactly, and content
was seeded.

**Owner can't sign in:** confirm the owner invite landed (Redis `reb:invites:*` +
Postgres `invites`) and that the owner is using the email the invite was issued to.
```

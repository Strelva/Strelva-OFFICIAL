# Domain Setup Checklist

> **2026-06-22:** tenant records (incl. `productionDomain`/`adminDomain`) now
> live in **Postgres** (`tenants` table) as the source of truth since the
> 2026-06-20 cutover — not Sanity. The DNS/Vercel/Cloudflare steps below are
> unaffected.
>
> **Scope note (2026-07-14):** client-domain ownership and DNS steps are current.
> Any later example that treats `strelva.com` as this repo's `/api` origin is a
> historical cutover artifact; use `app.strelva.com` for the control plane.

## Step 0 — The domain belongs to the client, from day one

This is a contract promise (see `docs/strategy/website-offer-two-door.md`): "the domain is in YOUR name from day one, and you leave with everything." Do not register a client's domain inside Strelva's registrar or Cloudflare account.

1. **Buy the domain in the client's own account.** The client creates (or already has) their own registrar / Cloudflare account and purchases the domain there. If they're not comfortable doing it solo, do a ~10-minute screen-share and walk them through it — but it stays under *their* login and *their* payment method.
2. **Strelva gets a member role, not ownership.** The client invites Strelva to their Cloudflare account with a **DNS-edit member role only** (Cloudflare: Members → Invite → role "DNS"). That's enough to add the Vercel records below and manage routing; it is not account ownership and is trivially revoked at handoff.
3. **Record who owns what.** Note in the tenant record / handoff notes that the registrar + DNS account is client-owned and Strelva is a delegated member. This is what makes the repo-transfer runbook's "DNS is already theirs" step true.

> **Existing clients — confirm and migrate.** Some early domains were set up before this rule. **Rohlax (`rohlaxwellness.com`) DNS lives in Cloudflare** — confirm whether that Cloudflare account is the client's or Strelva's. If it's in a Strelva-owned account, migrate the zone to a client-owned Cloudflare account (or transfer the registrar to the client) and re-add Strelva as a DNS-edit member. Until that's done, the ownership promise isn't actually backed by access reality.

## Adding a new tenant's custom domain

1. Confirm the domain was purchased in the **client's** account per Step 0, and that Strelva has the DNS-edit member role.
2. Add to the Vercel project (`strelva-admin` on the `strelva` team):
   ```
   vercel domains add yourbusiness.com strelva-admin --scope strelva
   vercel domains add www.yourbusiness.com strelva-admin --scope strelva
   vercel domains add admin.yourbusiness.com strelva-admin --scope strelva
   ```
3. Configure DNS per Vercel instructions:
   ```
   A     yourbusiness.com        76.76.21.21
   CNAME www.yourbusiness.com    cname.vercel-dns.com
   CNAME admin.yourbusiness.com  cname.vercel-dns.com
   ```
4. Update env on the `strelva-admin` project:
   ```
   CUSTOM_DOMAIN_MAP={"yourbusiness.com":"tenantid"}
   ```
   `www.` and `admin.` are resolved from the bare-domain entry by the proxy.
5. Update the tenant's `productionDomain` to `yourbusiness.com` (in the Postgres `tenants` table — the source of truth since the 2026-06-20 cutover; edit via the admin tenant-edit UI / `PATCH /api/admin/tenants`, not Sanity); set `adminDomain` only if it is not `admin.yourbusiness.com`.
6. Verify a Resend domain for `updates.yourbusiness.com` if using newsletter.
7. Pull production env and verify:
   ```
   vercel env pull .env.production.local --environment=production
   pnpm check:prod
   ```

## Strelva platform origins and wildcard subdomains

The production topology has separate ownership:

- `strelva.com` and `www.strelva.com` → `strelva-marketing` project (separate repo `~/strelva-marketing`).
- `app.strelva.com`, `admin.strelva.com`, and `*.strelva.com` tenant fallbacks →
  the `strelva-admin` control-plane project (`strelva` Vercel team, deploy with `--scope strelva`).

Configure the app/admin/wildcard records using the exact values Vercel shows for
the control-plane project. `MARKETING_DOMAINS` on that project lists only legacy
marketing hosts that still reach it:

```
MARKETING_DOMAINS=scaffoldweb.com,www.scaffoldweb.com
```

The built-in `strelva.com` classification is a routing fail-safe if apex traffic
ever reaches this deployment; it does not make this repository the production
marketing owner.

Verify:

```
vercel domains inspect app.strelva.com
vercel domains inspect admin.strelva.com
dig +short app.strelva.com CNAME
dig +short admin.strelva.com CNAME
dig +short '*.strelva.com' CNAME
curl -I -L https://app.strelva.com/api/health
pnpm check:prod
```

## Configurable hosted-sites apex (#322, activation pending #243)

`src/platform/infra/brand.ts` owns two independent build-time values:
`NEXT_PUBLIC_APP_ROOT_DOMAIN` and `NEXT_PUBLIC_SITES_ROOT_DOMAIN`. Each defaults
to `strelva.com` when omitted or blank. Use bare DNS domains, with no scheme,
port, path or wildcard. Invalid values fail rather than producing unsafe URLs.

The sites value controls hosted publication URLs, canonical fallbacks, static
export API origins, provisioning fallbacks and health read-back. Explicit client
custom domains retain precedence. Existing app-apex tenant hosts continue to
route during cutover; issued receipts and documents retain their original URLs
and hashes. Health reads the current sites URL, and visitor-tool bindings accept
trusted receipts from the current sites root or legacy app root after a rename.

App/admin URLs and fallback dashboard hosts use the app root. All Supabase
session writers use host-only cookies (no `Domain`), including callback and
refresh responses. A separate sites root admits only one-label public tenant
hosts; reserved `www`, `app`, `api`, `admin` and deeper names never become tenants
or operator hosts. Bare, reserved and deeper sites hosts return 404 before
client fallback, query impersonation, development bypass or internal API routing.
On a public tenant sites host, dashboard/sign-in/sign-up/no-access paths redirect
to `https://app.<app-root>/client/<slug>/...`; global app routes go to the app
host at their original path. `/auth/callback` stays the global app callback,
with a tenant dashboard `next` rebased to `/client/<slug>/dashboard...`. Query
parameters survive, and no session is written on the sites origin. Website
pages and `/api/v1/*` remain on the public tenant origin. Both roots are reserved
from client custom-domain claims.
Sending domains remain `updates.strelva.com` / `mail.strelva.com`.

**Nothing is activated by this preparation.** Jacob must choose a separate
registrable apex in [#243](https://github.com/Strelva/Strelva-OFFICIAL/issues/243),
authorize purchase and wildcard DNS/certificate setup, and authorize a new
build/deployment with the selected sites value. A sibling subdomain of
`strelva.com` does not provide the intended site/cookie separation. The company
packet is `strelva/docs/outside-approvals/neutral-hosted-sites-domain.md`.
No domain, provider or DNS writes are encoded in `vercel.json`; its automatic
Git deployments remain disabled. Retain the old wildcard for the authorized
migration/rollback window and qualify the new hosted response, visitor forms,
canonicals, app session scope and custom-domain regressions before removing it.

### Cutover and retirement of old hosted addresses

This is the ordered plan for #243, not evidence of activation:

1. Inventory each old `<slug>.strelva.com` host, including slug renames, client
   custom domains and explicit redirects such as GLDF. Record its new public
   URL and rollback destination. Preserve issued receipts and document hashes.
2. After the separately authorized domain/DNS/build cutover, verify the new
   tenant hosts: rendered site, forms and `/api/v1/*`, canonical/sitemap URLs,
   read-back, callback and dashboard redirects, and host-only app cookies.
   Verify the bare/reserved sites hosts return 404. Owner access must use the
   app fallback; never add the sites apex/wildcard to the auth redirect allowlist.
3. During the agreed rollback window, retain old wildcard DNS/certificates and
   old tenant routing. Code still serves these legacy hosts; configuration of
   the new sites root alone does **not** retire or redirect the old ones.
4. Once accepted, prepare and separately authorize the exact retirement change:
   public GET/HEAD requests on each old host return **301** to the approved new
   public URL, preserving path/query and explicit client-domain redirects.
   Dashboard/sign-in and auth routes move to the app host, using the same
   tenant fallback/global callback split above. Keep visitor API POSTs serving
   during the compatibility window; do not send them through a 301 that can
   discard the method/body. Coordinate remaining embed/export API origins
   before retiring those API endpoints.
5. Verify old-to-new redirects have one hop, valid certificates and no loops;
   confirm owner sign-in is on the app origin and old forms still deliver.
   Retain the old wildcard as a redirect endpoint for the agreed link/SEO
   lifetime. Remove serving code/DNS only after that lifetime and a separately
   approved check of old traffic and issued integrations. Do not delete the
   old records at the initial cutover.

`pnpm check:site-domains` loads `.env` and `.env.local` (existing shell env wins)
and validates both roots with the same function as the runtime. `pnpm check`,
`check:launch` and `check:release` run it first, so a malformed domain fails
before other checks/builds. When evaluating production env files, supply the
exact prepared values; a valid local default does not qualify a production build.

Local proof commands: `pnpm exec vitest run src/__tests__/sites-domain-config.test.ts
src/__tests__/sites-domain-check.test.ts src/__tests__/auth-cookie-scope.test.ts src/__tests__/middleware-supabase-session.test.ts`,
`pnpm check`, `pnpm check:boundaries`, and `pnpm check:custom-repos`.
Local fixtures use `sites.example`; this is test data, not a selected domain.

## Rohlax Wellness Cloudflare DNS

`rohlaxwellness.com` uses Cloudflare nameservers (`dax.ns.cloudflare.com`, `vivienne.ns.cloudflare.com`). Keep the Vercel domain entries in place and add the records Vercel recommends inside Cloudflare:

```
A www.rohlaxwellness.com 76.76.21.21
A admin.rohlaxwellness.com 76.76.21.21
```

Current Vercel evidence:

- `rohlaxwellness.com` is attached to project `rohlax-wellness`.
- `admin.rohlaxwellness.com` is attached to the `strelva-admin` control-plane project.
- `www.rohlaxwellness.com` is found under the account but still reports as not configured; confirm it is attached to the intended Vercel project if Vercel continues warning after the Cloudflare A record propagates.
- On May 13, 2026, `www` and `admin` expose the CNAME `931bd7b36e7b2348.vercel-dns-017.com.`, but `dns.resolve4(...)` and `curl` still return `ENOTFOUND`. Treat that as partial DNS, not launch-ready routing.

Verify:

```
vercel domains inspect rohlaxwellness.com
vercel domains inspect www.rohlaxwellness.com
vercel domains inspect admin.rohlaxwellness.com
dig +short www.rohlaxwellness.com CNAME
dig +short admin.rohlaxwellness.com CNAME
dig +short www.rohlaxwellness.com A
dig +short admin.rohlaxwellness.com A
curl -I -L https://rohlaxwellness.com
curl -I -L https://admin.rohlaxwellness.com
pnpm check:prod
```

## Verification

- [ ] `yourbusiness.com` shows the tenant's public site
- [ ] `admin.yourbusiness.com` redirects root traffic to `/dashboard`
- [ ] `admin.yourbusiness.com/sign-in` and `/sign-up` render the tenant auth flow
- [ ] `strelva.com` shows the separate marketing deployment
- [ ] `app.strelva.com/api/health` returns control-plane health JSON
- [ ] `app.strelva.com/access-request` reaches the control-plane acquisition flow
- [ ] `tenantid.strelva.com` is treated only as a fallback/platform route, not the customer-facing URL

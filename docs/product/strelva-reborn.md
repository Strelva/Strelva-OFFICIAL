# Strelva Reborn

Created: 2026-10-02
Version: `1.0.0`, tagged `strelva-v1.0.0` at release cut.
Status: preparing. Nothing in this release is deployed.

**Strelva Reborn is the release where every Strelva client runs inside a business
workspace.** The managed website becomes one capability in that workspace,
next to bookings, inquiries, publishing and internal apps. All five read the
same business record. Strelva operates it for them.

The Sept 30 release (internal name `strelvav2`, version `0.2.0`) put the
workspace machinery in production: memberships, grants, saved work, approvals,
exits, exports, allowances. It moved no client. Strelva Reborn is the release
that moves them. The [strelvav2 page](./strelvav2.md) is now history.

## Where we start

Measured 2026-10-02 from code and the
[Sept 30 release record](../operations/strelvav2-horizontal-acceptance.md#september-30-workspace-production-release).

- **No business record.** `src/platform/business-record/` is empty. A business
  is a `workspaces` row with a name. Facts live in `tenants` rows and inside
  each website document.
- **No client in a workspace.** Production: 0 workspaces, 0 tenant
  memberships, 1 sign-in in 30 days. No conversion script exists.
- **Data lives tenant-side.** Leads are Redis `leads:{tenant}`. Bookings and
  content each have two stores (tenant and workspace) that don't talk.
- **Capabilities are partial.** Website: v1 workspace drafts never go live;
  the rebuild work on `nav-three-places` does, behind
  `STRELVA_WEBSITE_REBUILD_RELEASE`, uncommitted. Bookings: real calendar
  writes, no weekly hours, services or confirmation email. Inquiries: flag
  off, tenant-keyed. Publishing: nothing in the workspace. Internal apps:
  real but isolated.
- **The agent is tenant-only.** "Ask Strelva" in the workspace routes to a
  screen; no model runs behind it.
- **The layers are tangled.** 98 workspace files import `src/lib`; `lib`
  imports back into `products` from `agent-shared.ts` and `event-actions.ts`.

Run `pnpm reborn:progress` for the code-side numbers at any time.

## What ships

A release is done when every line below is true and proven where it says.

### 1. One business record

- [ ] A `business_records` table (or set) per workspace holding facts
      (name, address, hours, services, phone, links), contacts and people.
- [ ] Website facts, booking hours and services, and inquiry contacts read and
      write it. No capability keeps its own copy of a business fact.
- [ ] Every edit has history and an undo, like website documents today.

Proof: unit and SQL tests in `check:workspace-sql`; `reborn:progress` shows
`business_record` done.

### 2. Data owned by the workspace

- [ ] Inquiries are Postgres-authoritative and reference `workspaces(id)`.
      `/api/v1/leads/[tenant]` keeps its contract and writes the new store.
- [ ] One booking store. `/api/booking/*` and `/api/v1/bookings/*` both land
      in it. Weekly hours, slot length, buffer, lead time, advance window,
      date overrides and services come over from `src/lib/booking.ts`.
- [ ] One approval store. Content, Google and workspace approvals use the
      governed-work proposal, decision and outcome tables. Redis event
      lifecycle retires.
- [ ] Redis is a cache again for leads, bookings and approvals.

Proof: failure-path tests, `pnpm check:custom-repos`, and a byte-identical
storefront comparison like Sept 30 (60/60).

### 3. Every client converted

- [ ] `scripts/convert-tenant-to-workspace.ts`: creates the workspace, links
      the tenant through a link table (the `tenants` row is not altered), and
      backfills facts, contacts, leads and bookings into the record.
      Idempotent, with a dry-run mode and a rollback.
- [ ] Dry run against a restored local copy for every active tenant.
- [ ] Production run for gldf, then the rest.
- [ ] Hosted websites created by the workspace stay linked to their workspace
      (today `reserve_website_hosted_tenant()` mints an unlinked tenant).

Proof: per-client conversion receipt; storefront responses unchanged.

### 4. Five capabilities, production-complete in the workspace

- [ ] **Website.** Live tenant sites show their name and domain, live link,
      verified status, change requests and previews awaiting review in the
      workspace. The rebuild work merges. Edits, history and publishing for
      existing sites are reachable from the workspace.
- [ ] **Bookings.** Parity with the tenant widget (above), plus confirmation
      and cancellation email through `src/lib/email/send.ts`, and a day roster.
- [ ] **Inquiries.** `STRELVA_INQUIRIES_RELEASE` on. Spam review, owner
      notification and the 9 clients' existing leads appear in the workspace.
- [ ] **Publishing.** Reviews and replies, Google Business, and blog and
      collections run from the workspace on a workspace connection. Social and
      newsletter are reachable from it.
- [ ] **Internal apps.** Records can point at contacts in the business record.
      A submission notifies the assigned person. App building is agency or
      Strelva only, per the Oct 2 agency-in-the-loop rule (today any member can
      open `/custom-applications/new`).
- [ ] **Ask Strelva runs in the workspace,** using the one tool set in
      `src/lib/agent-shared.ts`, with approvals through item 2.

Proof: authenticated local journeys per capability on desktop and mobile, in
empty, loading, error and permission states, using The Mooney Firm and gldf.

### 5. One place to operate

- [ ] One operator queue in `/admin` across tenants and workspaces: approvals,
      change requests, failed checks, domain state.
- [ ] Every outside write leaves a receipt with read-back and undo.
- [ ] Site health and domain checks cover every site, tenant or hosted.
- [ ] The agency home loads every delegated client, not the first 8.

### 6. Owners enter the workspace

- [ ] Signing in on a client admin host (for example
      `admin.greatlakesdriedfruit.com`) lands in that client's workspace.
- [ ] Each `/dashboard` page either has a workspace home or redirects to one.
      Pages with no customer value retire.
- [ ] Owner memberships exist for every converted client.

### 7. Structure that keeps it this way

- [ ] Shared infrastructure (`db`, `redis`, `auth`, `email`, `crypto`,
      `rate-limit`, `logger`, `ai-models`, `safe-fetch`) moves to
      `src/platform/infra`. `check:boundaries` blocks new workspace → `src/lib`
      imports and any `src/lib` → workspace import.
- [ ] One capability registry replaces the seven declaration files listed in
      [capabilities](../capabilities/README.md#where-capabilities-are-declared).
- [ ] One model-call helper. Every `generateText`, `streamText` and
      `generateObject` call goes through it (12 files in `src` today).
- [ ] `src/lib/newsletter.ts` sends through `email/send.ts`;
      `src/lib/public-continuation.ts` encrypts through `crypto/secrets.ts`.

Proof: `pnpm reborn:progress --strict` passes.

## Order

Each step unblocks the next. Steps 1, 2 and 7 are local work and start now.

1. **Foundation:** business record, infra move, boundary rule. Merge
   `nav-three-places` first so the website rebuild isn't stranded.
2. **Data:** inquiries, bookings and approvals onto the workspace stores, with
   dual-write behind the existing v1 contracts.
3. **Conversion:** script, local dry runs, then gldf in production.
4. **Capabilities:** website card, bookings parity, inquiries on, publishing,
   apps, agent.
5. **Operate:** one queue, receipts, monitoring.
6. **Entry:** owners in, dashboard retired page by page.

## Preview and Stable

Strelva has two channels. Customers use **Strelva**, the Stable channel,
which is what `main` and production run. Jacob and selected testers use
**Strelva Preview**, built from Reborn work before it ships. Nightly is when
Preview gets built, not a separate channel.

All Reborn work lands on the `reborn` branch through pull requests. `main`
stays Stable until the `1.0.0` cut merges `reborn` into it.

- **Nightly build.** [`preview-nightly.yml`](../../.github/workflows/preview-nightly.yml)
  builds `reborn` at 03:00 Eastern: lint, types, boundaries, ontology,
  workspace SQL and full upgrade, tests with coverage, audit, build, public
  smoke and workspace browser acceptance. A green build is tagged
  `strelva-v1.0.0-preview.YYYYMMDD`. Unchanged source isn't re-tagged.
- **Progress.** The run summary shows the progress table: now, last Preview,
  Oct 2 baseline and target. The tag message stores that build's numbers so
  the next one can compare. Run it by hand from the Actions tab with any
  branch.
- **Not yet: a Preview you can sign in to.** Today Preview is a tested,
  tagged build, not a running app. Running it needs its own deployment
  (for example `preview.strelva.com`) on a staging Supabase project, because
  Vercel preview builds would read production data. That is a new
  environment and env change, so it needs Jacob's yes.

## Needs Jacob's yes

Each of these gets an exact action prepared and verified before asking.

- Each production migration (business record, tenant-to-workspace links,
  inquiry and booking stores).
- Each production conversion run, starting with gldf.
- Owner invites. They send client email.
- Turning on `STRELVA_INQUIRIES_RELEASE` and `STRELVA_WEBSITE_REBUILD_RELEASE`.
- Changing where client admin hosts land.
- The release cut itself: `1.0.0` set in this repo and `strelva-marketing`
  together, per `VERSIONING.md`, and tagged `strelva-v1.0.0`.

Every production step also passes the
[release checklist](../operations/horizontal-release-checklist-2026-09-11.md#september-21-production-preparation).

## Not in Strelva Reborn

New pricing or plan tiers. Partner agencies (Strelva is the only agency in
this release). Home Finder. Enterprise customers. Self-serve website building
for owners. `/api/v2`. No `/api/v1` change except additive.

## Still unproven

- Production counts are from the Sept 30 record, not a fresh read. Run
  `scripts/workspace-target-snapshot.sql` read-only before the first
  migration.
- Whether governed-work tables are live: the capabilities page says no, the
  Sept 30 record says all 84 migrations applied. The snapshot settles it.
- Whether owners will use the workspace at all. Today 1 person signed in
  in 30 days. Strelva Reborn must keep working for clients who never log in.

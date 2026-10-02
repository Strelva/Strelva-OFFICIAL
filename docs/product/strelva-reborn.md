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

## Where we are

Audited 2026-10-02 against code, line by line. Production facts come from the
[Sept 30 release record](../operations/strelvav2-horizontal-acceptance.md#september-30-workspace-production-release),
not a fresh read.

**7 of 48 lines are done (4 proven locally only), 11 are partial and 30
are not started.** Summing the sizes below (S half a day, M two, L five, XL ten)
gives about 108 agent-days if done one at a time. Sections 0, 1 and 3 are the
critical path at about 31 of them; the rest can run in parallel streams.
These are estimates, not measurements. Nothing below is proven in
production.

- **No business record.** `src/platform/business-record/` is empty. A business
  is a `workspaces` row with a name. Facts live in `tenants` rows, a Redis
  booking blob and inside each website document.
- **No client in a workspace.** Production: 0 workspaces, 0 tenant
  memberships, 1 sign-in in 30 days. No conversion script exists.
- **Leads are being lost today.** Leads live only in Redis: `lead:{tenant}:{id}`
  expires after 90 days and `leads:{tenant}` keeps 500. Older leads are gone.
- **Data lives tenant-side.** Leads, booking config, orders, rewards, OAuth
  connections and analytics config are Redis. Bookings and content each have
  two stores that don't talk.
- **Capabilities are partial.** Website ~30%, inquiries ~35%, bookings ~25%,
  internal apps ~10%, publishing 0%, Ask Strelva in the workspace 0%.
- **A link already exists.** `offering_website_bindings` maps a business
  workspace to a `tenant_stable_id`. Owners need a tenant membership to create
  one, and production has none.
- **Client contract checks cover 2 of 9 repos.** `release-manifest.json` lists
  gldf and rohlax. McClear's Cottage and Orange Crate Brewing post to
  `/api/v1/leads`; four repos post to `/api/v1/track`. None are checked.
- **The layers are tangled.** 98 workspace files import `src/lib`; `lib`
  imports back into `products` from `agent-shared.ts` and `event-actions.ts`.

Run `pnpm reborn:progress` for the code-side numbers at any time.

## What ships

A release is done when every line below is true and proven where it says.
Each line ends with its Oct 2 status and size: S under a day of agent work,
M one to three days, L three to seven, XL more.

### 0. Stop losing data (first)

- [ ] Every `/api/v1/leads/[tenant]` submission is also written to Postgres,
      keyed by tenant now and by workspace after conversion. Redis keeps
      serving reads until cutover. *Not started · M*
- [ ] `release-manifest.json` lists all 9 client repos with the endpoints each
      calls. `check:custom-repos` exercises leads and track for McClear's,
      Leslie, RHM and Smokin' Buddha. *Not started · M*

### 1. One business record

- [x] A business record per workspace holding facts (name, address, hours,
      services, phone, links), contacts and people. *Proven locally Oct 2,
      not applied:* `20261002120000_business_record.sql`,
      `src/platform/business-record/`, `tests/business-record-schema.sql`.
- [ ] Website facts, booking hours and services, and inquiry contacts read and
      write it. No capability keeps its own copy of a business fact.
      *Not started · L*
- [x] Every edit has history and an undo, like website documents today.
      *Proven locally:* each command writes one immutable revision; undo
      refuses if a later change touched the same item.
- [ ] One owner-recipient rule: the record's owner contact, falling back to
      `tenants.owner_email`. Every owner notice (leads, bookings, reports)
      uses it. *Partial: `owner_recipient` fact and
      `resolve_business_owner_recipient` exist; no notice uses them yet · M*
- [ ] Every new table follows the `website_documents` pattern (RLS on, grants
      revoked, service-role functions) with cross-workspace denial tests.
      *Proven locally for the business record tables · keep for each new
      table*

Proof: unit and SQL tests in `check:workspace-sql`; `reborn:progress` shows
`business_record` done.

### 2. Data owned by the workspace

- [ ] Inquiries are Postgres-authoritative and reference `workspaces(id)`.
      `/api/v1/leads/[tenant]` keeps its contract and writes the new store.
      *Not started · M (after section 0)*
- [ ] One booking store. `/api/booking/*` and `/api/v1/bookings/*` both land
      in it. Weekly hours, slot length, buffer, lead time, advance window,
      date overrides and services come over from `src/lib/booking.ts`.
      *Not started · L*
- [ ] One approval store. Content, Google and workspace approvals use the
      governed-work proposal, decision and outcome tables. Redis event
      lifecycle retires. *Partial: Postgres shadow exists behind
      `GOVERNED_WORK_DUAL_WRITE`, keyed to tenants; Redis still gates writes ·
      L. Decide against [governed work](../architecture/ontology-phase2-governed-work.md),
      which calls the hybrid deliberate.*
- [ ] Orders, rewards, OAuth connections and analytics config move to
      Postgres. Redis is a cache again. *Not started · L*
- [ ] Workspace export and exit include the business record and every linked
      tenant's data. *Not started · M*

Proof: failure-path tests, `pnpm check:custom-repos`, and a byte-identical
storefront comparison like Sept 30 (60/60).

### 3. Every client converted

- [ ] `scripts/convert-tenant-to-workspace.ts`: creates the workspace, links
      the tenant through a link table (the `tenants` row is not altered),
      backfills facts, contacts, leads and bookings, and records billing
      state. One workspace can hold several tenants (Twin Trees pays for two
      sites). Idempotent, with a dry-run mode and a rollback. *Partial:
      built and proven locally as one atomic `convert_tenant_to_business`
      call; dry run is the default; `--apply` refuses a non-local database
      without `--i-have-jacobs-yes`. Rollback only undoes the import
      revision; a full unlink isn't built. Never run against Supabase · S*
- [x] Links and new rows survive tenant renames and deprovision. *Proven
      locally:* links key on `stable_id`; deleting a tenant clears the link
      and keeps the business.
- [ ] Tooling for a scrubbed local copy of production (Postgres, Auth users,
      Redis leads, bookings, events and connections; outgoing email, Stripe
      and Google disabled). *Not started · M*
- [ ] Dry run against that copy for every active tenant. *Not started · S*
- [ ] Production run for gldf, then the rest. *Not started · S each*
- [ ] Hosted websites created by the workspace stay linked through the same
      link table, with the business's real template and industry (today
      `reserve_website_hosted_tenant()` hard-codes `wellness`). *Partial · S*
- [ ] Billing follows the client: subscription, custom, comped and
      grandfathered (gldf, rohlax) states land in work-economics, and Stripe
      subscriptions carry `workspaceId`. *Not started · L*

Proof: per-client conversion receipt; storefront responses unchanged.

**Who runs a conversion (decided Oct 2).** A named Strelva operator: a
verified user with an active `super_admins` row. They become the workspace's
`created_by` and an `admin` member, not `owner`; owner carries payer, exit,
launch and publish authority that belongs to the client once invited in
section 6. No client user, invite or email is involved. The receipt records
billing type and multi-site accounts for review only; Stripe and allowances
are untouched.

### 4. Capabilities, production-complete in the workspace

- [ ] **Website.** Live tenant sites show name, domain, live link, verified
      status, change requests and previews awaiting review. Every field
      exists in tenant data today. *Name done; rest not started · S–M*
- [ ] **Website rebuild merges.** *Partial: committed in PR #209, flag off ·
      M*
- [ ] **Website edits, history and publishing** for existing sites are
      reachable from the workspace. *Partial: link-out only · S to link, L
      to make native*
- [ ] **Bookings.** Parity with the tenant widget (above), confirmation and
      cancellation email through `src/lib/email/send.ts`, and a day roster.
      *~25%: timezone, conflict checks, cancel done · L*
- [ ] **Inquiries.** `STRELVA_INQUIRIES_RELEASE` on, spam review in the
      workspace, owner notification. Existing leads already project in.
      *~35% · M*
- [ ] **Publishing.** Reviews and replies, Google Business, and blog and
      collections run from the workspace. Tenant Google tokens move to
      workspace connections through `crypto/secrets.ts` without re-consent.
      *Not started · L–XL*
- [ ] **Internal apps.** App building is agency or Strelva only (today any
      member can create through `applications/server.ts` and
      `custom-applications/lifecycle.ts`). *Not started · S*
- [ ] **Internal apps.** Records can point at contacts in the business
      record, and a submission notifies the assigned person. *Not started ·
      M*
- [ ] **Store, rewards, newsletter and wellness** (members, roster,
      schedule): each gets a workspace home or a written decision to stay on
      `/dashboard`. gldf, the first conversion, runs a store. *Not started ·
      L*
- [ ] **Analytics and reports** read the converted workspace; report crons
      resolve the recipient through the link. *Not started · M*
- [ ] **Ask Strelva runs in the workspace.** The ~24 tools inline in
      `src/app/api/agent/route.ts` move into `src/lib/agent-shared.ts`, a
      workspace agent route resolves workspace → link → tenant and re-checks
      permission, and approvals go through section 2. *Not started · L*

Proof: authenticated local journeys per capability on desktop and mobile, in
empty, loading, error and permission states, using The Mooney Firm and gldf.
Neither is used by any journey today.

### 5. One place to operate

- [ ] One operator queue in `/admin` across tenants and workspaces. Today six
      queues split across Redis (AI previews, change requests, needs-you,
      attention, domain alerts) and Postgres (service requests, operational
      inbox). *Not started · L*
- [ ] Every outside write leaves a receipt with read-back and undo. Google
      Business, Stripe and domain removal have no undo; Vercel domains are
      never removed. *Partial · L*
- [ ] Site health and domain checks cover every site. `website-health` skips
      custom-repo client sites; domain verification skips non-workspace
      tenants. *Partial · S*
- [ ] One domain view per workspace across both domain stores. *Not started ·
      S*
- [ ] The agency home loads every delegated client, not pages of 8. Needs a
      batched server read; today each client is its own request.
      *Not started · M*

### 6. Owners enter the workspace

- [ ] Signing in on a client admin host lands in that client's workspace.
      Today the sign-in page and auth callback hard-code `/dashboard`.
      *Not started · M*
- [ ] Each `/dashboard` page has a workspace home or redirects to one. Of 22
      pages: 3 have a home, 4 partial, 4 retire, the rest need building.
      *Not started · L*
- [ ] `/dashboard` and `/client/{tenant}/dashboard` stay permanent redirects;
      gldf and rohlax repos hard-code them and are not changed.
      *Not started · S*
- [ ] Owner memberships exist for every converted client, in both the
      workspace and the tenant while `/dashboard` pages remain. Workspace
      invites don't email today; tenant invites do. *Not started · M*
- [ ] Per-workspace flags layered over the env flags, so each client's
      landing, inquiries and rebuild turn on and roll back on their own. The
      same flags split Preview per tester. *Not started · M*

### 7. Structure that keeps it this way

- [ ] Shared infrastructure (`db`, `redis`, `auth`, `email`, `crypto`,
      `rate-limit`, `logger`, `ai-models`, `safe-fetch`) moves to
      `src/platform/infra`. `check:boundaries` blocks new workspace → `src/lib`
      imports (162 import sites today, baseline-and-shrink) and any `src/lib`
      → workspace import (8 today). *Not started · L*
- [ ] One capability registry replaces the seven declaration files listed in
      [capabilities](../capabilities/README.md#where-capabilities-are-declared).
      `site-capabilities.ts` stays as per-tenant v1 state. *Not started · L*
- [ ] One model-call helper. Every `generateText`, `streamText` and
      `generateObject` call goes through it (12 files in `src` today; six
      hard-code `gemini-2.5-flash`). It handles streaming, tools, structured
      output, fallback, logging and cost. *Not started · M*
- [ ] `src/lib/newsletter.ts` sends through `email/send.ts`;
      `src/lib/public-continuation.ts` encrypts through `crypto/secrets.ts`.
      *Not started · S*
- [ ] `src/lib/db/database.types.ts` is regenerated; it's missing the Oct 1
      website tables, so `deprovision-coverage.test.ts` can't see them.
      *Not started · S*

Proof: `pnpm reborn:progress --strict` passes.

### Done

- [x] Release page, progress script and Preview nightly workflow (this page).
- [x] Website rebuild, workspace places navigation and docs reorganization
      committed and passing local gates (PR #209).
- [x] Workspace SQL checks run on GitHub runners without ripgrep.

## Order

1. **Stop losing data:** lead dual-write and full client-repo checks.
2. **Foundation:** business record, link table, owner-recipient rule.
3. **Conversion:** script, scrubbed local copy, dry runs, then gldf on
   Jacob's yes.
4. **Data:** inquiries, bookings, approvals, remaining Redis stores.
5. **Capabilities:** website card and app-building limit first (small), then
   inquiries, Ask Strelva, bookings, store and reports, publishing.
6. **Entry:** per-workspace flags, owners in, dashboard redirects.
7. **Operate and structure:** run alongside from step 2.

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

- Each production migration: the three Oct 1 website migrations, the
  business record, tenant-to-workspace links, inquiry and booking stores.
- Making a scrubbed local copy of production data.
- Each production conversion run, starting with gldf.
- Owner invites. Tenant invites send client email.
- Turning on `EMAIL_SENDING_ENABLED`, `STRELVA_INQUIRIES_RELEASE` and
  `STRELVA_WEBSITE_REBUILD_RELEASE`.
- Adding `workspaceId` to Stripe subscription metadata.
- Changing where client admin hosts land.
- A Preview deployment and staging Supabase project.
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
- Whether governed-work tables are live and both flags on: the governed-work
  doc says yes with 97/97 parity, the capabilities page says the tables
  aren't applied. The snapshot settles it.
- Which tenants are live and paying, which use the wellness booking widget,
  and whether Cocard, Orange Crate and Vermont Unlimited are paid clients.
- Open PRs #201, #202 and #204 overlap sections 1 and 4. Merge or close them
  before section 1 lands.
- Whether owners will use the workspace at all. Today 1 person signed in
  in 30 days. Strelva Reborn must keep working for clients who never log in.

# Strelva Reborn

Created: 2026-10-02
Changed: 2026-10-06. Reborn is now the one build to `1.0.0`, not a ladder of `0.x` releases.
Status: building. Nothing in this release is deployed.

**Strelva Reborn is the build that becomes Strelva 1.0.0: every client runs
inside a business workspace, and the workspace is the product.** Each client's
website becomes its first System, next to inquiries, bookings, publishing and
internal tools. All of them read one business record. Strelva runs them, and
the owner only sees the decisions that are theirs.

[What Strelva becomes at 1.0.0](./product-model.md) is the product model, area
by area, with a spec for each. [Strelva 1.0.0](./strelva-1.0.0.md) is the
feature list. This page is the build: what's done, what's left, in what order,
and what needs Jacob's yes.

The Sept 30 release (internal name `strelvav2`, version `0.2.0`) put the
workspace machinery in production: memberships, grants, saved work, approvals,
exits, exports, allowances. It moved no client. The
[strelvav2 page](./strelvav2.md) is now history.

## One build, one exception

On October 6 Jacob dropped the `0.3.0`–`0.6.0` steps. Everything they held,
including owners entering, production-complete capabilities and one operator
place, is built now, together, toward `1.0.0`. The Systems model (Systems,
Connections, Possibilities, Versions, Make real) is in scope, not deferred.

| Release | What it is | When |
| --- | --- | --- |
| `0.2.1` | Every client lead also kept in Postgres; all 9 client repos checked | Now, alone, on Jacob's yes. Leads expire from Redis every day ([PR #213](https://github.com/Strelva/Strelva-OFFICIAL/pull/213)) |
| `1.0.0` | Everything below and in [Strelva 1.0.0](./strelva-1.0.0.md) | When every line is true in production and Jacob says Strelva would stand behind it for any new customer |

Building together does not mean deploying everything at once. Production steps
still go one at a time behind their own flags and Jacob's yes: migrations,
each client conversion (gldf first), owner invites, flag changes. What changes
is that no step waits for a release number, and no feature is parked for a
later `0.x`.

## Reborn in Systems terms

| Reborn section | What it becomes in the model |
| --- | --- |
| 1. One business record | The shared context every System reads. The business is the owner, not a System |
| 3. Every client converted | Each live client website becomes that business's first **System**, keyed to the tenant's `stable_id`. Twin Trees: one business, the same website System in two **Versions** |
| 1–2. Facts read from the record | **Connections** of kind *read*: website, bookings and inquiries read hours and services instead of keeping copies |
| 4. Publishing, Google | The Google listing and the newsletter become **Systems**; blog stays part of the website. Google writes are **Connections** of kind *act* on an account the business granted ([publishing spec](../capabilities/publishing/publishing-spec-2026-10-06.md)) |
| 4. Bookings, inquiries, internal tools | Each its own **System** ([systems catalog](./specs/systems-catalog.md)) |
| 4. Website rebuild, agency drafts | **Possibilities** on the website System; approve and publish is **Make real** |
| 5. Receipts, site health, one operator place | **Strelva handled** and System health ([operator](./specs/operator.md)) |
| 6. Owners enter the workspace | Home shows the business's Systems and **Needs you** ([owner entry](./specs/owner-entry.md), [needs you](./specs/needs-you.md)) |
| New | **Versions** for multi-location and agency clients ([agency and Versions](./specs/agency-and-versions.md)); **Ask Strelva** in the workspace ([ask-strelva](./specs/ask-strelva.md)); billing and Redis exit ([money and data](./specs/money-and-data.md)) |

The live-client rules don't move: `/api/v1` stays additive, `reb:` keys and
tenant rows stay, and clients who never log in keep working. Owners are never
required to sign in for 1.0.0 to work.

## Where we are

Audited 2026-10-02 against code, line by line, and again on 2026-10-05
against `reborn` plus every unmerged Oct 5 branch together. Production facts
come from the
[Sept 30 release record](../operations/strelvav2-horizontal-acceptance.md#september-30-workspace-production-release),
not a fresh read.

**8 of 48 lines are done, all proven locally only; 13 are partial and 27 are
not started.** The Oct 5 re-audit counts a table or function with no product
caller as partial, which moves undo back to partial and inquiries forward to
partial. Section 0 was finished locally on Oct 5; nothing in it is
deployed. Summing the sizes below (S half a day, M two, L five, XL ten)
gives about 108 agent-days if done one at a time. Sections 0, 1 and 3 are the
critical path at about 31 of them; the rest can run in parallel streams.
These are estimates, not measurements. Nothing below is proven in
production.

- **The business record exists only as data.** Tables, functions and tests
  are built locally (`src/platform/business-record/`). The conversion script
  is its only caller: no route, page or notice reads it yet.
- **No client in a workspace.** Production: 0 workspaces, 0 tenant
  memberships, 1 sign-in in 30 days. A local conversion script exists; its
  rollback only undoes the import revision.
- **Leads are being lost today.** In production, leads live only in Redis:
  `lead:{tenant}:{id}` expires after 90 days and `leads:{tenant}` keeps 500.
  Older leads are gone. The fix (section 0) is built locally and waits on a
  migration, a backfill and a deploy.
- **Data lives tenant-side.** Leads, booking config, orders, rewards, OAuth
  connections and analytics config are Redis. Bookings and content each have
  two stores that don't talk.
- **Capabilities are partial.** Website ~30%, inquiries ~35%, bookings ~25%,
  internal apps ~10%, publishing 0%, Ask Strelva in the workspace 0%.
- **A link already exists.** `offering_website_bindings` maps a business
  workspace to a `tenant_stable_id`. Owners need a tenant membership to create
  one, and production has none.
- **Client contract checks covered 2 of 9 repos.** Fixed locally Oct 5: the
  manifest lists all 9. Only McClear's Cottage (`mclears`) posts to
  `/api/v1/leads` (Orange Crate only mentions it in a comment); five repos post
  to `/api/v1/track`; Cocard calls `/api/v1/spam-pit`; Vermont Unlimited calls
  nothing.
- **The layers are tangled, and Oct 5 made it worse.** 108 workspace files
  import `src/lib` (98 on Oct 2; Systems, system health, the business-record
  repository and inquiry receipts added ten). `lib` imports back into
  `products` from `agent-shared.ts` and `event-actions.ts`.
- **Systems, Possibilities and Make real have their own flag.**
  `STRELVA_SYSTEMS_RELEASE` (PR #214, Oct 5) is off by default, so they no
  longer ride `STRELVA_WORKSPACE_RELEASE`, which production turned on Sept 30.
  Make real still runs on fake effects with in-memory progress, and Versions
  are in-memory only.
- **Lead copies are deleted with their tenant.** `tenant_leads` cascades on
  tenant delete. Whether a deprovisioned client's leads are kept is Jacob's
  call.

Run `pnpm reborn:progress` for the code-side numbers at any time.

## What ships

A release is done when every line below is true and proven where it says.
Each line ends with its Oct 2 status and size: S under a day of agent work,
M one to three days, L three to seven, XL more.

### 0. Stop losing data (first)

- [x] Every `/api/v1/leads/[tenant]` submission is also written to Postgres,
      keyed by tenant now and by workspace after conversion. Redis keeps
      serving reads until cutover. *Done locally Oct 5, not applied or
      deployed:* `20261005090000_tenant_leads.sql` (`tenant_leads` keyed by
      `stable_id`, nullable `workspace_id`, RLS on, two service-role RPCs),
      `src/lib/lead-mirror.ts` (1.5 s database bound plus 250 ms for failure reporting, never fails the submission,
      failures pending in Redis, paged, retried hourly by
      `lead-mirror-reconcile`), `scripts/backfill-tenant-leads.ts` (dry run by
      default). Operators see client leads at `/admin/client-leads` and on each
      client page. The owner lead email now carries the tenant, so the
      per-client override can turn it on. Proof: `tests/tenant-leads-schema.sql`
      in both SQL checks (including applying it before the Oct 1 and Oct 2
      migrations), `v1-leads-dual-write`, `lead-mirror`,
      `client-leads-operator`, `tenant-lead-backfill`,
      `new-lead-email-tenant` tests.
- [x] `release-manifest.json` lists all 9 client repos with the endpoints each
      calls. `check:custom-repos` exercises leads and track for McClear's,
      Leslie, RHM and Smokin' Buddha. *Done locally Oct 5:* per-repo `profile`
      and `v1Endpoints`; call sites read at the pinned commit; the real route
      handlers run against each repo's body shape
      (`custom-repo-v1-contracts.test.ts`). With `CUSTOM_REPO_VERIFY_PINS=1`
      the sibling folders fail because they are ahead of their pins or have the
      owners' uncommitted edits; clean clones at each pin pass. Smokin' Buddha's
      tenant slug is unconfirmed and it isn't in the Sept 30 active list.

### 1. One business record

- [x] A business record per workspace holding facts (name, address, hours,
      services, phone, links), contacts and people. *Proven locally Oct 2,
      not applied:* `20261002120000_business_record.sql`,
      `src/platform/business-record/`, `tests/business-record-schema.sql`.
- [ ] Website facts, booking hours and services, and inquiry contacts read and
      write it. No capability keeps its own copy of a business fact.
      *Not started · L*
- [ ] Every edit has history and an undo, like website documents today.
      *Partial:* each command writes one immutable revision and
      `undo_business_record_revision` refuses if a later change touched the
      same item, proven locally. Nothing outside tests calls undo yet · S
- [ ] One owner-recipient rule: the record's owner contact, falling back to
      `tenants.owner_email`. Every owner notice (leads, bookings, reports)
      uses it. *Built and proven locally Oct 6 (branch
      `build/business-ownership`, migration `20261007110000`, not applied):
      `src/lib/owner-recipient.ts` over `resolve_tenant_owner_recipient` is
      used by lead, inquiry, weekly and monthly report (both report paths,
      hosted included), review alert, review and order nudge and health-drop
      notices. No owner booking notice exists yet to wire; the bookings build
      must use it. Billing and lifecycle mail still read `owner_email` · S left*
- [ ] Every new table follows the `website_documents` pattern (RLS on, grants
      revoked, service-role functions) with cross-workspace denial tests.
      *Proven locally for the business record tables · keep for each new
      table*

Proof: unit and SQL tests in `check:workspace-sql`; `reborn:progress` shows
`business_record` done.

### 2. Data owned by the workspace

- [ ] Inquiries are Postgres-authoritative and reference `workspaces(id)`.
      `/api/v1/leads/[tenant]` keeps its contract and writes the new store.
      *Partial: `tenant_leads.workspace_id` references `workspaces(id)` and
      fills in when a tenant is linked, but it is a mirror; Redis still serves
      reads · M*
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
      without `--i-have-jacobs-yes`. `--rollback` runs the full unlink
      (`unlink_tenant_from_business`): dry-run preview by default, same
      refusal, receipt in `tenant_workspace_unlinks`; proven locally for
      convert → unlink → reconvert, unlink twice, unlink after an owner
      edit, a joined site, and cross-workspace denial. Never run against
      Supabase · S*
- [x] Links and new rows survive tenant renames and deprovision. *Proven
      locally:* links key on `stable_id`; deleting a tenant clears the link
      and keeps the business. Exception: `tenant_leads` rows cascade-delete
      with their tenant, pending Jacob's decision.
- [ ] Tooling for a scrubbed local copy of production (Postgres, Auth users,
      Redis leads, bookings, events and connections; outgoing email, Stripe
      and Google disabled). *Partial: `pnpm scrubbed-copy` built and proven
      locally against a fake source (`pnpm check:scrubbed-copy`); never run
      against production. Runbook:
      [scrubbed-production-copy.md](../operations/scrubbed-production-copy.md) · M*
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
      exists in tenant data today. *Partial: `SystemPage.tsx` shows name,
      domain, live link, health and a preview (local, `transition/systems`);
      change requests and previews awaiting review are missing · S*
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
      invites don't email today; tenant invites do. *Path built and proven
      locally Oct 6 (`build/business-ownership`): operator-issued owner
      invitation, emailed through `send.ts`; accepting writes both
      memberships in one transaction. No converted client has an owner yet:
      each invitation is Jacob's yes (`scripts/business-ownership.ts`) · S
      per client*
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

One build, several streams. The critical path is 1 → 2 → 3; everything else
runs beside it from step 2.

1. **Stop losing data (`0.2.1`):** lead dual-write and full client-repo
   checks. Built locally Oct 5; production needs the migration, backfill and
   deploy, each on Jacob's yes.
2. **Safety batch:** the seven P1 findings in the
   [Oct 5 integration audit](../operations/reborn-integration-audit-2026-10-05.md#open-release-findings)
   before any of that code goes near production. Built and proven locally
   Oct 7 on `build/safety-batch` (all seven P1s plus P2 #9; P2 #8 open).
   The two migrations need Jacob's yes before production.
3. **Foundation and conversion:** business record, one workspace-to-tenant
   link, owner-recipient rule, scrubbed local copy, dry runs for every active
   tenant, then gldf on Jacob's yes, then the rest.
4. **Data:** inquiries, bookings, approvals and the remaining Redis stores
   move to Postgres ([money and data](./specs/money-and-data.md)).
5. **Systems:** website, inquiries, bookings, publishing, internal tools and
   the catalog decisions, each to the capability bar in
   [Strelva 1.0.0](./strelva-1.0.0.md#the-bar).
6. **The model on screen:** Systems Home, System pages, Connections,
   Possibilities and Make real with real effects, Versions in Postgres,
   Needs you and Strelva handled, Ask Strelva.
7. **Entry and operation:** per-workspace flags, owners in (never required),
   dashboard redirects, the agency home and one operator queue.
8. **Structure:** shared infrastructure out of `src/lib`, one capability
   registry, one model-call helper. Runs alongside throughout.

## Preview and Stable

Strelva has two channels. Customers use **Strelva**, the Stable channel,
which is what `main` and production run. Jacob and selected testers use
**Strelva Preview**, built from Reborn work before it ships. Nightly is when
Preview gets built, not a separate channel.

All Reborn work lands on the `reborn` branch through pull requests. `main`
stays Stable; each Reborn version merges into `main` when it is cut. A step that
must not wait for the rest (like `0.2.1`) is built from `main` directly.

- **Nightly build.** [`preview-nightly.yml`](../../.github/workflows/preview-nightly.yml)
  builds `reborn` at 03:00 Eastern: lint, types, boundaries, ontology,
  workspace SQL and full upgrade, tests with coverage, audit, build, public
  smoke and workspace browser acceptance. A green build is tagged
  `strelva-v<next version>-preview.YYYYMMDD`, today
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

- The Systems spine migration `20261004120000_systems.sql` and every Oct 7 build-stream migration.
- Each production migration: the client lead store (Oct 5, can go first and
  alone), the three Oct 1 website migrations, the business record,
  tenant-to-workspace links, inquiry and booking stores.
- The client lead backfill against production
  (`scripts/backfill-tenant-leads.ts --apply --i-have-jacobs-yes`).
- Making a scrubbed local copy of production data.
- Each production conversion run, starting with gldf.
- Owner invites. Tenant invites send client email.
- Turning on `EMAIL_SENDING_ENABLED`, `STRELVA_INQUIRIES_RELEASE` and
  `STRELVA_WEBSITE_REBUILD_RELEASE`.
- Adding `workspaceId` to Stripe subscription metadata.
- Changing where client admin hosts land.
- A Preview deployment and staging Supabase project.
- Each release cut: the version set in this repo and `strelva-marketing`
  together, per `VERSIONING.md`, and tagged `strelva-v<version>`.

Every production step also passes the
[release checklist](../operations/horizontal-release-checklist-2026-09-11.md#september-21-production-preparation).

## Not in Strelva Reborn

New pricing or plan tiers. Partner agencies (Strelva is the only agency in
this release). Home Finder. Enterprise customers. Self-serve website building
for owners. `/api/v2`. No `/api/v1` change except additive.
(Possibilities, Make real and Versions moved into Reborn on October 6.)

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

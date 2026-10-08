# Strelva 1.0 release packet

Created: 2026-10-06 against `integrate/reborn-1.0` at `9e0bd441`.
Updated: 2026-10-06 on `w2/release-hardening`: findings 3, 5, 6, 8, 10 and
11 are fixed in code and proven locally (tests and SQL checks), never in
production. Two migrations were added (34 unapplied in total).
Updated: 2026-10-06 on `w4/journey-gaps` against `integrate/reborn-1.0` at
`30dcba1b` (waves 1–3 merged): 14 more migrations (48 unapplied, two new
batches 5 and 6), 11 new flags, two new crons, two new guarded scripts, and
the snapshot reads the new facts. Findings 12–17 are new. Wave 4's journey
gaps add two migrations as batch 7 (50 unapplied in total). Wave 5
(`w5/structure`) adds a third to batch 7, `20261009140000`, which gives
finding 16 its own per-business flag (51 unapplied in total).
Updated: 2026-10-07 for the agency model (company ADR 0012, accepted Oct 7),
using audit H, "What ADR 0012 breaks or changes in the in-flight 1.0 release"
(Oct 7; local evidence in `strelva/.scratch/agency-1.0/audit/H-release-impact.md`),
tracked in [#315](https://github.com/Strelva/Strelva-OFFICIAL/issues/315).
Status: steps 0–4 done Oct 7; later steps prepared, not executed by this
amendment. Every remaining production step is a separate yes.

**HOLD: steps 11–12 (S5 and conversions) until batch 7A lands.** The hold
decision [#234](https://github.com/Strelva/Strelva-OFFICIAL/issues/234) is
**pending**, not decided. This packet records the required stop; it does not
record Jacob's approval of the hold or authorize any production action.
Do not run the old designation or conversion path while that decision and
the batch 7A gate are unresolved.

This is every production step Strelva `1.0.0` needs, in order, written so
Jacob can say yes one item at a time. Each step names the exact command, what
it changes, how to verify it, and how to undo it. Saying yes to one step never
implies the next.

### Execution record · October 7, 2026

These are the completed results supplied for this amendment, not new
production checks run from this branch. Private dumps stay outside Git.

| Step | Status | Evidence |
| --- | --- | --- |
| [0](https://github.com/Strelva/Strelva-OFFICIAL/issues/343) · snapshot | Done · 2026-10-07 | 31 migration sentinels missing; 14 tenants, 12 active |
| [1](https://github.com/Strelva/Strelva-OFFICIAL/issues/344) · dump + local restore | Done · 2026-10-07 | Dump at `~/.strelva-prod-ops/dumps/2026-10-07`; restore matched 146/146 tables, 2,603 rows |
| [2](https://github.com/Strelva/Strelva-OFFICIAL/issues/345) · batch 0 | Done · 2026-10-07 14:25Z | `tenant_leads` applied; 86 migrations applied in total |
| [3](https://github.com/Strelva/Strelva-OFFICIAL/issues/346) · `0.2.1` | Done · 2026-10-07 14:53Z | Live deployment `dpl_9ViM5iWeCepPiio8k3AZ5NFwKFPx`; storefront parity 60/60 |
| [4](https://github.com/Strelva/Strelva-OFFICIAL/issues/347) · S1 lead backfill | Done · 2026-10-07 | 43/43 leads backfilled |

Re-read the snapshot before the next production write. Completion of these
steps does not qualify the 1.0 candidate or agency paths.

Every step also passes the
[release checklist](./horizontal-release-checklist-2026-09-11.md#september-21-production-preparation)
(Gates 1–4 and the stop conditions). Where this packet and the checklist
disagree, the checklist's stop conditions win.

## What this packet found that changes the plan

1. **`supabase db push` cannot push a batch.** It applies every pending file.
   Each batch is pushed from a batch directory (section 1).
2. **One migration is out of order.** `20260928130000_business_effort_minutes`
   is dated before the applied `20260930120000`. Every push after batch 0
   needs `--include-all`.
3. **Fixed: a missing `tenant_leads` pages once, not hourly.** `DUAL_WRITE_PG`
   is on unless set to `0`, so lead copies start on deploy. If `tenant_leads`
   or `record_tenant_lead` is missing, the first lead sets
   `reb:lead-mirror:schema-missing` and pages once
   (`lead_mirror_schema_missing`). After that, captures skip the database call
   and queue each lead in `reb:lead-mirror:pending` without paging. It
   rechecks at most hourly and resumes by itself once batch 0 lands; the
   reconcile cron reports `schemaMissing: true` and stays healthy. Visitors
   are never affected. Batch 0 should still go first: until it does, every
   lead waits in the queue for the cron or S1.
4. **The first conversion needs batch 4.** `20261007180000_business_billing`
   records a business's billing through a trigger at conversion time, with no
   backfill. Converting before it lands leaves converted businesses without a
   billing home. And `20261008130000` (batch 5) adopts the site as a
   System at conversion, with no backfill. So: every batch, then conversions.
5. **Fixed: inquiries and the website rebuild honor per-workspace rows.**
   Every caller that knows its business or site now asks the per-workspace
   or per-site resolver, so `workspace` turns them on client by client. A
   converted site follows its business's row (looked up through
   `resolve_billing_workspace`, batch 4); an unconverted site follows the env
   (`1` on, `workspace` off). Public endpoints (the inquiry form, lead
   capture, hosted pages) never count as operators, so an `operators` row
   keeps them closed to visitors. Callers with no business in hand keep the
   env-only rule: the account landing redirect, the `/workspace` page's
   first paint (the `/api/workspace` snapshot then says
   `releases.websiteRebuild` and `releases.inquiries` per workspace), and the
   preview fixture. The proxy only asks "could it be on" and leaves the
   per-site decision to the published-document read.
6. **Fixed: under `STRELVA_SYSTEMS_RELEASE=workspace`, Ask, the agency
   library and link fields follow the workspace row.** Ask needs
   `STRELVA_ASK_RELEASE=1` and Systems on for the asked workspace (503
   otherwise). The library is read for an agency workspace, and rows used to
   be allowed on business workspaces only; `20261008161000` (batch 3) allows
   them on agency workspaces too, set with `scripts/workspace-release-flag.ts`
   (S10). The command verifies the current operator's signed Supabase session;
   an `on` write records that same operator's approval and includes the local
   OS user and machine in its audit. Without the workspace release, link fields
   keep the env-only rule.
7. **"Stripe test mode first" can't run as specced.** The script picks its
   mode from the key prefix but reads Stripe ids from whatever Supabase is
   configured. A test key against production ids fails every update. A real
   rehearsal needs test-mode objects seeded on purpose (section 3, step S7).
8. **Twin Trees defaults to one business; `--separate-business` now exists.**
   Converting the second site still auto-joins the first site's workspace.
   `--separate-business` (migration `20261008160000`, batch 4) converts a
   linked-account site into its own business instead. Ask the owner before
   converting either site (section 4).
9. **A tested dump comes first.** Production had PITR off and no listed
   backups on Sept 21. Step 1 now has the Oct 7 restore evidence above.
   Audit H reports release-safety's rollback companions and restored-copy
   rehearsal for the 51-file inventory. Integrate and check that evidence
   before the next batch; batch 7A needs its own forward, reverse, forward run.
10. **Fixed: client-records parity runs itself.** A daily cron
    (`client-records-parity`, 05:40 UTC) compares Redis with Postgres and
    records one parity row per store, tenant and day. It never writes client
    rows and only acts while `STRELVA_CLIENT_RECORDS_DUAL_WRITE=1` (and
    `DUAL_WRITE_PG` isn't `0`). A store with any failed compare that day is
    left out of the streak and alerts (`client_records_parity`). The 7-day
    clock starts the day after the backfill. The backfill stays manual.
11. **Fixed: both scripts are guarded.** `scripts/count-client-redis-keys.ts`
    refuses any Redis that isn't loopback or `*.localhost` without
    `--i-have-jacobs-yes`. `scripts/backfill-secret-encryption.ts` is a dry
    run by default (tenant ids, column and key names only, never a value),
    writes only with `--apply`, and refuses a non-local Supabase or Redis
    without the yes, dry run included. Neither is part of 1.0.
12. **The booking store needs an extension.** `20261008141000_booking_store`
    runs `create extension if not exists btree_gist` for its one-slot
    exclusion constraint. Check before batch 6:
    `select name, installed_version from pg_available_extensions where name='btree_gist';`
    One row means it can be created. No row: stop.
13. **Batch 6 changes `tenant_leads` while leads are being written.** Since
    `0.2.1`, every captured lead is copied into `tenant_leads`.
    `20261008151000_connected_sites` swaps two checks, drops a `NOT NULL` and
    adds a foreign-key column and two unique indexes on it, with no
    `lock_timeout`. `20261009113000_inquiry_records` adds four columns
    (constant defaults, no rewrite), a check, a foreign key to
    `business_contacts` and an index (it has `lock_timeout 3s`). A blocked
    copy waits or fails into the pending queue, so no visitor sees it. Push
    at the quietest hour anyway.
14. **Booking parity has no cron.** Leads record their own daily parity in
    `lead-mirror-reconcile` while `STRELVA_LEADS_READ` is `compare` or
    `postgres`, and the client stores have `client-records-parity`. Bookings
    don't: `STRELVA_BOOKING_STORE_READ=postgres` serves the store only after
    7 days in a row of `booking-store-move.ts parity` results, and each run
    against production is a yes (S12). That means seven daily runs. Until
    then `postgres` behaves as `compare`.
15. **The Needs you chase reaches owners who never sign in; its scope needs 7A.**
    `20261009100000_strelva_service_actor` lets the hourly `needs-you` cron
    open workspace items for a business Strelva runs (converted, or provided
    by Strelva's agency), as "Strelva (system)", logged in
    `strelva_service_actions`. It never decides; deciding still needs the
    owner's signed link or session. The `workspace-work` cron resumes an
    approved Make real activation the same way. The chase stays a
    heartbeat until `STRELVA_NEEDS_YOU_RELEASE=1`; a resume only happens
    for an activation an owner approved under Systems. This is the original
    batch 6 behavior, not the agency-neutral release contract: batch 7A and
    step 16a must cover every business, including outside-agency and
    self-serve businesses, with the same owner approvals and logging.
16. **An owner with no account can now approve Make real by email link**
    (owner-entry decision 6, batch 7). The link's recipient must be the owner
    recipient on record and have no owner account; Strelva (system) then
    reads and runs that one plan under a `make_real_link` session, logged
    before it runs, and the plan fingerprint is checked again at decision
    time. **Its own flag** (wave 5, `20261009140000`): it only happens where
    `STRELVA_MAKE_REAL_OWNER_LINK_RELEASE` is on for the business (`workspace`
    plus a `make_real_owner_link` row `on`, or `1` except rows `off`), on top
    of Needs you and Systems being on for it (and live channels only with
    `STRELVA_MAKE_REAL_LIVE`). Needs you and Systems on are no longer enough.
    Unset, the link answers "Sign in to decide this" and no session is asked
    for; unsetting it, or a row `off`, stops it within a minute. Access,
    money and exit still need a sign-in.
17. **The visitor's booking no longer needs Redis once the one store
    serves.** With `STRELVA_BOOKING_STORE_READ=postgres` in force (after the
    parity streak), a Redis outage falls back to a per-instance rate limit
    and a best-effort Redis slot lock; the store's exclusion constraint is
    the guard. If neither the store nor Redis can hold a booking, the visitor
    gets a 503 that says nothing was booked (it was a 500). Code only; no
    migration or flag.
18. **Tenant code now reaches the workspace through ports registered at
    server start** (wave 5, `w5/structure`, Reborn section 7). `src/lib` no
    longer imports a workspace layer; `instrumentation.ts` imports
    `src/register-workspace-ports.ts`, which plugs in the owner-recipient
    rule, client-record mirrors, Google bindings, outside-write receipts,
    business billing metadata, the policy bridge, inquiry review and the
    agent's website tools. If that registration did not run, those calls
    throw "Workspace ports are not registered" (the owner notice still falls
    back to the tenant's own address). Check on Preview before production:
    one lead capture and one domain add log no such error. Scripts that reach
    these modules register themselves. Code only; no migration or flag.
19. **Five tenant_id tables are not swept by deprovision** (found by the
    regenerated database types, wave 5): `agency_managed_website_draft_grants`,
    `…_preparations`, `…_revisions`, `outside_write_receipts`,
    `report_snapshots`. None has a foreign key to `tenants`, so their rows
    outlive a deprovisioned tenant. Unchanged and listed in
    `TENANT_TABLES_SWEEP_UNDECIDED` (`src/lib/deprovision.ts`) for Jacob to
    decide: purge, keep as receipts, or settle through the workspace.

## The whole order

| # | Step | Kind | Section |
| --- | --- | --- | --- |
| [0](https://github.com/Strelva/Strelva-OFFICIAL/issues/343) | Read-only production snapshot · done Oct 7 | read | 0 |
| [1](https://github.com/Strelva/Strelva-OFFICIAL/issues/344) | Dump and test-restore the database · done Oct 7 | read + local | 1 |
| [2](https://github.com/Strelva/Strelva-OFFICIAL/issues/345) | Batch 0: `tenant_leads` · done Oct 7 | migration | 1 |
| [3](https://github.com/Strelva/Strelva-OFFICIAL/issues/346) | Deploy `0.2.1` from `main` (lead dual-write) · done Oct 7 | deploy | `strelva-reborn.md` |
| [4](https://github.com/Strelva/Strelva-OFFICIAL/issues/347) | Lead backfill · done Oct 7 | data | 3 · S1 |
| [5](https://github.com/Strelva/Strelva-OFFICIAL/issues/348) | Preview environment (optional, recommended before batch 2) | new env | 5 |
| [6](https://github.com/Strelva/Strelva-OFFICIAL/issues/349) | Batches 1 to 7 (unchanged, after release-safety's rehearsal) | migration ×7 | 1 |
| 6b | Batch 8 (proposed; companions run, catalog not restored): readers fix and w6 migrations, after 7A | migration | 1 |
| [6a](https://github.com/Strelva/Strelva-OFFICIAL/issues/350) | Batch 7A: agency-neutral amendments, dated before w6 migrations | migration | 1 |
| [7](https://github.com/Strelva/Strelva-OFFICIAL/issues/351) | Deploy the 1.0 candidate with every new flag unset | deploy | 2 |
| [8](https://github.com/Strelva/Strelva-OFFICIAL/issues/352) | Copy report and analytics state; client-records dual-write, backfill, parity | data | 3 · S2–S3 |
| [9](https://github.com/Strelva/Strelva-OFFICIAL/issues/353) | Confirm `SECRETS_ENC_KEY` | env read | 2 |
| [10](https://github.com/Strelva/Strelva-OFFICIAL/issues/354) | Scrubbed copy and dry run for every active tenant | read + local | 3 · S4 |
| [10a](https://github.com/Strelva/Strelva-OFFICIAL/issues/355) | Create Strelva's agency through ordinary agency signup | data | 6 |
| [10b](https://github.com/Strelva/Strelva-OFFICIAL/issues/356) | Verify Strelva's agency by the same bar as any agency | verification | 6 |
| [11](https://github.com/Strelva/Strelva-OFFICIAL/issues/357) | Retire the designation · HOLD pending 7A and #234 | retirement | 6 · S5 retired |
| [12](https://github.com/Strelva/Strelva-OFFICIAL/issues/358) | Convert with an explicit agency: test tenant, gldf, then the rest · HOLD | data ×N | 4 |
| [12a](https://github.com/Strelva/Strelva-OFFICIAL/issues/359) | Re-route any business converted before 7A | data if needed | 6 |
| [13](https://github.com/Strelva/Strelva-OFFICIAL/issues/360) | Flags in order | env ×N | 2 |
| [14](https://github.com/Strelva/Strelva-OFFICIAL/issues/361) | Stripe `workspaceId` and `payerKind` metadata | Stripe | 3 · S7 |
| [15](https://github.com/Strelva/Strelva-OFFICIAL/issues/362) | Google binding copy, verify, then read flag | data + Google | 3 · S8 |
| [16](https://github.com/Strelva/Strelva-OFFICIAL/issues/363) | Needs you policy seeding per converted tenant | data | 3 · S11 |
| [16a](https://github.com/Strelva/Strelva-OFFICIAL/issues/364) | Needs you chase covers every business | flag + verify | 6 |
| [17](https://github.com/Strelva/Strelva-OFFICIAL/issues/365) | Booking store: dual-write, backfill, 7 days of parity, then reads | env + data | 3 · S12, 2 |
| [18](https://github.com/Strelva/Strelva-OFFICIAL/issues/366) | Lead reads: compare, 7 days of parity, then Postgres reads, then authority | env ×3 | 2 |
| [19](https://github.com/Strelva/Strelva-OFFICIAL/issues/367) | Owner invites, then email on per client | email | 3 · S6, 2 |
| [19a](https://github.com/Strelva/Strelva-OFFICIAL/issues/368) | Open agency signup; outside effects off until verified | release gate | 6 |
| [19b](https://github.com/Strelva/Strelva-OFFICIAL/issues/369) | Onboard and verify the first outside agency | onboarding | 6 |
| [20](https://github.com/Strelva/Strelva-OFFICIAL/issues/370) | Release cut `1.0.0` with marketing: agencies are the customer | release | `VERSIONING.md` |

Steps 8 and 9 can run in parallel with 10. Nothing from step 12 on starts
before steps 6 and 6a are complete and the hold decision is recorded.
Steps 10a–10b use the same signup and verification paths as step 19b; no
designation substitutes for them. Step 12a must be settled before flags or
owner invites expose any earlier conversion. Steps 17 and 18 can start after step 7
(leads after S1), in parallel with conversions.

---

## 0. Read-only snapshot (first yes)

Done Oct 7 (step 0): 31 sentinels missing, 14 tenants / 12 active.
The Sept 30 record remains historical context. Re-read before the next write:

```sh
# Names only, no values: what is set in production
vercel env ls production --scope strelva   # in the strelva-admin project dir

# Flag values need the file. Pull to a private path, use, delete.
umask 077
vercel env pull /private/tmp/strelva-prod.env --environment=production --scope strelva
npx tsx --env-file=/private/tmp/strelva-prod.env \
  scripts/production-readiness-snapshot.ts --i-have-jacobs-yes > /private/tmp/snapshot-$(date +%F).txt
rm /private/tmp/strelva-prod.env

# Full migration list (read-only), as on Sept 30
npx supabase migration list --linked
# Catalog snapshot, as in Gate 2
psql "$READ_ONLY_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -f scripts/workspace-target-snapshot.sql
```

`scripts/production-readiness-snapshot.ts` (logic in
`scripts/readiness-snapshot.ts`, tests in
`src/__tests__/production-readiness-snapshot.test.ts`) refuses to run without
`--i-have-jacobs-yes`. It only reads: PostgREST head counts and column selects,
Auth user counts, Redis `SCAN`, `TYPE` and `ZCARD`/`LLEN`/`SCARD`/`HLEN`. It
never `GET`s a Redis value, never calls an RPC, and never selects a secret or
contact column. Secrets print as present/absent. The whole output is checked
for email addresses and token-shaped strings before it prints. If
`SNAPSHOT_DATABASE_URL` is set to a read-only role, it also lists
`supabase_migrations.schema_migrations` in one `READ ONLY` transaction via `psql`.

It answers the open production facts the specs list:

| Fact | Asked by | Snapshot field |
| --- | --- | --- |
| Workspaces, memberships, invites, sign-ins | owner-entry §7, 11 | `postgres.workspaces`, `workspaceMemberships`, `tenantMemberships`, `openTenantInvites`, `pendingWorkspaceInvitations`, `auth` |
| Does an agency workspace exist | agency-and-versions §10 | `postgres.workspaces.byKind.agency` |
| Which migrations are applied | this packet | `migrations.applied` (with SQL) or `migrations.sentinels` |
| `EMAIL_SENDING_ENABLED`, `CUSTOMER_EMAIL_ENABLED` | needs-you §10, systems-catalog §10 | `env.flags` |
| Which tenants have `reb:client-email:*` | owner-entry §11, needs-you §10 | `redis.activeTenantsWithClientEmailOverride` |
| `orders:*`, `reb:rewards:*` per tenant | systems-catalog §10 | `redis.families` |
| `leads:*`, `reb:spam-pit:*` per tenant | inquiry delta | `redis.families` (with entry counts) |
| `tenants.features` per active tenant, wellness/commerce | systems-catalog §10 | `postgres.activeTenants[].features` |
| `resend_domain` values | email | `postgres.activeTenants[].resendDomain` |
| Analytics config and Search Console | systems-catalog §10 | `redis.activeTenantsWithAnalyticsConfig`, `activeTenants[].hasSearchConsoleKey` |
| Google connections | publishing §10 | `redis.activeTenantsWithGoogleConnection` |
| `SECRETS_ENC_KEY` | publishing §10 | `env.secrets.SECRETS_ENC_KEY` |
| `unified_events` dual-write lands | money-and-data §10 | `postgres.unifiedEvents` (24h, 7d, latest) |
| Governed-work tables live | needs-you §10 | `postgres.governedWork` plus the two `GOVERNED_WORK_*` flags |
| Which list of active tenants is current (`smokin-buddha`) | systems-catalog §10 | `postgres.activeTenants` |
| The July org layer is applied (`accounts` exists) | this packet, batch 4 | `migrations.sentinels["20260729180000"]` |
| Each wave 2–3 migration applied or not (one table each) | this packet, batches 5–6 | `migrations.sentinels` (`20261008110000` … `20261009113000`) |
| How big the booking backfill is | bookings spec, "Moving today's bookings" | `postgres.bookings` (legacy `bookings` total and per active tenant, `public_website_bookings` receipts) |
| Booking config, overrides, slot locks and queued store writes in Redis | bookings spec | `redis.families` (`reb:booking:config:*`, `reb:booking:overrides:*`, `reb:booking:slot:*`, `reb:booking-store:pending`) |
| The 11 wave 2–3 flags and the wave 5 owner-link flag (all expected absent) | section 2 | `env.flags` |

Out of scope: gldf's own Supabase project (paused on Sept 30), Stripe,
Vercel logs, Google, approve-link counts.

**Stop if** the snapshot shows any migration applied that the repo lacks,
any 1.0 table present outside the approved applied batches, the `20260729180000` sentinel (`accounts`)
missing, any wave 2–3 flag already set, or a tenant count that differs from
14/12 without an explanation. **Also stop if a `strelva_agency_workspace`
row exists.** Before batch 3 the table can be absent; once present, read
`select count(*) from public.strelva_agency_workspace;` and expect `0`.
Never create a designation to satisfy a readiness check. An existing row
needs an approved recovery plan; do not delete it ad hoc.

---

## 1. Migrations

### What production has

From the [Sept 30 record](./strelvav2-horizontal-acceptance.md#september-30-workspace-production-release):
`supabase migration list --linked` matched all 84 repository migrations through
`20260921220000_customer_business_entry`, then
`20260930120000_revoke_public_execute_internal_functions` was pushed alone.
That was 85. Batch 0 applied Oct 7 at 14:25Z brings the total to 86.
The org layer (`20260729180000_org_layer_phase0_accounts`) is among
them, applied 2026-07-30 per
[persistence boundaries](../architecture/persistence-boundaries.md): dormant,
nothing reads its tables. Batch 4 is the first thing to use them.

### The July org layer (applied, not pushed)

**`20260729180000_org_layer_phase0_accounts`** · `7e0010ec36a4`
- Changes (applied 2026-07-30): `accounts`, `account_memberships`,
  `subscriptions`, `subscription_items`, and `tenants.account_id`. Dormant;
  nothing reads them until batch 4.
- Depends on: nothing unapplied. Batch 4 (`20261007180000`) depends on it.
- Rollback: none for 1.0. `rollback-org-layer-phase0.sql` drops `accounts`
  with cascade and must never run once batch 4 is in.
- Verify (step 0): the snapshot's `20260729180000` sentinel is `present`, and
  `supabase migration list --linked` lists it. Either missing: stop; nothing
  in this packet is pushed until it is explained.

### Original pending inventory: 51 files (batch 0 now applied)

`9e0bd441` held 117 migrations; `w2/release-hardening` added two
(`20261008160000` in batch 4, `20261008161000` in batch 3); waves 2–3 added
14 more (batches 5 and 6). `30dcba1b` holds 133: the 85 applied plus the 48
below. Digest is the first 12 hex characters of SHA-256; every one of the
48 was re-hashed at `30dcba1b` and the 34 older ones are unchanged. Re-hash
before each push and stop on any difference. Wave 4's journey gaps add two
more (`20261009130000`, `20261009131000`) as batch 7, on top: 50 in all.
Wave 5 adds `20261009140000` (the owner-link flag key) to batch 7: 51.
Batch 0 is done, leaving 50 files in batches 1–7 from this inventory.
Batch 7A and w6 files are additional. The readers fix and w6 are listed as
proposed batch 8 (not rehearsed) with digests; 7A still needs its own manifest.

### Before batch 0: a backup you have restored

Done Oct 7 (step 1): dump at `~/.strelva-prod-ops/dumps/2026-10-07`,
restored locally with 146/146 tables matching (2,603 rows).
The Sept 21 record found PITR disabled and no listed backups. The recipe
below is retained for the next fresh backup, not a request to repeat step 1:

```sh
umask 077
pg_dump "$PROD_DATABASE_URL" -Fc -f /private/strelva-backups/pre-1.0-$(date +%F).dump
# restore into a throwaway local cluster; compare row counts of tenants, memberships, workspaces
pg_restore -d "$LOCAL_EMPTY_DB" /private/strelva-backups/pre-1.0-$(date +%F).dump
```

Record size, time and restore duration. Before batch 4, also capture the
grants and constraints that batch 4 changes (see batch 4).

### How to push one batch

```sh
B=0                                   # batch number
DIR=/private/tmp/strelva-release/batch-$B
rm -rf "$DIR" && mkdir -p "$DIR/supabase/migrations"
cp supabase/config.toml "$DIR/supabase/"
# the 85 applied files
ls supabase/migrations | grep -E '^[0-9]{14}_.+\.sql$' \
  | awk '$0 <= "20260921220000~" || $0 ~ /^20260930120000_/' \
  | while read f; do cp "supabase/migrations/$f" "$DIR/supabase/migrations/"; done
# plus every earlier batch's files and this batch's files
for f in 20261005090000_tenant_leads.sql; do cp "supabase/migrations/$f" "$DIR/supabase/migrations/"; done
ls "$DIR/supabase/migrations" | grep -c '^20'          # 85 + files so far
shasum -a 256 "$DIR"/supabase/migrations/202609281* "$DIR"/supabase/migrations/2026100*

npx supabase --workdir "$DIR" link --project-ref zthifbnrtsirdekzzlxs
npx supabase --workdir "$DIR" db push --linked --dry-run                 # batch 0
npx supabase --workdir "$DIR" db push --linked --dry-run --include-all   # batches 1-7
# On the yes: the same command without --dry-run. Then the batch's verify queries.
```

The applied-file filter returns exactly 85 files at `9e0bd441` and at
`30dcba1b` (checked locally). The `--workdir`, `--include-all` and `--dry-run` flags were not run
from this branch; confirm them with `npx supabase db push --help` on the CLI
version used.

**Stop if** the dry run lists any file outside the batch, a digest differs,
or a push waits on a lock longer than 10 seconds (cancel it from the
dashboard; every file is transactional).

After each batch:
- its verify queries (below, all read-only);
- `storefront-parity` compare, 60/60 (section 4);
- `/workspace` still renders and `/api/workspace` still returns 401 signed out;
- 15 minutes with no new 5xx in Vercel logs.

### Batches

| Batch | Files | Touches live objects? | Yes covers |
| --- | --- | --- | --- |
| 0 | `20261005090000` | No | `0.2.1`: leads expire from Redis every day; ship alone, first |
| 1 | `20260928130000`, `20261002120000`, `20261005120000`, `20261005120100`, `20261007140000`, `20261007194000` | No. New tables and new function names only | Business record and additive foundations |
| 2 | `20261001120000`, `20261001130000`, `20261001140000`, `20261004120000`, `20261007100000`, `20261007101000` | Yes: wraps three live functions, adds a column to `domain_claims`, a trigger on `saved_product_work`, RESTRICT FKs to `tenants` | Websites v2 and the Systems spine |
| 3 | `20261007110000`, `20261007120000`, `20261007130000`, `20261007150000`, `20261007150100`, `20261007150200`, `20261007160000`, `20261007160100`, `20261007170000`, `20261007181000`, `20261007183000`, `20261007192000`, `20261008161000` | Yes: column + check on `workspace_invitations`, an AFTER DELETE trigger on `tenants`, replaces `accept_workspace_invitation` | Ownership, Needs you, flags (incl. agency rows), Versions, operator queue, Google bindings, client records |
| 4 | `20261007155000`, `20261007180000`, `20261007182000`, `20261007190000`, `20261007190100`, `20261007190200`, `20261007192100`, `20261008160000` | Yes, the heaviest: non-concurrent index, FK swap that locks `tenants`, revokes, constraint swaps, replaced live functions, small backfills | Each statement reviewed for locks; grants captured first |
| 5 | `20261008110000`, `20261008111000`, `20261008123000`, `20261008124000`, `20261008130000`, `20261008131000`, `20261008140000` | No Sept 30 objects. Triggers on batch 1–2 tables (`systems`, `tenant_workspace_links`), wraps `tenant_unlink_plan`, replaces `workspace_release_flag_names` | Ask history, website change receipts, listing read-back queue, Needs you policy imports, Possibilities, Make real live, lead reads |
| 6 | `20261008141000`, `20261008150000`, `20261008150100`, `20261008151000`, `20261009100000`, `20261009110000`, `20261009113000` | Yes: `btree_gist` extension, a column + FK and an index on live `public_website_bookings`; checks, columns and indexes on `tenant_leads` (written since `0.2.1`); a column + trigger on `owner_decisions`; replaces batch 1–5 functions | Booking store and lifecycle, linked-tenant publishing, domain approvals, connected sites, the Strelva service actor, inquiry records |
| 7 | `20261009130000`, `20261009131000`, `20261009140000` | Yes, small: replaces two batch 3/6 functions (`read_strelva_handled`, `record_strelva_service_action`) with the same signatures, swaps the `purpose` check on `strelva_service_actions` (batch 6, append-only), and replaces `workspace_release_flag_names()` (batch 6) with one more key | Strelva handled lists decided Needs you items; Make real by signed link for an owner with no account, behind its own `make_real_owner_link` flag |
| 8 (proposed; rehearsal fails catalog restore) | `20261009150000` and 83 w6 files (`20261010100000`–`20261010170000`); see "Batch 8 · proposed" | Not classified yet: live-object and lock impact unreviewed | Nothing until rehearsed; listed for review only |

Batches 5 and 6 are in filename order; batch 6 depends on batch 5
(`20261009100000` keeps every flag name `20261008131000` adds;
`20261009113000` replaces functions `20261008140000` creates). Splitting
them puts every change to a live or already-written table in one push.

**Agency amendment (audit H, Oct 7): batches 1–7 are safe as written after
release-safety's rehearsal.** The Strelva-only assumptions are empty tables
or replaceable functions at apply time; none writes agency data until
designation or conversion. Keep these checksum-pinned files unchanged.
This does not authorize a push or prove hosted qualification.

Each batch depends only on earlier batches. The Sept 30 app must keep
working on every batch. `pnpm check:workspace-upgrade` applies the files in
filename order, not in batches. Audit H cites release-safety's restored-copy
batch rehearsal for Gate 2 step 4; integrate its exact results rather than
treating this older filename-order check as equivalent. Preview (section 5)
is the place to qualify the batches against the old app on hosted Postgres 17.

<!-- proposed-batch-8:start -->
### Batch 8 · proposed, rehearsal fails catalog restore: readers fix and w6

Status: **proposed; forward and every companion run, catalog not restored.** Integrated on `a1/integrate-w6-r2`
(#455): the readers fix (#252) and every w6 stream (release-safety, website,
publishing, catalog, bookings, journeys, inquiries, owner-ask,
agency-operator), plus one integration wrapper (`20261010170000`). 84
files. They are listed in `scripts/release-safety/batches.json` under
`proposed`, which `check:release-safety` does not read. Nothing here is
staged, pushed or approved.

- Proven locally: forward replay of every migration in filename order on a
  fresh cluster, `check:workspace-sql` (per-stream forward and rollback
  fixtures) and `check:workspace-upgrade`. Not proven: release-safety's
  forward, reverse, forward with catalog/ACL comparison, the restored Oct 7
  copy, hosted Postgres 17.
- Every companion is now `rollback-<forward-file>` (release-safety's and
  #527's contract); the shared owner-link companion is split per file.
- Applies after batch 7A. Round 3 made two w6 files 7A-aware: owner decision
  link sessions (`20261010102000`) are served and rechecked through the
  verified agency of record like every other service session, and
  `system_actor_scope` (`20261010163100`) keeps 7A's provider-seat read.
  Their companions restore 7A's bodies byte-for-byte so 7A's own rollback
  guards still match.
- Release flag names (#253): every w6 file now appends or removes only its own
  keys in `workspace_release_flag_names()`, so apply order cannot drop a
  stream's flag. `tests/release-flag-names-final-schema.sql` pins the final
  union (19 keys).
- **Ordering.** 7A applies before this batch (packet order); two files now
  depend on 7A objects. `20261009150000` (readers fix) is dated inside 7A's
  window but has no 7A dependency.
- Rehearsal, Oct 7 local (`pnpm check:release-safety:batch8`, opt-in): after
  baseline, batches 0–7 and 7A, all 84 files apply and all 84 companions run
  in reverse (one defect fixed: `rollback-20261010135955_booking_exit_admission.sql`
  restored `booking_tenant` with three columns for a four-column type). The
  catalog is **not** restored: 20 tables, 168 columns, 6 indexes, 6 triggers,
  60 functions and 111 constraints remain, because the w6 companions keep
  evidence tables and entry points in place instead of archiving them the way
  batches 0–7 do. Batch 8 cannot join `batches` until each companion either
  archives and drops (release-safety's contract) or the rehearsal accepts a
  named retained-object list.
- Who says yes: Jacob, per file set, after release-safety supplies rehearsal
  evidence. This entry authorizes nothing.

| Forward file | SHA-256 (12) | Rollback companion |
| --- | --- | --- |
| `20261009150000_reader_rpc_volatility` | `e0bb71275ff5` | `rollback-20261009150000_reader_rpc_volatility.sql` |
| `20261010100000_owner_invitation_claim` | `f9f5d643cc0d` | `rollback-20261010100000_owner_invitation_claim.sql` |
| `20261010102000_owner_decision_links` | `5b6a58caea0e` | `rollback-20261010102000_owner_decision_links.sql` |
| `20261010102100_website_owner_link_launch` | `f6b16719de69` | `rollback-20261010102100_website_owner_link_launch.sql` |
| `20261010103000_ask_business_fact_drafts` | `f50ff99f752a` | `rollback-20261010103000_ask_business_fact_drafts.sql` |
| `20261010104000_owner_decision_website_preview` | `4836bf12d65c` | `rollback-20261010104000_owner_decision_website_preview.sql` |
| `20261010110000_website_cutover_undo` | `2eed390b2abe` | `rollback-20261010110000_website_cutover_undo.sql` |
| `20261010113000_website_system_releases` | `ce3aaa959b1a` | `rollback-20261010113000_website_system_releases.sql` |
| `20261010114000_website_domain_requests` | `ce75612d024e` | `rollback-20261010114000_website_domain_requests.sql` |
| `20261010115000_website_model_admission` | `148126b01ce2` | `rollback-20261010115000_website_model_admission.sql` |
| `20261010115500_website_business_facts` | `65e60c5b1aff` | `rollback-20261010115500_website_business_facts.sql` |
| `20261010115700_website_native_fact_reviews` | `39c0e5f10e4b` | `rollback-20261010115700_website_native_fact_reviews.sql` |
| `20261010120000_inquiry_workspace_replies` | `0e8449ac0d69` | `rollback-20261010120000_inquiry_workspace_replies.sql` |
| `20261010121000_inquiry_outcome_proof` | `f37be23868c6` | `rollback-20261010121000_inquiry_outcome_proof.sql` |
| `20261010122000_inquiry_weekly_outcomes` | `d5313e628fe9` | `rollback-20261010122000_inquiry_weekly_outcomes.sql` |
| `20261010123000_inquiry_context_notices` | `49b20de70665` | `rollback-20261010123000_inquiry_context_notices.sql` |
| `20261010124000_connected_inquiry_records` | `25030cff72a2` | `rollback-20261010124000_connected_inquiry_records.sql` |
| `20261010125000_inquiry_urgent_decisions` | `a0f1d7fe3007` | `rollback-20261010125000_inquiry_urgent_decisions.sql` |
| `20261010125500_inquiry_inbox` | `eb9e8b5aa5e4` | `rollback-20261010125500_inquiry_inbox.sql` |
| `20261010125600_inquiry_reply_purpose` | `b19132d4aac4` | `rollback-20261010125600_inquiry_reply_purpose.sql` |
| `20261010125700_inquiry_cache_presence` | `a53475a1e250` | `rollback-20261010125700_inquiry_cache_presence.sql` |
| `20261010125800_connected_inquiry_owner_notices` | `95cd063a1774` | `rollback-20261010125800_connected_inquiry_owner_notices.sql` |
| `20261010125900_inquiry_export_before_teardown` | `b85199f551f9` | `rollback-20261010125900_inquiry_export_before_teardown.sql` |
| `20261010125910_inquiry_decision_notice_claims` | `b6191189be01` | `rollback-20261010125910_inquiry_decision_notice_claims.sql` |
| `20261010125915_inquiry_decision_notice_events` | `2cda63da9816` | `rollback-20261010125915_inquiry_decision_notice_events.sql` |
| `20261010125920_tenant_lead_parity_completeness` | `593249eed7ff` | `rollback-20261010125920_tenant_lead_parity_completeness.sql` |
| `20261010125925_inquiry_member_replies` | `31a4c93da1d2` | `rollback-20261010125925_inquiry_member_replies.sql` |
| `20261010125930_inquiry_business_facts` | `853eb686c467` | `rollback-20261010125930_inquiry_business_facts.sql` |
| `20261010125935_inquiry_operator_authority` | `b6f229cd3b57` | `rollback-20261010125935_inquiry_operator_authority.sql` |
| `20261010125940_inquiry_booking_handoff` | `020a462a3978` | `rollback-20261010125940_inquiry_booking_handoff.sql` |
| `20261010125950_inquiry_operator_review` | `d5b7c466cb42` | `rollback-20261010125950_inquiry_operator_review.sql` |
| `20261010125955_inquiry_operator_revocation` | `8971490463a2` | `rollback-20261010125955_inquiry_operator_revocation.sql` |
| `20261010130000_booking_parity` | `cb9400eeded0` | `rollback-20261010130000_booking_parity.sql` |
| `20261010131000_booking_access` | `71ef42374f28` | `rollback-20261010131000_booking_access.sql` |
| `20261010132000_booking_updates` | `2054f7b5fc9f` | `rollback-20261010132000_booking_updates.sql` |
| `20261010133000_booking_calendar_mirror` | `bb78a005b074` | `rollback-20261010133000_booking_calendar_mirror.sql` |
| `20261010134000_booking_inquiry_offers` | `90cc6a1262a9` | `rollback-20261010134000_booking_inquiry_offers.sql` |
| `20261010135000_booking_setup` | `fbcd556ca5db` | `rollback-20261010135000_booking_setup.sql` |
| `20261010135500_booking_receipt_history` | `6d56df538a38` | `rollback-20261010135500_booking_receipt_history.sql` |
| `20261010135900_booking_receipt_lifecycle` | `2e55ddbe80e6` | `rollback-20261010135900_booking_receipt_lifecycle.sql` |
| `20261010135910_booking_owner_evidence` | `938e6aff021e` | `rollback-20261010135910_booking_owner_evidence.sql` |
| `20261010135920_booking_service_policies` | `7091ca705254` | `rollback-20261010135920_booking_service_policies.sql` |
| `20261010135940_booking_manual` | `6c24b3ca00d7` | `rollback-20261010135940_booking_manual.sql` |
| `20261010135945_booking_cancellation_cutoff` | `0268b1d85954` | `rollback-20261010135945_booking_cancellation_cutoff.sql` |
| `20261010135950_booking_calendar_health` | `98538318b1e4` | `rollback-20261010135950_booking_calendar_health.sql` |
| `20261010135955_booking_exit_admission` | `93a5c4e699d2` | `rollback-20261010135955_booking_exit_admission.sql` |
| `20261010135956_booking_native_workspace` | `d0fdaf3d4d09` | `rollback-20261010135956_booking_native_workspace.sql` |
| `20261010140000_google_listing_controls` | `bd73bdd48b95` | `rollback-20261010140000_google_listing_controls.sql` |
| `20261010141000_publishing_release_flags` | `282390f4bba5` | `rollback-20261010141000_publishing_release_flags.sql` |
| `20261010142000_workspace_publishing_content` | `a18b7644362e` | `rollback-20261010142000_workspace_publishing_content.sql` |
| `20261010143000_publishing_reconnect` | `d8173afa1b76` | `rollback-20261010143000_publishing_reconnect.sql` |
| `20261010150000_internal_tool_submit_notices` | `110c2d595560` | `rollback-20261010150000_internal_tool_submit_notices.sql` |
| `20261010150100_internal_tool_use_links` | `cacee35a11ef` | `rollback-20261010150100_internal_tool_use_links.sql` |
| `20261010150200_internal_tool_notice_delivery` | `d654c2e51b0d` | `rollback-20261010150200_internal_tool_notice_delivery.sql` |
| `20261010150300_catalog_tool_evidence` | `d427152e9159` | `rollback-20261010150300_catalog_tool_evidence.sql` |
| `20261010150400_internal_tool_use_edits` | `174d7aa326b4` | `rollback-20261010150400_internal_tool_use_edits.sql` |
| `20261010152000_catalog_report_receipts` | `cf902ae50664` | `rollback-20261010152000_catalog_report_receipts.sql` |
| `20261010153000_newsletter_contacts` | `73a4bab72d88` | `rollback-20261010153000_newsletter_contacts.sql` |
| `20261010154000_system_work_plan_authority` | `cccc95d2332f` | `rollback-20261010154000_system_work_plan_authority.sql` |
| `20261010155000_failed_system_plan_request` | `6743c34c637f` | `rollback-20261010155000_failed_system_plan_request.sql` |
| `20261010155100_internal_tool_member_submit` | `06f32d312b7f` | `rollback-20261010155100_internal_tool_member_submit.sql` |
| `20261010155200_internal_tool_use_link_labels` | `431012d2a7d8` | `rollback-20261010155200_internal_tool_use_link_labels.sql` |
| `20261010160000_agency_authoring` | `3030d1e2c9c8` | `rollback-20261010160000_agency_authoring.sql` |
| `20261010161000_operator_google_attempts` | `eb66a4a96832` | `rollback-20261010161000_operator_google_attempts.sql` |
| `20261010161100_operator_effort_context` | `5b0778835065` | `rollback-20261010161100_operator_effort_context.sql` |
| `20261010161200_operator_content_receipts` | `f13556ba7a61` | `rollback-20261010161200_operator_content_receipts.sql` |
| `20261010161300_review_reply_reservations` | `fc52897ad419` | `rollback-20261010161300_review_reply_reservations.sql` |
| `20261010161400_operator_complete_sources` | `cb1ce79c853b` | `rollback-20261010161400_operator_complete_sources.sql` |
| `20261010162000_complete_client_record_stores` | `6cb73a159863` | `rollback-20261010162000_complete_client_record_stores.sql` |
| `20261010162100_tenant_receipt_retention` | `6293e96d9a05` | `rollback-20261010162100_tenant_receipt_retention.sql` |
| `20261010162200_inquiry_delivery_records` | `69215a26babb` | `rollback-20261010162200_inquiry_delivery_records.sql` |
| `20261010163000_agency_operator_overview` | `682461fc3873` | `rollback-20261010163000_agency_operator_overview.sql` |
| `20261010163100_version_management` | `dfc621fe3532` | `rollback-20261010163100_version_management.sql` |
| `20261010163200_version_owner_grants` | `eb4ec7db41ac` | `rollback-20261010163200_version_owner_grants.sql` |
| `20261010163300_version_native_applications` | `69bdaf48f912` | `rollback-20261010163300_version_native_applications.sql` |
| `20261010163400_version_sibling_changes` | `512198a07d3b` | `rollback-20261010163400_version_sibling_changes.sql` |
| `20261010164000_finite_job_adapters` | `f2c7780c61b6` | `rollback-20261010164000_finite_job_adapters.sql` |
| `20261010165000_tenant_business_context` | `8f98460acd6b` | `rollback-20261010165000_tenant_business_context.sql` |
| `20261010165500_business_portability` | `fdb1db1a4ae9` | `rollback-20261010165500_business_portability.sql` |
| `20261010165600_exit_handoff_evidence` | `e28fd6bf9ef9` | `rollback-20261010165600_exit_handoff_evidence.sql` |
| `20261010165700_export_recovery` | `7f0e03212cba` | `rollback-20261010165700_export_recovery.sql` |
| `20261010165800_unbounded_export_archive` | `8bb45a0d6921` | `rollback-20261010165800_unbounded_export_archive.sql` |
| `20261010165900_export_build_access` | `e2dd7c05fc27` | `rollback-20261010165900_export_build_access.sql` |
| `20261010170000_deprovision_retained_after_inquiry_export` | `172e31fd9858` | `rollback-20261010170000_deprovision_retained_after_inquiry_export.sql` |

<!-- proposed-batch-8:end -->

### Step 6a · Batch 7A, before w6

[Step issue #350](https://github.com/Strelva/Strelva-OFFICIAL/issues/350).

- What: amend provider choice, maker/launch authority, the platform service
  actor, payer choice, agency verification schema and the STABLE readers
  identified by audit H (RL-02–06 and RL-12). Add new migrations; never
  rewrite batches 0–7.
- Command/approach: date 7A files `2026100915xxxx`, after
  `20261009140000` and before w6's `20261010*`. Integrate the final 7A
  manifest and rollback companions into release-safety's harness. Rehearse
  forward, reverse, forward on the restored Oct 7 copy, then rebase and
  rehearse w6 on top. Use the batch-directory recipe above with the exact
  manifest: `npx supabase --workdir "$DIR" db push --linked --dry-run --include-all`,
  then the same command without `--dry-run` on its own yes. A manifest or
  companion that has not landed is a blocker, not an instruction to guess files.
- Verify: matching pinned digests; dry run contains only 7A; forward,
  reverse, forward results recorded; designation has zero rows (or the
  retired table is absent); no automatic provider or operator-admin grant;
  explicit provider choice and all-business service actor pass locally;
  each effect stays off for an unverified agency. Run the section 1
  after-batch checks, including storefront 60/60, on the approved apply.
- Rollback: keep new flags off; use only 7A's rehearsed reverse companions,
  in reverse dependency order. If w6 is already applied, reverse its
  dependents first. After agency data exists, freeze effects and prepare a
  data-preserving recovery instead of blindly reversing schema.
- Who says yes: Jacob for the exact production batch and any rollback,
  after release-safety supplies the rehearsal evidence. Step 6a alone does
  not resolve decision #234 or authorize conversions.

### Per migration

"Depends on" lists unapplied migrations only. Every new table has RLS on and
grants revoked; every new function is service-role only unless noted.

#### Batch 0

**`20261005090000_tenant_leads`** · `4937430fc217`
- Changes: new `tenant_leads` (FK `tenants(stable_id)` on delete cascade);
  `tenant_lead_workspace`, `record_tenant_lead`, `read_tenant_leads`,
  `tenant_leads_attach_workspace`. A DO block adds trigger
  `tenant_workspace_links_attach_leads` only if that table exists (batch 1 adds it).
- Depends on: none.
- Rollback: drop the four functions, `drop table public.tenant_leads`. Loses
  leads written since; Redis still holds the last 90 days.
- Verify: `select to_regclass('public.tenant_leads'), has_table_privilege('anon','public.tenant_leads','select');` → `tenant_leads, f`

#### Batch 1

**`20260928130000_business_effort_minutes`** · `98a629ae8ab0` · out of order
- Changes: `business_effort_entries`, `business_effort_voids` (append-only);
  7 functions incl. `record_business_effort`, `read_effort_businesses`.
- Depends on: none.
- Rollback: drop the functions and both tables. Loses logged minutes.
- Verify: `select to_regclass('public.business_effort_entries'), to_regclass('public.business_effort_voids');`

**`20261002120000_business_record`** · `36fffb74a5c2`
- Changes: `business_records`, `business_record_facts`, `business_services`,
  `business_people`, `business_contacts`, `business_record_revisions`,
  `tenant_workspace_links`, `tenant_workspace_unlinks`; 30 functions incl.
  `convert_tenant_to_business`, `preview_tenant_unlink`,
  `unlink_tenant_from_business`, `resolve_business_owner_recipient`. Creates
  `tenant_workspace_links_attach_leads` because batch 0 is in.
- Depends on: none hard (`tenant_leads`, `systems` only through `to_regclass`).
- Rollback: roll back batches 3–4 first; drop the functions; drop tables
  children first (unlinks, links, revisions, contacts, people, services, facts, records).
- Verify: `select to_regclass('public.business_records'), to_regclass('public.tenant_workspace_links'), (select count(*) from pg_trigger where tgname='tenant_workspace_links_attach_leads');` → `…, …, 1`

**`20261005120000_workspace_authority_helpers`** · `064946b96ce4`
- Changes: new `workspace_role_allows(text,text)`, `workspace_require(uuid,uuid,text)`. `lock_timeout 3s`.
- Rollback: drop both (after the next file).
- Verify: `select to_regprocedure('public.workspace_require(uuid,uuid,text)') is not null;`

**`20261005120100_workspace_authority_write_rpcs`** · `deede275f8a0`
- Changes: 8 new write RPCs: `save_workspace_calendar_connection`,
  `revoke_workspace_calendar_connection`, `mark_workspace_calendar_connection_error`,
  `save_workspace_calendar_event_receipt`, `revoke_workspace_delegation`,
  `revoke_workspace_handoff`, `create_workspace_handoff`, `save_workspace_work`.
- Depends on: `20261005120000`.
- Rollback: drop the 8.
- Verify: `select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('save_workspace_calendar_connection','revoke_workspace_calendar_connection','mark_workspace_calendar_connection_error','save_workspace_calendar_event_receipt','revoke_workspace_delegation','revoke_workspace_handoff','create_workspace_handoff','save_workspace_work');` → `8`

**`20261007140000_model_call_log`** · `e2dc485a78da`
- Changes: `model_call_log`; `record_model_calls`, `summarize_model_call_costs`.
- Rollback: drop both functions and the table. Loses the cost log.
- Verify: `select to_regclass('public.model_call_log');`

**`20261007194000_tenant_report_and_analytics_state`** · `7b014b307346`
- Changes: `tenant_report_state`, `tenant_analytics_config` (FK `tenants(stable_id)`);
  5 functions. No SQL backfill (S2 copies Redis).
- Rollback: drop the functions and both tables. Redis keys are never removed.
- Verify: `select to_regclass('public.tenant_report_state'), to_regclass('public.tenant_analytics_config');`

#### Batch 2

**`20261001120000_website_documents`** · `d8ac38ab2e1d`
- Changes: `website_documents`, `website_document_heads`,
  `website_document_publications`, `website_document_receipts`,
  `website_document_health`, `website_hosted_tenant_reservations`,
  `website_crawl_pages`; 19 functions. FKs to `tenants` are ON DELETE RESTRICT,
  so the old deprovision path can't delete a published or reserved tenant
  (`20261007100000` adds the new one).
- Replaces live functions: rewrites `update_bounded_product_work` by text
  replace on `pg_get_functiondef` and raises
  `website_bounded_version_upgrade_missing` if production's text differs;
  renames `accept_workspace_handoff` and `export_workspace_snapshot` to
  `*_pre_website_documents` and installs wrappers.
- Pre-check (read-only): `select md5(pg_get_functiondef('public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb)'::regprocedure));`
  equals the same query on a local database migrated to `20260930120000`.
- Rollback: drop the new functions; drop both wrappers, rename the
  `*_pre_website_documents` functions back and re-grant execute to
  service_role; re-run the `update_bounded_product_work` block from
  `20260920120000_websites.sql`; drop the 7 tables (crawl pages,
  reservations, health, receipts, publications, heads, documents).
- Verify: `select to_regclass('public.website_documents'), to_regprocedure('public.accept_workspace_handoff_pre_website_documents(text,uuid,text,uuid,text,boolean)') is not null;`

**`20261001130000_domain_registration_attempt`** · `cb22976e2bfc`
- Changes: `domain_claims` gains `registration_attempt text check (…)`.
  ACCESS EXCLUSIVE with a short scan, no `lock_timeout`. The table is small.
- Rollback: `alter table public.domain_claims drop column registration_attempt;`
- Verify: `select count(*) from information_schema.columns where table_name='domain_claims' and column_name='registration_attempt';` → `1`

**`20261001140000_agency_website_document_drafts`** · `30edc0cbb56e`
- Changes: 4 functions incl. `commit_agency_website_document_candidate`.
- Depends on: `20261001120000`.
- Rollback: drop the 4.
- Verify: `select to_regprocedure('public.read_agency_website_document_candidate(uuid,text,uuid,uuid,text,boolean)') is not null;`

**`20261004120000_systems`** · `544b495774f8`
- Changes: `systems`, `system_revisions`, `system_outputs`,
  `system_connections`; 29 functions; trigger
  `saved_product_work_schedule_pause_follows` AFTER UPDATE OF payload on live
  `saved_product_work` (it only writes `systems`).
- Depends on: `20261002120000`, `20261001120000`.
- Rollback: drop the trigger and functions; drop connections, outputs, the
  deferrable `systems_current_revision_fk`, revisions, systems.
- Verify: `select to_regclass('public.systems'), (select count(*) from pg_trigger where tgname='saved_product_work_schedule_pause_follows');` → `systems, 1`

**`20261007100000_atomic_tenant_teardown`** · `b406f6154f9f`
- Changes: `tenant_teardown_tables`, `tenant_teardown_blockers`,
  `deprovision_tenant_rows` (deletes ~40 tenant tables when called; nothing at apply).
- Depends on: `20261001120000`.
- Rollback: drop the 3.
- Verify: `select has_function_privilege('anon','public.deprovision_tenant_rows(text)','execute');` → `f`

**`20261007101000_provider_website_launch_authority`** · `803165889573`
- Changes: `website_document_launch_authority`; replaces
  `reserve_website_hosted_tenant` and `publish_website_document` (both from
  `20261001120000`, so nothing live changes).
- Rollback: restore both from `20261001120000`, drop the new function.
- Verify: `select to_regprocedure('public.website_document_launch_authority(uuid,uuid,uuid)') is not null;`

#### Batch 3

**`20261007110000_business_ownership`** · `d3d4a078a8eb`
- Changes: `strelva_agency_workspace`, `workspace_providers`,
  `tenant_lead_purges`. Live tables: `workspace_invitations` gains
  `issued_by_kind text not null default 'owner'` and check
  `workspace_invitations_operator_issues_owner_only` (ACCESS EXCLUSIVE + scan);
  trigger `tenants_retain_leads` AFTER DELETE on `tenants`, so deleting a tenant
  now keeps its leads. `tenant_leads` loses its tenant FK and gains retention
  columns and `tenant_leads_retain_until_idx` (scans the backfilled table).
- Replaces live `accept_workspace_invitation(text,uuid,text)` (from
  `20260918130000`), plus `tenant_unlink_plan` and `read_tenant_leads` from
  earlier batches.
- Depends on: `20261002120000`, `20261004120000`, `20261005090000`.
- Rollback: restore `accept_workspace_invitation` from
  `20260918130000_workspace_invitations.sql` and the other two from their
  files; drop the triggers and three tables; drop the invitations check and
  column. Re-adding the `tenant_leads` FK fails once a tenant with leads has
  been deleted, so that part is one-way.
- Verify: `select (select count(*) from information_schema.columns where table_name='workspace_invitations' and column_name='issued_by_kind'), (select count(*) from pg_trigger where tgname='tenants_retain_leads');` → `1, 1`

**`20261007120000_needs_you`** · `37c431ebe8ff`
- Changes: `decision_policies`, `decision_policy_history`, `owner_decisions`,
  `owner_decision_deliveries`; 27 functions incl. `read_strelva_handled`.
- Depends on: `20261002120000`, `20261004120000`, `20261001120000`.
- Rollback: drop functions; drop deliveries, decisions, history, policies.
- Verify: `select to_regclass('public.owner_decisions'), to_regclass('public.decision_policies');`

**`20261007130000_workspace_release_flags`** · `f1c9a474ae30`
- Changes: `workspace_release_flags`, `workspace_release_testers`,
  `workspace_release_flag_changes`; 10 functions incl.
  `resolve_tenant_owner_entry`. `lock_timeout 3s`.
- Depends on: `20261002120000`.
- Rollback: drop functions and the three tables.
- Verify: `select to_regclass('public.workspace_release_flags'), has_table_privilege('anon','public.workspace_release_flags','select');` → `…, f`

**`20261007150000_system_versions`** · `16138552215b`
- Changes: 9 `system_version*` tables; 27 functions.
- Depends on: `20261004120000`, `20261002120000`.
- Rollback: roll back `20261007150100` first; drop functions; drop tables children first.
- Verify: `select count(*) from pg_class where relkind='r' and relnamespace='public'::regnamespace and relname like 'system_version%';` → `9`

**`20261007150100_agency_client_overview`** · `90bb850b69e2`
- Changes: 4 functions; only `agency_client_overview` is granted.
- Depends on: `20261004120000`, `20261007150000`, `20261001120000` (runtime).
- Rollback: drop the 4.
- Verify: `select has_function_privilege('anon','public.agency_client_overview(uuid,uuid,text,uuid,integer)','execute');` → `f`

**`20261007150200_platform_agency_workspace`** · `dbfef968b7fa`
- Changes: `platform_workspaces`; `read_platform_workspace`,
  `set_platform_workspace`; an AFTER INSERT trigger on
  `strelva_agency_workspace` mirrors the designation; copies one if present
  (expected none; S5 is retired and must not be run).
- Depends on: `20261007110000` (hard).
- Rollback: drop the trigger, functions and table.
- Verify: `select to_regclass('public.platform_workspaces'), (select count(*) from pg_trigger where tgname='strelva_agency_workspace_sync_platform');` → `…, 1`

**`20261007160000_operator_queue`** · `f68763473e3d`
- Changes: `operator_queue_marks`, `operator_queue_mark_events`,
  `outside_write_receipts` (append-only); 8 functions.
- Rollback: drop the functions and three tables. Loses receipts.
- Verify: `select to_regclass('public.operator_queue_marks'), to_regclass('public.outside_write_receipts');`

**`20261007160100_business_effort_tenant_links`** · `ce4114ca74e2`
- Changes: replaces `read_effort_businesses` (from batch 1) to include tenant links.
- Rollback: restore it from `20260928130000_business_effort_minutes.sql`.
- Verify: `select position('tenant_workspace_links' in prosrc) > 0 from pg_proc where proname='read_effort_businesses';` → `t`

**`20261007170000_workspace_account_bindings`** · `27f045a496eb`
- Changes: `workspace_account_bindings` (a check refuses plaintext tokens),
  `workspace_google_locations`, `google_listing_receipts`
  (`on delete set null (binding_id)` needs Postgres 15+; production is 17.6);
  ~14 functions; replaces `system_origin_kinds()` from batch 2.
- Depends on: `20261002120000` (hard), `20261004120000`.
- Rollback: drop the functions and three tables; restore `system_origin_kinds()`
  from `20261004120000`. Copied grants are lost; Redis stays the source.
- Verify: `select to_regclass('public.workspace_account_bindings'), public.system_origin_kinds() @> array['google_location'];` → `…, t`

**`20261007181000_tenant_client_records`** · `3aed57fe6984`
- Changes: `tenant_client_records`, `tenant_client_record_parity`; 8
  functions; insert and delete triggers on `tenant_workspace_links`.
- Depends on: `20261002120000` (hard).
- Rollback: drop triggers, functions, both tables. Redis stays the authority.
- Verify: `select to_regclass('public.tenant_client_records'), (select count(*) from pg_trigger where tgname like 'tenant_workspace_links_client_records%');` → `…, 2`

**`20261007183000_business_outcomes`** · `719e167fa123`
- Changes: read-only `business_outcome_month(uuid,uuid,text,date)`.
- Rollback: drop it.
- Verify: `select to_regprocedure('public.business_outcome_month(uuid,uuid,text,date)') is not null;`

**`20261007192000_make_systems_authority`** · `662552f6b784`
- Changes: replaces `workspace_role_allows` and `save_workspace_work` (both
  batch 1); adds `workspace_make_systems_authority`,
  `workspace_require_make_systems`, `save_system_work`. `lock_timeout 3s`.
- Rollback: restore both from `20261005120000`/`20261005120100`; drop the three.
- Verify: `select public.workspace_role_allows('owner','make_systems');` → `f`

**`20261008161000_release_flags_agency_workspaces`** · `35f78a9c041a` · new on `w2/release-hardening`
- Changes: replaces `workspace_release_assert_workspace` (from
  `20261007130000`, same signature, still callable by nobody) to accept
  agency workspaces as well as business ones. Personal workspaces stay
  refused. `lock_timeout 3s`; no table changes.
- Depends on: `20261007130000`.
- Rollback: re-run that function's body from `20261007130000` (`kind = 'customer'`).
  Rows already set on agency workspaces stay readable but can't change.
- Verify: `select position('agency' in prosrc) > 0 from pg_proc where proname='workspace_release_assert_workspace';` → `t`

#### Batch 4

Before the push, save to a private file:

```sql
select relname, relacl from pg_class where relname in ('accounts','account_memberships','subscriptions','subscription_items');
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.workspace_export_receipts'::regclass;
select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'subscription_items_tenant_id_fkey';
select count(*) from public.saved_product_work;
```

Push at the quietest hour. Most of these files have no `lock_timeout`.

**`20261007155000_make_real_activations`** · `67d26b31d9a1`
- Changes: non-concurrent partial unique index
  `saved_product_work_make_real_activation_idx` on live `saved_product_work`
  (blocks its writes while it builds) and a BEFORE INSERT OR UPDATE guard
  trigger; 9 functions.
- Rollback: drop the trigger, index and functions. Activation rows written since stay.
- Verify: `select to_regclass('public.saved_product_work_make_real_activation_idx'), (select count(*) from pg_trigger where tgname='saved_product_work_make_real_activation_guard_trg');` → `…, 1`

**`20261007180000_business_billing`** · `81fc82cf33a4`
- Changes: 9 columns on `accounts` (incl. `workspace_id uuid unique`) and
  check `accounts_workspace_billing_state`; drops and re-adds
  `subscription_items_tenant_id_fkey` with on update/delete cascade (validates,
  and takes SHARE ROW EXCLUSIVE on **`tenants`**); revokes all on `accounts`,
  `account_memberships`, `subscriptions`, `subscription_items` from
  public/anon/authenticated; triggers on `tenant_workspace_links` that write
  `accounts`, `subscriptions`, `subscription_items` and `tenants.account_id`
  at each conversion and unlink.
- Depends on: `20261002120000` (hard).
- Rollback: drop the triggers and functions; drop the check and 9 columns;
  re-add the FK as in `20260729180000` (`references tenants(id) on delete cascade`);
  re-grant from the capture. Rows made by conversions need a manual cleanup.
  Never run `rollback-org-layer-phase0.sql` for this; it drops `accounts` with cascade.
- Verify: `select (select count(*) from information_schema.columns where table_name='accounts' and column_name in ('workspace_id','billing_type')), has_table_privilege('authenticated','public.accounts','select');` → `2, f`

**`20261007182000_workspace_export_v3`** · `94fff56f7d3e`
- Changes: loosens `workspace_export_receipts_schema_version_check` (adds 3)
  and `…_byte_size_check` (no 2 MB cap for v3); `workspace_export_builds`,
  `workspace_export_build_parts`; 10 functions. v2 `export_workspace_snapshot`
  is untouched.
- Rollback: drop functions and tables; `delete from workspace_export_receipts where schema_version=3`; re-add the old checks from the capture.
- Verify: `select pg_get_constraintdef(oid) from pg_constraint where conname='workspace_export_receipts_schema_version_check';` includes `3`

**`20261007190000_document_revisions`** · `7dc1a0a222da`
- Changes: `document_revisions` (append-only); replaces live
  `update_document_work` (from `20260911210000`); backfills history from
  `saved_product_work` (0 rows on Sept 30).
- Rollback: restore `update_document_work` from `20260911210000_document_work.sql`; drop the table.
- Verify: `select to_regclass('public.document_revisions');`

**`20261007190100_onboarding_revisions`** · `87e87f78b94d`
- Changes: `onboarding_revisions`; replaces live `update_onboarding_work`
  (from `20260920020000`); backfill (0 rows on Sept 30).
- Rollback: restore from `20260920020000_onboarding_work.sql`; drop the table.
- Verify: `select to_regclass('public.onboarding_revisions');`

**`20261007190200_application_version_history`** · `fd6441960c4b`
- Changes: `application_candidate_versions`; triggers on live
  `application_states` and `saved_product_work` trim histories to 50;
  `application_guard_release_history()` becomes a no-op (from
  `20260914021000`); replaces `publish_application_candidate` (from
  `20260914020000`); backfill (0 workspaces on Sept 30).
- Rollback: drop the triggers; restore both functions from their files; copy, then drop the archive table.
- Verify: `select count(*) from pg_trigger where tgname in ('application_states_candidate_version_window_trg','saved_product_work_application_window_trg');` → `2`

**`20261007192100_internal_tool_links`** · `5a070e27938a`
- Changes: replaces live `validate_application_spec` and
  `validate_application_record` (from `20260920010000`) and
  `business_contact_sources()`; swaps two checks on batch-1 tables; trigger
  `application_records_links_guard_trg` on live `application_records`;
  `internal_tool_notices`; 4 functions. `lock_timeout 3s`.
- Rollback: drop the trigger, table and functions; restore the validators
  from `20260920010000_application_date_fields.sql` and
  `business_contact_sources` from `20261002120000`; re-add the old checks
  (fails if new values are in use).
- Verify: `select to_regclass('public.internal_tool_notices'), 'newsletter' = any(public.business_contact_sources());` → `…, t`

**`20261008160000_convert_separate_business`** · `d28b0eb4086d` · new on `w2/release-hardening`
- Changes: replaces `convert_tenant_to_business` (same signature and grants)
  to accept `separateBusiness: true` (refused with `targetWorkspaceId` or any
  other value; the receipt records it), and `business_billing_on_link` so a
  separate business is billed by its own line item, not the account bundle.
  No table locks; `lock_timeout 3s`.
- Depends on: `20261002120000`, `20261007180000`.
- Rollback: re-run both function bodies from those files.
- Verify: `select proname, position('separateBusiness' in prosrc) > 0 from pg_proc where proname in ('convert_tenant_to_business','business_billing_on_link');` → both `t`

**After batch 4:** `select count(*) from supabase_migrations.schema_migrations where version >= '20260928130000';` → `34`

#### Batch 5

Every file is additive. Nothing here touches a Sept 30 table or function.

**`20261008110000_ask_conversations`** · `daa05fc3df79`
- Changes: `ask_conversations`, `ask_messages`; `append_ask_message`,
  `list_ask_conversations`, `read_ask_conversation`, `ask_history_actor_role`.
  `lock_timeout 3s`.
- Depends on: none unapplied (`workspaces`, `users` only).
- Rollback: drop the 4 functions, then `ask_messages`, `ask_conversations`. Loses Ask history.
- Verify: `select to_regclass('public.ask_conversations'), to_regclass('public.ask_messages'), has_table_privilege('authenticated','public.ask_messages','select');` → `…, …, f`

**`20261008111000_website_change_receipts`** · `76383b48111a`
- Changes: append-only `website_change_receipts` (FK to live
  `service_requests`, no change to it); `record_website_change_receipt`,
  `list_website_change_requests`, `website_change_actor_role`. `lock_timeout 3s`.
- Depends on: none unapplied.
- Rollback: drop the 3 functions and the table. Loses receipts.
- Verify: `select to_regclass('public.website_change_receipts');`

**`20261008123000_listing_readback_queue`** · `1566ab25d9e5`
- Changes: read-only `read_google_listing_readback_failures` for `/admin/queue`.
- Depends on: `20261007160000` (`operator_queue_assert_operator`),
  `20261007170000` (`google_listing_receipts`).
- Rollback: drop it.
- Verify: `select count(*) from pg_proc where proname='read_google_listing_readback_failures';` → `1`

**`20261008124000_needs_you_policy_settings`** · `d377b485506f`
- Changes: immutable `decision_policy_tenant_imports` (one receipt per
  tenant and kind, written by S11); `needs_you_tenant_link`,
  `read_tenant_decision_routes`, `set_tenant_decision_route`,
  `list_owner_decisions_not_told`, `list_decision_policy_businesses`. Replaces nothing.
- Depends on: `20261007120000` (`decision_policies`, `owner_decisions`),
  `20261002120000` (`tenant_workspace_links`).
- Rollback: drop the functions, trigger and table. Once S11 has run, the
  moved kinds' authority falls back to Redis (`reb:content-autonomy`,
  `reb:reply-voice`), which S11 never changes.
- Verify: `select to_regclass('public.decision_policy_tenant_imports'), (select count(*) from pg_trigger where tgname='decision_policy_tenant_imports_immutable');` → `…, 1`

**`20261008130000_system_possibilities`** · `47c86d063608`
- Changes: `system_possibilities`, `system_possibility_pins`,
  append-only `system_possibility_events`, immutable
  `system_revision_contents`; 23 functions (the new `tenant_unlink_plan`
  among them) incl. `save_system_possibility`,
  `adopt_converted_tenant_systems`, `pause_tenant_systems`. Triggers
  `systems_possibilities_follow_revision` (after update of
  `current_revision_id` on `systems`) and `tenant_workspace_links_adopt_systems`
  (after insert on `tenant_workspace_links`, so each conversion from now on
  adopts its site as a live System at revision 1). Renames
  `tenant_unlink_plan(uuid)` (from `20261007110000`) to
  `tenant_unlink_plan_before_systems` and wraps it. No backfill: a link
  made before this batch adopts nothing. Production has no links before
  step 12, so none is needed.
- Depends on: `20261004120000`, `20261002120000`, `20261007110000`, `20261007120000`.
- Rollback: drop both triggers and the 23 functions (the wrapper
  included), rename `tenant_unlink_plan_before_systems` back and
  re-grant execute to service_role; drop events, pins, possibilities,
  revision contents. Adopted `systems` rows stay (they are ordinary Systems).
- Verify: `select to_regclass('public.system_possibilities'), to_regprocedure('public.tenant_unlink_plan_before_systems(uuid)') is not null, (select count(*) from pg_trigger where tgname in ('systems_possibilities_follow_revision','tenant_workspace_links_adopt_systems'));` → `…, t, 2`

**`20261008131000_make_real_live`** · `d8dfd70362db`
- Changes: replaces `workspace_release_flag_names()` (from `20261007130000`)
  to add five `make_real_live:<channel>` keys; adds
  `due_make_real_activations`, `read_ready_system_possibilities`.
- Depends on: `20261007130000`, `20261008130000` (hard: `system_possibilities`).
- Rollback: restore `workspace_release_flag_names()` from `20261007130000`
  (rows already set on the new keys stay readable, can't change); drop the two.
- Verify: `select 'make_real_live:booking_page' = any(public.workspace_release_flag_names());` → `t`

**`20261008140000_tenant_lead_reads`** · `5cdabdf1ca0b`
- Changes: `read_tenant_lead`, `read_tenant_lead_digests` over `tenant_leads`
  (the `STRELVA_LEADS_READ` switch and its parity check).
- Depends on: `20261005090000`.
- Rollback: drop both (after rolling back `20261009113000`, which replaces them).
- Verify: `select count(*) from pg_proc where proname in ('read_tenant_lead','read_tenant_lead_digests');` → `2`

**After batch 5:** the same count → `41`

#### Batch 6

Check `btree_gist` is available first (finding 12). Push at the quietest
hour: three files here have no `lock_timeout` and touch tables that are
written today (finding 13).

**`20261008141000_booking_store`** · `6c6a33fe69e3`
- Changes: `create extension if not exists btree_gist`;
  `booking_settings`, `business_bookings` (exclusion constraint
  `business_bookings_one_slot`), immutable `business_booking_history`;
  11 functions incl. `record_tenant_booking`, `read_tenant_bookings`,
  `decide_workspace_booking_request`. Live `public_website_bookings` gains
  nullable `booking_id uuid references business_bookings on delete set null`
  (ACCESS EXCLUSIVE for the catalog change, no rewrite, no `lock_timeout`).
  The legacy `bookings` table is not touched.
- Depends on: `20261002120000` (`business_contacts`, `business_services`,
  `tenant_workspace_links`), `20261004120000` (`systems`).
- Rollback: roll back `20261009110000` first;
  `alter table public.public_website_bookings drop column booking_id;` drop
  the functions and the three tables. Leave the extension. Bookings written
  since stay in the legacy stores (the dual-write never stops them).
- Verify: `select to_regclass('public.business_bookings'), (select count(*) from information_schema.columns where table_name='public_website_bookings' and column_name='booking_id'), (select count(*) from pg_extension where extname='btree_gist');` → `…, 1, 1`

**`20261008150000_website_linked_tenant_publication`** · `b52c753a4d2a`
- Changes: immutable `website_linked_publications`; replaces
  `reserve_website_hosted_tenant` (latest from `20261007101000`) and
  `manage_published_website_tenant` (from `20261001120000`); adds
  `publish_website_document_to_linked_tenant`, `read_website_current_tenant`,
  `read_website_linked_publications`, `website_business_template`. Nothing
  changes at apply; publishing writes `tenants.delivery_model` only when called.
- Depends on: `20261001120000`, `20261002120000`, `20261007101000`.
- Rollback: restore `reserve_website_hosted_tenant` from `20261007101000`
  and `manage_published_website_tenant` from `20261001120000`; drop the new
  functions and table. A tenant already republished keeps
  `delivery_model='platform_template'`; the row records the prior model.
- Verify: `select to_regclass('public.website_linked_publications'), to_regprocedure('public.read_website_current_tenant(uuid,uuid,uuid,text)') is not null;`

**`20261008150100_website_domain_owner_approval`** · `872d95f7907b`
- Changes: immutable `website_domain_approvals`;
  `approve_website_domain_change`, `authorize_website_domain_change`,
  `read_website_domain_approvals`. `manage_published_website_tenant` stays
  owner-only.
- Depends on: `20261001120000`.
- Rollback: drop the functions and table.
- Verify: `select to_regclass('public.website_domain_approvals');`

**`20261008151000_connected_sites`** · `f9d54f4c426a`
- Changes: `connected_sites`, append-only `connected_site_events`; 17 new
  functions. `tenant_leads` and `tenant_client_records` each: `tenant_stable_id`
  drops `NOT NULL`, new `connected_site_id` FK (on delete cascade), a
  one-origin check, the `recorded_via` check swapped to allow
  `connected_site`, a partial unique index. Replaces `system_origin_kinds()`
  (latest from `20261007170000`; keeps every kind, adds `connected_site`).
  No `lock_timeout`.
- Depends on: `20261005090000`, `20261007181000`, `20261004120000`,
  `20261002120000`, `20261007170000`.
- Rollback: roll back `20261009113000` first (its `recorded_via` check names
  `connected_site`); delete rows with `connected_site_id` set; drop the
  indexes, checks and columns; restore both old `recorded_via` checks and
  `NOT NULL` (from `20261005090000` and `20261007181000`); restore
  `system_origin_kinds()` from `20261007170000`; drop the functions and both tables.
- Verify: `select to_regclass('public.connected_sites'), (select count(*) from information_schema.columns where table_name in ('tenant_leads','tenant_client_records') and column_name='connected_site_id'), 'connected_site' = any(public.system_origin_kinds());` → `…, 2, t`

**`20261009100000_strelva_service_actor`** · `2e80eabbbd08`
- Changes: append-only `strelva_service_actions`; `owner_decisions` gains
  `opened_by text` (null or `strelva_system`) and a before-update guard
  trigger; replaces `owner_decision_json` (from `20261007120000`) and
  `workspace_release_flag_names()` (keeps the `20261008131000` keys, adds
  `connected_sites`); adds `strelva_runs_business`, `strelva_service_reader`,
  `strelva_service_session`, `open_owner_decision_as_service`,
  `record_strelva_service_action`, `due_make_real_activations_for_service`.
  `lock_timeout 3s`.
- Depends on: `20261007120000`, `20261007110000`, `20261007130000`,
  `20261002120000`, `20261008131000`.
- Rollback: restore `owner_decision_json` from `20261007120000` and
  `workspace_release_flag_names()` from `20261008131000`; drop the trigger,
  `owner_decisions.opened_by`, the new functions and the table.
- Verify: `select to_regclass('public.strelva_service_actions'), (select count(*) from information_schema.columns where table_name='owner_decisions' and column_name='opened_by'), 'connected_sites' = any(public.workspace_release_flag_names());` → `…, 1, t`

**`20261009110000_booking_lifecycle`** · `a873c16d81b5`
- Changes: `business_booking_messages` (send log, unique booking + kind);
  `claim_booking_messages`, `finish_booking_message`, `expire_booking_holds`,
  `lapse_booking_requests`, `read_workspace_booking`,
  `read_public_booking_by_manage_token`, `record_workspace_booking`,
  `set_tenant_booking_hours`. Non-concurrent index
  `public_website_bookings_manage_token_idx` on live `public_website_bookings`
  (small table), two partial indexes on `business_bookings`. No `lock_timeout`.
- Depends on: `20261008141000`, `20261004120000`, `20261002120000`.
- Rollback: drop the functions, the three indexes and the table. Unsent
  reminders are simply not sent.
- Verify: `select to_regclass('public.business_booking_messages'), to_regclass('public.public_website_bookings_manage_token_idx');`

**`20261009113000_inquiry_records`** · `18a6a41549fe`
- Changes: `tenant_leads` gains `intake_state` (default `kept`),
  `held_reason`, `intake_state_at`, `contact_id` (FK `business_contacts`, on
  delete set null), the `recorded_via` check swapped again (adds
  `spam_hold`), check `tenant_leads_spam_hold_held`, index
  `tenant_leads_workspace_state_idx`; append-only `inquiry_events`; 10 new
  functions incl. `hold_tenant_lead_as_spam`, `read_workspace_leads`,
  `decide_held_workspace_lead`; replaces `read_tenant_leads` (latest
  `20261007110000`), `read_tenant_lead`, `read_tenant_lead_digests`
  (`20261008140000`) with the same signatures. `lock_timeout 3s`.
- Depends on: `20261005090000`, `20261008140000`, `20261008151000`
  (the check keeps `connected_site`), `20261002120000`.
- Rollback: restore the three read functions from `20261007110000` and
  `20261008140000`; delete `spam_hold` rows; drop `inquiry_events`, the new
  functions, index, checks and columns; restore the `recorded_via` check from
  `20261008151000`.
- Verify: `select (select count(*) from information_schema.columns where table_name='tenant_leads' and column_name in ('intake_state','contact_id')), to_regclass('public.inquiry_events');` → `2, …`

**After batch 6:** the same count → `48`

#### Batch 7: Wave 4 journey gaps (`w4/journey-gaps`)

Three files, in filename order (the third from wave 5, `w5/structure`).
Batch 7 depends on batches 3 and 6. No file writes a row; both are rehearsed in `check:workspace-sql` and
`check:workspace-upgrade` with their own contracts plus the Needs you and
service actor contracts rerun against the replacements. Code that reads the
new keys (`src/platform/needs-you/handled.ts`) and calls the new function
(`startMakeRealLinkSession`) degrades safely without them: the old
`read_strelva_handled` simply lists fewer receipts, and a missing
`strelva_make_real_link_session` makes the link answer "Sign in to decide
this", as today. Still, deploy the app after batch 7, not before.

**`20261009130000_strelva_handled_decisions`** · `5f85457c73e3`
- Changes: replaces `read_strelva_handled(uuid, uuid, text, timestamptz)`
  (from `20261007120000`) with the same signature and grants. It also returns
  approved and declined `owner_decisions` in the window (not only expired
  ones), with `outcomeReason`, `sourceLifecycle`, `sourceId`,
  `decidedByKind`, `receiptRef`, `approveEffect`, `notYetEffect`, `systemId`
  and `openHref`. Every decision row says `not_undoable`; the app maps each
  lifecycle to its reason. Writes nothing. `lock_timeout 3s`.
- Depends on: `20261007120000` (the function, `owner_decisions`,
  `needs_you_member_role`, `needs_you_operator_id`), `20261002120000`
  (`business_record_revisions`), `20261001120000` (`website_document_receipts`).
- Rollback: re-create `read_strelva_handled` from `20261007120000` (its body
  at lines 731–772) with `create or replace`, then the same revoke and grant.
  Nothing else depends on the new keys.
- Verify: `select pg_get_functiondef('public.read_strelva_handled(uuid,uuid,text,timestamptz)'::regprocedure) like '%''approved'', ''declined''%', has_function_privilege('authenticated', 'public.read_strelva_handled(uuid,uuid,text,timestamptz)', 'execute');` → `t, f`

**`20261009131000_make_real_owner_link`** · `d76caeff5f91`
- Changes: the `strelva_service_actions_purpose_check` constraint is
  dropped and re-added with `make_real_link` (validates existing rows; the
  table is append-only and small). New `strelva_make_real_link_session(uuid,
  uuid, text)`: a 30-minute Strelva (system) session bound to one open
  `make_real` decision routed to the owner, not sign-in-only, for the owner
  recipient on record (`resolve_business_owner_recipient`) only when that
  recipient has no owner account, and only for a business Strelva runs.
  Replaces `record_strelva_service_action` (from `20261009100000`, same
  signature): it also accepts a `make_real_link` session, for one `run`, only
  after its decision is approved by owner link and before its outcome is
  recorded. `claim_owner_decision` is unchanged. `lock_timeout 3s`.
- Depends on: `20261009100000` (the table, `strelva_runs_business`, the
  function it replaces), `20261007120000` (`owner_decisions`,
  `needs_you_owner_actor`), `20261002120000`
  (`resolve_business_owner_recipient`).
- Rollback: drop `strelva_make_real_link_session`; restore
  `record_strelva_service_action` from `20261009100000`; then, in one
  transaction with `alter table public.strelva_service_actions disable trigger
  strelva_service_actions_immutable`, delete rows with purpose
  `make_real_link`, re-enable the trigger, and restore the check to
  `('needs_you_sync', 'make_real_resume')`. Activations a link run started
  keep running under `make_real_resume`; their approval record is the owner's
  decision, which rollback doesn't touch.
- Verify: `select to_regprocedure('public.strelva_make_real_link_session(uuid,uuid,text)') is not null, pg_get_constraintdef((select oid from pg_constraint where conname = 'strelva_service_actions_purpose_check')) like '%make_real_link%';` → `t, t`

**`20261009140000_make_real_owner_link_flag`** · `5a2ae2bdf486`
- Changes: replaces `workspace_release_flag_names()` (from `20261009100000`)
  with the same full list plus `make_real_owner_link`, so a business can get
  that row. The flag tables' check constraints call the function, so nothing
  else becomes valid. No table, row or grant changes. `lock_timeout 3s`.
- Depends on: `20261009100000` (the list it extends), `20261007130000` (the
  flag tables), `20261009131000` (the behavior the flag gates).
- Rollback: delete `workspace_release_flags` rows with flag
  `make_real_owner_link` (and their `workspace_release_flag_changes` rows,
  with that table's immutability trigger disabled for the statement only),
  then re-create `workspace_release_flag_names()` from `20261009100000`.
- Verify: `select 'make_real_owner_link' = any(public.workspace_release_flag_names()), 'connected_sites' = any(public.workspace_release_flag_names());` → `t, t`

**After batch 7:** the same count → `51`

---

## 2. Env flags

Every flag below is read by code at `30dcba1b` (checked by grep over
`src` and `scripts`: every `STRELVA_*` name added since `9e0bd441` is here;
the rest of the new names are constants, test fixtures or the local
`STRELVA_UI_PREVIEW`/`STRELVA_CALENDAR_FIXTURE`, which must stay unset in
production). Env changes need a new production deploy, not a redeploy. Each
flag is its own yes.

**How per-workspace layering works** (`src/platform/release-flags/resolve.ts`):
env unset or `0` is off everywhere and a row can't turn it on; env `workspace`
is on only where the workspace's row is `on`, or `operators` for super admins
and named testers; env `1` is on everywhere except rows set to `off`. If
`STRELVA_WORKSPACE_RELEASE` isn't `1`, everything is off. Rows live in
`workspace_release_flags` (batch 3), set at `/admin/clients/[id]`, cached 60 s.

### New since the Sept 30 release

| Flag | Turns on | Default | Values | Per workspace | Needs | Kill switch |
| --- | --- | --- | --- | --- | --- | --- |
| `STRELVA_OWNER_ENTRY` | Signed-in owners on client admin hosts go through `/auth/entry` (workspace or `/dashboard`) | off | `workspace`, `1` | Yes: `off`/`operators`/`on` | batch 3 | unset |
| `STRELVA_SYSTEMS_RELEASE` | Systems Home, System page, Possibilities, Make real, Ask, link fields, agency Clients/Queue/Library/Team | off | `workspace` (per workspace row, business or agency), `1` | Yes: `off`/`operators`/`on`; agency rows need `20261008161000` and S10 | batches 2–4 | unset |
| `STRELVA_ASK_RELEASE` | Ask Strelva | off | `1`; also needs WORKSPACE `1` and Systems on for the asked workspace (`1`, or `workspace` with its row on) | Through Systems | batch 1 (`model_call_log`), model keys | unset |
| `STRELVA_WEBSITE_REBUILD_RELEASE` | Website rebuild, v2 documents, health and domain alerts | off | `workspace`, `1` | Yes: per business; a converted site follows its business (needs batch 4); public hosted pages never count as operators | batch 2; `VERCEL_API_TOKEN` | unset |
| `STRELVA_NEEDS_YOU_RELEASE` | Needs you and Strelva handled; hourly cron does work for every business (step 16a) | off (cron heartbeat only, routes 503) | `1` | No | batches 3, 6–7 and 7A's neutral service actor; S11; step 16a | unset |
| `STRELVA_PUBLISHING_RELEASE` | Listing and newsletter Systems, Connect Google | off | `1` | No; shows inside Systems | batch 3, S8 | unset |
| `STRELVA_GOOGLE_BINDINGS` | Read the Postgres Google binding first, fall back to Redis (counted daily in `reb:google-binding:fallback:*`); OAuth callback writes both | off (Redis only) | `1` | No | batch 3, `SECRETS_ENC_KEY`, S8 | unset |
| `STRELVA_BUSINESS_BILLING` | `workspaceId` on new checkout metadata; webhook copies payment status to the business | off | `1` | No | batch 4 | unset |
| `STRELVA_CLIENT_RECORDS_DUAL_WRITE` | Copy Redis client stores to `tenant_client_records`; the daily `client-records-parity` cron records parity | off | `1` (and `DUAL_WRITE_PG` not `0`) | No | batch 3 | unset |
| `STRELVA_CLIENT_RECORDS_READ` | Read a store from Postgres, only after a 7-day parity streak | empty | comma list of `spam_held`, `inquiry_timeline`, `inquiry_reply`, `booking_config`, `account_grouping` | Per store | batch 3, S3 | remove the store |
| `STRELVA_EXPORT_SCHEMA_3` | Paged export v3; link emailed to the owner | off (503) | `1` | No | batch 4 | unset |
| `SCAFFOLD_PREVIEW_SIGNING_SECRET` | HMAC for private website share links | falls back to `CRON_SECRET` | any secret | n/a | none | n/a. Set a dedicated value before rebuild sharing |

### New in waves 2–3

| Flag | Turns on | Default | Values | Per workspace | Needs | Kill switch |
| --- | --- | --- | --- | --- | --- | --- |
| `STRELVA_LEADS_READ` | Where lead reads come from. `compare`: Redis serves, Postgres read beside it, differences logged, and `lead-mirror-reconcile` records one parity row per tenant per day. `postgres`: `tenant_leads` serves after 7 days of parity (acts as `compare` until then); any Postgres miss serves Redis | `redis` (unset) | `compare`, `postgres` | No | batch 5 (`20261008140000`), S1 | unset (both stores keep every write) |
| `STRELVA_LEADS_AUTHORITY` | Capture writes `tenant_leads` first; Redis becomes the cache. A Postgres failure keeps the lead in Redis and the pending queue | off | `postgres` (and `DUAL_WRITE_PG` not `0`) | No | `STRELVA_LEADS_READ=postgres` serving | unset |
| `STRELVA_INQUIRY_RECORDS` | Spam held for review in `tenant_leads`, `inquiry_events` history, sender linked to business contacts, the workspace Inquiries read and held-item review. Writes never fail a visitor | off | `1` (and `DUAL_WRITE_PG` not `0`) | No | batch 6 (`20261009113000`) | unset |
| `STRELVA_BOOKING_STORE_WRITE` | Dual-write: both booking route families also write `business_bookings`. A failed store write never fails the visitor; it is queued in `reb:booking-store:pending` and retried by `lead-mirror-reconcile` | off | `1` (and `DUAL_WRITE_PG` not `0`) | No | batch 6 (`20261008141000`) | unset |
| `STRELVA_BOOKING_STORE_READ` | `compare`: legacy serves, the store's bookings and slots are computed beside it and differences logged. `postgres`: the store serves and guards the slot after 7 days of booking parity (S12), with hours and services from the business record; acts as `compare` until then | `legacy` (unset) | `compare`, `postgres`; ignored unless WRITE is on | No | WRITE, S12 | unset (legacy stores keep every write) |
| `STRELVA_BOOKING_OWNER_NOTICE` | "New booking" email to the owner recipient when a visitor's booking is confirmed. A request is a Needs you item instead | off | `1` | No | batch 1 (owner-recipient rule); email gates | unset |
| `STRELVA_BOOKING_REMINDERS` | The `booking-reminders` cron's work: customer reminders 24 h and 2 h before, the owner's one 24-hour chase of a request, the 72-hour request lapse, the 15-minute hold sweep | off (heartbeat only) | `1`; also needs WRITE | No | batch 6 (`20261009110000`); email gates | unset |
| `STRELVA_BOOKING_MANAGE_PAGE` | The customer's manage link `/b/[token]`, and the link in reminders. GET never changes anything | off (404) | `1` | No | batch 6 (`20261009110000`) | unset |
| `STRELVA_BOOKING_CALENDAR_BUSY` | Subtracts a connected Google or Outlook calendar's busy times from store-served slots (60 s cache). A failed read offers slots and turns an instant booking into a request | off | `1` | No | `STRELVA_BOOKING_STORE_READ=postgres` serving; calendar connections | unset |
| `STRELVA_MAKE_REAL_LIVE` | Make real's live effect channels (`hosted_website`, `tenant_content`, `inquiry_form`, `booking_page`, `internal_app`). Off: the step waits, never fakes | off | `workspace` (per channel row), `1` | Yes: one `make_real_live:<channel>` row each | batch 5 (`20261008131000`), Systems on | unset |
| `STRELVA_MAKE_REAL_OWNER_LINK_RELEASE` | Make real approved by signed email link for an owner with no account (finding 16): Strelva (system) runs that one plan under a `make_real_link` session. Off: the link answers "Sign in to decide this" | off | `workspace` (per business row), `1` (wherever Needs you and Systems are on, except rows `off`) | Yes: `make_real_owner_link` row | batch 7 (`20261009131000`, `20261009140000`), Needs you and Systems on | unset |
| `STRELVA_CONNECTED_SITES_RELEASE` | Connected sites: a business's existing site sends inquiries, held spam and visits through `/api/v1/connect/*` (additive), after it proves control of its host | off | `workspace` (per business, incl. the public connect gate), `1` (wherever Systems is on, except rows `off`) | Yes: `connected_sites` row | batch 6 (`20261008151000`, `20261009100000`), Systems on | unset |

### Existing flags that matter for 1.0

| Flag | Today (Sept 30 record) | Default | Values | Kill switch |
| --- | --- | --- | --- | --- |
| `STRELVA_WORKSPACE_RELEASE` | `1` | off | `1` | unset turns off everything layered on it |
| `STRELVA_INQUIRIES_RELEASE` | unset | off | `workspace` (per business; a converted site follows its business, needs batch 4), `1` (every client, except a row set `off`) | unset |
| `STRELVA_BACKGROUND_WORK_RELEASE` | unset | off | `1` | unset |
| `STRELVA_PLANNING_ENABLED` | unset | off | `1` | unset |
| `STRELVA_PRODUCT_LEARNING_RELEASE`, `STRELVA_CUSTOMERS_RELEASE` | unset | off | `1` | leave off; the audit proposes cutting both |
| `EMAIL_SENDING_ENABLED` | unknown (snapshot) | off | `true` (not `1`) | unset. Per-tenant `reb:client-email:{tenant}` = `on`/`off` beats it |
| `CUSTOMER_EMAIL_ENABLED` | unknown | off | `true` | unset |
| `OPERATOR_EMAILS_ENABLED`, `PROSPECT_EMAILS_ENABLED` | unknown | **on** | anything but `false` | `false` |
| `DUAL_WRITE_PG` | unknown | **on** | anything but `0`/`false`. A missing lead schema is detected once and paged once; live lead copies pause until `tenant_leads` exists (`reb:lead-mirror:schema-missing`, cleared by the first successful copy or S1) | `0` (stops every Postgres mirror) |
| `GOVERNED_WORK_DUAL_WRITE`, `GOVERNED_WORK_READ_PG` | unknown (snapshot settles it) | off | `1`/`true` | unset |
| `SECRETS_ENC_KEY` | unknown | without it, secrets are stored plaintext and binding writes refuse | any passphrase | **never remove once used**: every encrypted secret becomes unreadable |
| `REB_DEV_UNGATED_ACCESS` | must be absent | off | — | must stay absent in production |

### Recommended production order

1. Deploy the 1.0 candidate with every new flag unset, after batch 7A and
   w6's rehearsed migrations. The new crons then: `lead-mirror-reconcile`
   hourly (also retries queued booking-store writes, none while the booking
   write is off); `client-records-parity` daily, heartbeat only until the
   dual-write is on; `needs-you` heartbeat only; `booking-reminders` and
   `connected-sites-purge` heartbeat only; `website-health` and
   `website-domain-verification` alert only when rebuild is on, and the
   domain cron skips without `VERCEL_API_TOKEN`.
2. `STRELVA_CLIENT_RECORDS_DUAL_WRITE=1`. Data only, no UI. It also turns on
   the daily read-only parity cron. After S3's backfill, wait 7 clean days
   (alert `client_records_parity`, heartbeat `client-records-parity`) before
   adding a store to `STRELVA_CLIENT_RECORDS_READ`.
3. Confirm `SECRETS_ENC_KEY` is present (`vercel env ls`). If it is absent,
   stop: adding it means running `backfill-secret-encryption.ts` (now a dry
   run by default, guarded). That is its own packet.
4. `STRELVA_SYSTEMS_RELEASE=workspace`, `STRELVA_OWNER_ENTRY=workspace`.
   Invisible until a row says `operators` or `on`. The same holds for
   `STRELVA_INQUIRIES_RELEASE=workspace` and
   `STRELVA_WEBSITE_REBUILD_RELEASE=workspace`, which now also work per
   business (after batch 4); each is its own yes.
5. After conversions (section 4), per workspace rows: test business
   `operators`, gldf `operators`, Jacob walks every page, then `on`. For the
   agency library, set the Strelva agency workspace's `systems` row with S10.
6. `STRELVA_BUSINESS_BILLING=1`, then S7.
7. After S8: `STRELVA_GOOGLE_BINDINGS=1`; after 30 days with zero fallbacks,
   `STRELVA_PUBLISHING_RELEASE=1`.
8. `STRELVA_NEEDS_YOU_RELEASE=1`, only after `needs-you-parity` is clean
   and S11 has seeded each converted tenant's policies. From then the
   hourly chase opens items as "Strelva (system)" for every business,
   including outside-agency and self-serve businesses (step 16a). Do not
   enable it with the old `strelva_runs_business` restriction or operator-admin
   fallback. Owners get nothing while email is gated.
8a. Bookings, one yes each, any time after step 1 (independent of
   conversions): `STRELVA_BOOKING_STORE_WRITE=1`; S12 backfill and
   `schedules`; `STRELVA_BOOKING_STORE_READ=compare`; S12 parity daily for 7
   days with no miss (`booking_store_parity_miss` silent); then
   `STRELVA_BOOKING_STORE_READ=postgres`. After that, each its own yes:
   `STRELVA_BOOKING_MANAGE_PAGE=1`; then, once email is on for a client
   (step 10), `STRELVA_BOOKING_REMINDERS=1` and
   `STRELVA_BOOKING_OWNER_NOTICE=1` (both are global, and their sends obey
   each client's email gate);
   `STRELVA_BOOKING_CALENDAR_BUSY=1` last, once a business has a calendar
   connection.
8b. Leads, after S1 and 24 hours with `reb:lead-mirror:pending` empty:
   `STRELVA_LEADS_READ=compare`; 7 clean days (alert
   `lead_read_parity_failed` silent); `STRELVA_LEADS_READ=postgres`; then,
   last and only after a week of Postgres reads,
   `STRELVA_LEADS_AUTHORITY=postgres`. `STRELVA_INQUIRY_RECORDS=1` any time
   after batch 6; it only adds records.
8c. `STRELVA_MAKE_REAL_LIVE=workspace`, then per business and channel
   (`make_real_live:<channel>` rows via S10 or `/admin/clients/[id]`):
   test business first, `operators`, Jacob makes one Possibility real per
   channel, then `on`. `STRELVA_CONNECTED_SITES_RELEASE=workspace`, then a
   `connected_sites` row per business that has a site Strelva doesn't host.
8d. After step 8, `STRELVA_MAKE_REAL_OWNER_LINK_RELEASE=workspace`, then a
   `make_real_owner_link` row per business whose owner has no account: test
   business first (`on`; the link has no viewer, so `operators` never
   applies), Jacob approves one Make real plan from the email, then the
   next business. Each row is its own yes.
9. One at a time: `STRELVA_INQUIRIES_RELEASE` and
   `STRELVA_WEBSITE_REBUILD_RELEASE` per business through `workspace` rows,
   then `1` only when every converted business is `on` or explicitly `off`
   (an unconverted site follows `1`). `STRELVA_EXPORT_SCHEMA_3=1` is still a
   global switch. `STRELVA_ASK_RELEASE=1` when Ask is wanted; under Systems
   `workspace` it reaches only businesses whose row is on.
10. Email last: owner invites (S6), then `reb:client-email:{tenant}=on` per
    client (test business, gldf, the rest), then `EMAIL_SENDING_ENABLED=true`,
    then `CUSTOMER_EMAIL_ENABLED=true`.
11. `STRELVA_OWNER_ENTRY=1` only when every converted workspace's row is `on`
    or explicitly `off`.

Rollback for any flag: unset it and deploy. Data written while it was on
stays; nothing in 1.0 deletes Redis state when a flag turns off.

### Crons added since the Sept 30 release

Declared in `vercel.json`, authenticated with `requireCronRequest`,
registered in `CRON_MAX_AGE_SECONDS` (`src/lib/heartbeat.ts`). They ship with
the deploy (step 7, no separate yes) and do nothing but record a heartbeat
until their flag is on. Two are new since `9e0bd441`:

| Cron | Schedule (UTC) | Max age | Does work when | Kill switch |
| --- | --- | --- | --- | --- |
| `booking-reminders` | `*/15 * * * *` | 45 min | `STRELVA_BOOKING_REMINDERS=1` and `STRELVA_BOOKING_STORE_WRITE=1`: hold sweep, request clock (24 h chase, 72 h lapse), customer reminders. Each message is claimed once in `business_booking_messages`; every email goes through the one send path and its gates | unset `STRELVA_BOOKING_REMINDERS` |
| `connected-sites-purge` | `50 5 * * *` | 26 h | `STRELVA_CONNECTED_SITES_RELEASE` is `1` or `workspace`: deletes connected-site visit and click events after 400 days and held spam after 30 (`purge_connected_site_records`). Inquiries stay | unset the flag |

Already in this packet, with new work since: `client-records-parity` (05:40,
w2); `lead-mirror-reconcile` now also records lead parity (while
`STRELVA_LEADS_READ` is set) and retries queued booking-store writes;
`needs-you` opens items as "Strelva (system)" (finding 15);
`workspace-work` resumes approved Make real activations and withdraws idle
Possibilities.

---

## 3. Scripts that need `--i-have-jacobs-yes`, in order

None of these load an env file. Run them as
`npx tsx --env-file=<private prod env file> scripts/…` and delete the file
after. Each script treats any `SUPABASE_URL` that isn't loopback or
`*.localhost` as production. Every one is a dry run without `--apply`,
except S11, which has no `--apply` and writes whenever the yes is given.
Dry runs read production, so they ride on the same yes as the apply.
`scripts/booking-store-move.ts` and `scripts/needs-you-seed-tenant-policies.ts`
are new in waves 2–3 (S12, S11; `booking-store-move-plan.ts` is the
module S12 loads). Every other file under `scripts/` that mentions
`--i-have-jacobs-yes` is a listed command or the module behind one
(checked by grep at `30dcba1b`).

For S10, sign in as the active Strelva operator first. Copy the `access_token`
from that browser's `sb-<project-ref>-auth-token` entry in Application → Local
Storage, then enter it at a hidden shell prompt so it is not part of command
history:

```sh
printf 'Current Strelva session access token: ' >&2
read -r -s STRELVA_OPERATOR_SESSION_ACCESS_TOKEN
printf '\n'
export STRELVA_OPERATOR_SESSION_ACCESS_TOKEN
```

Run the S10 commands below, replacing `operators` with `on` when enabling
Systems, then run `unset STRELVA_OPERATOR_SESSION_ACCESS_TOKEN`. The `on`
write records an approval under the token's verified user ID; the browser or
CLI cannot name another approver.

| # | When | Dry run | Apply | Writes | Needs |
| --- | --- | --- | --- | --- | --- |
| S0 | Step 0 | — | `npx tsx scripts/production-readiness-snapshot.ts --i-have-jacobs-yes` | nothing | — |
| S1 | After batch 0 and the `0.2.1` deploy | `npx tsx scripts/backfill-tenant-leads.ts` | `npx tsx scripts/backfill-tenant-leads.ts --apply --i-have-jacobs-yes` | `tenant_leads` via `record_tenant_lead`; clears `reb:lead-mirror:pending` entries, and a successful write also clears `reb:lead-mirror:schema-missing`. Idempotent | batch 0 |
| S2 | After batch 1 | `npx tsx scripts/copy-report-analytics-state.ts` | `npx tsx scripts/copy-report-analytics-state.ts --apply --i-have-jacobs-yes` | `tenant_report_state`, `tenant_analytics_config` with `via='backfill'`, fills only what's missing | batch 1 |
| S3 | After batch 3 and `STRELVA_CLIENT_RECORDS_DUAL_WRITE=1` | `npx tsx scripts/client-records-move.ts backfill` | `… backfill --apply --i-have-jacobs-yes`; then the daily `client-records-parity` cron records parity on its own (no command). `client-records-move.ts parity --i-have-jacobs-yes` remains for an on-demand check | `tenant_client_records` (backfill only); parity rows (one per store/tenant/day) come from the cron | batch 3 |
| S4 | After batch 6 | `pnpm check:scrubbed-copy` (local only, no yes) | `pnpm scrubbed-copy create --out=$HOME/strelva-copies/$(date +%F) --source=<pg host> --source-redis=<db>.upstash.io --grandfathered=gldf,rohlax --i-have-jacobs-yes`, then `pnpm scrubbed-copy dry-run --out=…` and `npx tsx scripts/needs-you-parity.ts` against the copy | nothing in production; a local copy outside every git checkout | read-only source credentials in a clean shell ([scrubbed copy](./scrubbed-production-copy.md)). Check free disk first (12 GB on Oct 6) |
| S5 | Retired · step 11 held pending 7A and #234 | Read-only check for a designation row | **Do not run `designate-agency`.** Create and verify the ordinary agency in steps 10a–10b instead | no designation or automatic provider rows | batch 7A; section 6 |
| — | Conversions · HOLD | section 4, with explicit `--agency` | section 4, per-client yes | business + provider seat; no standing operator admin | batches 0–7A; steps 10a–11; #234 |
| S6 | Per client, after its conversion, walk-through and any step 12a repair | Preview the ordinary active-provider agency's owner-invite flow after RL-09 lands; confirm recipient and final agency labels | Use that agency-issued flow on the client's own yes. The legacy super-admin `business-ownership.ts invite-owner` path is not the agency delivery path | owner invitation; **also attempts email**. Send only with the agency's `email_send` verification and the existing client/email gates; otherwise retain the accept link. Revoke through the same logged invitation path | batch 3 + 7A, agency-issued invitation implementation and verified email path; exact command/UI evidence must land before S6 |
| S7 | After conversions and `STRELVA_BUSINESS_BILLING=1` | `npx tsx scripts/stripe-workspace-metadata.ts` (no Stripe call) | test key: `npx tsx scripts/stripe-workspace-metadata.ts --apply --i-have-jacobs-yes`; live key: add `--live` | Stripe `metadata.workspaceId` and `metadata.payerKind`, merge only, after the amended writer lands. The 9 existing clients stay `business` (pay Strelva directly); no payer migration. An object reachable from two businesses is a conflict and never written | batch 4 + 7A payer contract and amended metadata writer. A dry run that lists every tenant as "Not converted" means batch 4 is missing: the RPC error is swallowed |
| S8 | After conversions | `npx tsx scripts/copy-google-bindings.ts` | `npx tsx scripts/copy-google-bindings.ts --apply --i-have-jacobs-yes`, then `npx tsx scripts/copy-google-bindings.ts --verify-google --i-have-jacobs-yes` | `workspace_account_bindings`, `workspace_google_locations`, re-encrypted, `migrated_from='redis'`; never overwrites. Verify mints one token per copy and makes one read-only Google call. Unconverted tenants are skipped | batch 3, `SECRETS_ENC_KEY` (apply refuses without it), conversion |
| S9 | Around each step | — | `npx tsx scripts/storefront-parity.ts capture … --i-have-jacobs-yes` and `compare` | only the `--out` file | section 4 |
| S10 | For a workspace with no client page (the Strelva agency workspace) | `npx tsx --env-file=<prod env> scripts/workspace-release-flag.ts <workspace-id> systems operators --reason="<why>" --i-have-jacobs-yes` (reads the row) | same with `--apply`; use state `on` to enable Systems | one `workspace_release_flags` row and change record, revision-checked. `on` also records a same-operator approval and audit event. | batch 3 incl. `20261008161000`; signed operator session token |
| S11 | After batch 5 and each tenant's conversion, before `STRELVA_NEEDS_YOU_RELEASE=1` | Against the S4 scrubbed copy only: `npx tsx scripts/needs-you-seed-tenant-policies.ts [<slug>] --json` (no yes needed on local stores) | `npx tsx scripts/needs-you-seed-tenant-policies.ts <slug> --operator-user-id=<uuid> --operator-email=<super admin> --i-have-jacobs-yes` | one `decision_policy_tenant_imports` receipt per tenant and kind (content autonomy, review reply mode), the owner's `decision_policies` row and its history. Redis keys never change; idempotent. A choice the new floor doesn't carry over is listed, not migrated | batch 5 (`20261008124000`), conversion. **There is no production dry run**: with the yes it writes, and without it it refuses a non-local store. Review the scrubbed-copy plan first |
| S12 | After batch 6 and `STRELVA_BOOKING_STORE_WRITE=1` | `npx tsx scripts/booking-store-move.ts backfill --i-have-jacobs-yes` (reads client bookings, writes nothing) | Two yeses. S12a: `… backfill --apply --i-have-jacobs-yes`, then `… schedules --i-have-jacobs-yes` (dry run) and `… schedules --apply --i-have-jacobs-yes`. S12b, after `STRELVA_BOOKING_STORE_READ=compare`: `… parity --i-have-jacobs-yes` once a day for 7 days (finding 14) | `business_bookings` through `record_tenant_booking` (the dual-write RPC; reruns are no-ops, overlaps refused and listed); parity rows under store `bookings`. Legacy stores untouched | batch 6 (`20261008141000`) |
| — | Not part of 1.0 | `npx tsx scripts/backfill-secret-encryption.ts --i-have-jacobs-yes`; `npx tsx scripts/count-client-redis-keys.ts --i-have-jacobs-yes` (read-only) | backfill: `--apply --i-have-jacobs-yes` | encrypted secret columns and `connections:*` | `SECRETS_ENC_KEY` |

**Stripe, test mode first, done properly (S7).** A test key against
production ids fails every update. Rehearse on Preview instead: seed one
test-mode customer and subscription per converted Preview business with
`tenantId` metadata, run the dry run, `--apply --i-have-jacobs-yes`, and read
`workspaceId` and `payerKind` back in the Stripe test dashboard. The existing
clients must read `payerKind=business`; do not switch their payer as part of
conversion. Then the live dry run, then `--live` on Jacob's yes. Rollback:
restore the prior values for these two metadata keys per object in the
apply receipt (clear newly added keys with `metadata[<key>]=""`); preserve
every other metadata key and never change a subscription or charge.

---

## 4. Per-client conversion runbook

Conversion makes each live client a business workspace whose website is its
first System. It never changes the tenant row, `reb:` keys, `/api/v1`,
legacy tenant memberships or Stripe, and never emails anyone. Under ADR 0012,
the chosen agency receives an ordinary provider seat; the platform operator
gets no standing business `admin` membership. Any platform support access is
logged and time-boxed, separate from agency delivery.

### Step 12 · HOLD until batch 7A and the pending decision

[Step issue #358](https://github.com/Strelva/Strelva-OFFICIAL/issues/358);
conversion implementation [#316](https://github.com/Strelva/Strelva-OFFICIAL/issues/316).

- What: convert each tenant with an explicit chosen agency. For the 9
  existing managed clients, record `workspace_providers.source=existing_contract`
  only after Jacob confirms each client's existing agreement names Strelva's
  agency. A test or new business needs its own recorded choice; never infer
  a contract from being in the active-tenant list.
- Command/approach: use the commands below with `--agency=<workspace-id>`
  after the amended script and RPC land. This checkout's old script does not
  support that option; do not run it or silently omit the agency. The dry run
  must show the provider, source and absence of an operator-admin grant.
- Verify: chosen provider and `existing_contract` receipt per existing
  client; ordinary agency queue access; no standing platform-operator admin;
  owner data and exit intact; billing payer remains `business`; storefront
  5/5, then the post-conversion checks below. Confirm the agency cannot read
  a different agency's clients and that the owner can replace it without migration.
- Rollback: preview and apply `--rollback` below using the amended script;
  verify it also reverses the provider linkage without deleting approvals
  or receipts. Capture storefront parity again. Rehearse this before each
  production conversion; if subsequent work prevents unlink, freeze effects
  and prepare a data-preserving recovery on its own yes.
- Who says yes: Jacob for each conversion and rollback, after steps 6a,
  10a–10b and 11 pass and [#234](https://github.com/Strelva/Strelva-OFFICIAL/issues/234)
  has an explicit recorded decision. Owner choice/contract evidence is a
  separate prerequisite, including Twin Trees' business structure below.

### Order

1. **Rehearsal:** S4 scrubbed copy, then `pnpm scrubbed-copy dry-run` for
   every active tenant. A tenant whose rolled-back rehearsal fails is not
   converted until it passes.
2. **Strelva-owned test tenant** (`strelva` in the systems-catalog spec;
   confirm it is in the step 0 snapshot's active list, and create it with
   `pnpm provision-tenant` on its own yes if not).
3. **gldf.** Grandfathered, rewards, orders, a Google connection. Its own
   Supabase was paused on Sept 30; parity only covers Strelva's reads.
4. **The rest, one per day,** smallest first.
5. **Twin Trees last,** and only after its owner answers the question below.

### For each tenant

```sh
SLUG=gldf
OP=<super admin email>
AGENCY=<ordinary agency workspace id from step 10a>
D=/private/tmp/strelva-conversion/$SLUG && mkdir -p $D

# a. Storefront before (read-only)
npx tsx scripts/storefront-parity.ts capture --base=https://app.strelva.com \
  --tenants=$SLUG --out=$D/before.json --i-have-jacobs-yes

# b. Dry run (reads production, writes nothing)
npx tsx --env-file=<prod env> scripts/convert-tenant-to-workspace.ts $SLUG --agency=$AGENCY --operator-email=$OP

# c. On the yes for this tenant
npx tsx --env-file=<prod env> scripts/convert-tenant-to-workspace.ts $SLUG --agency=$AGENCY --apply --operator-email=$OP --i-have-jacobs-yes

# d. Prove nothing a site reads changed
npx tsx scripts/storefront-parity.ts capture --base=https://app.strelva.com \
  --tenants=$SLUG --out=$D/after.json --i-have-jacobs-yes
npx tsx scripts/storefront-parity.ts compare $D/before.json $D/after.json   # 5 of 5 identical
pnpm check:custom-repos
```

Then: rerun the dry run (it reports "already converted"); check the provider
and membership receipts above and the billing home (`read_business_billing`
through the authorized billing view, with payer `business` for the 9 clients); 24
hours with `reb:lead-mirror:pending` empty and no new 5xx; set the workspace
row to `operators`; Jacob walks every page; then S6 and `on`.

**The full 60/60.** Around each migration batch and each deploy, capture all
12 active tenants (12 × 5 reads) the same way and compare before and after.
That is the Sept 30 check: site-capabilities, page-config, content
settings/hero/navigation, byte for byte. For a candidate deployment before
promotion, capture its protected URL with `VERCEL_AUTOMATION_BYPASS_SECRET`
in the environment and compare against live.

**Stop if** any read differs, the conversion receipt shows skipped fields
the dry run didn't, a lead fails to mirror, the agency was defaulted, a
standing operator-admin row was granted, or a designation row exists.

### Rollback

```sh
npx tsx --env-file=<prod env> scripts/convert-tenant-to-workspace.ts $SLUG --rollback --operator-email=$OP                              # preview
npx tsx --env-file=<prod env> scripts/convert-tenant-to-workspace.ts $SLUG --rollback --apply --operator-email=$OP --i-have-jacobs-yes
```

`unlink_tenant_from_business` removes the link, every imported item nobody
changed since, the leads' business pointer, and the business itself when the
conversion created it and nothing else lives there. The billing unlink trigger
runs on the same delete. The site never stopped reading the tenant, so a
rollback has no storefront effect; capture and compare anyway.

### The Twin Trees question

One account pays a bundled $300/month for `twintrees-camillus` and
`twintrees-fayetteville` (recorded operator state, not rechecked). The open
question: **is Twin Trees one business with two locations, or two
businesses?** Only the owner can answer. Ask before converting either site.

- **One business (spec recommendation):** one workspace, one billing state, a
  hidden source System "Twin Trees website" with two location Versions.
  Conversion does this by default: the second site auto-joins the first
  site's workspace through the multi-site account.
- **Two businesses:** run every Twin Trees conversion, the first one
  included, with `--separate-business` (dry run, then
  `--apply --i-have-jacobs-yes`; needs `20261008160000`). Each site becomes
  its own business named for the site. Its billing home holds only its own
  line item (not the $300 bundle) and records the shared account
  (`sharedAccount: true`). The bundled subscription stays one Stripe object,
  and S7 lists it as a conflict and leaves it alone. Rollback is the normal
  `--rollback`; it deletes the separate business and its billing home. The
  flag is refused with `--rollback` and ignored (logged) on a single-site
  tenant.
- Either way, `workspace_calendar_connections` allows one calendar per
  provider per business, so two locations in one business can't each bind
  their own Google calendar.

---

## 5. Google console and the Preview environment

### Google: what Jacob checks in the console

Nothing here is a Google write; it is reading settings. Record each answer.

1. **Which Cloud project.** The project that owns the OAuth client whose id
   matches production's `GOOGLE_CLIENT_ID` (and `GOOGLE_CALENDAR_CLIENT_ID`
   if set; it falls back to the main pair).
2. **OAuth consent screen is "In production", not "Testing".** In Testing,
   refresh tokens die after 7 days and S8's "no re-consent" can't hold.
3. **Verification** for the scopes the code asks for:
   `https://www.googleapis.com/auth/business.manage`,
   `…/auth/webmasters.readonly`, `…/auth/analytics.readonly` (tenant connect),
   and `…/auth/calendar` (workspace calendar). All four are listed on the
   consent screen.
4. **Authorized domain** `strelva.com` on the consent screen.
5. **Redirect URIs on the OAuth client(s)**, exactly:
   - `https://app.strelva.com/api/oauth/google/callback` (from `NEXT_PUBLIC_APP_URL`; confirm that value)
   - `https://app.strelva.com/api/workspace/calendar-connections/oauth/google/callback` (from `APP_URL`, falling back to `NEXT_PUBLIC_APP_URL`)
6. **APIs enabled:** My Business Account Management, My Business Business
   Information, Google My Business (v4: reviews, local posts), Search Console,
   Google Analytics Data, Google Analytics Admin, Google Calendar, PageSpeed
   Insights, Generative Language.
7. **Business Profile API access approved.** The quota page shows non-zero
   requests per minute for the Business Profile APIs. Zero means the access
   request is still pending, and every GBP call fails regardless of OAuth.
8. **Service account behind `GOOGLE_SEARCH_CONSOLE_KEY`:** it exists, its key
   isn't disabled, and it is a user on each client's Search Console property
   and GA4 property (compare with the snapshot's analytics list).
9. **A Business Profile verified for 60+ days with a website listed**, which
   Google requires for API access (publishing spec §10).

### Preview: `preview.strelva.com` on a staging Supabase project

Today Preview is a nightly tested, tagged build, not an app you can sign into.
Vercel preview deployments of the app project read production data, so they
can't be used for this.

**What it is for:** Jacob and named testers use 1.0 before clients see it, and
it is the hosted rehearsal for this packet: batches 0–7, 7A, then w6 in order
on hosted Postgres 17, ordinary agency signup and verification, explicit-agency
conversions of synthetic tenants, flags in order, and S7's
test-mode Stripe run. That is checklist Gate 4, item 1 (isolated hosted
qualification).

**Exact plan, each line part of one yes:**

1. **Supabase:** new project `strelva-staging` in the same org, same region
   (`us-east-1`), Postgres 17. Cost: one more project on the current plan;
   check the org's billing page for the exact compute charge before saying yes.
2. **Schema:** from a clean checkout of the candidate commit,
   `npx supabase link --project-ref <staging-ref>` then
   `npx supabase db push --linked`, rehearsing the batches by pushing from the
   batch directories in section 1 in order (85 files first).
3. **Data:** synthetic only. A Strelva test business and 2–3 fake tenants
   (one multi-site pair to rehearse Twin Trees). No scrubbed copy: it is
   built to stay on one machine, and moving it to a hosted project would be a
   separate yes.
4. **Redis:** a new Upstash database `strelva-staging`. Never the production one.
5. **Vercel:** a custom environment `preview` on the `strelva-admin` project
   tracking the `reborn` branch, with its own env set: staging Supabase and
   Redis, Stripe **test** keys, no `RESEND_API_KEY`, every email switch off,
   `OPERATOR_EMAILS_ENABLED=false`, `PROSPECT_EMAILS_ENABLED=false`, a new
   `SECRETS_ENC_KEY`, `STRELVA_WORKSPACE_RELEASE=1` and the flags under test.
   Crons in `vercel.json` run only on production, so Preview has none unless
   triggered by hand.
6. **Domain and DNS:** add `preview.strelva.com` to that environment; one
   CNAME at the DNS provider to Vercel. This is the only DNS change.
7. **Auth:** staging Supabase site URL and redirect allowlist set to
   `https://preview.strelva.com`; Google sign-in through a **separate**
   Testing-mode OAuth client, so production's client and consent screen are
   untouched.
8. **Access:** Vercel deployment protection on, plus Strelva sign-in. Testers
   are added as `workspace_release_testers`.

Rollback: remove the domain and the custom environment, pause the staging
project. Nothing in production changes at any point.

---

## 6. Agency-model release gates

These are the ADR 0012 additions from audit H. They describe the required
release behavior, not implemented or deployed completion. Steps that need
new scripts, gates or screens wait for those implementations and their local
and Preview evidence. Never substitute a service-role write or super-admin
bypass for an ordinary agency action.

### Step 10a · Create Strelva's agency through ordinary signup

[Step issue #355](https://github.com/Strelva/Strelva-OFFICIAL/issues/355).

- What: create the agency "Strelva" as the first ordinary agency on the
  neutral platform, without a singleton designation or default-provider status.
- Command/approach: after 7A and the candidate deploy, Jacob signs in at
  `app.strelva.com/workspace` through the ordinary agency signup and uses
  `create_agency`. Record its workspace id for explicit conversions. Set its
  `systems` row with S10 for the agency library; this is not verification.
- Verify: `workspaces.kind=agency`, ordinary membership and Clients/Queue/
  Library/Team access; zero designation rows; no business provider selected
  automatically; outside effects denied until step 10b. Repeat the same
  signup with a synthetic outside agency on Preview.
- Rollback: leave effect gates off and close access through the normal
  membership/lifecycle controls. Only remove an unused synthetic workspace
  through a rehearsed normal cleanup; preserve any production records.
- Who says yes: Jacob for the production signup and S10 row, separately
  from verification, conversion, or sending anything to clients.

### Step 10b · Verify Strelva's agency by the same bar

[Step issue #356](https://github.com/Strelva/Strelva-OFFICIAL/issues/356).

- What: qualify Strelva's agency for outside effects by the same method,
  evidence and review applied to every agency. Being Strelva is no exemption.
- Command/approach: after Jacob selects the verification method and the
  per-agency implementation lands, a logged platform operator reviews the
  ordinary application and grants only approved effects (`publish_domain`,
  `google_write`, `email_send`, `take_payment`) through that verification path.
  Record the reviewer, evidence, effect and receipt. No direct SQL bypass.
- Verify: an unverified Preview agency is denied every outside effect;
  a verified one can use only its granted effects with the client's approval
  and authority. Strelva passes the identical tests; platform support powers
  cannot serve its clients. Verification does not itself publish, send or charge.
- Rollback: revoke the affected effect grants through the logged path and
  confirm fresh requests fail. Preserve receipts; reconcile effects already
  accepted by providers rather than treating them as retryable or unsent.
- Who says yes: Jacob on the verification bar and each production grant or
  revocation; the platform operator records the review. The bar is still an
  unresolved dependency, not selected by ADR 0012.

### Step 11 · Retire the designation (S5)

[Step issue #357](https://github.com/Strelva/Strelva-OFFICIAL/issues/357).
**HOLD until 7A lands; decision #234 remains pending.**

- What: retire `designate-agency`, not designate Strelva. Steps 10a–10b
  replace S5; S10 still sets the ordinary agency's `systems` row.
- Command/approach: do not run the old S5 command. After 7A, confirm the
  deprecated designation path cannot write or auto-mark providers and its
  callers have been replaced. Review the release-safety and readiness receipts.
- Verify: no `strelva_agency_workspace` row; provider choice is explicit;
  service actor and catalog no longer depend on the designation. A row found
  at any stage is a stop condition and requires an approved recovery plan.
- Rollback: leave the retirement in place and gates off. Do not restore a
  designation as recovery; any schema reversal follows step 6a's rehearsed
  rollback and its own yes.
- Who says yes: Jacob records the decision in
  [#234](https://github.com/Strelva/Strelva-OFFICIAL/issues/234) and approves
  this production retirement after the evidence. ADR acceptance and this
  documentation change do not settle that issue.

### Step 12a · Re-route anything converted early

[Step issue #359](https://github.com/Strelva/Strelva-OFFICIAL/issues/359).

- What: move any earlier conversion onto an explicit provider seat and
  remove the standing operator-admin path. Expected count: zero; verify it.
- Command/approach: after 7A and before client flags or invites, inventory
  `tenant_workspace_links`, providers and operator memberships against the
  new conversion contract. Record a zero-result receipt if none need repair.
  Otherwise use the rehearsed RL-08 re-path tool from #316, dry run then
  guarded apply on each business's own yes, with recorded agency choice or
  confirmed `existing_contract`. Its exact command waits for the tool to land.
- Verify: same business/System ids, data, billing payer and storefront reads;
  explicit provider/source; ordinary agency access; no standing operator
  admin; owner replacement and exit still work. Compare before/after receipts.
- Rollback: freeze effects, use the tool's rehearsed inverse plan to restore
  the prior approved provider relationship, and retain audit receipts. Do not
  recreate a singleton or standing operator-admin privilege as a shortcut.
- Who says yes: Jacob for the inventory and each production repair/rollback,
  with the business's provider authority confirmed. Unexpected early data
  blocks the normal rollout until its recovery is approved and verified.

### Step 16a · Needs you chase covers every business

[Step issue #364](https://github.com/Strelva/Strelva-OFFICIAL/issues/364).

- What: the platform service actor chases decisions for every business under
  `STRELVA_NEEDS_YOU_RELEASE`, including another agency's clients and
  businesses with no agency. Owners still never need to sign in to receive
  supported decision links; access, money and exit retain their sign-in bar.
- Command/approach: after 7A's all-business scope and caller changes land,
  rehearse the hourly `needs-you` cron with synthetic Strelva-agency,
  outside-agency and self-serve businesses, including owners with no account.
  Seed each converted tenant's policies with S11. Turn
  `STRELVA_NEEDS_YOU_RELEASE=1` on only after the parity and scope checks;
  retain the separate Make real owner-link and email gates.
- Verify: all three business types receive the same eligible Needs you item
  and logged service receipt; none relies on a Strelva provider or operator
  admin. Only the owner can decide; an approved activation resumes once;
  cross-business access is refused; email stays off while gated. Observe the
  first production cron and compare its receipts to the approved scope.
- Rollback: unset `STRELVA_NEEDS_YOU_RELEASE` with the required new deploy;
  verify the cron returns to heartbeat only. Preserve open decisions and
  receipts; disabling the chase does not undo an approved outside effect.
- Who says yes: Jacob for the global flag and rollback after local/Preview
  parity. Live email and effect channels remain separate yeses.

### Step 19a · Open agency signup

[Step issue #368](https://github.com/Strelva/Strelva-OFFICIAL/issues/368).

- What: anyone can sign up as an agency and build immediately; outside
  effects start off and unlock per agency after verification.
- Command/approach: after steps 10a–10b and the neutral journeys pass,
  release the ordinary agency signup through the implemented signup gate.
  Review the final flag name, default and kill switch when that gate lands;
  no new env name is assumed here. Publish only Jacob-approved agreement
  terms and signup language. Verification uses step 10b's bar.
- Verify: a fresh non-operator signs up, builds and sees only its own queue;
  publish, Google writes, email and payments fail while unverified. A
  single effect grant unlocks only that effect with client authority. Strelva
  has no default matching or catalog-placement advantage; businesses can
  still self-serve without an agency.
- Rollback: close the signup gate through its verified kill switch and
  revoke affected effect grants if needed; keep existing agency records,
  client data and exit available. Closing signup does not cancel agreements.
- Who says yes: Jacob on public signup, agreement terms and any rollback,
  after local/Preview evidence. No pricing, rates or agency share are selected here.

### Step 19b · First outside agency

[Step issue #369](https://github.com/Strelva/Strelva-OFFICIAL/issues/369).

- What: onboard and verify the first agency outside Strelva using the same
  signup, workspace, queue, authority and qualification bar.
- Command/approach: the agency accepts Jacob-approved terms, signs up itself
  through step 19a, builds, then submits step 10b's verification. A business
  explicitly chooses that agency; run one agreed workflow with the business's
  approval. Select the payer per business without changing the 9 clients'
  existing payer or commercial terms. No operator-admin shortcut.
- Verify: receipts for signup, verification and chosen provider; isolation
  from Strelva's clients; unverified effects denied and only approved verified
  effects accepted; the same Needs you chase; owner replacement without data
  migration; payer and billing reads match the chosen model. Record observed
  use separately from journey tests; one onboarding is not proven economics.
- Rollback: revoke effect grants, pause the agreed work and let the owner
  end or switch the provider through the ordinary path. Preserve business
  data, approvals and receipts. Unwind any commercial commitment only on its
  agreed terms; never delete the business to remove an agency.
- Who says yes: Jacob on terms, onboarding and any platform grant; the
  outside agency accepts its agreement and the business chooses its provider,
  payer and each outside action. No outreach or commitment is authorized by
  this packet.

---

## Still unproven

- Steps 0–4 have the supplied Oct 7 evidence above. This docs-only amendment
  did not re-read production or inspect private dumps. Later production
  steps, including batch 7A and all agency gates, remain unexecuted here.
- The hold decision #234 is pending. Verification method and agreement
  terms still need Jacob; each of the 9 clients' `existing_contract` evidence
  and Twin Trees' business structure must be confirmed before conversion.
- Audit H reports release-safety's local restored-copy rehearsal and rollback
  companions for batches 1–7. This branch does not contain that harness or
  batch 7A. Integrate its manifest/evidence and record 7A's forward, reverse,
  forward rehearsal; hosted Postgres 17 qualification remains a separate gate.
- The exact signup kill switch, verification/re-path tools, amended
  `--agency` conversion option and `payerKind` metadata writer are prerequisites,
  not runnable completion claims in this checkout.
- The `update_bounded_product_work` rewrite assumes production's function text
  matches the repo; the batch 2 pre-check settles it.
- The Oct 7 snapshot and `0.2.1` storefront 60/60 are production evidence.
  They do not prove the candidate's agency behavior.
  The snapshot's new facts (wave 2–3 flags, sentinels incl. the org layer,
  legacy booking counts, booking Redis families) are covered by
  `src/__tests__/production-readiness-snapshot.test.ts`, which now also fails
  when a pending migration that creates a table has no sentinel.
- Batches 5 and 6's original split was checked by reading SQL dependencies;
  audit H now cites the release-safety rehearsal. `btree_gist` availability
  on production still needs the batch 6 pre-check (finding 12).
- Booking parity needs seven daily production runs by hand (finding 14);
  a cron for it does not exist yet.
- The `w2/release-hardening` fixes (findings 3, 5, 6, 8, 10, 11) are proven
  with unit and route tests against fakes and with the local SQL checks.
  None has run against hosted Postgres, real Redis or a deployed app. The
  per-site flag lookup depends on `resolve_billing_workspace` (batch 4);
  before batch 4 a failed lookup falls back to the env value, which never
  turns a flag on that the env has off.

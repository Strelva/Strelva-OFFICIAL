# Strelva 1.0 release packet

Created: 2026-10-06 against `integrate/reborn-1.0` at `9e0bd441`.
Updated: 2026-10-06 on `w2/release-hardening`: findings 3, 5, 6, 8, 10 and
11 are fixed in code and proven locally (tests and SQL checks), never in
production. Two migrations were added (34 unapplied in total).
Status: prepared, nothing executed. Every step below is a separate yes.

This is every production step Strelva `1.0.0` needs, in order, written so
Jacob can say yes one item at a time. Each step names the exact command, what
it changes, how to verify it, and how to undo it. Saying yes to one step never
implies the next.

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
   billing home. So: all five batches, then conversions.
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
   (S10). Without the workspace release, link fields keep the env-only rule.
7. **"Stripe test mode first" can't run as specced.** The script picks its
   mode from the key prefix but reads Stripe ids from whatever Supabase is
   configured. A test key against production ids fails every update. A real
   rehearsal needs test-mode objects seeded on purpose (section 3, step S7).
8. **Twin Trees defaults to one business; `--separate-business` now exists.**
   Converting the second site still auto-joins the first site's workspace.
   `--separate-business` (migration `20261008160000`, batch 4) converts a
   linked-account site into its own business instead. Ask the owner before
   converting either site (section 4).
9. **No rollback SQL exists for any of the 32 migrations**, and production had
   PITR off and no listed backups on Sept 21. A tested dump comes first.
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

## The whole order

| # | Step | Kind | Section |
| --- | --- | --- | --- |
| 0 | Read-only production snapshot | read | 0 |
| 1 | Dump and test-restore the database | read + local | 1 |
| 2 | Batch 0: `tenant_leads` | migration | 1 |
| 3 | Deploy `0.2.1` from `main` (lead dual-write) | deploy | `strelva-reborn.md` |
| 4 | Lead backfill | data | 3 · S1 |
| 5 | Preview environment (optional, recommended before batch 2) | new env | 5 |
| 6 | Batches 1 to 4 | migration ×4 | 1 |
| 7 | Deploy the 1.0 candidate with every new flag unset | deploy | 2 |
| 8 | Copy report and analytics state; client-records dual-write, backfill, parity | data | 3 · S2–S3 |
| 9 | Confirm `SECRETS_ENC_KEY` | env read | 2 |
| 10 | Scrubbed copy and dry run for every active tenant | read + local | 3 · S4 |
| 11 | Agency workspace + designate | data | 3 · S5 |
| 12 | Conversions: test tenant, gldf, then the rest | data ×N | 4 |
| 13 | Flags in order | env ×N | 2 |
| 14 | Stripe `workspaceId` metadata | Stripe | 3 · S7 |
| 15 | Google binding copy, verify, then read flag | data + Google | 3 · S8 |
| 16 | Owner invites, then email on per client | email | 3 · S6, 2 |
| 17 | Release cut `1.0.0` with marketing | release | `VERSIONING.md` |

Steps 8 and 9 can run in parallel with 10. Nothing from step 12 on starts
before step 6 is complete.

---

## 0. Read-only snapshot (first yes)

The Sept 30 record is six days old. Every count in this packet comes from it
or from code. Re-read before the first write:

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

Out of scope: gldf's own Supabase project (paused on Sept 30), Stripe,
Vercel logs, Google, approve-link counts.

**Stop if** the snapshot shows any migration applied that the repo lacks,
any 1.0 table already present, or a tenant count that differs from 14/12
without an explanation.

---

## 1. Migrations

### What production has

From the [Sept 30 record](./strelvav2-horizontal-acceptance.md#september-30-workspace-production-release):
`supabase migration list --linked` matched all 84 repository migrations through
`20260921220000_customer_business_entry`, then
`20260930120000_revoke_public_execute_internal_functions` was pushed alone.
That is 85. The org layer (`20260729180000_org_layer_phase0_accounts`) is among
them, applied 2026-07-30 per
[persistence boundaries](../architecture/persistence-boundaries.md): dormant,
nothing reads its tables. Batch 4 is the first thing to use them.

### What is unapplied: 34 files

`9e0bd441` holds 117 migrations; `w2/release-hardening` adds two
(`20261008160000` in batch 4, `20261008161000` in batch 3), so 119. The 34
below are not in production. Digest is the first 12 hex characters of
SHA-256 at `9e0bd441` (the two new files at `w2/release-hardening`). Re-hash
before each push and stop on any difference.

### Before batch 0: a backup you have restored

The Sept 21 record found PITR disabled and no listed backups. Before batch 0:

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
npx supabase --workdir "$DIR" db push --linked --dry-run --include-all   # batches 1-4
# On the yes: the same command without --dry-run. Then the batch's verify queries.
```

The applied-file filter returns exactly 85 files at `9e0bd441` (checked
locally). The `--workdir`, `--include-all` and `--dry-run` flags were not run
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

Each batch depends only on earlier batches. The Sept 30 app must keep
working on every batch. That is Gate 2 step 4, rehearsed locally by
`pnpm check:workspace-upgrade`, which applies the files in filename order, not
in batches; it is not yet rehearsed against the old app. Preview (section 5)
is the place to rehearse the batches on hosted Postgres 17.

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
  (none until S5).
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

---

## 2. Env flags

Every flag below is read by code at `9e0bd441`. Env changes need a new
production deploy, not a redeploy. Each flag is its own yes.

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
| `STRELVA_NEEDS_YOU_RELEASE` | Needs you and Strelva handled; hourly cron does work | off (cron heartbeat only, routes 503) | `1` | No | batch 3 | unset |
| `STRELVA_PUBLISHING_RELEASE` | Listing and newsletter Systems, Connect Google | off | `1` | No; shows inside Systems | batch 3, S8 | unset |
| `STRELVA_GOOGLE_BINDINGS` | Read the Postgres Google binding first, fall back to Redis (counted daily in `reb:google-binding:fallback:*`); OAuth callback writes both | off (Redis only) | `1` | No | batch 3, `SECRETS_ENC_KEY`, S8 | unset |
| `STRELVA_BUSINESS_BILLING` | `workspaceId` on new checkout metadata; webhook copies payment status to the business | off | `1` | No | batch 4 | unset |
| `STRELVA_CLIENT_RECORDS_DUAL_WRITE` | Copy Redis client stores to `tenant_client_records`; the daily `client-records-parity` cron records parity | off | `1` (and `DUAL_WRITE_PG` not `0`) | No | batch 3 | unset |
| `STRELVA_CLIENT_RECORDS_READ` | Read a store from Postgres, only after a 7-day parity streak | empty | comma list of `spam_held`, `inquiry_timeline`, `inquiry_reply`, `booking_config`, `account_grouping` | Per store | batch 3, S3 | remove the store |
| `STRELVA_EXPORT_SCHEMA_3` | Paged export v3; link emailed to the owner | off (503) | `1` | No | batch 4 | unset |
| `SCAFFOLD_PREVIEW_SIGNING_SECRET` | HMAC for private website share links | falls back to `CRON_SECRET` | any secret | n/a | none | n/a. Set a dedicated value before rebuild sharing |

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

1. Deploy the 1.0 candidate with every new flag unset, after batch 4. The
   new crons then: `lead-mirror-reconcile` hourly; `client-records-parity`
   daily, heartbeat only until the dual-write is on; `needs-you` heartbeat only;
   `website-health` and `website-domain-verification` alert only when rebuild
   is on, and the domain cron skips without `VERCEL_API_TOKEN`.
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
8. `STRELVA_NEEDS_YOU_RELEASE=1`, only after `needs-you-parity` is clean.
   Owners get nothing while email is gated.
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

---

## 3. Scripts that need `--i-have-jacobs-yes`, in order

None of these load an env file. Run them as
`npx tsx --env-file=<private prod env file> scripts/…` and delete the file
after. Each script treats any `SUPABASE_URL` that isn't loopback or
`*.localhost` as production. Every one is a dry run without `--apply`.
Dry runs read production, so they ride on the same yes as the apply.

| # | When | Dry run | Apply | Writes | Needs |
| --- | --- | --- | --- | --- | --- |
| S0 | Step 0 | — | `npx tsx scripts/production-readiness-snapshot.ts --i-have-jacobs-yes` | nothing | — |
| S1 | After batch 0 and the `0.2.1` deploy | `npx tsx scripts/backfill-tenant-leads.ts` | `npx tsx scripts/backfill-tenant-leads.ts --apply --i-have-jacobs-yes` | `tenant_leads` via `record_tenant_lead`; clears `reb:lead-mirror:pending` entries, and a successful write also clears `reb:lead-mirror:schema-missing`. Idempotent | batch 0 |
| S2 | After batch 1 | `npx tsx scripts/copy-report-analytics-state.ts` | `npx tsx scripts/copy-report-analytics-state.ts --apply --i-have-jacobs-yes` | `tenant_report_state`, `tenant_analytics_config` with `via='backfill'`, fills only what's missing | batch 1 |
| S3 | After batch 3 and `STRELVA_CLIENT_RECORDS_DUAL_WRITE=1` | `npx tsx scripts/client-records-move.ts backfill` | `… backfill --apply --i-have-jacobs-yes`; then the daily `client-records-parity` cron records parity on its own (no command). `client-records-move.ts parity --i-have-jacobs-yes` remains for an on-demand check | `tenant_client_records` (backfill only); parity rows (one per store/tenant/day) come from the cron | batch 3 |
| S4 | After batch 4 | `pnpm check:scrubbed-copy` (local only, no yes) | `pnpm scrubbed-copy create --out=$HOME/strelva-copies/$(date +%F) --source=<pg host> --source-redis=<db>.upstash.io --grandfathered=gldf,rohlax --i-have-jacobs-yes`, then `pnpm scrubbed-copy dry-run --out=…` and `npx tsx scripts/needs-you-parity.ts` against the copy | nothing in production; a local copy outside every git checkout | read-only source credentials in a clean shell ([scrubbed copy](./scrubbed-production-copy.md)). Check free disk first (12 GB on Oct 6) |
| S5 | Before the first real conversion | — | Jacob, signed in at `app.strelva.com/workspace`, creates the agency workspace "Strelva" (`create_agency`); read its id; then `npx tsx scripts/business-ownership.ts designate-agency <workspace-id> --operator-email=<super admin> --apply --i-have-jacobs-yes` | `strelva_agency_workspace`, mirrored to `platform_workspaces`; marks converted businesses as operated by Strelva. Set once; a second id is refused | batch 3 |
| — | Conversions | section 4 | section 4 | section 4 | batches 0–4 |
| S6 | Per client, after its conversion and walk-through | `npx tsx scripts/business-ownership.ts invite-owner <slug> --operator-email=<super admin>` | `… invite-owner <slug> --operator-email=<super admin> --apply --i-have-jacobs-yes` | owner invitation; **also attempts the email** (the yes sets both). It leaves only if `EMAIL_SENDING_ENABLED=true` or `reb:client-email:<slug>=on`; otherwise the accept link prints. Revoke: `… revoke-owner-invite <invitation-id> --operator-email=<e> --apply --i-have-jacobs-yes` | batch 3 |
| S7 | After conversions and `STRELVA_BUSINESS_BILLING=1` | `npx tsx scripts/stripe-workspace-metadata.ts` (no Stripe call) | test key: `npx tsx scripts/stripe-workspace-metadata.ts --apply --i-have-jacobs-yes`; live key: add `--live` | Stripe `metadata.workspaceId` on subscriptions and customers, merge only. An object reachable from two businesses is a conflict and never written | batch 4. A dry run that lists every tenant as "Not converted" means batch 4 is missing: the RPC error is swallowed |
| S8 | After conversions | `npx tsx scripts/copy-google-bindings.ts` | `npx tsx scripts/copy-google-bindings.ts --apply --i-have-jacobs-yes`, then `npx tsx scripts/copy-google-bindings.ts --verify-google --i-have-jacobs-yes` | `workspace_account_bindings`, `workspace_google_locations`, re-encrypted, `migrated_from='redis'`; never overwrites. Verify mints one token per copy and makes one read-only Google call. Unconverted tenants are skipped | batch 3, `SECRETS_ENC_KEY` (apply refuses without it), conversion |
| S9 | Around each step | — | `npx tsx scripts/storefront-parity.ts capture … --i-have-jacobs-yes` and `compare` | only the `--out` file | section 4 |
| S10 | For a workspace with no client page (the Strelva agency workspace) | `npx tsx scripts/workspace-release-flag.ts <workspace-id> systems operators --operator-email=<super admin> --reason="<why>" --i-have-jacobs-yes` (reads the row) | same with `--apply` | one `workspace_release_flags` row and its change record, revision-checked | batch 3 incl. `20261008161000` |
| — | Not part of 1.0 | `npx tsx scripts/backfill-secret-encryption.ts --i-have-jacobs-yes`; `npx tsx scripts/count-client-redis-keys.ts --i-have-jacobs-yes` (read-only) | backfill: `--apply --i-have-jacobs-yes` | encrypted secret columns and `connections:*` | `SECRETS_ENC_KEY` |

**Stripe, test mode first, done properly (S7).** A test key against
production ids fails every update. Rehearse on Preview instead: seed one
test-mode customer and subscription per converted Preview business with
`tenantId` metadata, run the dry run, `--apply --i-have-jacobs-yes`, and read
the metadata back in the Stripe test dashboard. Then the live dry run, then
`--live` on Jacob's yes. Rollback: the script only adds `workspaceId`;
removing it is a one-line `metadata[workspaceId]=""` update per object
listed in the apply output.

---

## 4. Per-client conversion runbook

Conversion makes each live client a business workspace whose website is its
first System. It never changes the tenant row, `reb:` keys, `/api/v1`,
memberships, Stripe, and never emails anyone. The operator becomes the
workspace's `admin`, not owner.

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
D=/private/tmp/strelva-conversion/$SLUG && mkdir -p $D

# a. Storefront before (read-only)
npx tsx scripts/storefront-parity.ts capture --base=https://app.strelva.com \
  --tenants=$SLUG --out=$D/before.json --i-have-jacobs-yes

# b. Dry run (reads production, writes nothing)
npx tsx --env-file=<prod env> scripts/convert-tenant-to-workspace.ts $SLUG --operator-email=$OP

# c. On the yes for this tenant
npx tsx --env-file=<prod env> scripts/convert-tenant-to-workspace.ts $SLUG --apply --operator-email=$OP --i-have-jacobs-yes

# d. Prove nothing a site reads changed
npx tsx scripts/storefront-parity.ts capture --base=https://app.strelva.com \
  --tenants=$SLUG --out=$D/after.json --i-have-jacobs-yes
npx tsx scripts/storefront-parity.ts compare $D/before.json $D/after.json   # 5 of 5 identical
pnpm check:custom-repos
```

Then: rerun the dry run (it reports "already converted"); check the business
has a billing home (`read_business_billing` via the operator console); 24
hours with `reb:lead-mirror:pending` empty and no new 5xx; set the workspace
row to `operators`; Jacob walks every page; then S6 and `on`.

**The full 60/60.** Around each migration batch and each deploy, capture all
12 active tenants (12 × 5 reads) the same way and compare before and after.
That is the Sept 30 check: site-capabilities, page-config, content
settings/hero/navigation, byte for byte. For a candidate deployment before
promotion, capture its protected URL with `VERCEL_AUTOMATION_BYPASS_SECRET`
in the environment and compare against live.

**Stop if** any read differs, the conversion receipt shows skipped fields
the dry run didn't, or a lead fails to mirror.

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
it is the hosted rehearsal for this packet: batches 0–4 in order on hosted
Postgres 17, conversions of synthetic tenants, flags in order, and S7's
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

## Still unproven

- Every production fact here is from the Sept 30 record or code. Step 0 is
  the first fresh read.
- The batch-directory push recipe and the CLI flags were not run (no Supabase
  CLI on this machine).
- No migration has been rehearsed against the Sept 30 app on the same schema.
- The `update_bounded_product_work` rewrite assumes production's function text
  matches the repo; the batch 2 pre-check settles it.
- `storefront-parity.ts` and the snapshot are proven against fakes only.
- The `w2/release-hardening` fixes (findings 3, 5, 6, 8, 10, 11) are proven
  with unit and route tests against fakes and with the local SQL checks.
  None has run against hosted Postgres, real Redis or a deployed app. The
  per-site flag lookup depends on `resolve_billing_workspace` (batch 4);
  before batch 4 a failed lookup falls back to the env value, which never
  turns a flag on that the env has off.

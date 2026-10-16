# Migration plan: the 28 held files, rehearsed on production's schema

October 16, 2026. Branch `xa/fix-migrations` (base `b4b433005`). Prepared for the
cutover session. Running any step below against production still needs Jacob's
yes (AGENTS.md: database migrations).

> **After the merge into `xa/build-20261015`:** the switch-on lane added a 29th
> held file, `20261028120000_owner_email_confirmations.sql` (with its rollback).
> It is newer than the 28 rehearsed here and was not part of this rehearsal. The
> staged push now applies 29 files; rerun
> `scripts/release-safety/rehearse-pending-on-restored-schema.sh` before the
> cutover so the 29th gets the same forward, reverse and reapply proof.

## Bottom line

Production has applied 400 of the repo's 428 migrations, and the history matches
the files exactly (same versions and names, nothing extra). The other 28 are all
newer than production's newest applied version (`20261025170000`), so one plain
`supabase db push` from a staged directory applies exactly those 28, in filename
order. The CLI's own read-only dry run against production lists exactly these 28.

On an exact copy of production's schema, restored on PostgreSQL 17.11, all 28
applied cleanly as the non-superuser `postgres` role. All 28 rollbacks then ran in
reverse order and returned the catalog to production's exactly (10,089 objects,
zero differences). Reapplying gave the forward catalog again, also with zero
differences. The existing proofs (`pnpm check:release-safety` and the batch8
`--current-tail` proof) pass on PostgreSQL 17.

**Order: schema first, then code.** All 28 files are additive with respect to
the code running in production now. Two of them, `20261026160000_sites_atomic_publish`
and `20261027120100_site_content_source_backfill`, must be in place before the
new build serves traffic. So the push goes first, the read-only checks pass, and
only then is the new deployment promoted. After the promote, the backfill gets
re-checked (see risk R2).

Drift between production and the repo history: **three items**, none of them in
the path of the 28 files (details under "Drift").

## Evidence

| What | Result | Where |
|---|---|---|
| Prod history vs repo (`supabase_migrations.schema_migrations`, versions and names only) | 400 applied, 400 match by version and name, 0 in prod and missing from the repo, 28 pending | read on Oct 16 |
| CLI view | `supabase db push --workdir <stage> --linked --dry-run` lists exactly the 28 files below | `.scratch/release-safety/logs/push-dry-run.log` (deleted) |
| Schema-only dump | `pg_dump --schema-only` with PG 17.11 client against prod 17.6; 0 `COPY`/`INSERT` lines; read-only session (`default_transaction_read_only=on`) | deleted after use |
| Restore on PG 17.11 | 11 errors, all from `supabase_vault` (a hosted-only extension) and its grants; no pending file touches `vault` | `scripts/release-safety/rehearse-pending-on-restored-schema.sh` |
| Forward x28, reverse x28, forward x28 | C2 == C0 exactly; C3 == C1 exactly (`catalog-wide.sql`: functions, owners, ACLs, tables, columns, constraints, indexes, triggers, policies, types, default ACLs, every app schema) | same script |
| Expected build catalog | Prod + 28 (C1) vs a fresh replay of all 428 repo files on a hosted-platform skeleton: only the 3 drift items differ | `catalog-wide.sql` diff |
| Live prod catalog vs replay of the 400 applied files | Same 3 drift items, plus platform-only default ACLs (graphql, realtime) and `supabase_vault` | read-only `catalog-wide.sql` on prod |
| `STRELVA_PG_BIN=…/postgresql@17/bin pnpm check:release-safety` | exit 0 (69 tests; batches 0 to 7 forward/rollback/forward; refusals; dump/restore) | local |
| `STRELVA_PG_BIN=…/postgresql@17/bin pnpm exec tsx scripts/check-release-safety-batch8.ts --current-tail` | exit 0: 202 remaining forwards applied after the batch8 capture; 2 recovery rounds; exact catalog reproduced | local |
| `pnpm check:release-safety:batch8` with the default PG 18 | exit 0 (the PG 18 default still works) | local |
| Migration-reading Vitest suites (34 files) + new test | 35 files, 391 tests pass; `pnpm typecheck` and eslint on changed TS pass | local |

Everything here was proven locally against a restored schema, not against
production. Row-dependent behaviour (constraint validation on real rows, the
backfill on real tenant rows, populated rollback refusals) was not exercised on
real data. The schema read was authorized as schema-only, so no rows were read.

## Drift: production vs repo history

1. **`public.unified_events.id` has no default in prod.** Replaying the repo in
   filename order gives `default gen_random_uuid()::text`. Two files from July 14 touch
   it: `20260714183000_align_domain_identifier_types` drops the default and
   `20260714200746_onboarding_firebreak` sets it. Prod evidently ran them in the
   other order. App writes always supply ids (`evt_*`), so nothing breaks today.
   If parity matters, it needs a separate, reviewed forward fix (`alter column id
   set default gen_random_uuid()::text`). It is **not** in this packet.
2. **`public.reb_touch_updated_at()` exists only in prod.** It is a trigger
   function with no trigger using it, no reference anywhere in the repo, and
   `EXECUTE` granted to PUBLIC, anon, authenticated and service_role. It is an
   inert orphan. Leave it, or drop it later in its own reviewed migration.
3. **Schema `release_runtime_recovery` (4 tables) exists only in prod.** It was
   created by the operator-run `capture-batch8-runtime-baseline.sql` /
   `capture-batch8-runtime-scope.sql`, not by a migration. This is expected per
   the release-safety README. Keep it: the batch8 disable/enable path depends on it.

A false alarm, already ruled out: a dump and restore re-parenthesizes CHECK
expressions (`a AND b AND c` vs `(a AND b) AND c`). Once both sides go through
the same dump and restore (or both are read live), those differences go away.
Comparing the live prod catalog with an un-restored replay shows only the items
above.

## The release-order trap

- `20261026160000_sites_atomic_publish` adds `publish_site_drafts(...)`, which the
  new build calls (`src/platform/infra/db/repositories.ts`). If the code goes
  first, site-editor publish fails. It also adds `content`/`page_config`
  `updated_at` touch triggers. The current production code tolerates them; the
  only effect is more accurate revalidation.
- `20261027120100_site_content_source_backfill` sets
  `tenants.custom_repo.contentSource = 'strelva'` for gldf, rohlax and
  rhm-innovations. The new build has no fallback list, so without the backfill
  those three sites read as `request` (Ask for a change) instead of native editing.

Both are safe ahead of the current code, so all 28 go first. Every other file is
additive for the deployed code too. Of the 22 pre-existing objects the packet
changes, none is removed. Every `create or replace` keeps its signature, and
every constraint change is a superset of production's current definition. I
checked the prod definitions of `owner_decisions_route_check`,
`owner_decisions_decided_by_kind_check`, `business_record_facts_fact_key_check`
and `connection_holders_provider_check`. Release flags added by steps 12, 16, 21
and 24 (`sites_by_code`, `keep_your_site`, `listings_sync`, `vertical_intake`)
have no rows, so they are off. App-event capture inserts `capture=false`, and the
new triggers do nothing while it is off. The Dental gate (`vertical_intake`)
stays off: the schema lands, the flag does not turn on.

## What the backfill touches in production

```sql
update public.tenants
   set custom_repo = coalesce(custom_repo,'{}'::jsonb)
     || jsonb_build_object('contentSource','strelva','declarationCheckedAt', <now, UTC ISO>)
 where id in ('gldf','rohlax','rhm-innovations')
   and coalesce(custom_repo->>'contentSource','') = '';
```

- At most **3 rows** of `public.tenants`, only the `custom_repo` column (plus
  nothing else: no tenants trigger fires on `custom_repo`; `updated_at` is not
  touched by this statement). A tenant that already declares any non-empty
  `contentSource` (e.g. `repo`) is skipped.
- Rehearsed with fictional rows (`scripts/release-safety/fixtures/`): null
  `custom_repo` becomes `{"contentSource":"strelva",…}`, an object gains the two keys and
  keeps the rest, `contentSource: ""` is overwritten, `contentSource: "repo"` and
  tenants outside the list are untouched.
- Its rollback is **not exact**: a row that started as `NULL` comes back as `{}`,
  and a pre-existing `declarationCheckedAt` is removed. Both are harmless for
  readers, but the rollback is not an identity.
- Pre-flight, read-only, part of the migration's own authority (it reads key
  presence and the one enum value, no customer data):

```sql
select id, jsonb_typeof(custom_repo) shape, custom_repo ? 'contentSource' declared,
       custom_repo->>'contentSource' source, custom_repo ? 'declarationCheckedAt' checked
  from public.tenants where id in ('gldf','rohlax','rhm-innovations') order by id;
```

  Go only if every `shape` is `object` or NULL. An array or scalar would be
  concatenated, not merged. A row whose `source` is already `repo` stays `repo`,
  and then check 13b in the verify file will (correctly) show `false`. Decide
  that case before the push.

## Cutover runbook (main session, with Jacob's yes)

All commands run from this worktree (or any checkout at this branch's head).
`$STAGE` is a fresh directory outside git (e.g. `/private/tmp/strelva-stage-<ts>`).

1. **Fresh history read (read-only).** Save the versions to
   `$STAGE.applied`:
   `select version from supabase_migrations.schema_migrations order by 1;`
   Expect exactly 400 rows, newest `20261025170000`, none between
   `20261026100000` and `20261028110000`. Stop otherwise.
2. **Catalog guard (read-only).** Run `scripts/release-safety/catalog-wide.sql`
   against prod in a session that has run `set role postgres` (psql `-q -At`), and hash the output.
   Rehearsed digest: `c35129dd6918d7edce9674a517a2df3e4ef680184595cda000644df7d73b5d99`
   (10,099 lines). A different digest means the schema changed after this
   rehearsal. Stop and re-rehearse.
3. **Backfill pre-flight** (query above).
4. **Stage:** `bash scripts/release-safety/stage-pending.sh $STAGE.applied $STAGE`.
   It refuses unpinned files, digest mismatches, missing rollbacks, and pending
   files older than the newest applied version (so `--include-all` is never
   needed). It copies only timestamped forwards plus `config.toml` and its templates.
   Pass a third argument (a version) to stop at a boundary.
5. **Link and dry run:** `supabase link --project-ref zthifbnrtsirdekzzlxs --workdir $STAGE`,
   then `supabase db push --workdir $STAGE --linked --dry-run`. The list must
   equal `$STAGE/pending-receipt.json` (the 28 below).
6. **Push:** `supabase db push --workdir $STAGE --linked` (no `--include-all`).
7. **Verify (read-only):**
   `psql "$DB" -X -At -v ON_ERROR_STOP=1 -c 'begin read only' -f scripts/release-safety/verify-pending-20261016.sql -c rollback`.
   Every row must be `t` (44 checks: 2 history, 26 final function fingerprints, 11
   tables, the touch triggers, flag names, `publish_site_drafts` grants, backfill, the 10 guard schemas).
   All rows were `t` on the rehearsed final state.
8. **Promote the new build.** Then wait 60 s (the `reb:tenants:all` cache TTL)
   and re-run check 13b (risk R2).

If step 6 stops partway, the files already applied stay applied (each file is its
own transaction). Fix the cause and re-run steps 4 to 7: staging picks up from the
new history.

## The 28 steps

Apply command for every step: step 6 above (one push, filename order).
Strong locks were measured on the rehearsal copy by holding each file's
transaction open and reading `pg_locks` for relations that exist in production.
SRE = ShareRowExclusive (blocks writes, not reads), AE = AccessExclusive (blocks
reads too), SUE = ShareUpdateExclusive. Every file except #28 sets
`lock_timeout = 3s`. #28 only replaces a function and takes no table lock.
Runtime is local and on empty tables. Production tables are small (nine clients
on the tenant model), so expect tens of milliseconds per file and under 2 s of
database time for the whole packet. The real risk is a lock wait, which turns
into a clean 3 s failure. AE locks are held only for the file's transaction, on
`business_ai_budget_reservations` (#7), `owner_decisions` (#10),
`website_change_receipts` (#14), `connected_sites` (#17) and
`business_record_facts`/`inquiry_business_fact_proposals` (#25). Each of these
scans its table once to validate a superset CHECK.

| # | Migration | sha256 | Strong locks on existing tables | Local ms (run 1/2) | Rollback sha256 | Rollback ms |
|---|---|---|---|---|---|---|
| 1 | `20261026100000_conn_core_holders` | `44ab6cf4bfb6e9a7bd00787780ca1b88ec8443352ba83c28c22cc2fa6076de94` | users=SRE workspaces=SRE | 26/25 | `3a85f7a7607cb0d05f9c68e51b3df81f851b7f0fa3730041e04e2eaf396863e2` | 53 |
| 2 | `20261026110000_conn_google_agency_oauth` | `a2a90f542e86967b99762f9cc2804c0571d763e1383683ae05eadc657f373d4e` | users=SRE workspaces=SRE | 24/20 | `0ace8db71cea75496f26ac2abf845da66b5c02e939ef7d5701b512e7547694dd` | 34 |
| 3 | `20261026120100_conn_tools_installer` | `a88fbd9c9584e2670f4a777eb850b26e625d041f74c322dee6486415d223d90f` | none | 22/19 | `b9d69ef8a32585a4288dcf4bcb5019a9c562e09c08369d4aabe15452fc59825e` | 37 |
| 4 | `20261026130000_conn_apps_declarations` | `dfcefd463a4d6ee5287ceb01a9d9c8418edcf2753d1d6a3ea4276694af825fe3` | none | 20/20 | `48a7f37a02e5d4f5e9b030f0dea715970a5abd2baa77a0ed262128ccba7f80f0` | 41 |
| 5 | `20261026150000_conn_outlook_calendar` | `71abcfded152ea827b230aa1d5e991298ea2b00c8a925c0b735075794d091814` | none | 21/21 | `4f5fdcd21f80e0d4307f92211fd2525ff6e522c3138481fdbb343c51437390d2` | 32 |
| 6 | `20261026160000_sites_atomic_publish` | `2a66755e700c916d29d38f5d0199c20bf850d6553d294918574ab6e20ac0063f` | content=SRE page_config=SRE | 17/16 | `4ce718e52887600f2701dbeba9fd4de449fced08d377126238bba5415fd8ab7f` | 26 |
| 7 | `20261026170000_ai_controls` | `13023c90c893ee4c6e2f15d48d0e1107f3a782c4f788ae973bb6247778749914` | business_ai_budget_reservations=AE users=SRE workspaces=SRE | 23/22 | `9989cb9c7dd57ce03d307da8828638ef89521f5372a605cf3d93757607efc168` | 54 |
| 8 | `20261026180000_money_agency_pay_links` | `f4776b87aa3f2e3af0a3230441c5fb09e696bfb7584be2e3d252cb60c89cab23` | business_payments=SRE workspaces=SRE | 26/24 | `7c90c8aa525ab05ceb5495b2612bd721ded314f7dff3c82f0c0a5b02b698def3` | 46 |
| 9 | `20261027100000_owner_reach` | `1c836506b0b762c7c9ab57c490c1b06da4d418e20b73efde86c4c12887049793` | none | 16/17 | `43ac6331bb1bab044114862746313bb6705a5925bbbf297fa0611c03fd071565` | 20 |
| 10 | `20261027110000_dedupe_flows_owner_decisions` | `bf81f5b6ec1950f2e5a25f075f8df1cbc14b7aa3179e668751617b368f680a27` | owner_decisions=AE | 17/17 | `ce59c211f28d88b7e0b5a70089477fb37b70cff843e5cc1ab59840fd50dee80c` | 22 |
| 11 | `20261027111000_provider_client_queue_v3` | `746e1fa5dc26a3e177b30912667fdb9565c5e99dac004dca4bca0e9e6f6a086e` | none | 17/15 | `2d0f76f80b5d33476b67bb8c5e85cd3f8bd1348785b1af30ef9955b24e112068` | 18 |
| 12 | `20261027120000_sites_by_code_flag` | `d38779a579f58144070cc20a1b863d0b08f40ef83bfcd5f39f7d7fa764c0f31e` | none | 15/16 | `6ec2ff669b755c36ff73351a1259236e6e46dd180e3095251773d68e6bd6d5ac` | 17 |
| 13 | `20261027120100_site_content_source_backfill` | `7d49f519a4a6ed9129ea7cc86dedf486ff5544160e1b8bb51a2d3897ac1c49f0` | none | 17/18 | `3c335f1aed6cdcfecc483bf511c93eb096de318bed972c55fe1823920b72b81f` | 18 |
| 14 | `20261027120200_site_change_agent_tools` | `b419ecb14996fdab446b2da9a3e551e4da3476c48613336d728709a618b2b63d` | assistant_connections=SRE website_change_receipts=AE website_change_receipts=SRE | 24/22 | `9f585a8f9f36687f16b6f7dcc093d7690869e986e338e6161b8aeca04056f174` | 18 |
| 15 | `20261027120300_website_code_releases` | `b79af0af09af91f25b52a82c36ab55f44497738d7eae61cd19a9e667dbb76bfb` | assistant_connections=SRE users=SRE workspaces=SRE | 23/24 | `5e72a3d47718a9e35a6cc5c79831192ca47d4006cf2c294bb9eefc43ce230607` | 19 |
| 16 | `20261027160000_keep_your_site_flag` | `e77939a1c89abfe4c77534fa9dea14d7060890e631637d22dae9845c56d0b516` | none | 18/18 | `eb2bc83d7e1e11a14de7c35d7924ba75776f6a4724a8cd3507d5e6cb3727e23f` | 18 |
| 17 | `20261027160100_keep_your_site_changes` | `5a3822ccd5dd747d98110ed71f5b534a5c46c2345bb419a574f220ace37133c4` | connected_sites=AE connected_sites=SRE service_requests=SRE system_revisions=SRE users=SRE workspaces=SRE | 34/30 | `cc73c1e740aad36a86232c625fe978a74fde75daa2ad23d118dd3c42ca9a197f` | 22 |
| 18 | `20261027160200_keep_your_site_agency_home` | `9f402ba74c1981f4ef523e6fcf10e6da1c173c511febb2123c8aeda988ce8ec2` | none | 19/18 | `91a8ed0f8a636930d5f6305205e8ade722f1968bdad1088baee969961280a906` | 17 |
| 19 | `20261028100000_app_events` | `70916590a46750c3babf8e0918ade58fd63718e6cad0842a36e7671fe3ed6fe1` | users=SRE workspaces=SRE | 34/34 | `e9a3879656d2e441ef20ec5ab5982fefcdae7a464aa5c681dfe63c1e17e2a88f` | 24 |
| 20 | `20261028100100_app_event_sources` | `029bad98991e9e83af7c62428cb9996d025c32ad4fa68d90cdf308deacf4e01f` | business_booking_history=SRE business_record_confirmed=SRE business_record_facts=SRE business_services=SRE connected_sites=SRE owner_decisions=SRE reviews=SRE system_revisions=SRE tenant_leads=SRE website_change_receipts=SRE workspace_account_bindings=SRE | 19/18 | `86a83a5745e696664df495678bb94665ec690628017453c93febfb6531716f09` | 17 |
| 21 | `20261028100200_listings_sync_flag` | `42f9e59490600587dd8ad7ec9dbb21fcdf53046c61fc474c632f9f76844639f2` | none | 16/15 | `c715d0bb90ffe869f36c7e36521537243bb4b5d2893992aea4c7076b17a5840f` | 18 |
| 22 | `20261028100300_listings_sync_store` | `85a30dc2c4943d488965b837cc3aae9fbf448c310bf3fd3c1e3bc9eae87f7204` | users=SRE workspaces=SRE | 24/26 | `44f3d3723d61b2f39b580efb97f3636cd7c96f72d7a63ebd9de7bc2b545b28a2` | 23 |
| 23 | `20261028100400_care_reports` | `4bd20d92cb9ed0a0bc7017e37f894552a066490ad6ae9536955da0919fd1eb38` | users=SRE workspaces=SRE | 33/31 | `22db7070eddcb5d0e9fe8c56bb960f3b0f87232e48ddb87f2690dada6909f5bb` | 25 |
| 24 | `20261028100500_vertical_intake_flag` | `716352f9b41650c9baed2f5e7e06bedbeed3ceaf79e802fae0ea6c487a4d961a` | none | 15/17 | `cbe01a5d37e9bac6977c709d785f4e1079289d573ce59233e83340885789538a` | 17 |
| 25 | `20261028100600_business_record_insurance_fact` | `15d05fd15176a227a5fe445041fe9e239fd004deb7a60c6e4121c7959e9bf844` | business_record_facts=AE business_record_facts=SUE inquiry_business_fact_proposals=AE inquiry_business_fact_proposals=SUE | 29/30 | `023587e9a2559fb8381333f69a62ecdb092b1bbc571058af3384a9e31d1a42f5` | 31 |
| 26 | `20261028100700_vertical_intake` | `113a802892d0485ead10d77ec13e5b343e50a3c9b9c1d743f34b79cf7c7b57bb` | tenant_leads=SRE users=SRE workspaces=SRE | 27/27 | `6b3036e2555c0560aaf8cfb516ea1fc4086cb0d1c9fefffaf48a9689d111977f` | 21 |
| 27 | `20261028100800_access_review_since` | `12abec19b1da406b4b1cdfd235e6af8f92fad011b422aa3eb8b698dd41493310` | none | 16/16 | `a9813f1e72c5000138cbb2d3d41dfd319f8555424eaec9a86040c1ed29c20ff5` | 15 |
| 28 | `20261028110000_agency_actor_person_name` | `ce86ed687c9d0a1b58a102d3febfb4bfffa3112839a7e93025ada316cd266f4a` | none | 16/16 | `32dca215841358093cff615f4a37bbaffad402220384303a73291990e78ed337` | 16 |


### Verification and rollback, step by step

Verification is the matching row of `scripts/release-safety/verify-pending-20261016.sql`
(labels use the step numbers above), plus `select 1 from supabase_migrations.schema_migrations where version = '<version>'`.

Rollback for step N runs in **strict reverse order** (28 back to N), one file at
a time, each as its own transaction:

```sh
psql "$DB" -X -v ON_ERROR_STOP=1 -f supabase/migrations/rollback-<file>.sql
# step 6 only (its rollback has no BEGIN): add --single-transaction
supabase migration repair --status reverted <version> --linked --workdir $STAGE
```

Every rollback below was run against the restored production schema with the
packet freshly applied (empty new tables). Refusal paths on populated tables were
**not** exercised in this rehearsal. The per-lane SQL fixtures cover some of them.

| # | Rollback behaviour (from the file; refusal = whole file aborts) |
|---|---|
| 1 | Refuses if `connection_holders`/`connection_holder_commands` have rows, a guarded function drifted, or a later caller depends on it. Drops the 2 tables and the `conn_core_rollback` schema. |
| 2 | Refuses on function drift, a later caller, or any `conn_google_agency_oauth_attempts` row. |
| 3 | Refuses on function drift or a later caller. |
| 4 | Refuses on function drift or a later caller. Restores `system_package_*` from its guard schema. |
| 5 | Refuses on drift or a later caller. Restores the provider check without `outlook_calendar`, which fails if outlook rows exist. |
| 6 | Drops `publish_site_drafts` and both touch triggers. Publications already made stay. |
| 7 | Refuses if any business has active AI controls or `list_price` reservations. Drops `ceiling_source` and the 2 tables. |
| 8 | Refuses if `agency_pay_links` or `money_documents` have rows. |
| 9 | Restores `issue_agency_client_owner_claim` and drops the reach reads. |
| 10 | **Deletes `owner_decisions` rows with `decided_by_kind = 'policy'` or `route = 'handle_after_notice'`** (policy receipts), then restores the narrower checks and drops the two functions. |
| 11 | Drops `read_provider_client_queue_v3`. |
| 12 | **Deletes `sites_by_code` flag rows, ceilings and flag change history** (it disables the history immutability trigger to do so), then restores the flag-name list. |
| 13 | Removes `contentSource`/`declarationCheckedAt` where they are `strelva`. Not exact (see above). Roll the code back first. |
| 14 | Refuses if a later migration changed the restored functions or ACLs. Receipts keep their rows; the provenance columns are dropped. |
| 15 | Refuses if `reconcile_website_system_releases` changed later; with recorded code releases it needs `set sites_by_code.allow_drop = '1'`. |
| 16 | Refuses if `keep_your_site` ceiling history exists; deletes its flag rows and ceilings and restores the prior function. |
| 17 | Refuses once any `released` change step exists. |
| 18 | Refuses on drift. Restores `read_agency_client_home`. |
| 19 | Refuses with events, dead letters or endpoints unless `set app_events.allow_drop = '1'` (which drops them). Deletes `app_events` flag rows and history. |
| 20 | Drops the 13 source triggers (on 11 tables) and their functions. Touches no data. |
| 21 | Deletes `listings_sync` flag rows, ceilings and change history (disables the immutability trigger). |
| 22 | Refuses with data unless `set listing_sync.allow_drop = '1'`. |
| 23 | Refuses if care reports, releases or time entries exist. Deletes `care_reports` flag rows and history. |
| 24 | Deletes `vertical_intake` flag rows, ceilings and change history (disables the immutability trigger). |
| 25 | Refuses on drift or any `insurance_accepted` fact. Restores the wrapped validator and its prior ACL. |
| 26 | Refuses once any intake release exists. Drops the intake tables. |
| 27 | Refuses on drift. Restores `read_access_review` without `since`. |
| 28 | **New in this branch.** Refuses unless `application_action_actor_snapshot` still has this migration's body (md5 `b09212f05eed923ed5eac932464edad7`). Restores production's current body (from `20261021181000`, md5 `0e87457beccd70089d6a97a1843396f4`) and ACL. Snapshots already written with `personName` keep it. |

## Risks and calls for the main session

- **R1. `business_record_fact_valid` loses service_role EXECUTE (step 25).** The
  wrapper is new and gets only `postgres=X`; production's current function has
  `service_role=X`. Proven on the rehearsal copy: as service_role, a direct
  `business_record_fact_valid(...)` call or any direct write to a table whose
  CHECK uses it fails with `permission denied`. Today every writer of
  `business_record_facts`/`inquiry_business_fact_proposals` is a SECURITY
  DEFINER function owned by `postgres` (17 found), and `src/` only reads those
  tables directly, so nothing breaks. It is a trap for any future direct
  service-role write. Options: accept (least privilege), or add
  `grant execute on function public.business_record_fact_valid(text,jsonb) to service_role;`
  to step 25 before the push. That would change its sha256 and require
  re-pinning and re-rehearsal. Not changed here.
- **R2. The backfill can be overwritten in the window before the promote.**
  `src/lib/tenants.ts` writes `custom_repo` whole whenever a caller passes
  `customRepo`. An operator tenant edit through the currently deployed code,
  made between the push and the promote, would drop `contentSource`. Keep the
  window short and re-run check 13b after the promote. If it reads `false`,
  re-running the same UPDATE is idempotent and safe (a production data fix, so
  it needs Jacob's yes). Tenant reads are cached for 60 s (`reb:tenants:all`),
  so the new code can see stale values for up to a minute after the push.
- **R3. Some rollbacks delete evidence.** Steps 12, 19, 21, 23 and 24 remove that
  flag's per-business rows and change history. Step 10 deletes policy-written
  `owner_decisions` receipts. Once any of these has been used, prefer leaving
  the schema and switching the flag off. Rollback is a pre-use escape hatch.
- **R4. Partial-push recovery.** Files with their own `BEGIN/COMMIT` commit
  before the CLI writes their history row. If the CLI dies in that gap, the
  schema is applied but the history row is missing, and re-running the push fails with
  "already exists". The fix is `supabase migration repair --status applied <version>`
  after confirming with the verify file. Not observed; inherent to the CLI.
- **R5. Fidelity limits.** Locally `postgres` is an ordinary role with prod's
  attributes and memberships but without Supabase's `supautils` grants;
  nothing in the 28 needed more. Row volumes and concurrent traffic were not
  simulated. The hosted-only `supabase_vault` was stubbed as an empty schema.

## How I got the schema (and what touched production)

- `supabase link` in this worktree, then `supabase db dump --linked --dry-run`. The CLI
  created its standard temporary login role (`cli_login_postgres`, expiring)
  through the Management API, then printed connection settings. No password
  had to be supplied. That role creation is the only thing that changed on the
  production side, and it is platform-managed: no schema, data or settings change.
- Every SQL session was forced read-only (`PGOPTIONS=-c default_transaction_read_only=on`)
  and ran as `postgres` via `set role`. Reads: `schema_migrations` versions and
  names, `pg_roles` attributes and memberships (no passwords), extension list,
  `pg_dump --schema-only`, `catalog-wide.sql`, `supabase db push --dry-run`.
- The dump, catalogs, clusters and connection settings lived under
  `.scratch/release-safety/` (gitignored) and were deleted at the end. None of
  it is in git.

## What this branch adds

- `supabase/migrations/rollback-20261028110000_agency_actor_person_name.sql`
  (the missing rollback; pinned in `batches.json` with its sha256). Every other
  pending file already had a pinned rollback with matching digests.
- `scripts/release-safety/postgres.ts`: `STRELVA_PG_BIN` selects the PostgreSQL bin
  directory. It must contain the binary, otherwise it throws instead of falling
  back. With no override, the PG 18 default is unchanged. Covered by
  `src/__tests__/release-safety-pg-bin.test.ts`.
- `scripts/release-safety/rehearse-pending-on-restored-schema.sh`: restore,
  fictional seed, forward, reverse, reapply, exact catalog equality, on any PG
  version.
- `scripts/release-safety/catalog-wide.sql`: a line-per-object catalog of every app
  schema (ACL items sorted, newlines escaped). Used for both the guard digest and
  the rehearsal diffs.
- `scripts/release-safety/stage-pending.sh`: offline staging of only the
  pending forwards, with pinned-digest refusals and an optional stop boundary.
- `scripts/release-safety/verify-pending-20261016.sql`: the read-only post-push check.
- `scripts/release-safety/fixtures/content-source-backfill-{seed,read}.sql`: fictional rows.

To re-rehearse after any change (needs a fresh, separately authorized
schema-only read in `<input-dir>`: `prod-schema.sql`, `applied.tsv`,
`roleattrs.txt`, `members.txt`):

```sh
STRELVA_PG_BIN=/opt/homebrew/opt/postgresql@17/bin \
  bash scripts/release-safety/rehearse-pending-on-restored-schema.sh <input-dir> <out-dir>
```

## Still unproven

- Any of this against production itself. Only the read-only dry run touched it.
- Constraint validation against production's real rows (the CHECKs are supersets
  of the current ones, so existing rows already satisfy them).
- The backfill's actual effect on the three real rows (pre-flight query above).
- Populated rollback refusals for the 28 files on this schema.
- The new build running against the migrated schema (preview or production).

\set ON_ERROR_STOP on
-- Listings in sync (20261028100300): queued checks, fixes, numbered Releases and
-- the service-only RPCs. Fictional rows on a disposable cluster, one transaction.
begin;
create function pg_temp.ls_assert(ok boolean, note text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'listings sync assertion: %', note; end if; end $$;
create function pg_temp.ls_refuse(statement text, reason text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if position(reason in sqlerrm) = 0 then raise exception 'expected %, got % (%)', reason, sqlerrm, statement; end if;
    return;
  end;
  raise exception 'expected refusal %, succeeded: %', reason, statement;
end $$;

-- ---- seed ----
insert into public.users(id, email, verified_at) values
 ('29100000-0000-4000-8000-000000000001', 'ls-owner@example.test', now()),
 ('29100000-0000-4000-8000-000000000002', 'ls-agency@example.test', now()),
 ('29100000-0000-4000-8000-000000000003', 'ls-stranger@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
 ('29100000-0000-4000-8000-000000000010', 'customer', 'Listings client', '29100000-0000-4000-8000-000000000001'),
 ('29100000-0000-4000-8000-000000000011', 'customer', 'Bare client', '29100000-0000-4000-8000-000000000001'),
 ('29100000-0000-4000-8000-000000000020', 'agency', 'Listings agency', '29100000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
 ('29100000-0000-4000-8000-000000000010', '29100000-0000-4000-8000-000000000001', 'owner', '29100000-0000-4000-8000-000000000001'),
 ('29100000-0000-4000-8000-000000000011', '29100000-0000-4000-8000-000000000001', 'owner', '29100000-0000-4000-8000-000000000001'),
 ('29100000-0000-4000-8000-000000000020', '29100000-0000-4000-8000-000000000002', 'owner', '29100000-0000-4000-8000-000000000002');
insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by) values
 ('29100000-0000-4000-8000-000000000010', '29100000-0000-4000-8000-000000000020', 'owner', '29100000-0000-4000-8000-000000000001');
insert into public.agency_client_staff(agency_workspace_id, customer_workspace_id, user_id, assigned_by) values
 ('29100000-0000-4000-8000-000000000020', '29100000-0000-4000-8000-000000000010', '29100000-0000-4000-8000-000000000002', '29100000-0000-4000-8000-000000000002');
insert into public.business_records(workspace_id, revision, created_by, updated_by) values
 ('29100000-0000-4000-8000-000000000010', 3, '29100000-0000-4000-8000-000000000001', '29100000-0000-4000-8000-000000000001');
insert into public.business_record_confirmed(workspace_id, entity, entity_id, state, confirmed_by_kind) values
 ('29100000-0000-4000-8000-000000000010', 'fact', 'phone', '{"value":"+17165550100"}', 'owner_write'),
 ('29100000-0000-4000-8000-000000000010', 'fact', 'owner_recipient', '{"value":"ls-owner@example.test"}', 'owner_write');
insert into public.tenants(id, site_name, stable_id, delivery_model) values
 ('ls-site', 'Listings Site', '29100000-0000-4000-8000-0000000000a0', 'custom_repo');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt)
  values ('29100000-0000-4000-8000-0000000000a0', 'ls-site', '29100000-0000-4000-8000-000000000010',
    '29100000-0000-4000-8000-000000000001', '29100000-0000-4000-8000-0000000000b0', repeat('c', 64), '{}');

-- ---- grants ----
select pg_temp.ls_assert(
  not has_table_privilege('service_role', 'public.listing_sync_checks', 'select')
  and not has_table_privilege('service_role', 'public.listing_sync_fixes', 'select')
  and not has_table_privilege('service_role', 'public.listing_sync_releases', 'select')
  and not has_table_privilege('authenticated', 'public.listing_sync_releases', 'select'),
  'no table privilege for anyone');
select pg_temp.ls_assert((
  select count(*) = 11 and bool_and(has_function_privilege('service_role', p.oid, 'execute')
    and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname = any(array['listing_sync_queue_check','listing_sync_claim_checks','listing_sync_confirmed_facts','listing_sync_targets',
    'listing_sync_save_fixes','listing_sync_finish_check','listing_sync_set_fix','listing_sync_decline_plan','listing_sync_due_workspaces',
    'listing_sync_open_plan','read_listing_sync'])), 'every RPC is service_role only');
select pg_temp.ls_assert('listings_sync' = any(public.workspace_release_flag_names()), 'listings_sync is a known release flag');

-- ---- queue ----
create temp table ls_ids(k text primary key, v uuid);
grant all on ls_ids to service_role;
set local role service_role;
insert into ls_ids select 'q1', public.listing_sync_queue_check('29100000-0000-4000-8000-000000000010', 'check_now', '29100000-0000-4000-8000-000000000001');
insert into ls_ids select 'q2', public.listing_sync_queue_check('29100000-0000-4000-8000-000000000010', 'sweep');
select pg_temp.ls_assert((select v from ls_ids where k = 'q1') = (select v from ls_ids where k = 'q2'), 'queue dedupe returns the same id');
select pg_temp.ls_refuse($$select public.listing_sync_queue_check('29100000-0000-4000-8000-000000000011', 'sweep')$$, 'listing_sync_no_record');
select pg_temp.ls_refuse($$select public.listing_sync_queue_check('29100000-0000-4000-8000-000000000010', 'fact.changed')$$, 'listing_sync_checks_trigger_check');
reset role;
select pg_temp.ls_assert((select count(*) from public.listing_sync_checks) = 1, 'one queued check');
select pg_temp.ls_assert((select record_revision from public.listing_sync_checks) = 3, 'the check carries the record revision');

-- ---- claim ----
set local role service_role;
create temp table ls_claim as select * from public.listing_sync_claim_checks(5);
select pg_temp.ls_assert((select count(*) from ls_claim) = 1 and (select status from ls_claim) = 'running', 'claim returns one running row');
select pg_temp.ls_assert((select count(*) from public.listing_sync_claim_checks(5)) = 0, 'a second claim returns none');
select pg_temp.ls_assert(public.listing_sync_confirmed_facts('29100000-0000-4000-8000-000000000010') = jsonb_build_object(
  'revision', 3, 'facts', '{"phone":"+17165550100"}'::jsonb, 'services', '[]'::jsonb), 'confirmed facts exclude the owner recipient');
select pg_temp.ls_assert(jsonb_array_length(public.listing_sync_targets('29100000-0000-4000-8000-000000000010')->'tenants') = 1
  and public.listing_sync_targets('29100000-0000-4000-8000-000000000010')->'agencies' = '["29100000-0000-4000-8000-000000000020"]'::jsonb,
  'targets list the linked site and the agency');

-- ---- fixes ----
select pg_temp.ls_refuse(format($$select public.listing_sync_save_fixes(%L, gen_random_uuid(), '[]')$$, (select id from ls_claim)), 'listing_sync_claim_lost');
create temp table ls_saved as select * from public.listing_sync_save_fixes((select id from ls_claim), (select claim_token from ls_claim),
  '[{"surfaceKey":"google:loc1","factKey":"hours","kind":"google_hours","proposed":{"locationId":"loc1"}},
    {"surfaceKey":"booking:main","factKey":"hours","kind":"booking_hours","proposed":{"weekly":[]}},
    {"surfaceKey":"website:site","factKey":"page","kind":"site_request","proposed":{"lines":["Phone"]}}]');
select pg_temp.ls_assert((select count(*) from ls_saved) = 3, 'three fixes saved');
select pg_temp.ls_assert((select count(*) from public.listing_sync_save_fixes((select id from ls_claim), (select claim_token from ls_claim),
  '[{"surfaceKey":"google:loc1","factKey":"hours","kind":"google_hours","proposed":{"locationId":"loc1"}}]')) = 3, 'saving again adds nothing');
select pg_temp.ls_assert((select status from public.listing_sync_set_fix(
  (select id from ls_saved where surface_key = 'booking:main'), '29100000-0000-4000-8000-000000000010', array['proposed'], 'applying', null, null,
  '29100000-0000-4000-8000-000000000001')) = 'applying', 'set_fix moves proposed to applying');
select pg_temp.ls_refuse(format($$select public.listing_sync_set_fix(%L, '29100000-0000-4000-8000-000000000010', array['proposed'], 'applied', null, null, null)$$,
  (select id from ls_saved where surface_key = 'booking:main')), 'listing_sync_fix_moved');
select public.listing_sync_set_fix((select id from ls_saved where surface_key = 'booking:main'), '29100000-0000-4000-8000-000000000010',
  array['applying'], 'applied', 'booking:main', null, null);
select public.listing_sync_set_fix((select id from ls_saved where surface_key = 'website:site'), '29100000-0000-4000-8000-000000000010',
  array['proposed'], 'applied', 'request:1', null, null);

-- ---- finish: differences leave no Release; the applied booking fix is verified ----
select pg_temp.ls_assert((public.listing_sync_open_plan('29100000-0000-4000-8000-000000000010')) is null, 'no open plan before a check is done');
select public.listing_sync_finish_check((select id from ls_claim), (select claim_token from ls_claim), 'done',
  '[{"surfaceKey":"booking:main","facts":[{"fact":"hours","state":"follows"}]},{"surfaceKey":"website:site","facts":[{"fact":"phone","state":"differs"}]}]',
  1, 2, null);
select pg_temp.ls_assert((select count(*) from public.listing_sync_claim_checks(1)) = 0, 'nothing is queued after finish');
reset role;
select pg_temp.ls_assert((select status from public.listing_sync_fixes where surface_key = 'booking:main') = 'verified', 'an applied fix verifies when its fact reads follows');
select pg_temp.ls_assert((select status from public.listing_sync_fixes where surface_key = 'website:site') = 'applied', 'a page fix stays applied while the page differs');
select pg_temp.ls_assert((select count(*) from public.listing_sync_releases) = 0, 'a check with differences records no Release');

-- ---- Releases: number from 1, no duplicates, new payload makes the next number ----
set local role service_role;
create temp table ls_cu as select * from public.listing_sync_claim_checks(1, public.listing_sync_queue_check('29100000-0000-4000-8000-000000000010', 'after_fix'));
select public.listing_sync_finish_check((select id from ls_cu), (select claim_token from ls_cu), 'done',
  '[{"surfaceKey":"website:site","state":"unreadable","facts":[]}]', 0, 0, null);
reset role;
select pg_temp.ls_assert((select status from public.listing_sync_fixes where surface_key = 'website:site') = 'applied', 'a page fix stays applied when the page could not be read');
set local role service_role;
create temp table ls_c2 as select * from public.listing_sync_claim_checks(1, public.listing_sync_queue_check('29100000-0000-4000-8000-000000000010', 'after_fix'));
select pg_temp.ls_assert((public.listing_sync_finish_check((select id from ls_c2), (select claim_token from ls_c2), 'done',
  '[{"surfaceKey":"website:site","state":"read","facts":[{"fact":"phone","state":"matches"}]}]', 0, 1, null))->'release'->>'number' = '1', 'Release 1');
reset role;
select pg_temp.ls_assert((select status from public.listing_sync_fixes where surface_key = 'website:site') = 'verified', 'the page fix verifies once the page matches');
set local role service_role;
create temp table ls_c3 as select * from public.listing_sync_claim_checks(1, public.listing_sync_queue_check('29100000-0000-4000-8000-000000000010', 'sweep'));
select pg_temp.ls_assert((public.listing_sync_finish_check((select id from ls_c3), (select claim_token from ls_c3), 'done',
  '[{"surfaceKey":"website:site","state":"read","facts":[{"fact":"phone","state":"matches"}]}]', 0, 1, null))->'release' = 'null'::jsonb, 'the same readings record no new Release');
create temp table ls_c4 as select * from public.listing_sync_claim_checks(1, public.listing_sync_queue_check('29100000-0000-4000-8000-000000000010', 'sweep'));
select pg_temp.ls_assert((public.listing_sync_finish_check((select id from ls_c4), (select claim_token from ls_c4), 'done',
  '[{"surfaceKey":"website:site","state":"read","facts":[{"fact":"phone","state":"matches"},{"fact":"hours","state":"matches"}]}]', 0, 2, null))->'release'->>'number' = '2', 'different readings make Release 2');
reset role;
select pg_temp.ls_refuse($$update public.listing_sync_releases set number = 9$$, 'listing_sync_release_immutable');
select pg_temp.ls_refuse($$delete from public.listing_sync_releases$$, 'listing_sync_release_immutable');

-- ---- a verified fix is offered again when a later check at the same revision saves it ----
select pg_temp.ls_assert((select status from public.listing_sync_fixes where surface_key = 'booking:main') = 'verified', 'booking fix is verified before the drift');
set local role service_role;
create temp table ls_d1 as select * from public.listing_sync_claim_checks(1, public.listing_sync_queue_check('29100000-0000-4000-8000-000000000010', 'sweep'));
select pg_temp.ls_assert((select count(*) from public.listing_sync_save_fixes((select id from ls_d1), (select claim_token from ls_d1),
  '[{"surfaceKey":"booking:main","factKey":"hours","kind":"booking_hours","proposed":{"weekly":[]}}]') f where f.status = 'proposed' and f.surface_key = 'booking:main') = 1,
  'a verified fix becomes proposed again when a later check at the same revision saves it');
select public.listing_sync_finish_check((select id from ls_d1), (select claim_token from ls_d1), 'done',
  '[{"surfaceKey":"booking:main","facts":[{"fact":"hours","state":"differs"}]}]', 1, 1, null);
select pg_temp.ls_assert((select count(*) from jsonb_array_elements(public.listing_sync_open_plan('29100000-0000-4000-8000-000000000010')->'fixes') x
  where x->>'surfaceKey' = 'booking:main' and x->>'checkId' = (select id::text from ls_d1)) = 1, 'open_plan lists the re-opened fix with its new checkId');
reset role;

-- ---- supersede and decline ----
update public.business_records set revision = 4 where workspace_id = '29100000-0000-4000-8000-000000000010';
set local role service_role;
create temp table ls_c5 as select * from public.listing_sync_claim_checks(1, public.listing_sync_queue_check('29100000-0000-4000-8000-000000000010', 'fact.confirmed'));
select pg_temp.ls_assert((select count(*) from public.listing_sync_save_fixes((select id from ls_c5), (select claim_token from ls_c5),
  '[{"surfaceKey":"google:loc1","factKey":"phone","kind":"google_info","proposed":{}},{"surfaceKey":"google:loc1","factKey":"address","kind":"owner_todo","proposed":{"lines":["x"]}}]')) = 2,
  'revision 4 has two fixes and the older proposed ones are gone');
reset role;
select pg_temp.ls_assert((select status from public.listing_sync_fixes where surface_key = 'google:loc1' and fact_key = 'hours' and record_revision = 3) = 'superseded',
  'the older proposed fix is superseded');
set local role service_role;
select public.listing_sync_finish_check((select id from ls_c5), (select claim_token from ls_c5), 'done',
  '[{"surfaceKey":"google:loc1","facts":[{"fact":"phone","state":"differs"}]}]', 1, 1, null);
select pg_temp.ls_assert(jsonb_array_length(public.listing_sync_open_plan('29100000-0000-4000-8000-000000000010')->'fixes') = 1, 'the open plan leaves owner to-dos out');
select pg_temp.ls_assert(public.listing_sync_decline_plan('29100000-0000-4000-8000-000000000010', 4, '29100000-0000-4000-8000-000000000001') = 1, 'decline moves one fix');
select pg_temp.ls_assert(jsonb_array_length(public.listing_sync_open_plan('29100000-0000-4000-8000-000000000010')->'fixes') = 0, 'a declined plan is no longer open');

-- ---- read_listing_sync ----
select pg_temp.ls_refuse($$select public.read_listing_sync('29100000-0000-4000-8000-000000000010', '29100000-0000-4000-8000-000000000003', 'ls-stranger@example.test')$$, 'business_record_access_denied');
select pg_temp.ls_assert(public.read_listing_sync('29100000-0000-4000-8000-000000000010', '29100000-0000-4000-8000-000000000001', 'ls-owner@example.test')->>'access' = 'owner', 'the owner reads');
select pg_temp.ls_assert(public.read_listing_sync('29100000-0000-4000-8000-000000000010', '29100000-0000-4000-8000-000000000002', 'ls-agency@example.test')->>'access' = 'admin', 'the agency seat reads with the seat role');
select pg_temp.ls_assert((public.read_listing_sync('29100000-0000-4000-8000-000000000010', '29100000-0000-4000-8000-000000000001', 'ls-owner@example.test')->>'releaseCount')::int = 2, 'two Releases counted');

-- ---- due ----
select pg_temp.ls_assert((select count(*) from public.listing_sync_due_workspaces(10, 'on')) = 0, 'a freshly checked business is not due');
reset role;
update public.listing_sync_checks set finished_at = clock_timestamp() - interval '25 hours' where status = 'done';
set local role service_role;
select pg_temp.ls_assert((select count(*) from public.listing_sync_due_workspaces(10, 'on')) = 1, 'a business last checked over 24 hours ago is due');
select pg_temp.ls_assert((select count(*) from public.listing_sync_due_workspaces(10, 'workspace')) = 0, 'workspace mode skips a business without its switch on');
select pg_temp.ls_assert((select count(*) from public.listing_sync_due_workspaces(10, 'off')) = 0, 'an unknown mode reaches no business');
reset role;
insert into public.workspace_release_flags(workspace_id, flag, state, changed_by) values ('29100000-0000-4000-8000-000000000010', 'listings_sync', 'on', '29100000-0000-4000-8000-000000000001')
  on conflict (workspace_id, flag) do update set state = 'on';
set local role service_role;
select pg_temp.ls_assert((select count(*) from public.listing_sync_due_workspaces(10, 'workspace')) = 1, 'workspace mode reaches a business with its switch on');
reset role;
update public.workspace_release_flags set state = 'off' where workspace_id = '29100000-0000-4000-8000-000000000010' and flag = 'listings_sync';
set local role service_role;
select pg_temp.ls_assert((select count(*) from public.listing_sync_due_workspaces(10, 'on')) = 0, 'on mode skips a business switched off');
reset role;

-- ---- authenticated cannot call ----
set local role authenticated;
select pg_temp.ls_refuse($$select public.listing_sync_queue_check('29100000-0000-4000-8000-000000000010', 'sweep')$$, 'permission denied');
select pg_temp.ls_refuse($$select public.read_listing_sync('29100000-0000-4000-8000-000000000010', '29100000-0000-4000-8000-000000000001', 'ls-owner@example.test')$$, 'permission denied');
reset role;

\if :{?keep_fixture}
commit;
\else
rollback;
\endif

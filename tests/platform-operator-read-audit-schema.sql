\set ON_ERROR_STOP on
-- Fictional identities only; the outer transaction rolls back all proof data.
begin;
create function pg_temp.pra_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'platform read audit assertion: %',label; end if; end $$;
create function pg_temp.pra_error(statement text) returns text language plpgsql as $$
begin execute statement; return 'no error'; exception when others then return sqlerrm; end $$;
create temporary table pra_readers(reader_name text primary key, definition text, acl aclitem[]);
insert into pra_readers select p.proname,pg_get_functiondef(p.oid),p.proacl from pg_proc p
  where p.pronamespace='public'::regnamespace and p.proname in (
    'read_catalog_tool_notice_failures','read_catalog_tool_contact_conflicts','read_catalog_report_failures',
    'read_operator_google_uncertainty','read_operator_queue_context_v2','read_effort_businesses',
    'read_business_effort','read_outside_write_receipts','read_google_listing_readback_failures','read_google_listing_readback_failures_v2','read_operator_queue_context');
select pg_temp.pra_assert((select count(*)=11 from pra_readers),'exact eleven original reader inventory');

insert into public.users(id,email,verified_at) values
  ('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test',now()),
  ('20090039-0000-4000-8000-000000000002','platform-read-outsider@example.test',now());
insert into public.super_admins(user_id,email) values
  ('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test');
insert into public.workspaces(id,kind,name,created_by) values
  ('20090039-0000-4000-8000-000000000011','customer','Platform read fixture one','20090039-0000-4000-8000-000000000002'),
  ('20090039-0000-4000-8000-000000000012','customer','Platform read fixture two','20090039-0000-4000-8000-000000000002');
select pg_temp.pra_assert(not exists(select 1 from public.workspace_memberships where user_id='20090039-0000-4000-8000-000000000001'),'operator holds no customer memberships');

do $$
declare role_name text; privilege text;
begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
    foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      perform pg_temp.pra_assert(not has_table_privilege(role_name,'public.platform_operator_read_audit',privilege),role_name||' direct '||privilege||' denied');
    end loop;
  end loop;
end $$;
select pg_temp.pra_assert((select relrowsecurity from pg_class where oid='public.platform_operator_read_audit'::regclass),'RLS enabled');
select pg_temp.pra_assert(not has_function_privilege('anon','public.read_audited_platform_operator_source(uuid,text,text)','EXECUTE')
 and not has_function_privilege('authenticated','public.read_audited_platform_operator_source(uuid,text,text)','EXECUTE')
 and has_function_privilege('service_role','public.read_audited_platform_operator_source(uuid,text,text)','EXECUTE'),'wrapper service only');
select pg_temp.pra_assert(not has_function_privilege('service_role','public.platform_operator_read_audit_immutable()','EXECUTE'),'trigger helper private');
select pg_temp.pra_assert(not has_function_privilege('service_role','public.platform_operator_read_actor(uuid,text,text)','EXECUTE'),'shared audit actor helper private');
select pg_temp.pra_assert(not has_function_privilege('anon','public.authorize_platform_operator_read(uuid,text,text)','EXECUTE') and not has_function_privilege('authenticated','public.authorize_platform_operator_read(uuid,text,text)','EXECUTE') and has_function_privilege('service_role','public.authorize_platform_operator_read(uuid,text,text)','EXECUTE'),'app admission service only');
select pg_temp.pra_assert(not has_function_privilege('anon','public.read_audited_platform_operator_detail(uuid,text,text,date,uuid,text,uuid,integer)','EXECUTE') and not has_function_privilege('authenticated','public.read_audited_platform_operator_detail(uuid,text,text,date,uuid,text,uuid,integer)','EXECUTE') and has_function_privilege('service_role','public.read_audited_platform_operator_detail(uuid,text,text,date,uuid,text,uuid,integer)','EXECUTE'),'detail wrapper service only');

-- Direct browser/service table access is refused by actual execution too.
set local role anon;
select pg_temp.pra_assert(pg_temp.pra_error($q$insert into public.platform_operator_read_audit(actor_user_id,reader_name) values('20090039-0000-4000-8000-000000000001','read_effort_businesses')$q$) like 'permission denied for table %','anonymous insert denied');
select pg_temp.pra_assert(pg_temp.pra_error($q$update public.platform_operator_read_audit set scope='platform'$q$) like 'permission denied for table %','anonymous update denied');
select pg_temp.pra_assert(pg_temp.pra_error($q$delete from public.platform_operator_read_audit$q$) like 'permission denied for table %','anonymous delete denied');
select pg_temp.pra_assert(pg_temp.pra_error($q$truncate public.platform_operator_read_audit$q$) like 'permission denied for table %','anonymous truncate denied');
reset role;
set local role authenticated;
select pg_temp.pra_assert(pg_temp.pra_error($q$insert into public.platform_operator_read_audit(actor_user_id,reader_name) values('20090039-0000-4000-8000-000000000001','read_effort_businesses')$q$) like 'permission denied for table %','browser insert denied');
select pg_temp.pra_assert(pg_temp.pra_error($q$update public.platform_operator_read_audit set scope='platform'$q$) like 'permission denied for table %','browser update denied');
select pg_temp.pra_assert(pg_temp.pra_error($q$delete from public.platform_operator_read_audit$q$) like 'permission denied for table %','browser delete denied');
select pg_temp.pra_assert(pg_temp.pra_error($q$truncate public.platform_operator_read_audit$q$) like 'permission denied for table %','browser truncate denied');
select pg_temp.pra_assert(pg_temp.pra_error($q$select public.read_audited_platform_operator_source('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','read_effort_businesses')$q$) like 'permission denied for function %','browser wrapper denied');
select pg_temp.pra_assert(pg_temp.pra_error($q$select public.authorize_platform_operator_read('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','admin.client-leads.read')$q$) like 'permission denied for function %','browser admission denied');
reset role;
set local role service_role;
select pg_temp.pra_assert(pg_temp.pra_error($q$insert into public.platform_operator_read_audit(actor_user_id,reader_name) values('20090039-0000-4000-8000-000000000001','read_effort_businesses')$q$) like 'permission denied for table %','service insert denied');
select pg_temp.pra_assert(pg_temp.pra_error($q$update public.platform_operator_read_audit set scope='platform'$q$) like 'permission denied for table %','service update denied');
select pg_temp.pra_assert(pg_temp.pra_error($q$delete from public.platform_operator_read_audit$q$) like 'permission denied for table %','service delete denied');
select pg_temp.pra_assert(pg_temp.pra_error($q$truncate public.platform_operator_read_audit$q$) like 'permission denied for table %','service truncate denied');
reset role;

-- Actual service-role execution, unchanged result and one event per read,
-- including empty support results. The source names are a static SQL CASE.
set local role service_role;
do $$
declare reader text; actual jsonb; expected jsonb;
begin
  foreach reader in array array[
    'read_catalog_tool_notice_failures','read_catalog_tool_contact_conflicts','read_catalog_report_failures',
    'read_operator_google_uncertainty','read_operator_queue_context_v2','read_effort_businesses'
  ] loop
    actual := public.read_audited_platform_operator_source('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test',reader);
    execute format('select public.%I($1,$2)',reader) into expected
      using '20090039-0000-4000-8000-000000000001'::uuid,'platform-read-operator@example.test'::text;
    perform pg_temp.pra_assert(actual is not distinct from expected,'audited result unchanged: '||reader);
  end loop;
  foreach reader in array array['read_business_effort','read_outside_write_receipts','read_google_listing_readback_failures','read_google_listing_readback_failures_v2','read_operator_queue_context'] loop
    actual := public.read_audited_platform_operator_detail('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test',reader,
      '2026-01-01','20090039-0000-4000-8000-000000000011','fixture-tenant','20090039-0000-4000-8000-000000000011',50);
    case reader
      when 'read_business_effort' then expected := public.read_business_effort('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','2026-01-01','20090039-0000-4000-8000-000000000011');
      when 'read_outside_write_receipts' then expected := public.read_outside_write_receipts('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','fixture-tenant','20090039-0000-4000-8000-000000000011',50);
      when 'read_google_listing_readback_failures' then expected := public.read_google_listing_readback_failures('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test',50);
      when 'read_google_listing_readback_failures_v2' then expected := public.read_google_listing_readback_failures_v2('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test');
      when 'read_operator_queue_context' then expected := public.read_operator_queue_context('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test');
    end case;
    perform pg_temp.pra_assert(actual is not distinct from expected,'typed detail result/filters unchanged: '||reader);
  end loop;
  actual := public.read_audited_platform_operator_detail('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','read_google_listing_readback_failures',p_limit=>-5);
  perform pg_temp.pra_assert(actual is not distinct from public.read_google_listing_readback_failures('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test',-5),'legacy listing clamping preserved');
  actual := public.read_audited_platform_operator_detail('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','read_google_listing_readback_failures');
  perform pg_temp.pra_assert(actual is not distinct from public.read_google_listing_readback_failures('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test',null),'legacy null listing default preserved');
  perform pg_temp.pra_assert(pg_temp.pra_error($q$select public.read_audited_platform_operator_detail('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','read_outside_write_receipts',p_limit=>0)$q$)='operator_queue_invalid','invalid outside receipt limit refused');
  perform pg_temp.pra_assert(pg_temp.pra_error($q$select public.read_audited_platform_operator_detail('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','read_outside_write_receipts')$q$)='operator_queue_invalid','null outside receipt limit refused');
  perform pg_temp.pra_assert(pg_temp.pra_error($q$select public.read_audited_platform_operator_detail('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','read_business_effort')$q$)='business_effort_invalid','required effort date remains required');
  foreach reader in array array['admin.clients.read','admin.accounts.read','admin.analytics.read','admin.audit.read','admin.actions.read','admin.drafts.read','admin.digests.read','admin.leads.read','admin.uptime.read','admin.ops.read','admin.pay-links.read','admin.client-leads.read','admin.tenant-controls.read','admin.component-registry.read','admin.make-real.read','admin.booking-email.read','admin.owner-decisions.read'] loop
    perform public.authorize_platform_operator_read('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test',reader);
  end loop;
  perform pg_temp.pra_assert(pg_temp.pra_error($q$select public.authorize_platform_operator_read('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','read_effort_businesses')$q$)='platform_operator_read_invalid','admission refuses source name outside app-power list');
  perform pg_temp.pra_assert(jsonb_array_length(public.read_effort_businesses('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test'))>=2,'global list includes both unrelated businesses');
  perform pg_temp.pra_assert(pg_temp.pra_error($q$select public.read_audited_platform_operator_source('20090039-0000-4000-8000-000000000002','platform-read-outsider@example.test','read_effort_businesses')$q$)='platform_operator_read_access_denied','verified nonoperator refused');
  perform pg_temp.pra_assert(pg_temp.pra_error($q$select public.read_audited_platform_operator_source('20090039-0000-4000-8000-000000000001','wrong@example.test','read_effort_businesses')$q$)='platform_operator_read_access_denied','email mismatch refused');
  perform pg_temp.pra_assert(pg_temp.pra_error($q$select public.read_audited_platform_operator_source('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','read_business_effort')$q$)='platform_operator_read_invalid','nonallowlisted source refused');
  perform pg_temp.pra_assert(pg_temp.pra_error($q$select public.read_audited_platform_operator_source('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test',null)$q$)='platform_operator_read_invalid','null selector refused');
end $$;
reset role;
select pg_temp.pra_assert((select count(*)=30 and count(distinct reader_name)=28 and bool_and(scope='platform') from public.platform_operator_read_audit where actor_user_id='20090039-0000-4000-8000-000000000001'),'eleven atomic sources and seventeen admitted app powers; no invalid/denied events');
select pg_temp.pra_assert((select array_agg(attname::text order by attnum)=array['id','actor_user_id','reader_name','scope','created_at'] from pg_attribute where attrelid='public.platform_operator_read_audit'::regclass and attnum>0 and not attisdropped),'audit contains no emails or result payload');

update public.super_admins set revoked_at=clock_timestamp() where user_id='20090039-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.pra_assert(pg_temp.pra_error($q$select public.read_audited_platform_operator_source('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','read_effort_businesses')$q$)='platform_operator_read_access_denied','retained revoked grant refused');
select pg_temp.pra_assert(pg_temp.pra_error($q$select public.authorize_platform_operator_read('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','admin.client-leads.read')$q$)='platform_operator_read_access_denied','app admission retained revoked grant refused');
reset role;
update public.super_admins set revoked_at=null where user_id='20090039-0000-4000-8000-000000000001';
update public.users set verified_at=null where id='20090039-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.pra_assert(pg_temp.pra_error($q$select public.read_audited_platform_operator_source('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','read_effort_businesses')$q$)='platform_operator_read_access_denied','unverified actor refused');
select pg_temp.pra_assert(pg_temp.pra_error($q$select public.authorize_platform_operator_read('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','admin.client-leads.read')$q$)='platform_operator_read_access_denied','app admission unverified actor refused');
reset role;
update public.users set verified_at=now() where id='20090039-0000-4000-8000-000000000001';

select pg_temp.pra_assert(pg_temp.pra_error($q$update public.platform_operator_read_audit set reader_name='read_effort_businesses' where actor_user_id='20090039-0000-4000-8000-000000000001'$q$)='platform_operator_read_audit_immutable','update refused even to owner');
select pg_temp.pra_assert(pg_temp.pra_error($q$delete from public.platform_operator_read_audit where actor_user_id='20090039-0000-4000-8000-000000000001'$q$)='platform_operator_read_audit_immutable','delete refused');
select pg_temp.pra_assert(pg_temp.pra_error($q$truncate public.platform_operator_read_audit$q$)='platform_operator_read_audit_immutable','truncate refused');

create function pg_temp.pra_fail_insert() returns trigger language plpgsql as $$ begin raise exception 'fixture_audit_unavailable'; end $$;
create trigger fixture_audit_unavailable before insert on public.platform_operator_read_audit for each row execute function pg_temp.pra_fail_insert();
set local role service_role;
select pg_temp.pra_assert(pg_temp.pra_error($q$select public.read_audited_platform_operator_source('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','read_effort_businesses')$q$)='fixture_audit_unavailable','audit failure returns error, never source data');
select pg_temp.pra_assert(pg_temp.pra_error($q$select public.authorize_platform_operator_read('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','admin.client-leads.read')$q$)='fixture_audit_unavailable','app admission audit failure refused');
select pg_temp.pra_assert(pg_temp.pra_error($q$select public.read_audited_platform_operator_detail('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','read_operator_queue_context')$q$)='fixture_audit_unavailable','detail audit failure refused');
reset role;
drop trigger fixture_audit_unavailable on public.platform_operator_read_audit;
select pg_temp.pra_assert((select count(*)=30 from public.platform_operator_read_audit where actor_user_id='20090039-0000-4000-8000-000000000001'),'failed audit adds no event');

-- Native ACL transition is tested here; actual transactional inverse/reapply is
-- exercised by the shared shell checks without committing this fixture.
revoke all on function public.read_audited_platform_operator_source(uuid,text,text) from service_role;
set local role service_role;
select pg_temp.pra_assert(pg_temp.pra_error($q$select public.read_audited_platform_operator_source('20090039-0000-4000-8000-000000000001','platform-read-operator@example.test','read_effort_businesses')$q$) like 'permission denied for function %','disabled wrapper cannot disclose');
reset role;
grant execute on function public.read_audited_platform_operator_source(uuid,text,text) to service_role;
select pg_temp.pra_assert(not exists(select 1 from pra_readers r join pg_proc p on p.proname=r.reader_name and p.pronamespace='public'::regnamespace where pg_get_functiondef(p.oid) is distinct from r.definition or p.proacl is distinct from r.acl),'eleven pure reader bodies/ACL unchanged');
-- Retained IDs do not acquire a user-deletion FK or erase historical access.
delete from public.super_admins where user_id='20090039-0000-4000-8000-000000000001';
delete from public.users where id='20090039-0000-4000-8000-000000000001';
select pg_temp.pra_assert((select count(*)=30 from public.platform_operator_read_audit where actor_user_id='20090039-0000-4000-8000-000000000001'),'account deletion preserves trace without blocking');
rollback;
\echo Platform support read audit: eleven unchanged results, native service ACL, current actor, immutable global history, fail-closed audit and retaining inverse/reapply passed.

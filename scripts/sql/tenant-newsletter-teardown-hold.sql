\set ON_ERROR_STOP on
-- Owned local native window only. All fictional rows are rolled back.
begin;
set local lock_timeout='3s';
insert into public.users(id,email) values('27413000-0000-4000-8000-000000000001','newsletter-hold-proof@example.test');
insert into public.workspaces(id,kind,name,created_by) values
 ('27413000-0000-4000-8000-000000000002','customer','Fictional newsletter hold proof','27413000-0000-4000-8000-000000000001');
insert into public.tenants(id,site_name) values
 ('fictional-newsletter-held','Fictional held site'),('fictional-newsletter-other','Fictional other site');
select public.adopt_system_with_revision(
 '27413000-0000-4000-8000-000000000002','tenant',
 (select stable_id::text from public.tenants where id='fictional-newsletter-held'),
 'Fictional live newsletter site','website',
 '{"kind":"tenant_website","ref":"fictional-newsletter-held"}'::jsonb,true,
 '27413000-0000-4000-8000-000000000001');
insert into public.workspace_newsletter_issues(id,workspace_id,tenant_id,system_id,event_id,draft_hash,subject,body,approved_by,suppressed_count)
 select ('27413000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '27413000-0000-4000-8000-000000000002',
 case when n in (11,12) then 'fictional-newsletter-held' when n=13 then 'fictional-newsletter-other' end,
 '27413000-0000-4000-8000-000000000003','fictional-newsletter-proof-'||n,repeat('a',64),
 'Fictional approved issue','Fictional body','Fictional local operator',0
 from generate_series(11,14) n;
create temporary table newsletter_hold_before as
 select 'tenant' kind,id,md5(to_jsonb(t)::text) digest from public.tenants t where id like 'fictional-newsletter-%'
 union all
 select 'issue',id::text,md5(to_jsonb(i)::text) from public.workspace_newsletter_issues i
 where workspace_id='27413000-0000-4000-8000-000000000002'
 union all
 select 'system',id::text,md5(to_jsonb(s)::text) from public.systems s
 where business_workspace_id='27413000-0000-4000-8000-000000000002';
do $$
declare f boolean; e boolean; r boolean; b record; saved record; current_digest text;
begin
 select * into b from public.tenant_cleanup_teardown_blockers('fictional-newsletter-held');
 if b.newsletter_issues<>2 or b.publications<>0 or b.reservations<>0 or b.booking_grants<>0 or b.bookings<>0 then
  raise exception 'newsletter_hold_reader_scope_wrong';
 end if;
 select * into b from public.tenant_cleanup_teardown_blockers('fictional-newsletter-absent');
 if b.newsletter_issues<>0 then raise exception 'native_null_issue_became_slug_hold'; end if;
 foreach f in array array[false,true] loop
  foreach e in array array[false,true] loop
   foreach r in array array[false,true] loop
    begin
     perform public.deprovision_tenant_guarded('fictional-newsletter-held',f,e,r);
     raise exception 'newsletter_hold_teardown_was_allowed';
    exception when others then
     if sqlerrm<>'tenant_teardown_blocked_by_newsletter_history' then raise; end if;
    end;
   end loop;
  end loop;
 end loop;
 for saved in select * from newsletter_hold_before loop
  if saved.kind='tenant' then
   select md5(to_jsonb(t)::text) into current_digest from public.tenants t where id=saved.id;
  elsif saved.kind='system' then
   select md5(to_jsonb(s)::text) into current_digest from public.systems s where id=saved.id::uuid;
  else
   select md5(to_jsonb(i)::text) into current_digest from public.workspace_newsletter_issues i where id=saved.id::uuid;
  end if;
  if current_digest is distinct from saved.digest then raise exception 'newsletter_hold_mutated_record: %',saved.id; end if;
 end loop;
 if exists(select 1 from public.tenant_deprovision_cleanup where tenant_id='fictional-newsletter-held') then
  raise exception 'newsletter_hold_fabricated_cleanup_receipt';
 end if;
 if has_function_privilege('anon','public.tenant_cleanup_teardown_blockers(text)','EXECUTE')
  or has_function_privilege('authenticated','public.tenant_cleanup_teardown_blockers(text)','EXECUTE')
  or has_function_privilege('service_role','public.tenant_cleanup_teardown_blockers_before_newsletter(text)','EXECUTE')
  or has_function_privilege('service_role','public.deprovision_tenant_guarded_before_cleanup(text,boolean,boolean,boolean)','EXECUTE') then
  raise exception 'newsletter_hold_expanded_authority';
 end if;
 raise notice 'Newsletter holds counted exactly; all guarded flag combinations refused before cleanup; live System, tenant and immutable workspace rows preserved';
end $$;
rollback;

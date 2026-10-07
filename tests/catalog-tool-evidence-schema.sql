\set ON_ERROR_STOP on
begin;
create function pg_temp.te_assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'tool evidence assertion: %',message; end if; end; $$;
select pg_temp.te_assert(jsonb_array_length(public.read_catalog_tool_releases('e8000000-0000-4000-8000-000000000010',
  'e8000000-0000-4000-8000-000000000002','links-staff@example.test'))>=1,'member reads durable release history');
do $$ begin
  begin perform public.read_catalog_tool_releases('e8000000-0000-4000-8000-000000000010',
    'e8000000-0000-4000-8000-000000000004','links-other@example.test');
    raise exception 'cross-workspace history accepted';
  exception when others then if sqlerrm<>'workspace_access_denied' then raise; end if; end;
end $$;
insert into public.business_contacts(id,workspace_id,email,phone,sources,first_seen_at,last_seen_at) values
  ('e8000000-0000-4000-8000-000000000070','e8000000-0000-4000-8000-000000000010','w6-email@example.test',null,array['operator'],now(),now()),
  ('e8000000-0000-4000-8000-000000000071','e8000000-0000-4000-8000-000000000010',null,'7165550199',array['operator'],now(),now());
select public.resolve_internal_tool_links('e8000000-0000-4000-8000-000000000010','e8000000-0000-4000-8000-000000000040',
  'e8000000-0000-4000-8000-000000000002','links-staff@example.test',
  '[{"fieldId":"client","kind":"contact","email":"w6-email@example.test","phone":"7165550199"}]');
select pg_temp.te_assert(exists(select 1 from public.internal_tool_contact_conflicts where email_contact_id='e8000000-0000-4000-8000-000000000070'
  and phone_contact_id='e8000000-0000-4000-8000-000000000071'),'conflicting matches recorded; email kept');
select pg_temp.te_assert(jsonb_array_length(public.read_catalog_tool_contact_conflicts('e8000000-0000-4000-8000-000000000001','links-operator@example.test'))>=1,'operator sees merge item');
select pg_temp.te_assert(not has_function_privilege('authenticated','public.read_catalog_tool_contact_conflicts(uuid,text)','execute')
  and not has_table_privilege('service_role','public.internal_tool_contact_conflicts','SELECT'),'service RPCs only');
rollback;

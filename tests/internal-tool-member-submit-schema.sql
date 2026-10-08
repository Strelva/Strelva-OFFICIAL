\set ON_ERROR_STOP on
begin;
-- Reuse the fictional installed tool from internal-tool-links-schema.sql.
create function pg_temp.member_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then if sqlerrm<>expected then raise; end if; return; end;
  raise exception 'expected error %',expected;
end; $$;
create function pg_temp.member_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'member submit assertion: %',message; end if; end; $$;
create function pg_temp.member_submit(p_record_id text,p_values jsonb,p_links jsonb,p_revision integer default null)
returns jsonb language sql as $$
  select public.submit_internal_tool_member_record(
    'e8000000-0000-4000-8000-000000000040','e8000000-0000-4000-8000-000000000010',
    'e8000000-0000-4000-8000-000000000002','links-staff@example.test',1,
    coalesce(p_revision,(select records_revision from public.application_states where work_id='e8000000-0000-4000-8000-000000000040')),
    p_record_id,p_values,p_links)
$$;
create temp table member_saved as select pg_temp.member_submit('w6-member-atomic',
  '{"business":"Atomic intake","client":"atomic@client.example.test","handler":"sam@leslie.example.test"}',
  '[{"fieldId":"client","kind":"contact","name":"Atomic Co","email":"atomic@client.example.test"},{"fieldId":"handler","kind":"assigned_person","email":"sam@leslie.example.test"}]') result;
select pg_temp.member_assert(exists(select 1 from public.application_records r join public.business_contacts c on c.id=(r.values->>'client')::uuid
  where r.record_id='w6-member-atomic' and c.email='atomic@client.example.test' and c.name='Atomic Co' and c.workspace_id=r.workspace_id),'record and contact committed together');
select pg_temp.member_assert((select result->'record'->>'id'='w6-member-atomic' and result->'conflicts'='[]'::jsonb from member_saved),'saved record returned');
-- A native validation failure happens after link resolution and must roll it back.
select pg_temp.member_error($q$select pg_temp.member_submit('w6-member-invalid','{"business":42,"client":"member-invalid@client.example.test"}',
  '[{"fieldId":"client","kind":"contact","email":"member-invalid@client.example.test"}]')$q$,'application_record_invalid');
select pg_temp.member_assert(not exists(select 1 from public.business_contacts where email='member-invalid@client.example.test'),'invalid record did not create contact');
select pg_temp.member_error($q$select pg_temp.member_submit('w6-member-stale','{"business":"Stale","client":"member-stale@client.example.test"}',
  '[{"fieldId":"client","kind":"contact","email":"member-stale@client.example.test"}]',0)$q$,'application_records_revision_conflict');
select pg_temp.member_assert(not exists(select 1 from public.business_contacts where email='member-stale@client.example.test'),'stale submit did not create contact');
select pg_temp.member_error($q$select pg_temp.member_submit('w6-member-atomic','{"business":"Duplicate","client":"member-duplicate@client.example.test"}',
  '[{"fieldId":"client","kind":"contact","email":"member-duplicate@client.example.test"}]')$q$,'application_record_duplicate');
select pg_temp.member_assert(not exists(select 1 from public.business_contacts where email='member-duplicate@client.example.test'),'duplicate did not create contact');
select pg_temp.member_error($q$select pg_temp.member_submit('w6-member-person','{"business":"Unknown staff","client":"member-person@client.example.test","handler":"missing@example.test"}',
  '[{"fieldId":"client","kind":"contact","email":"member-person@client.example.test"},{"fieldId":"handler","kind":"assigned_person","email":"missing@example.test"}]')$q$,'application_record_person_unknown');
select pg_temp.member_assert(not exists(select 1 from public.business_contacts where email='member-person@client.example.test'),'unknown staff rolled back prior contact');
select pg_temp.member_error($q$select pg_temp.member_submit('w6-member-foreign','{"business":"Foreign contact","client":"e8000000-0000-4000-8000-000000000032"}','[]')$q$,'application_record_link_denied');
-- The existing identity boundary cannot be replaced by a resource-use grant.
select pg_temp.member_error($q$select public.submit_internal_tool_member_record(
  'e8000000-0000-4000-8000-000000000040','e8000000-0000-4000-8000-000000000010',
  'e8000000-0000-4000-8000-000000000003','links-outsider@example.test',1,0,'outsider','{}','[]')$q$,'application_access_denied');
-- Keep the email match and commit the operator merge item on a valid split match.
create temp table member_conflict as select pg_temp.member_submit('w6-member-conflict',
  '{"business":"Split match","client":"acme@client.example.test"}',
  '[{"fieldId":"client","kind":"contact","email":"acme@client.example.test","phone":"(716) 555-0100"}]') result;
select pg_temp.member_assert((select result->'conflicts'='["Client contact"]'::jsonb and result->'record'->'values'->>'client'='e8000000-0000-4000-8000-000000000030' from member_conflict),'split match keeps email and reports conflict');
select pg_temp.member_assert(exists(select 1 from public.internal_tool_contact_conflicts where work_id='e8000000-0000-4000-8000-000000000040'
  and email_contact_id='e8000000-0000-4000-8000-000000000030' and phone_contact_id='e8000000-0000-4000-8000-000000000031'),'split match queue evidence committed');
select pg_temp.member_assert(not has_function_privilege('authenticated','public.submit_internal_tool_member_record(uuid,uuid,uuid,text,integer,integer,text,jsonb,jsonb)','execute'),'no browser RPC bypass');
rollback;

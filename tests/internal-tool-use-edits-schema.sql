\set ON_ERROR_STOP on
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then if sqlerrm<>expected then raise; end if; return; end;
  raise exception 'expected error %',expected;
end; $$;
-- Existing use fixture is revoked; grant corrections without submit authority.
create temp table w6_edit_grant as select * from public.grant_application_use_with_edit(
'e8000000-0000-4000-8000-000000000001','links-operator@example.test','e8000000-0000-4000-8000-000000000040',
'links-outsider@example.test',array['form','list'],'own','own',false,'Correct intake',clock_timestamp()+interval '1 day');
select count(*) from public.edit_internal_tool_use_record(
'e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from w6_edit_grant),1,1,'{"id":"w6-use","values":{"business":"Corrected intake","client":"corrected@client.example.test","handler":"e8000000-0000-4000-8000-000000000020"}}','w6-edit-001');
do $$ begin
if not exists(select 1 from public.application_records r join public.business_contacts c on c.id=(r.values->>'client')::uuid
where r.work_id='e8000000-0000-4000-8000-000000000040' and r.record_id='w6-use' and r.record_revision=2
and c.email='corrected@client.example.test' and c.workspace_id=r.workspace_id and 'internal_app'=any(c.sources)) then raise exception 'correction not linked'; end if;
end $$;
-- Raw email input retains its stable replay digest even after contact resolution.
select count(*) from public.edit_internal_tool_use_record(
'e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from w6_edit_grant),1,1,'{"id":"w6-use","values":{"business":"Corrected intake","client":"corrected@client.example.test","handler":"e8000000-0000-4000-8000-000000000020"}}','w6-edit-001');
do $$ begin
if (select record_revision from public.application_records where work_id='e8000000-0000-4000-8000-000000000040' and record_id='w6-use')<>2
or (select count(*) from public.application_use_edits where grant_id=(select id from w6_edit_grant) and idempotency_key='w6-edit-001')<>1 then raise exception 'correction replay duplicated'; end if;
end $$;
-- Both a phone contact and a typed staff email resolve on correction.
select count(*) from public.edit_internal_tool_use_record(
'e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from w6_edit_grant),1,2,'{"id":"w6-use","values":{"business":"Corrected phone","client":"(716) 555-0199","handler":"sam@leslie.example.test"}}','w6-edit-002');
do $$ begin
if not exists(select 1 from public.application_records r join public.business_contacts c on c.id=(r.values->>'client')::uuid
where r.record_id='w6-use' and r.record_revision=3 and c.phone_key=public.business_contact_phone_key('(716) 555-0199')
and r.values->>'handler'='e8000000-0000-4000-8000-000000000020') then raise exception 'phone/staff correction failed'; end if;
end $$;
-- Validation failure rolls the new contact back with the edit.
do $$ begin
begin
perform public.edit_internal_tool_use_record('e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from w6_edit_grant),1,3,'{"id":"w6-use","values":{"business":42,"client":"edit-rollback@client.example.test"}}','w6-edit-invalid');
raise exception 'invalid correction accepted';
exception when others then if sqlerrm<>'application_record_invalid' then raise; end if; end;
if exists(select 1 from public.business_contacts where email='edit-rollback@client.example.test') then raise exception 'invalid correction leaked contact'; end if;
end $$;
-- Stale revision, another submitter's record and foreign business links fail.
select pg_temp.expect_error($q$select * from public.edit_internal_tool_use_record('e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from w6_edit_grant),1,2,'{"id":"w6-use","values":{"business":"Stale","client":"stale-edit@client.example.test"}}','w6-edit-stale')$q$,'application_record_revision_conflict');
select pg_temp.expect_error($q$select * from public.edit_internal_tool_use_record('e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from w6_edit_grant),1,1,'{"id":"r1","values":{"business":"Not mine","client":"foreign-edit@client.example.test"}}','w6-edit-other')$q$,'application_use_denied');
select pg_temp.expect_error($q$select * from public.edit_internal_tool_use_record('e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from w6_edit_grant),1,3,'{"id":"w6-use","values":{"business":"Cross business","client":"e8000000-0000-4000-8000-000000000032"}}','w6-edit-cross')$q$,'application_record_link_denied');
select pg_temp.expect_error($q$select * from public.edit_internal_tool_use_record('e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from w6_edit_grant),1,3,'{"id":"w6-use","values":{"business":"Foreign assignee","client":"foreign-assignee-rollback@client.example.test","handler":"e8000000-0000-4000-8000-000000000022"}}','w6-edit-foreign-assignee')$q$,'application_record_link_denied');
do $$ begin
if exists(select 1 from public.business_contacts where email='foreign-assignee-rollback@client.example.test') then raise exception 'foreign assignee leaked contact'; end if;
end $$;
select pg_temp.expect_error($q$select * from public.edit_internal_tool_use_record('e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from w6_edit_grant),1,3,'{"id":"w6-use","values":{"business":"Unknown staff","client":"e8000000-0000-4000-8000-000000000030","handler":"staff@other.example.test"}}','w6-edit-staff')$q$,'application_record_person_unknown');
update public.application_use_grants set status='revoked',revoked_at=clock_timestamp() where id=(select id from w6_edit_grant);
select pg_temp.expect_error($q$select * from public.edit_internal_tool_use_record('e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from w6_edit_grant),1,3,'{"id":"w6-use","values":{"business":"Revoked","client":"revoked-edit@client.example.test"}}','w6-edit-revoked')$q$,'application_use_denied');
do $$ begin
if exists(select 1 from public.business_contacts where email in ('stale-edit@client.example.test','foreign-edit@client.example.test','revoked-edit@client.example.test')) then raise exception 'denied correction leaked contact'; end if;
if has_function_privilege('authenticated','public.edit_internal_tool_use_record(uuid,text,uuid,uuid,integer,integer,jsonb,text)','execute')
or not has_function_privilege('service_role','public.edit_internal_tool_use_record(uuid,text,uuid,uuid,integer,integer,jsonb,text)','execute') then raise exception 'correction function authority wrong'; end if;
end $$;

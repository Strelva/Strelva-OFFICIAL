\set ON_ERROR_STOP on
-- A resource-use recipient has no business membership or contact-list authority.
create temp table w6_use_grant as select * from public.grant_application_use_with_edit(
'e8000000-0000-4000-8000-000000000001','links-operator@example.test','e8000000-0000-4000-8000-000000000040',
'links-outsider@example.test',array['form','list'],'own','own',true,'Staff intake',clock_timestamp()+interval '1 day');
create temp table w6_use_result as select public.submit_internal_tool_use_record(
'e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from w6_use_grant),1,'{"id":"w6-use","values":{"business":"Grant intake","client":"grant@client.example.test","handler":"sam@leslie.example.test"}}','w6-use-001') value;
do $$ begin
if not exists(select 1 from public.application_records r join public.business_contacts c on c.id=(r.values->>'client')::uuid
where r.work_id='e8000000-0000-4000-8000-000000000040' and r.record_id='w6-use' and c.workspace_id=r.workspace_id
and c.email='grant@client.example.test' and 'internal_app'=any(c.sources)) then raise exception 'contact not linked'; end if;
end $$;
-- Replay returns the same record, never another submission or receipt.
select public.submit_internal_tool_use_record('e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from w6_use_grant),1,'{"id":"w6-use","values":{"business":"Grant intake","client":"grant@client.example.test","handler":"sam@leslie.example.test"}}','w6-use-001');
select public.claim_internal_tool_submit_notice('e8000000-0000-4000-8000-000000000010','e8000000-0000-4000-8000-000000000040','w6-use','handler','e8000000-0000-4000-8000-000000000003','links-outsider@example.test');
-- Invalid values reject the record AND roll back the contact upsert.
do $$ begin
begin
perform public.submit_internal_tool_use_record('e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from w6_use_grant),1,'{"id":"w6-invalid","values":{"business":42,"client":"rolledback@client.example.test"}}','w6-invalid-001');
raise exception 'invalid record accepted';
exception when others then if sqlerrm<>'application_record_invalid' then raise; end if; end;
if exists(select 1 from public.business_contacts where email='rolledback@client.example.test') then raise exception 'contact leaked from rejected submit'; end if;
end $$;
update public.application_use_grants set status='revoked',revoked_at=clock_timestamp() where id=(select id from w6_use_grant);
do $$ begin
begin
perform public.submit_internal_tool_use_record('e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from w6_use_grant),1,'{"id":"w6-revoked","values":{"business":"No access","client":"revoked@client.example.test"}}','w6-revoked-001');
raise exception 'revoked recipient accepted';
exception when others then if sqlerrm<>'application_use_denied' then raise; end if; end;
if exists(select 1 from public.business_contacts where email='revoked@client.example.test') then raise exception 'revoked recipient created contact'; end if;
end $$;

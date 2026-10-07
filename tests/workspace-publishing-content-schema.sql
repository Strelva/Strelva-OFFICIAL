\set ON_ERROR_STOP on
begin;
create function pg_temp.pc_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'publishing assertion failed: %',label; end if; end; $$;
create function pg_temp.pc_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm not like expected then raise exception 'expected % got %',expected,sqlerrm; end if;
    return;
  end;
  raise exception 'expected failure %',expected;
end; $$;
insert into public.users(id,email,email_confirmed_at) values('cf000000-0000-4000-8000-000000000001','content-fixture@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('cf000000-0000-4000-8000-000000000010','customer','Content Fixture','cf000000-0000-4000-8000-000000000001'),
 ('cf000000-0000-4000-8000-000000000011','customer','Other Fixture','cf000000-0000-4000-8000-000000000001');
insert into public.tenants(id,stable_id,site_name,active) values('content-fixture','cf000000-0000-4000-8000-0000000000b1','Content Fixture',true);
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
 values('cf000000-0000-4000-8000-0000000000b1','content-fixture','cf000000-0000-4000-8000-000000000010','cf000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-0000000000c1',repeat('a',64),'{}');
create temp table pc_input(doc jsonb);
insert into pc_input values(jsonb_build_object('workspaceId','cf000000-0000-4000-8000-000000000010','systemId','cf000000-0000-4000-8000-000000000020','tenantId','content-fixture',
 'eventId','evt-content-fixture','actor','owner-link:content-fixture@example.test','draftHash',repeat('b',64),'type','blog','slug','hello','data','{"title":"Hello","body":"Approved words"}'::jsonb,'before','null'::jsonb));
create temp table pc_publication as select doc from pc_input;
select pg_temp.pc_assert((select relrowsecurity from pg_class where oid='public.workspace_newsletter_issues'::regclass),'RLS');
select pg_temp.pc_assert(not has_table_privilege('service_role','public.workspace_newsletter_issues','insert') and not has_table_privilege('anon','public.workspace_newsletter_issues','select'),'RPC-only output store');
select pg_temp.pc_assert(not has_function_privilege('authenticated','public.publish_workspace_collection(jsonb)','execute') and has_function_privilege('service_role','public.publish_workspace_collection(jsonb)','execute'),'service-only publishing RPC');
create temp table pc_receipt(doc jsonb);
insert into pc_receipt select public.publish_workspace_collection(doc) from pc_input;
select pg_temp.pc_assert((select status='published' and data->>'body'='Approved words' from public.collection_entries where tenant_id='content-fixture' and slug='hello'),'approved snapshot published');
select pg_temp.pc_assert((select count(*)=1 from public.outside_write_receipts where tenant_id='content-fixture'),'one existing-ledger receipt');
select pg_temp.pc_assert((select public.publish_workspace_collection(doc)=(select doc from pc_receipt) from pc_input),'publication replay returns first receipt');
select pg_temp.pc_expect($$select public.publish_workspace_collection(doc || '{"workspaceId":"cf000000-0000-4000-8000-000000000011"}') from pc_input$$,'publishing_tenant_not_linked');
select pg_temp.pc_expect($$select public.publish_workspace_collection(doc || '{"draftHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}') from pc_input$$,'publishing_receipt_conflict');
select pg_temp.pc_expect($$select public.publish_workspace_collection(doc || '{"systemId":"cf000000-0000-4000-8000-000000000021"}') from pc_input$$,'publishing_receipt_conflict');
select pg_temp.pc_expect($$select public.publish_workspace_collection(doc || '{"eventId":"evt-stale"}') from pc_input$$,'publishing_baseline_changed');
-- Receipt validation failure rolls back the collection write as well.
select pg_temp.pc_expect($$select public.publish_workspace_collection(doc || '{"eventId":"evt-invalid-receipt","slug":"rollback-entry","actor":""}') from pc_input$$,'outside_write_receipt_invalid');
select pg_temp.pc_assert(not exists(select 1 from public.collection_entries where tenant_id='content-fixture' and slug='rollback-entry'),'receipt failure rolls back publication');
update public.collection_entries set status='draft',data='{"title":"Later owner edit"}' where tenant_id='content-fixture' and slug='hello';
select pg_temp.pc_assert((select public.publish_workspace_collection(doc)=(select doc from pc_receipt limit 1) from pc_publication),'publication recovery survives a later edit');
select pg_temp.pc_assert((select status='draft' and data->>'title'='Later owner edit' from public.collection_entries where tenant_id='content-fixture' and slug='hello'),'recovery does not overwrite the later edit');
update pc_input set doc=doc || '{"eventId":"evt-newsletter-fixture","subject":"A new issue","body":"Frozen approved words"}';
insert into pc_receipt select public.approve_workspace_newsletter_issue(doc) from pc_input;
select pg_temp.pc_assert((select state='approved_sending_paused' and accepted_count=0 and failure_count=0 and body='Frozen approved words' from public.workspace_newsletter_issues where tenant_id='content-fixture'),'approved and paused, no provider acceptance invented');
select pg_temp.pc_assert((select public.approve_workspace_newsletter_issue(doc)=(select doc from pc_receipt offset 1 limit 1) from pc_input),'newsletter replay returns first issue');
select pg_temp.pc_expect($$select public.approve_workspace_newsletter_issue(doc || '{"body":"Changed after approval"}') from pc_input$$,'newsletter_issue_conflict');
select pg_temp.pc_expect($$update public.workspace_newsletter_issues set body='Rewritten' where tenant_id='content-fixture'$$,'newsletter_issue_is_immutable');
select pg_temp.pc_expect($$delete from public.workspace_newsletter_issues where tenant_id='content-fixture'$$,'newsletter_issue_is_immutable');
select pg_temp.pc_expect($$select public.read_workspace_newsletter_issues('cf000000-0000-4000-8000-000000000011','content-fixture')$$,'publishing_tenant_not_linked');
select pg_temp.pc_assert(jsonb_array_length(public.read_workspace_collection_receipts('cf000000-0000-4000-8000-000000000010','content-fixture','cf000000-0000-4000-8000-000000000020'))=1,'workspace receipt read keeps ledger identity');
select pg_temp.pc_assert(jsonb_array_length(public.read_workspace_newsletter_issues('cf000000-0000-4000-8000-000000000010','content-fixture'))=1,'immutable issue readable');
-- Pausing blocks new work, but does not erase an output already accepted.
insert into public.systems(id,business_workspace_id,name,kind,lifecycle,current_revision_id,current_revision_number,command_id,command_digest,created_by,updated_by)
 values('cf000000-0000-4000-8000-000000000020','cf000000-0000-4000-8000-000000000010','Content Fixture','website','paused','cf000000-0000-4000-8000-000000000030',1,'cf000000-0000-4000-8000-000000000031',repeat('d',64),'cf000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001');
insert into public.system_revisions(id,system_id,business_workspace_id,number,implementation,command_id,command_digest,created_by)
 values('cf000000-0000-4000-8000-000000000030','cf000000-0000-4000-8000-000000000020','cf000000-0000-4000-8000-000000000010',1,'{"kind":"content","ref":"fixture"}','cf000000-0000-4000-8000-000000000032',repeat('e',64),'cf000000-0000-4000-8000-000000000001');
select pg_temp.pc_assert((select public.publish_workspace_collection(doc)=(select doc from pc_receipt limit 1) from pc_publication),'paused publication recovery returns first receipt');
select pg_temp.pc_assert((select public.approve_workspace_newsletter_issue(doc)=(select doc from pc_receipt offset 1 limit 1) from pc_input),'paused issue recovery returns first output');
select pg_temp.pc_expect($$select public.publish_workspace_collection(doc || '{"eventId":"evt-after-pause"}') from pc_publication$$,'publishing_paused');
select pg_temp.pc_expect($$select public.approve_workspace_newsletter_issue(doc || '{"eventId":"evt-issue-after-pause"}') from pc_input$$,'publishing_paused');
update public.systems set lifecycle='live' where id='cf000000-0000-4000-8000-000000000020';
insert into public.workspace_exit_requests(workspace_id,requested_by,idempotency_key,command_digest,future_work,provider_participation,maintained_resource_action,state,completed_at)
 values('cf000000-0000-4000-8000-000000000010','cf000000-0000-4000-8000-000000000001','publishing-exit',repeat('f',64),'pause','keep','stop','{"status":"completed"}',now());
select pg_temp.pc_assert((select public.publish_workspace_collection(doc)=(select doc from pc_receipt limit 1) from pc_publication),'stopped workspace publication recovery returns first receipt');
select pg_temp.pc_assert((select public.approve_workspace_newsletter_issue(doc)=(select doc from pc_receipt offset 1 limit 1) from pc_input),'stopped workspace issue recovery returns first output');
select pg_temp.pc_expect($$select public.publish_workspace_collection(doc || '{"eventId":"evt-after-stop"}') from pc_publication$$,'publishing_paused');
select pg_temp.pc_expect($$select public.approve_workspace_newsletter_issue(doc || '{"eventId":"evt-issue-after-stop"}') from pc_input$$,'publishing_paused');
rollback;

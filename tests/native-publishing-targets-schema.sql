\set ON_ERROR_STOP on
begin;
create function pg_temp.np_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'native publishing assertion: %',label; end if; end; $$;
create function pg_temp.np_expect(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlerrm not like expected then raise exception 'expected % got %',expected,sqlerrm; end if; return; end; raise exception 'expected %',expected; end; $$;
insert into public.users(id,email,verified_at) values('af100000-0000-4000-8000-000000000001','native-publishing@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('af100000-0000-4000-8000-000000000010','customer','Native Publishing','af100000-0000-4000-8000-000000000001'),
 ('af100000-0000-4000-8000-000000000011','customer','Other Business','af100000-0000-4000-8000-000000000001');
insert into public.systems(id,business_workspace_id,name,kind,lifecycle,current_revision_id,current_revision_number,command_id,command_digest,created_by,updated_by)
 values('af100000-0000-4000-8000-000000000020','af100000-0000-4000-8000-000000000010','Native Website','website','draft','af100000-0000-4000-8000-000000000030',1,'af100000-0000-4000-8000-000000000031',repeat('a',64),'af100000-0000-4000-8000-000000000001','af100000-0000-4000-8000-000000000001'),
 ('af100000-0000-4000-8000-000000000021','af100000-0000-4000-8000-000000000010','Native Newsletter','newsletter','draft','af100000-0000-4000-8000-000000000032',1,'af100000-0000-4000-8000-000000000033',repeat('b',64),'af100000-0000-4000-8000-000000000001','af100000-0000-4000-8000-000000000001');
insert into public.system_revisions(id,system_id,business_workspace_id,number,implementation,command_id,command_digest,created_by) values
 ('af100000-0000-4000-8000-000000000030','af100000-0000-4000-8000-000000000020','af100000-0000-4000-8000-000000000010',1,'{"kind":"content","ref":"native-fixture"}','af100000-0000-4000-8000-000000000034',repeat('c',64),'af100000-0000-4000-8000-000000000001'),
 ('af100000-0000-4000-8000-000000000032','af100000-0000-4000-8000-000000000021','af100000-0000-4000-8000-000000000010',1,'{"kind":"content","ref":"native-newsletter"}','af100000-0000-4000-8000-000000000035',repeat('d',64),'af100000-0000-4000-8000-000000000001');
create temp table np_input(doc jsonb);
insert into np_input values(jsonb_build_object('workspaceId','af100000-0000-4000-8000-000000000010','systemId','af100000-0000-4000-8000-000000000020','tenantId','workspace-af100000-0000-4000-8000-000000000010',
 'eventId','evt-native-fixture','actor','owner-link:native-publishing@example.test','draftHash',repeat('b',64),'type','blog','slug','hello','data','{"title":"Native words"}'::jsonb,'before','null'::jsonb));
select pg_temp.np_assert(not has_table_privilege('service_role','public.workspace_collection_entries','insert') and not has_function_privilege('authenticated','public.publish_native_workspace_collection(jsonb)','execute'),'RPC-only native store');
create temp table np_receipt as select public.publish_native_workspace_collection(doc) result from np_input;
select pg_temp.np_assert(jsonb_array_length(public.read_native_workspace_collection('af100000-0000-4000-8000-000000000010','af100000-0000-4000-8000-000000000020'))=1,'read back published content');
select pg_temp.np_assert((select tenant_id is null and actor='owner-link:native-publishing@example.test' and readback='matched' from public.outside_write_receipts where command_key='workspace-collection:evt-native-fixture'),'workspace receipt and approving actor');
select pg_temp.np_expect($$select public.publish_native_workspace_collection(doc || '{"workspaceId":"af100000-0000-4000-8000-000000000011"}') from np_input$$,'publishing_system_not_owned');
select pg_temp.np_expect($$select public.publish_native_workspace_collection(doc || '{"tenantId":"fake"}') from np_input$$,'publishing_scope_invalid');
select pg_temp.np_expect($$select public.publish_native_workspace_collection(doc || '{"eventId":"evt-stale"}') from np_input$$,'publishing_baseline_changed');
select pg_temp.np_expect($$select public.publish_native_workspace_collection(doc || '{"eventId":"evt-invalid","slug":"rollback","actor":""}') from np_input$$,'outside_write_receipt_invalid');
select pg_temp.np_assert(not exists(select 1 from public.workspace_collection_entries where slug='rollback'),'receipt failure rolls back content');
-- Undo is a new baseline-bound approval, never a destructive receipt rewrite.
create temp table np_restore as select doc || jsonb_build_object('eventId','evt-native-restore','status','draft','before',jsonb_build_object('status','published','data',doc->'data'),'draftHash',repeat('c',64)) doc from np_input;
select public.publish_native_workspace_collection(doc) from np_restore;
select pg_temp.np_assert((select status='draft' from public.workspace_collection_entries where slug='hello'),'restore/unpublish applied');
update public.systems set lifecycle='paused' where id='af100000-0000-4000-8000-000000000020';
select pg_temp.np_assert((select public.publish_native_workspace_collection(doc)=(select result from np_receipt) from np_input),'accepted recovery after restore and pause');
select pg_temp.np_expect($$select public.publish_native_workspace_collection(doc || '{"eventId":"evt-after-pause"}') from np_input$$,'publishing_paused');
select pg_temp.np_expect($$select public.publish_native_workspace_collection(doc || jsonb_build_object('draftHash',repeat('d',64))) from np_input$$,'publishing_receipt_conflict');
select public.approve_native_workspace_newsletter_issue(doc || '{"systemId":"af100000-0000-4000-8000-000000000021","eventId":"evt-native-newsletter","subject":"Native issue","body":"Frozen words"}') from np_input;
select pg_temp.np_assert((select tenant_id is null and state='approved_sending_paused' and accepted_count=0 from public.workspace_newsletter_issues where event_id='evt-native-newsletter'),'native issue is immutable and paused');
select pg_temp.np_expect($$update public.workspace_newsletter_issues set body='changed' where event_id='evt-native-newsletter'$$,'newsletter_issue_is_immutable');
select pg_temp.np_assert(jsonb_array_length(public.read_native_workspace_newsletter_issues('af100000-0000-4000-8000-000000000011'))=0,'other business cannot read native issues');
-- Native grant is workspace-owned, with no linked tenant and no Redis fallback.
select public.upsert_workspace_account_binding(jsonb_build_object('workspaceId','af100000-0000-4000-8000-000000000010','provider','google','originTenantStableId',null,'scopes','[]'::jsonb,'refreshTokenCiphertext','enc:v1:YQ==:Yg==:Yw==','accessTokenCiphertext','enc:v1:YQ==:Yg==:Yw==','status','connected'),'oauth');
select pg_temp.np_assert(public.read_native_workspace_google_binding('af100000-0000-4000-8000-000000000010')->>'originTenantId' is null and public.read_native_workspace_google_binding('af100000-0000-4000-8000-000000000010')->>'workspaceId'='af100000-0000-4000-8000-000000000010','native binding resolved');
select pg_temp.np_assert(public.read_native_workspace_google_binding('af100000-0000-4000-8000-000000000011') is null,'native grant isolation');
rollback;

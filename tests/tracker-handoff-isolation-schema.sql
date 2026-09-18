\set ON_ERROR_STOP on
create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'assertion failed: %', message; end if; end;
$$;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.accept_workspace_handoff(text,uuid,text,boolean)','EXECUTE'),'handoff remains service-only');
DO $$
declare
 w uuid:=gen_random_uuid(); source_id uuid; target_id uuid:=gen_random_uuid(); copied_id uuid;
 token text:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
 revoked_token text:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
 original jsonb; copied jsonb; accepted record; replay record;
begin
 insert into public.workspaces(id,kind,name,created_by) values(w,'agency','Handoff isolation proof','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 original:=jsonb_build_object('tracker',jsonb_build_object(
  'id','handoff-tracker','revision',3,'originalSource','Name'||chr(10)||'Roof',
  'rows',jsonb_build_array(jsonb_build_object('id','row1','state','active','cells',jsonb_build_object('name',jsonb_build_object('value','Roof repaired')),
   'coordination',jsonb_build_object('assigneeId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','links',jsonb_build_array(jsonb_build_object('workId',target_id,'rowId','project1','linkedRevision',0))))),
  'history',jsonb_build_array(
   jsonb_build_object('kind','coordinate_records','commandId','assign','revision',1,'coordinationChanges',jsonb_build_array(jsonb_build_object('rowId','row1','before',jsonb_build_object('assigneeId',null,'links','[]'::jsonb),'after',jsonb_build_object('assigneeId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','links','[]'::jsonb)))),
   jsonb_build_object('kind','update_cell','commandId','repair','revision',2,'changes',jsonb_build_array(jsonb_build_object('rowId','row1','columnId','name','before','Roof','after','Roof repaired'))),
   jsonb_build_object('kind','undo_change','commandId','undo-assignment','revision',3,'coordinationChanges',jsonb_build_array(jsonb_build_object('rowId','row1','before',jsonb_build_object('assigneeId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','links','[]'::jsonb),'after',jsonb_build_object('assigneeId',null,'links','[]'::jsonb)))))));
 insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by) values(w,'tracker','tracker','Transferred jobs',original,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') returning id into source_id;
 insert into public.workspace_handoffs(agency_workspace_id,source_work_id,recipient_email,token_hash,status,expires_at,created_by) values
  (w,source_id,'recipient@example.com',token,'pending',now()+interval '1 hour','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  (w,source_id,'recipient@example.com',revoked_token,'revoked',now()+interval '1 hour','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 begin
  perform public.accept_workspace_handoff(token,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',false);
  raise exception 'wrong recipient accepted';
 exception when others then if SQLERRM<>'handoff_recipient_mismatch' then raise; end if; end;
 begin
  perform public.accept_workspace_handoff(revoked_token,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','recipient@example.com',false);
  raise exception 'revoked handoff accepted';
 exception when others then if SQLERRM<>'handoff_revoked' then raise; end if; end;
 select * into accepted from public.accept_workspace_handoff(token,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','recipient@example.com',false);
 select payload into copied from public.saved_product_work where id=accepted.customer_work_id;
 perform pg_temp.assert_true(not(copied->'tracker'->'rows'->0 ? 'coordination'),'customer copy removes source workspace assignment and related work');
 perform pg_temp.assert_true(copied->'tracker'->'history'=jsonb_build_array(original->'tracker'->'history'->1),'customer copy preserves cell history but removes coordination and its undo receipts');
 perform pg_temp.assert_true(copied->'tracker'->>'revision'='3' and copied->'tracker'->>'originalSource'=original->'tracker'->>'originalSource' and copied->'tracker'->'rows'->0->'cells'=original->'tracker'->'rows'->0->'cells','copy preserves revision, original input, and current record data');
 perform pg_temp.assert_true((select payload=original from public.saved_product_work where id=source_id),'handoff does not mutate agency source');
 perform pg_temp.assert_true((select source_work_id=source_id and created_by='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' from public.saved_product_work where id=accepted.customer_work_id),'copy keeps source provenance and recipient ownership');
 perform pg_temp.assert_true(accepted.delegation_id is null and not exists(select 1 from public.workspace_delegations where customer_work_id=accepted.customer_work_id),'handoff creates no unrequested read grant');
 perform pg_temp.assert_true(not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'recipient does not gain source workspace membership');
 select * into replay from public.accept_workspace_handoff(token,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','recipient@example.com',true);
 perform pg_temp.assert_true(replay.already_accepted and replay.customer_work_id=accepted.customer_work_id and replay.delegation_id is null,'replay returns same copy without expanding delegation');
 begin
  perform public.accept_workspace_handoff(token,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',false);
  raise exception 'accepted token bypassed recipient check';
 exception when others then if SQLERRM<>'handoff_recipient_mismatch' then raise; end if; end;
end $$;

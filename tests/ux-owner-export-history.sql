\set ON_ERROR_STOP on
begin;
insert into public.users(id,email,verified_at) values
 ('e6592400-0000-4000-8000-000000000001','history-owner@example.test',now()),
 ('e6592400-0000-4000-8000-000000000002','history-admin@example.test',now()),
 ('e6592400-0000-4000-8000-000000000003','history-other@example.test',now()),
 ('e6592400-0000-4000-8000-000000000004','history-unconfirmed@example.test',null);
insert into public.workspaces(id,kind,name,created_by) values
 ('e6592400-0000-4000-8000-000000000010','customer','History archive','e6592400-0000-4000-8000-000000000001'),
 ('e6592400-0000-4000-8000-000000000011','customer','Other archive','e6592400-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('e6592400-0000-4000-8000-000000000010','e6592400-0000-4000-8000-000000000001','owner','e6592400-0000-4000-8000-000000000001'),
 ('e6592400-0000-4000-8000-000000000010','e6592400-0000-4000-8000-000000000002','admin','e6592400-0000-4000-8000-000000000001'),
 ('e6592400-0000-4000-8000-000000000011','e6592400-0000-4000-8000-000000000003','owner','e6592400-0000-4000-8000-000000000003'),
 ('e6592400-0000-4000-8000-000000000010','e6592400-0000-4000-8000-000000000004','owner','e6592400-0000-4000-8000-000000000001');
insert into public.workspace_export_builds(id,workspace_id,requested_by,requester_role,deliver_to,status,
 manifest,download_token_hash,expires_at,created_at) values
 ('e6592400-0000-4000-8000-000000000020','e6592400-0000-4000-8000-000000000010','e6592400-0000-4000-8000-000000000002','operator','history-owner@example.test','ready','{}',repeat('a',64),now()+interval '6 days',now()-interval '8 days'),
 ('e6592400-0000-4000-8000-000000000021','e6592400-0000-4000-8000-000000000010','e6592400-0000-4000-8000-000000000001','owner','history-owner@example.test','ready','{}',repeat('b',64),now()-interval '1 second',now()-interval '2 days'),
 ('e6592400-0000-4000-8000-000000000022','e6592400-0000-4000-8000-000000000010','e6592400-0000-4000-8000-000000000001','owner','history-owner@example.test','building',null,null,null,now()),
 ('e6592400-0000-4000-8000-000000000023','e6592400-0000-4000-8000-000000000010','e6592400-0000-4000-8000-000000000001','owner','history-owner@example.test','building',null,null,null,now()-interval '31 minutes'),
 ('e6592400-0000-4000-8000-000000000024','e6592400-0000-4000-8000-000000000010','e6592400-0000-4000-8000-000000000001','owner','history-owner@example.test','failed',null,null,null,now()-interval '1 day'),
 ('e6592400-0000-4000-8000-000000000025','e6592400-0000-4000-8000-000000000010','e6592400-0000-4000-8000-000000000001','owner','history-owner@example.test','failed',null,null,null,now()-interval '8 days'),
 ('e6592400-0000-4000-8000-000000000026','e6592400-0000-4000-8000-000000000011','e6592400-0000-4000-8000-000000000003','owner','history-other@example.test','building',null,null,null,now());
do $$declare result jsonb; actor record; item jsonb;begin
 result:=public.list_workspace_export_owner_builds('e6592400-0000-4000-8000-000000000010','e6592400-0000-4000-8000-000000000001','history-owner@example.test');
 if jsonb_array_length(result)<>5 or result->0->>'status'<>'building' or result->1->>'status'<>'stalled'
   or result->2->>'status'<>'failed' or result->3->>'status'<>'expired' or result->4->>'status'<>'ready' then raise exception 'history status/order/retention mismatch: %',result;end if;
 for item in select value from jsonb_array_elements(result) loop
  if item->>'workspaceId'<>'e6592400-0000-4000-8000-000000000010' or (select count(*) from jsonb_object_keys(item))<>5 then raise exception 'history leaked fields or other workspace';end if;
 end loop;
 for actor in select id,email from public.users where id in ('e6592400-0000-4000-8000-000000000002','e6592400-0000-4000-8000-000000000003','e6592400-0000-4000-8000-000000000004') loop
  begin
   perform public.list_workspace_export_owner_builds('e6592400-0000-4000-8000-000000000010',actor.id,actor.email);
   raise exception 'non-owner or unconfirmed history read';
  exception when others then if sqlerrm<>'workspace_export_denied' then raise;end if;end;
 end loop;
 begin
  perform public.list_workspace_export_owner_builds('e6592400-0000-4000-8000-000000000010','e6592400-0000-4000-8000-000000000001','spoof@example.test');
  raise exception 'spoofed owner email';
 exception when others then if sqlerrm<>'workspace_export_denied' then raise;end if;end;
 if has_function_privilege('anon','public.list_workspace_export_owner_builds(uuid,uuid,text)','execute')
   or has_function_privilege('authenticated','public.list_workspace_export_owner_builds(uuid,uuid,text)','execute')
   or not has_function_privilege('service_role','public.list_workspace_export_owner_builds(uuid,uuid,text)','execute') then raise exception 'history execute authority mismatch';end if;
end $$;
delete from public.workspace_export_builds where workspace_id='e6592400-0000-4000-8000-000000000010';
do $$begin
 if public.list_workspace_export_owner_builds('e6592400-0000-4000-8000-000000000010','e6592400-0000-4000-8000-000000000001','history-owner@example.test')<>'[]'::jsonb then raise exception 'empty history mismatch';end if;
end $$;
update public.workspace_memberships set role='member' where workspace_id='e6592400-0000-4000-8000-000000000010' and user_id='e6592400-0000-4000-8000-000000000001';
do $$begin
 begin
  perform public.list_workspace_export_owner_builds('e6592400-0000-4000-8000-000000000010','e6592400-0000-4000-8000-000000000001','history-owner@example.test');
  raise exception 'revoked owner history read';
 exception when others then if sqlerrm<>'workspace_export_denied' then raise;end if;end;
end $$;
rollback;

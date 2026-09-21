\set ON_ERROR_STOP on
create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'assertion failed: %', message; end if; end;
$$;
create function pg_temp.responsibility_next(previous jsonb, kind text) returns jsonb language sql as $$
 select previous || jsonb_build_object('revision',(previous->>'revision')::integer+1,'updatedAt','2026-09-12T12:01:00Z','history',previous->'history' || jsonb_build_array(jsonb_build_object('revision',(previous->>'revision')::integer+1,'actorId',previous->>'ownerId','kind',kind,'at','2026-09-12T12:01:00Z')));
$$;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.update_work_responsibility(uuid,uuid,uuid,text,integer,jsonb)','EXECUTE'),'responsibility RPC service only');
select pg_temp.assert_true(not has_function_privilege('anon','public.due_workspace_work(integer)','EXECUTE'),'due work is not publicly enumerable');
DO $$
declare w uuid; item public.saved_product_work; current_work public.saved_product_work; proposal jsonb; draft jsonb; malicious jsonb;
begin
 select id into w from public.workspaces where created_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and kind='personal' limit 1;
 proposal := '{"version":1,"revision":0,"title":"Update procedure","intent":"Keep instructions current","ownerId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","status":"proposed","createdAt":"2026-09-12T12:00:00Z","updatedAt":"2026-09-12T12:00:00Z","history":[],"steps":[{"id":"edit","operation":"document.edit","workId":"11111111-1111-4111-8111-111111111111","input":{"kind":"edit","expectedRevision":0,"title":"Procedure","text":"Confirmed"},"dependsOn":[],"maximumCents":0,"status":"pending","attempt":0}]}';
 insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by) values(w,'operations','responsibility','Update procedure',proposal,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') returning * into item;
 draft := pg_temp.responsibility_next(proposal,'approve') || jsonb_build_object('status','ready','approvedBy',item.created_by::text,'approvedAt','2026-09-12T12:01:00Z');
 select * into current_work from public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',0,draft);
 perform pg_temp.assert_true(current_work.payload->>'status'='ready','owner approval persists');
 begin
  perform public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',0,draft);
  raise exception 'stale responsibility update accepted';
 exception when others then if SQLERRM<>'responsibility_revision_conflict' then raise; end if; end;
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(w,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','member',item.created_by) on conflict do nothing;
 begin
  malicious := pg_temp.responsibility_next(draft,'pause');
  malicious := jsonb_set(malicious,'{history,1,actorId}','"cccccccc-cccc-4ccc-8ccc-cccccccccccc"');
  perform public.update_work_responsibility(item.id,w,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',1,malicious);
  raise exception 'non-owner member mutated responsibility';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
 begin
  malicious := jsonb_set(pg_temp.responsibility_next(draft,'started'),'{steps,0,input,text}','"Different approved work"');
  perform public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',1,malicious);
  raise exception 'approved input changed';
 exception when others then if SQLERRM<>'responsibility_payload_invalid' then raise; end if; end;
 begin
  malicious := pg_temp.responsibility_next(draft,'pause') || '{"approvedAt":"2026-09-13T12:01:00Z"}'::jsonb;
  perform public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',1,malicious);
  raise exception 'approval evidence changed';
 exception when others then if SQLERRM<>'responsibility_payload_invalid' then raise; end if; end;
 delete from public.workspace_memberships where workspace_id=w and user_id=item.created_by;
 begin
  perform public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',1,pg_temp.responsibility_next(draft,'pause'));
  raise exception 'revoked owner changed responsibility';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
 perform pg_temp.assert_true(not exists(select 1 from public.due_workspace_work(30) d where d.id=item.id),'revoked work is not due');
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(w,item.created_by,'owner',item.created_by);
 draft := pg_temp.responsibility_next(draft,'started') || '{"status":"running"}'::jsonb;
 draft := jsonb_set(draft,'{steps,0}',(draft->'steps'->0)||'{"status":"running","attempt":1,"leaseId":"lease-1","startedAt":"2026-09-12T12:01:00Z"}'::jsonb);
 select * into current_work from public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',1,draft);
 draft := pg_temp.responsibility_next(draft,'cancel') || '{"status":"cancelled"}'::jsonb;
 perform public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',2,draft);
 draft := pg_temp.responsibility_next(draft,'outcome');
 draft := jsonb_set(draft,'{steps,0}',(draft->'steps'->0)||'{"status":"completed","effect":"accepted","result":{"receipt":"accepted-1"}}'::jsonb);
 select * into current_work from public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',3,draft);
 perform pg_temp.assert_true(current_work.payload->>'status'='cancelled' and current_work.payload->'steps'->0->>'effect'='accepted','cancellation retains late accepted outcome');
 begin
  malicious := pg_temp.responsibility_next(draft,'resume') || '{"status":"ready"}'::jsonb;
  perform public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',4,malicious);
  raise exception 'cancelled work reopened';
 exception when others then if SQLERRM<>'responsibility_payload_invalid' then raise; end if; end;
 begin
  malicious := jsonb_set(pg_temp.responsibility_next(draft,'outcome'),'{steps,0,effect}','"none"');
  perform public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',4,malicious);
  raise exception 'accepted outcome erased';
 exception when others then if SQLERRM<>'responsibility_payload_invalid' then raise; end if; end;
 -- A separate completed responsibility cannot reopen; accepted verification failures cannot retry.
 insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by) values(w,'operations','responsibility','Update procedure',proposal,item.created_by) returning * into item;
 draft := pg_temp.responsibility_next(proposal,'approve') || jsonb_build_object('status','ready','approvedBy',item.created_by::text,'approvedAt','2026-09-12T12:01:00Z');
 perform public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',0,draft);
 draft := pg_temp.responsibility_next(draft,'started') || '{"status":"running"}'::jsonb;
 draft := jsonb_set(draft,'{steps,0}',(draft->'steps'->0)||'{"status":"running","attempt":1,"leaseId":"lease-2"}'::jsonb);
 perform public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',1,draft);
 draft := pg_temp.responsibility_next(draft,'outcome') || '{"status":"needs_attention"}'::jsonb;
 draft := jsonb_set(draft,'{steps,0}',(draft->'steps'->0)||'{"status":"accepted","effect":"accepted","result":{"receipt":"accepted-2"}}'::jsonb);
 perform public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',2,draft);
 begin
  malicious := jsonb_set(pg_temp.responsibility_next(draft,'retry'),'{steps,0,status}','"pending"');
  perform public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',3,malicious);
  raise exception 'accepted action made retryable';
 exception when others then if SQLERRM<>'responsibility_payload_invalid' then raise; end if; end;
 draft := jsonb_set(pg_temp.responsibility_next(draft,'reconcile'),'{steps,0,status}','"completed"') || '{"status":"completed"}'::jsonb;
 perform public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',3,draft);
 begin
  malicious := pg_temp.responsibility_next(draft,'retry') || '{"status":"ready"}'::jsonb;
  perform public.update_work_responsibility(item.id,w,item.created_by,'agency@example.com',4,malicious);
  raise exception 'completed responsibility reopened';
 exception when others then if SQLERRM<>'responsibility_payload_invalid' then raise; end if; end;
 delete from public.workspace_memberships where workspace_id=w and user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
end $$;

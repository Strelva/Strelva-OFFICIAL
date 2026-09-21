\set ON_ERROR_STOP on
create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'assertion failed: %', message; end if; end;
$$;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb)','EXECUTE'),'bounded updates service only');
DO $$
declare w uuid; item public.saved_product_work; changed public.saved_product_work; draft jsonb;
begin
 select id into w from public.workspaces where created_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and kind='personal' limit 1;
 insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
 values(w,'applications','application','Requests','{"version":1,"revision":0,"title":"Requests","createdBy":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","createdAt":"2026-09-12T12:00:00Z","history":[]}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') returning * into item;
 draft := item.payload || jsonb_build_object('revision',1,'history',jsonb_build_array(jsonb_build_object('revision',1,'actorId',item.created_by::text,'kind','rehearse','at','2026-09-12T12:01:00Z')));
 select * into changed from public.update_bounded_product_work(item.id,w,item.created_by,'agency@example.com','applications',0,draft);
 if changed.payload->>'revision'<>'1' then raise exception 'bounded revision not saved'; end if;
 begin
  perform public.update_bounded_product_work(item.id,w,item.created_by,'agency@example.com','applications',0,draft);
  raise exception 'stale update accepted';
 exception when others then if SQLERRM<>'bounded_revision_conflict' then raise; end if; end;
 begin
  perform public.update_bounded_product_work(item.id,w,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com','applications',1,draft);
  raise exception 'foreign update accepted';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
 begin
  perform public.update_bounded_product_work(item.id,w,item.created_by,'agency@example.com','scheduling',1,draft);
  raise exception 'cross product update accepted';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
 begin
  perform public.update_bounded_product_work(item.id,w,item.created_by,'agency@example.com','applications',1,draft || '{"revision":2,"history":[]}'::jsonb);
  raise exception 'erased history accepted';
 exception when others then if SQLERRM<>'bounded_payload_invalid' then raise; end if; end;
end $$;

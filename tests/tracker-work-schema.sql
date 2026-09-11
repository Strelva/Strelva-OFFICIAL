\set ON_ERROR_STOP on
create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %', message; end if; end; $$;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.update_tracker_work(uuid,uuid,uuid,text,integer,jsonb)','EXECUTE'),'tracker RPC service only');
DO $$
declare w uuid; item public.saved_product_work; result public.saved_product_work;
begin
 select id into w from public.workspaces where created_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and kind='personal' limit 1;
 insert into public.saved_product_work(workspace_id, product_id,resource_kind,title,payload,created_by)
 values(w,'tracker','tracker','Fictional tracker','{"tracker":{"id":"tracker-test","revision":0,"originalSource":"Name\nExample"}}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') returning * into item;
 select * into result from public.update_tracker_work(item.id,w,item.created_by,'agency@example.com',0,'{"tracker":{"id":"tracker-test","revision":1,"originalSource":"Name\nExample"}}');
 if result.payload->'tracker'->>'revision'<>'1' then raise exception 'update not persisted'; end if;
 begin
  perform public.update_tracker_work(item.id,w,item.created_by,'agency@example.com',0,result.payload);
  raise exception 'stale revision accepted';
 exception when others then if SQLERRM<>'tracker_revision_conflict' then raise; end if; end;
 begin
  perform public.update_tracker_work(item.id,w,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',1,result.payload);
  raise exception 'foreign actor accepted';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
 begin
  perform public.update_tracker_work(item.id,w,item.created_by,'agency@example.com',1,'{"tracker":{"id":"tracker-test","revision":2,"originalSource":"replaced"}}');
  raise exception 'source replacement accepted';
 exception when others then if SQLERRM<>'tracker_payload_invalid' then raise; end if; end;
end $$;

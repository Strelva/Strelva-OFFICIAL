\set ON_ERROR_STOP on
create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %', message; end if; end $$;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.update_product_learning_work(uuid,uuid,uuid,text,integer,jsonb)','EXECUTE'),'learning RPC is service only');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.create_product_learning_work(uuid,uuid,text,jsonb)','EXECUTE'),'learning creation is service only');
DO $$
declare w uuid; item public.saved_product_work; revised public.saved_product_work; draft jsonb;
begin
  select id into w from public.workspaces where created_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and kind='personal' limit 1;
  insert into public.super_admins(user_id,email) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com') on conflict do nothing;
  select * into item from public.create_product_learning_work(w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com','{"status":"active","title":"Reply outcomes","version":1,"revision":0,"createdBy":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","createdAt":"2026-09-12T12:00:00Z","budgetCents":10,"spentCents":0,"sources":[],"history":[]}');
  draft := item.payload || jsonb_build_object('revision',1,'spentCents',1,'history',jsonb_build_array(jsonb_build_object('revision',1,'actorId',item.created_by::text,'at','2026-09-12T12:00:00Z','kind','collect')));
  select * into revised from public.update_product_learning_work(item.id,w,item.created_by,'agency@example.com',0,draft);
  perform pg_temp.assert_true(revised.payload->>'spentCents'='1','collection persisted');
  begin
    perform public.update_product_learning_work(item.id,w,item.created_by,'agency@example.com',0,draft);
    raise exception 'stale evidence accepted';
  exception when others then if SQLERRM<>'learning_revision_conflict' then raise; end if; end;
  begin
    perform public.update_product_learning_work(item.id,w,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',1,draft);
    raise exception 'foreign learning edit accepted';
  exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
  begin
    perform public.update_product_learning_work(item.id,w,item.created_by,'wrong@example.com',1,draft);
    raise exception 'wrong verified email accepted';
  exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
  begin
    perform public.update_product_learning_work(item.id,w,item.created_by,'agency@example.com',1,draft || '{"revision":2,"history":[]}'::jsonb);
    raise exception 'history replacement accepted';
  exception when others then if SQLERRM<>'learning_payload_invalid' then raise; end if; end;
  update public.super_admins set revoked_at=clock_timestamp() where user_id=item.created_by;
  begin
    perform public.update_product_learning_work(item.id,w,item.created_by,'agency@example.com',1,draft);
    raise exception 'revoked internal researcher accepted';
  exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
end $$;

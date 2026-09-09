\set ON_ERROR_STOP on
create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %', message; end if; end; $$;
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.workspace_operations'::regclass),'operation RLS');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.workspace_operations','SELECT'),'private attempts');
select pg_temp.assert_true(not has_function_privilege('anon','public.workspace_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid,jsonb,text,text)','EXECUTE'),'no anonymous RPC');
DO $$
declare w uuid; op public.workspace_operations; first_work uuid; n integer;
begin
 select id into w from public.workspaces where created_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and kind='personal' limit 1;
 if w is null then select id into w from public.create_owned_workspace('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com','personal','Recovery test'); end if;
 select * into op from public.workspace_operation('claim','12121212-1212-4121-8121-121212121212',w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com','ai_visibility','{"business":"Fictional"}','13131313-1313-4131-8131-131313131313');
 if op.status<>'running' then raise exception 'claim failed'; end if;
 begin
  perform public.workspace_operation('claim',op.id,w,op.created_by,'agency@example.com','ai_visibility',op.input,'14141414-1414-4141-8141-141414141414');
  raise exception 'concurrent claim accepted';
 exception when others then if SQLERRM<>'operation_in_progress' then raise; end if; end;
 begin
  perform public.workspace_operation('read',op.id,w,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com');
  raise exception 'wrong actor accepted';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
 begin
  perform public.workspace_operation('claim',op.id,w,op.created_by,'agency@example.com','ai_visibility','{"business":"Changed"}',op.lease_id);
  raise exception 'changed input accepted';
 exception when others then if SQLERRM<>'operation_input_conflict' then raise; end if; end;
 perform public.workspace_operation('checkpoint',op.id,w,op.created_by,'agency@example.com',p_lease_id=>op.lease_id,p_result=>'{"business":"Fictional","score":80}');
 select * into op from public.workspace_operation('claim',op.id,w,op.created_by,'agency@example.com','ai_visibility',op.input,'14141414-1414-4141-8141-141414141414');
 if op.status<>'ready' then raise exception 'checkpoint lost'; end if;
 select * into op from public.workspace_operation('complete',op.id,w,op.created_by,'agency@example.com',p_resource_kind=>'ai_visibility_private_assessment',p_title=>'Fictional');
 first_work=op.work_id;
 select * into op from public.workspace_operation('complete',op.id,w,op.created_by,'agency@example.com',p_resource_kind=>'ai_visibility_private_assessment',p_title=>'Fictional');
 if op.work_id is distinct from first_work or op.result is not null then raise exception 'duplicate completion or residual payload'; end if;
 select count(*) into n from public.saved_product_work where id=first_work;
 if n<>1 then raise exception 'result count wrong'; end if;
 -- A stale worker cannot overwrite a recovered attempt.
 select * into op from public.workspace_operation('claim','15151515-1515-4151-8151-151515151515',w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com','ai_visibility','{}','13131313-1313-4131-8131-131313131313');
 update public.workspace_operations set lease_until=now()-interval '1 second' where id=op.id;
 perform public.workspace_operation('claim',op.id,w,op.created_by,'agency@example.com','ai_visibility','{}','14141414-1414-4141-8141-141414141414');
 begin
  perform public.workspace_operation('checkpoint',op.id,w,op.created_by,'agency@example.com',p_lease_id=>'13131313-1313-4131-8131-131313131313',p_result=>'{}');
  raise exception 'stale checkpoint accepted';
 exception when others then if SQLERRM<>'operation_lease_lost' then raise; end if; end;
end $$;

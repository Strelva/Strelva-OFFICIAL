\set ON_ERROR_STOP on
create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %', message; end if; end $$;
select pg_temp.assert_true(not has_table_privilege('authenticated','public.workspace_agent_access_tokens','SELECT'),'integration hashes are service only');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.workspace_agent_access_events','SELECT'),'integration history is service only');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.issue_agent_access_token(uuid,text,uuid,integer,jsonb,text,uuid,uuid,text,text,text,text[],timestamptz)','EXECUTE'),'token issue is service only');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.revoke_agent_access_token(uuid,text,uuid,integer,jsonb,text,uuid,timestamptz)','EXECUTE'),'token revoke is service only');

DO $$
declare
  workspace_id uuid; item public.saved_product_work; v_grant_id uuid:=gen_random_uuid(); v_token_id uuid:=gen_random_uuid(); state jsonb; revoked jsonb;
  owner_id uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
begin
  select id into workspace_id from public.create_owned_workspace(owner_id,'agency@example.com','personal','Agent access proof');
  insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
  values(workspace_id,'documents','document','Procedure','{"revision":0,"text":"Original"}',owner_id) returning * into item;
  state:=jsonb_build_object(
    'version',1,'revision',1,
    'grants',jsonb_build_array(jsonb_build_object('id',v_grant_id,'participantEmail','agency@example.com','participantKind','agent','scope',jsonb_build_array('read','propose'),'purpose','Personal AI review','expiresAt',now()+interval '1 day','budgetMinor',100,'currency','USD','sponsorId',owner_id,'createdAt',now(),'status','active')),
    'contributions','[]'::jsonb,
    'history',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'actorId',owner_id,'kind','grant','subjectId',v_grant_id,'at',now()))
  );
  perform public.issue_agent_access_token(owner_id,'agency@example.com',item.id,0,state,'0',v_token_id,v_grant_id,repeat('a',64),'sta_aaaaaaaa', 'Research assistant',array['read','propose'],now()+interval '1 day');
  perform pg_temp.assert_true((select t.token_hash=repeat('a',64) and t.issuer_user_id=owner_id and t.work_id=item.id and t.grant_id=v_grant_id from public.workspace_agent_access_tokens t where t.id=v_token_id),'hash and native authority are bound');
  perform pg_temp.assert_true((select count(*)=1 from public.workspace_agent_access_events e where e.token_id=v_token_id and e.action='issued'),'issue attribution recorded');

  begin
    perform public.issue_agent_access_token(owner_id,'agency@example.com',item.id,1,state,'0',gen_random_uuid(),v_grant_id,repeat('b',64),'sta_bbbbbbbb','Too broad',array['read','execute'],now()+interval '1 day');
    raise exception 'unsupported token scope accepted';
  exception when check_violation then null; when others then if SQLERRM<>'agent_access_denied' then raise; end if; end;

  revoked:=state || jsonb_build_object(
    'revision',2,
    'grants',jsonb_build_array((state->'grants'->0) || jsonb_build_object('status','revoked','revokedAt',now())),
    'history',state->'history' || jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'actorId',owner_id,'kind','revoke','subjectId',v_grant_id,'at',now()))
  );
  perform public.revoke_agent_access_token(owner_id,'agency@example.com',item.id,1,revoked,'0',v_token_id,now());
  perform pg_temp.assert_true((select t.revoked_at is not null and t.revoked_by=owner_id from public.workspace_agent_access_tokens t where t.id=v_token_id),'token revoked');
  perform pg_temp.assert_true(public.read_work_auxiliary(owner_id,'agency@example.com',item.id,'participation')->'payload'->'grants'->0->>'status'='revoked','native grant revoked in same change');
end $$;

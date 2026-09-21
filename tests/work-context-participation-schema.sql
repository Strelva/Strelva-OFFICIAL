\set ON_ERROR_STOP on
create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %', message; end if; end $$;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.commit_work_auxiliary(uuid,text,uuid,text,integer,jsonb,text,text)','EXECUTE'),'auxiliary commands service only');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.workspace_work_context','SELECT'),'context not directly exposed');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.workspace_work_participation','SELECT'),'participants not directly exposed');
DO $$
declare w uuid; item public.saved_product_work; source_item public.saved_product_work; state jsonb; grant_item jsonb; contribution jsonb; context_state jsonb; revision_one jsonb;
  owner_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  guest_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
begin
 select id into w from public.create_owned_workspace(owner_id,'agency@example.com','personal','Participation proof');
 insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
 values(w,'documents','document','Shared procedure','{"revision":0,"text":"Original"}',owner_id) returning * into item;
 insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
 values(w,'documents','document','Source hours','{"revision":0,"text":"Nine"}',owner_id) returning * into source_item;
 grant_item := jsonb_build_object('id','grant-1','participantEmail','other@example.com','participantKind','person','scope',jsonb_build_array('read','propose'),'purpose','Review hours','expiresAt',now()+interval '1 day','budgetMinor',200,'currency','USD','sponsorId',owner_id,'createdAt',now(),'status','active');
 state := jsonb_build_object('version',1,'revision',1,'grants',jsonb_build_array(grant_item),'contributions','[]'::jsonb,'history',jsonb_build_array(jsonb_build_object('actorId',owner_id,'kind','grant','subjectId','grant-1')));
 perform public.commit_work_auxiliary(owner_id,'agency@example.com',item.id,'participation',0,state,'manage','0');
 perform pg_temp.assert_true(public.read_work_auxiliary(guest_id,'other@example.com',item.id,'participation')->'payload'->>'revision'='1','outside actor can inspect its work grant');
 begin
  perform public.commit_work_auxiliary(guest_id,'other@example.com',item.id,'participation',1,state,'manage','0');
  raise exception 'guest can manage grants';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
 contribution := jsonb_build_object('id','proposal-1','grantId','grant-1','actorId',guest_id,'actorEmail','other@example.com','sponsorId',owner_id,'baseWorkRevision','0','summary','Correct hours','content','Open at nine','costMinor',100,'currency','USD','idempotencyKey','proposal','status','pending');
 state := state || jsonb_build_object('revision',2,'contributions',jsonb_build_array(contribution),'history',state->'history' || jsonb_build_array(jsonb_build_object('actorId',guest_id,'kind','contribute','subjectId','proposal-1')));
 perform public.commit_work_auxiliary(guest_id,'other@example.com',item.id,'participation',1,state,'contribute','0');
 perform pg_temp.assert_true(public.read_work_auxiliary(owner_id,'agency@example.com',item.id,'participation')->'payload'->'contributions'->0->>'actorId'=guest_id::text,'contribution attribution persisted');
 begin
  perform public.commit_work_auxiliary(guest_id,'other@example.com',item.id,'participation',1,state,'contribute','0');
  raise exception 'stale contribution replay accepted';
 exception when others then if SQLERRM<>'work_auxiliary_conflict' then raise; end if; end;
 -- Concurrent revocation wins against a prepared contribution because it shares the work lock and revision.
 state := state || jsonb_build_object('revision',3,'grants',jsonb_build_array(grant_item || '{"status":"revoked"}'),'history',state->'history' || jsonb_build_array(jsonb_build_object('actorId',owner_id,'kind','revoke','subjectId','grant-1')));
 perform public.commit_work_auxiliary(owner_id,'agency@example.com',item.id,'participation',2,state,'manage','0');
 begin
  perform public.read_work_auxiliary(guest_id,'other@example.com',item.id,'participation');
  raise exception 'revoked grant can read';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
 state := state || jsonb_build_object('revision',4,'contributions',state->'contributions' || jsonb_build_array(contribution || '{"id":"proposal-2","idempotencyKey":"next"}'),'history',state->'history' || jsonb_build_array(jsonb_build_object('actorId',guest_id,'kind','contribute','subjectId','proposal-2')));
 begin
  perform public.commit_work_auxiliary(guest_id,'other@example.com',item.id,'participation',3,state,'contribute','0');
  raise exception 'revoked grant can contribute';
 exception when others then if SQLERRM<>'work_grant_denied' then raise; end if; end;
 -- Source authority binds to an exact same-workspace version.
 context_state := jsonb_build_object('version',1,'revision',1,'grants',jsonb_build_array(jsonb_build_object('id','source-grant','sourceWorkId',source_item.id,'sourceRevision','0','scope',jsonb_build_array('read','use_in_work'),'status','active','expiresAt',now()+interval '1 day')),'facts','[]'::jsonb,'preferences','[]'::jsonb,'history',jsonb_build_array(jsonb_build_object('actorId',owner_id,'kind','grant_source','subjectId','source-grant')));
 perform public.commit_work_auxiliary(owner_id,'agency@example.com',item.id,'context',0,context_state,'manage','0');
 revision_one := context_state;
 update public.saved_product_work set payload='{"revision":1,"text":"Ten"}' where id=source_item.id;
 context_state := context_state || jsonb_build_object('revision',2,'facts',jsonb_build_array(jsonb_build_object('id','fact-1','sourceWorkId',source_item.id,'sourceRevision','0')),'history',context_state->'history' || jsonb_build_array(jsonb_build_object('actorId',owner_id,'kind','record_fact','subjectId','fact-1')));
 begin
  perform public.commit_work_auxiliary(owner_id,'agency@example.com',item.id,'context',1,context_state,'manage','0');
  raise exception 'stale source fact saved';
 exception when others then if SQLERRM<>'work_source_changed' then raise; end if; end;
 begin
  perform public.read_work_auxiliary(guest_id,'other@example.com',item.id,'context');
  raise exception 'outside source context disclosed';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
 perform pg_temp.assert_true(public.read_work_auxiliary(owner_id,'agency@example.com',item.id,'context')->'payload'=revision_one,'failed source update preserves context');
 -- Internal research is not shareable through the generic work grant surface.
 insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
 values(w,'product-learning','research','Private research','{"revision":0}',owner_id) returning * into source_item;
 begin
  perform public.read_work_auxiliary(owner_id,'agency@example.com',source_item.id,'participation');
  raise exception 'internal research shared through participation';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;

end $$;

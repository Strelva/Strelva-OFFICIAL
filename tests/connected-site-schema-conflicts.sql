\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %',message; end if; end $$;
create or replace function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'Expected error % for %',expected,statement;
end $$;
select pg_temp.assert_true(not has_function_privilege('anon','public.record_connected_site_schema_conflict(text,text,jsonb)','execute'),'public callers cannot bypass the route');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.read_connected_site_schema_conflict(uuid,uuid)','execute'),'internal decision read is service only');

do $$
declare
  owner_id uuid := '73000000-0000-4000-8000-000000000101';
  ws uuid := '73000000-0000-4000-8000-000000000110';
  other_ws uuid := '73000000-0000-4000-8000-000000000111';
  key text := 'sk_pub_' || repeat('m',24);
  token text := repeat('n',32);
  origin text := 'https://schema-fixture.example';
  site jsonb; item jsonb; first_item jsonb; second_item jsonb; context jsonb;
begin
  insert into public.users(id,email,verified_at) values (owner_id,'schema-owner@example.test',now());
  insert into public.workspaces(id,kind,name,created_by) values (ws,'customer','Schema fixture',owner_id),(other_ws,'customer','Other schema fixture',owner_id);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values (ws,owner_id,'owner',owner_id);
  insert into public.business_records(workspace_id,created_by,updated_by) values (ws,owner_id,owner_id);
  insert into public.business_record_facts(workspace_id,fact_key,value,source,verified,updated_by) values
    (ws,'display_name','"Confirmed Name"','owner',false,owner_id),
    (ws,'phone','"7165550100"','agent',false,owner_id),
    (ws,'address','{"line1":"1 Main St","city":"Buffalo"}','owner',true,owner_id),
    (ws,'owner_recipient','{"email":"external-owner@example.test"}','owner',true,owner_id);
  -- Sites read the owner-confirmed copy (#521), so mirror owner writes into
  -- that copy exactly as the connected-sites contract fixture does.
  insert into public.business_record_confirmed(workspace_id,entity,entity_id,state,confirmed_by_kind)
    select ws,'fact',f.fact_key,public.business_record_entity_state(ws,'fact',f.fact_key),'owner_write'
      from public.business_record_facts f where f.workspace_id=ws and f.source='owner';
  site := public.create_connected_site(ws,owner_id,'schema-owner@example.test',jsonb_build_object('publicKey',key,'verificationToken',token,'label','Schema fixture','siteUrl',origin||'/','siteHost','schema-fixture.example','allowedOrigins',jsonb_build_array(origin),'platform','wix'));
  item := jsonb_build_object('kind','fact.inferred','route','owner_decides','title','Check published facts','detail','Website differs from confirmed name','approveEffect','Acknowledge only; no facts change','notYetEffect','Nothing changes','sourceLifecycle','connected_site_schema','sourceId',site->>'id','revisionHash',repeat('a',64),'urgent',false,'adminMayDecide',true);
  perform pg_temp.expect_error(format('select public.record_connected_site_schema_conflict(%L,%L,%L)',key,origin,item),'connected_site_not_verified');
  site := public.confirm_connected_site_verification(ws,owner_id,'schema-owner@example.test',(site->>'id')::uuid,array[token]);
  context := public.read_connected_site_context(key);
  perform pg_temp.assert_true(context->'facts'->>'display_name'='Confirmed Name' and context->'facts'->'address'->>'city'='Buffalo','owner-stated and verified facts comparable');
  perform pg_temp.assert_true(not (context->'facts' ? 'phone') and not (context->'facts' ? 'owner_recipient'),'unconfirmed inferred facts and recipient ignored');
  perform pg_temp.expect_error(format('select public.record_connected_site_schema_conflict(%L,%L,%L)',key,null,item),'connected_site_origin_denied');
  perform pg_temp.expect_error(format('select public.record_connected_site_schema_conflict(%L,%L,%L)',key,'https://evil.example',item),'connected_site_origin_denied');
  perform pg_temp.expect_error(format('select public.record_connected_site_schema_conflict(%L,%L,%L)','sk_pub_'||repeat('z',24),origin,item),'connected_site_unknown');
  perform pg_temp.expect_error(format('select public.record_connected_site_schema_conflict(%L,%L,%L)',key,origin,item||jsonb_build_object('sourceId',other_ws)),'connected_site_invalid');

  -- The owner recipient need not be a member, and no browser owner session is used.
  first_item := public.record_connected_site_schema_conflict(key,origin,item);
  second_item := public.record_connected_site_schema_conflict(key,origin,item);
  perform pg_temp.assert_true(first_item->>'id'=second_item->>'id','repeat report deduplicates');
  perform pg_temp.assert_true(first_item->>'deliveryState'='not_sent' and not (first_item->>'signInRequired')::boolean,'recorded only, no login requirement');
  perform pg_temp.assert_true(public.read_connected_site_schema_conflict(other_ws,(site->>'id')::uuid) is null,'read cannot cross business boundary');
  perform pg_temp.assert_true(public.read_connected_site_schema_conflict(ws,(site->>'id')::uuid)->>'id'=first_item->>'id','source reads open decision');
  insert into public.owner_decision_link_bindings(decision_id,workspace_id,recipient)
    values ((first_item->>'id')::uuid,ws,'external-owner@example.test');
  perform public.claim_owner_decision(ws,(first_item->>'id')::uuid,repeat('a',64),'approve','owner_link',null,null,'external-owner@example.test');
  perform public.finish_owner_decision(ws,(first_item->>'id')::uuid,'done','Acknowledged; no facts changed',null);
  perform pg_temp.assert_true(public.record_connected_site_schema_conflict(key,origin,item)->>'state'='approved','closed revision is not reopened');
  second_item := public.record_connected_site_schema_conflict(key,origin,item||jsonb_build_object('revisionHash',repeat('b',64)));
  perform pg_temp.assert_true(second_item->>'state'='open','new disagreement is reviewable');
  perform public.record_connected_site_schema_conflict(key,origin,item||jsonb_build_object('revisionHash',repeat('c',64)));
  perform pg_temp.assert_true((select count(*) from public.owner_decisions where workspace_id=ws and state='open')=1,'only one open item per connected site');
  perform pg_temp.assert_true((select count(*) from public.owner_decision_deliveries where workspace_id=ws)=0,'recording does not send or attempt email');
  perform public.revoke_connected_site(ws,owner_id,'schema-owner@example.test',(site->>'id')::uuid);
  perform pg_temp.assert_true(public.read_connected_site_schema_conflict(ws,(site->>'id')::uuid) is null,'revoked source no longer waits');
  perform pg_temp.expect_error(format('select public.record_connected_site_schema_conflict(%L,%L,%L)',key,origin,item),'connected_site_unknown');
end $$;
\if :{?keep_fixture}
commit;
\else
rollback;
\endif

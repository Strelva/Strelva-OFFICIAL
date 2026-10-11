\set ON_ERROR_STOP on
begin;
create function pg_temp.renew_assert(ok boolean,m text) returns void language plpgsql as $$begin if ok is not true then raise exception 'renewable assertion: %',m;end if;end $$;
create function pg_temp.renew_expect(q text,expected text) returns void language plpgsql as $$begin begin execute q;exception when others then if sqlerrm not like expected then raise exception 'expected % got %',expected,sqlerrm;end if;return;end;raise exception 'expected failure %',expected;end $$;
create function pg_temp.renew_hash(label text) returns text language sql as $$select md5(label)||md5(label||'-fixture')$$;
insert into public.users(id,email,verified_at) values
 ('ac181200-0000-4000-8000-000000000001','renew-owner@example.test',now()),
 ('ac181200-0000-4000-8000-000000000002','renew-agency@example.test',now()),
 ('ac181200-0000-4000-8000-000000000003','renew-stranger@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('ac181200-0000-4000-8000-000000000010','customer','Renewable fixture','ac181200-0000-4000-8000-000000000001'),
 ('ac181200-0000-4000-8000-000000000020','agency','Renew agency','ac181200-0000-4000-8000-000000000002'),
 ('ac181200-0000-4000-8000-000000000030','customer','Other fixture','ac181200-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('ac181200-0000-4000-8000-000000000010','ac181200-0000-4000-8000-000000000001','owner','ac181200-0000-4000-8000-000000000001'),
 ('ac181200-0000-4000-8000-000000000020','ac181200-0000-4000-8000-000000000002','owner','ac181200-0000-4000-8000-000000000002'),
 ('ac181200-0000-4000-8000-000000000030','ac181200-0000-4000-8000-000000000003','owner','ac181200-0000-4000-8000-000000000003');
create function pg_temp.renew_issue(label text,agency boolean default false) returns uuid language plpgsql as $$
declare uid uuid:=case when agency then 'ac181200-0000-4000-8000-000000000002'::uuid else 'ac181200-0000-4000-8000-000000000001'::uuid end;
begin
 perform public.issue_agent_oauth_connection_code(uid,case when agency then 'renew-agency@example.test' else 'renew-owner@example.test' end,'ac181200-0000-4000-8000-000000000010',case when agency then 'ac181200-0000-4000-8000-000000000020'::uuid else null end,pg_temp.renew_hash(label||'-code'),'https://chatgpt.com/oauth/codex/client.json','Codex','http://127.0.0.1:41239/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),case when agency then array['business:read'] else array['business:read','website:read','website:propose'] end);
 perform public.exchange_agent_oauth_connection_code(pg_temp.renew_hash(label||'-code'),'https://chatgpt.com/oauth/codex/client.json','http://127.0.0.1:41239/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),pg_temp.renew_hash(label||'-access'),pg_temp.renew_hash(label||'-refresh'));
 return (select connection_id from public.assistant_tokens where token_hash=pg_temp.renew_hash(label||'-access'));
end $$;
create function pg_temp.renew_refresh(old_label text,new_label text,scopes text[] default null,client text default 'https://chatgpt.com/oauth/codex/client.json',resource text default 'https://app.strelva.com/api/mcp/public') returns jsonb language sql as $$
 select public.refresh_agent_oauth_connection(pg_temp.renew_hash(old_label||'-refresh'),client,resource,scopes,pg_temp.renew_hash(new_label||'-access'),pg_temp.renew_hash(new_label||'-refresh'))
$$;
create temporary table renew_connections(label text primary key,id uuid);
insert into renew_connections values('rotate',pg_temp.renew_issue('rotate'));
select pg_temp.renew_assert(public.read_agent_oauth_connection(pg_temp.renew_hash('rotate-access'),'https://app.strelva.com/api/mcp/public')->>'workspaceId'='ac181200-0000-4000-8000-000000000010','new business bootstrap');
select pg_temp.renew_expect($q$select public.exchange_agent_oauth_connection_code(pg_temp.renew_hash('rotate-code'),'https://chatgpt.com/oauth/codex/client.json','http://127.0.0.1:41239/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),pg_temp.renew_hash('replay-access'),pg_temp.renew_hash('replay-refresh'))$q$,'oauth_invalid_grant');
select pg_temp.renew_assert(pg_temp.renew_refresh('rotate','wrong',null,'other-client')->>'error'='invalid_grant','refresh client binding');
select pg_temp.renew_assert(pg_temp.renew_refresh('rotate','wrong',null,'https://chatgpt.com/oauth/codex/client.json','https://other.test/mcp')->>'error'='invalid_grant','refresh resource binding');
select pg_temp.renew_assert(pg_temp.renew_refresh('rotate','attenuate',array['business:read'])->>'scope'='business:read','refresh attenuates');
select pg_temp.renew_assert(public.validate_agent_oauth_token(pg_temp.renew_hash('attenuate-access'),'https://app.strelva.com/api/mcp/public','website:propose','ac181200-0000-4000-8000-000000000010') is null,'attenuated access cannot propose');
select pg_temp.renew_assert(pg_temp.renew_refresh('attenuate','amplify',array['business:read','website:read'])->>'error'='invalid_scope','refresh cannot re-expand');
select pg_temp.renew_assert(pg_temp.renew_refresh('attenuate','next')->>'scope'='business:read','omitted scope preserves attenuation');
select pg_temp.renew_assert(public.read_agent_oauth_principal(pg_temp.renew_hash('next-access'),'https://app.strelva.com/api/mcp/public',null)->'scopes'='["business:read"]'::jsonb,'step-up reads attenuated live access scopes');
select pg_temp.renew_assert(pg_temp.renew_refresh('rotate','replay')->>'error'='invalid_grant','used refresh detected');
select pg_temp.renew_assert(public.read_agent_oauth_connection(pg_temp.renew_hash('next-access'),'https://app.strelva.com/api/mcp/public') is null,'replay revokes latest access');
select pg_temp.renew_assert(pg_temp.renew_refresh('next','dead')->>'error'='invalid_grant','replay revokes latest refresh');
select pg_temp.renew_expect($q$select public.lock_agent_oauth_token(pg_temp.renew_hash('next-access'),'https://app.strelva.com/api/mcp/public','business:read','ac181200-0000-4000-8000-000000000010')$q$,'oauth_invalid_token');
insert into renew_connections values('disconnect',pg_temp.renew_issue('disconnect'));
select pg_temp.renew_assert(public.list_agent_oauth_connections('ac181200-0000-4000-8000-000000000001','renew-owner@example.test','ac181200-0000-4000-8000-000000000010') @> '[{"clientName":"Codex","status":"active"}]','owner lists connection metadata');
select pg_temp.renew_expect($q$select public.list_agent_oauth_connections('ac181200-0000-4000-8000-000000000003','renew-stranger@example.test','ac181200-0000-4000-8000-000000000010')$q$,'workspace_access_denied');
select pg_temp.renew_expect($q$select public.disconnect_agent_oauth_connection('ac181200-0000-4000-8000-000000000003','renew-stranger@example.test','ac181200-0000-4000-8000-000000000030',(select id from renew_connections where label='disconnect'))$q$,'workspace_access_denied');
select public.disconnect_agent_oauth_connection('ac181200-0000-4000-8000-000000000001','renew-owner@example.test','ac181200-0000-4000-8000-000000000010',(select id from renew_connections where label='disconnect'));
select pg_temp.renew_assert(pg_temp.renew_refresh('disconnect','dead')->>'error'='invalid_grant','owner disconnect stops renewal');
select pg_temp.renew_assert(public.read_agent_oauth_connection(pg_temp.renew_hash('disconnect-access'),'https://app.strelva.com/api/mcp/public') is null,'owner disconnect stops access');
insert into renew_connections values('expired',pg_temp.renew_issue('expired'));
update public.assistant_connections set expires_at=clock_timestamp()-interval '1 second' where id=(select id from renew_connections where label='expired');
select pg_temp.renew_assert(pg_temp.renew_refresh('expired','dead')->>'error'='invalid_grant','family expiration stops renewal');
select pg_temp.renew_assert(public.read_agent_oauth_connection(pg_temp.renew_hash('expired-access'),'https://app.strelva.com/api/mcp/public') is null,'family expiration stops existing access');
insert into renew_connections values('removed',pg_temp.renew_issue('removed'));
delete from public.workspace_memberships where workspace_id='ac181200-0000-4000-8000-000000000010' and user_id='ac181200-0000-4000-8000-000000000001';
select pg_temp.renew_assert(pg_temp.renew_refresh('removed','dead')->>'error'='invalid_grant','removed owner stops renewal');
select pg_temp.renew_assert(public.read_agent_oauth_connection(pg_temp.renew_hash('removed-access'),'https://app.strelva.com/api/mcp/public') is null,'removed owner stops access');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values ('ac181200-0000-4000-8000-000000000010','ac181200-0000-4000-8000-000000000001','owner','ac181200-0000-4000-8000-000000000001');
insert into renew_connections values('client-revoke',pg_temp.renew_issue('client-revoke'));
select public.revoke_agent_oauth_client_token(pg_temp.renew_hash('client-revoke-refresh'),'wrong-client');
select pg_temp.renew_assert(pg_temp.renew_refresh('client-revoke','client-rotate')->>'scope'='business:read website:read website:propose','wrong client cannot revoke refresh');
select public.revoke_agent_oauth_client_token(pg_temp.renew_hash('client-rotate-refresh'),'https://chatgpt.com/oauth/codex/client.json');
select pg_temp.renew_assert(public.read_agent_oauth_connection(pg_temp.renew_hash('client-rotate-access'),'https://app.strelva.com/api/mcp/public') is null,'RFC7009 refresh revokes family');
select pg_temp.renew_assert(pg_temp.renew_refresh('client-rotate','dead')->>'error'='invalid_grant','RFC7009 stops renewal');

-- Agency renewal carries the exact current seat and staffing, never a replacement grant.
select public.choose_business_provider('ac181200-0000-4000-8000-000000000001','renew-owner@example.test','ac181200-0000-4000-8000-000000000010','ac181200-0000-4000-8000-000000000020');
select public.set_agency_client_staff('ac181200-0000-4000-8000-000000000002','renew-agency@example.test','ac181200-0000-4000-8000-000000000020','ac181200-0000-4000-8000-000000000010','ac181200-0000-4000-8000-000000000002',true);
insert into renew_connections values('agency',pg_temp.renew_issue('agency',true));
select pg_temp.renew_assert(pg_temp.renew_refresh('agency','agency-next')->>'scope'='business:read','agency current mandate renews');
select public.set_agency_client_staff('ac181200-0000-4000-8000-000000000002','renew-agency@example.test','ac181200-0000-4000-8000-000000000020','ac181200-0000-4000-8000-000000000010','ac181200-0000-4000-8000-000000000002',false);
select pg_temp.renew_assert(pg_temp.renew_refresh('agency-next','dead')->>'error'='invalid_grant','staff mandate removed stops renewal');
select public.set_agency_client_staff('ac181200-0000-4000-8000-000000000002','renew-agency@example.test','ac181200-0000-4000-8000-000000000020','ac181200-0000-4000-8000-000000000010','ac181200-0000-4000-8000-000000000002',true);
select public.end_provider_seat('ac181200-0000-4000-8000-000000000001','renew-owner@example.test','ac181200-0000-4000-8000-000000000010','ac181200-0000-4000-8000-000000000020','Renew fixture');
select public.choose_business_provider('ac181200-0000-4000-8000-000000000001','renew-owner@example.test','ac181200-0000-4000-8000-000000000010','ac181200-0000-4000-8000-000000000020');
select pg_temp.renew_assert(pg_temp.renew_refresh('agency-next','dead')->>'error'='invalid_grant','replacement agency seat cannot renew old family');
select pg_temp.renew_assert(public.read_agent_oauth_principal(pg_temp.renew_hash('agency-next-access'),'https://app.strelva.com/api/mcp/public',null) is null,'replacement agency seat cannot revive old access');
select pg_temp.renew_assert(not has_table_privilege('service_role','public.assistant_refresh_tokens','select') and not has_table_privilege('authenticated','public.assistant_connections','select'),'credential tables accessible only through routines');
select pg_temp.renew_assert(not has_function_privilege('anon','public.refresh_agent_oauth_connection(text,text,text,text[],text,text)','execute') and not has_function_privilege('authenticated','public.disconnect_agent_oauth_connection(uuid,text,uuid,uuid)','execute') and has_function_privilege('service_role','public.refresh_agent_oauth_connection(text,text,text,text[],text,text)','execute'),'routines service-role only');
select pg_temp.renew_assert(not has_function_privilege('service_role','public.lock_agent_oauth_token(text,text,text,uuid)','execute'),'lock helper is internal');
-- Rollback refusal executes the same guard without erasing fixture evidence.
select pg_temp.renew_expect($q$do $guard$ begin if exists(select 1 from public.assistant_connections) then raise exception 'agent_oauth_renewable_rollback_requires_data_preservation'; end if;end $guard$$q$,'agent_oauth_renewable_rollback_requires_data_preservation');
rollback;

-- Run on the ordered native schema. All examples fictional; transaction rolls back.
begin;
create function pg_temp.refused(p_sql text,p_reason text) returns void language plpgsql as $$
begin
 begin execute p_sql; exception when others then if position(p_reason in sqlerrm)>0 then return; end if; raise; end;
 raise exception 'expected refusal: %',p_reason;
end $$;
do $$ begin
 if has_function_privilege('anon','public.conn_google_agency_oauth(uuid,text,uuid,uuid,text,jsonb)','execute') or has_function_privilege('authenticated','public.conn_google_agency_oauth(uuid,text,uuid,uuid,text,jsonb)','execute') then raise exception 'client RPC access'; end if;
 if not (select relrowsecurity from pg_class where oid='public.conn_google_agency_oauth_attempts'::regclass) then raise exception 'RLS absent'; end if;
 if has_table_privilege('service_role','public.conn_google_agency_oauth_attempts','select') or has_table_privilege('authenticated','public.conn_google_agency_oauth_attempts','select') then raise exception 'direct table access'; end if;
end $$;
-- Real prerequisite fixture shape is owned by the ordered runner below.
select pg_temp.refused($q$select public.conn_google_agency_oauth('10000000-0000-4000-8000-000000000001','owner@harbor.example','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','begin_oauth','{}')$q$,'conn_google_agency_denied');
select pg_temp.refused($q$select public.conn_google_agency_oauth(null,null,null,null,'disconnect','{}')$q$,'conn_google_input_invalid');
rollback;

-- Actual agency begin/consume/finish and authority-loss contract, all rolled back.
begin;
insert into public.users(id,email,verified_at) values
 ('ec110000-0000-4000-8000-000000000001','staff@north.example',now()),
 ('ec110000-0000-4000-8000-000000000002','owner@harbor.example',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('ec110000-0000-4000-8000-000000000010','agency','North Studio','ec110000-0000-4000-8000-000000000001'),
 ('ec110000-0000-4000-8000-000000000020','customer','Harbor Dental','ec110000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('ec110000-0000-4000-8000-000000000010','ec110000-0000-4000-8000-000000000001','owner','ec110000-0000-4000-8000-000000000001'),
 ('ec110000-0000-4000-8000-000000000020','ec110000-0000-4000-8000-000000000002','owner','ec110000-0000-4000-8000-000000000002');
insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values
 ('ec110000-0000-4000-8000-000000000020','ec110000-0000-4000-8000-000000000010','owner','ec110000-0000-4000-8000-000000000002');
insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values
 ('ec110000-0000-4000-8000-000000000010','ec110000-0000-4000-8000-000000000020','ec110000-0000-4000-8000-000000000001','ec110000-0000-4000-8000-000000000001');
insert into public.agency_scope_grants(customer_workspace_id,agency_workspace_id,scope,level,status,consent,proposed_by,responded_by,responded_at) values
 ('ec110000-0000-4000-8000-000000000020','ec110000-0000-4000-8000-000000000010','google','prepare','active','Fictional explicit Google area grant.','ec110000-0000-4000-8000-000000000001','ec110000-0000-4000-8000-000000000002',now());
create function pg_temp.agency_call(action text,input jsonb) returns jsonb language sql as $$
 select public.conn_google_agency_oauth('ec110000-0000-4000-8000-000000000001','staff@north.example','ec110000-0000-4000-8000-000000000020','ec110000-0000-4000-8000-000000000010',action,input)
$$;
do $$ declare attempt uuid:='ec110000-0000-4000-8000-000000000030'; result jsonb; begin
 perform pg_temp.agency_call('begin_oauth',jsonb_build_object('id',attempt,'accountId','accounts/north','locationId','harbor','nonceHash',repeat('a',64),'stateHash',repeat('b',64)));
 -- Exact attempt/actor/nonce, one consumption only.
 begin perform pg_temp.agency_call('consume_oauth',jsonb_build_object('id',attempt,'nonceHash',repeat('c',64),'stateHash',repeat('b',64)));raise exception 'bad nonce admitted';exception when others then if sqlerrm<>'native_google_oauth_unavailable' then raise;end if;end;
 perform pg_temp.agency_call('consume_oauth',jsonb_build_object('id',attempt,'nonceHash',repeat('a',64),'stateHash',repeat('b',64)));
 begin perform pg_temp.agency_call('consume_oauth',jsonb_build_object('id',attempt,'nonceHash',repeat('a',64),'stateHash',repeat('b',64)));raise exception 'replay admitted';exception when others then if sqlerrm<>'native_google_oauth_unavailable' then raise;end if;end;
 -- Removing current assignment stops completion even after consent exchange.
 update public.agency_client_staff set status='ended',ended_at=now() where customer_workspace_id='ec110000-0000-4000-8000-000000000020';
 begin perform pg_temp.agency_call('finish_oauth',jsonb_build_object('id',attempt));raise exception 'revoked staff admitted';exception when others then if sqlerrm<>'conn_google_agency_denied' then raise;end if;end;
 update public.agency_client_staff set status='active',ended_at=null where customer_workspace_id='ec110000-0000-4000-8000-000000000020';
 result:=pg_temp.agency_call('finish_oauth',jsonb_build_object('id',attempt,'subject','north-fixture-subject','scopes',jsonb_build_array('openid','https://www.googleapis.com/auth/business.manage'),'accessTokenCiphertext','enc:v1:AAAA:BBBB:CCCC','refreshTokenCiphertext','enc:v1:DDDD:EEEE:FFFF','tokenExpiresAt',(clock_timestamp()+interval '1 hour')::text));
 if result->>'status'<>'connected' or not exists(select 1 from public.workspace_google_locations where binding_id=(result->>'bindingId')::uuid and account_id='accounts/north' and location_id='harbor') then raise exception 'exact agency binding missing'; end if;
 if exists(select 1 from public.workspace_memberships where workspace_id='ec110000-0000-4000-8000-000000000020' and user_id='ec110000-0000-4000-8000-000000000001') then raise exception 'agency became owner'; end if;
 -- Cross-lane source identity: the native OAuth result must be usable by core's
 -- real holder/Version reader, without relabeling the agency's login as business.
 perform public.record_connection_holder('ec110000-0000-4000-8000-000000000020',
  'ec110000-0000-4000-8000-000000000001','staff@north.example',
  'google_business_profile:'||(result->>'bindingId'),'google_business_profile',
  '{"kind":"agency","workspaceId":"ec110000-0000-4000-8000-000000000010"}',
  '{"kind":"agency","workspaceId":"ec110000-0000-4000-8000-000000000010"}',gen_random_uuid(),repeat('d',64));
 if public.read_system_version_connection_owner('ec110000-0000-4000-8000-000000000001','staff@north.example',
  'google_business_profile:'||(result->>'bindingId')) is distinct from 'ec110000-0000-4000-8000-000000000020'::uuid then
  raise exception 'core refused native agency OAuth source';
 end if;
 if public.read_system_version_connection_owner('ec110000-0000-4000-8000-000000000002','owner@harbor.example',
  'google_business_profile:'||(result->>'bindingId')) is not null then
  raise exception 'business borrowed agency OAuth source';
 end if;

end $$;
rollback;

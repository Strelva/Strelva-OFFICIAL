\set ON_ERROR_STOP on
begin;
create function pg_temp.pd_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'provider disconnect assertion failed: %', message; end if; end; $$;
create function pg_temp.pd_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm like expected then return; end if;
    raise exception 'expected %, got %', expected, sqlerrm;
  end;
  raise exception 'expected %, statement succeeded: %', expected, statement;
end; $$;

select pg_temp.pd_assert((select relrowsecurity from pg_class where oid='public.provider_disconnect_receipts'::regclass), 'receipt table has RLS');
select pg_temp.pd_assert(not has_table_privilege('service_role','public.provider_disconnect_receipts','select')
  and not has_table_privilege('authenticated','public.provider_disconnect_receipts','select')
  and not has_function_privilege('anon','public.record_tenant_provider_disconnect(text,text,uuid,text,text,text,text[])','execute')
  and not has_function_privilege('authenticated','public.disconnect_workspace_calendar_connection(uuid,uuid,text,text,text)','execute')
  and has_function_privilege('service_role','public.record_tenant_provider_disconnect(text,text,uuid,text,text,text,text[])','execute')
  and has_function_privilege('service_role','public.disconnect_workspace_calendar_connection(uuid,uuid,text,text,text)','execute'),
  'only trusted service role writes disconnect receipts');

insert into public.users(id,email,verified_at) values
  ('fd000000-0000-4000-8000-000000000001','disconnect-owner@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
  ('fd000000-0000-4000-8000-000000000010','customer','Disconnect fixture','fd000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('fd000000-0000-4000-8000-000000000010','fd000000-0000-4000-8000-000000000001','owner','fd000000-0000-4000-8000-000000000001');
insert into public.tenants(id,stable_id,site_name,active,instagram_access_token) values
  ('fd-disconnect','fd000000-0000-4000-8000-000000000011','Disconnect fixture',true,'enc:v1:IGTOKEN:TAG:DATA');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values
  ('fd000000-0000-4000-8000-000000000011','fd-disconnect','fd000000-0000-4000-8000-000000000010',
   'fd000000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000012',repeat('d',64),'{}');

insert into public.tenant_client_records(tenant_stable_id,workspace_id,store,record_id,payload,payload_hash,captured_at,recorded_via) values
  ('fd000000-0000-4000-8000-000000000011','fd000000-0000-4000-8000-000000000010','provider_connections','google',
   '{"provider":"google","accessToken":"enc:v1:ACCESS:TAG:DATA","refreshToken":"enc:v1:REFRESH:TAG:DATA"}',
   repeat('a',64),now(),'dual_write');

insert into public.workspace_account_bindings(workspace_id,provider,origin_tenant_stable_id,scopes,
  refresh_token_ciphertext,access_token_ciphertext,token_expires_at,status,migrated_from) values
  ('fd000000-0000-4000-8000-000000000010','google','fd000000-0000-4000-8000-000000000011',
   array['https://www.googleapis.com/auth/business.manage'],'enc:v1:REFRESH:TAG:DATA','enc:v1:ACCESS:TAG:DATA',now()+interval '1 hour','connected','oauth'),
  ('fd000000-0000-4000-8000-000000000010','google',null,
   array['https://www.googleapis.com/auth/business.manage'],'enc:v1:NATIVE:TAG:DATA','enc:v1:NATIVE:TAG:DATA',now()+interval '1 hour','connected','oauth');

select public.record_tenant_provider_disconnect('fd-disconnect','google','fd000000-0000-4000-8000-000000000001',
  'failed','http_503','complete',array['redis_connection:google']);
select pg_temp.pd_assert((select count(*)=2 and bool_and(status='revoked' and refresh_token_ciphertext is null
  and access_token_ciphertext is null and token_expires_at is null)
  from public.workspace_account_bindings where workspace_id='fd000000-0000-4000-8000-000000000010'),
  'tenant and native Google grants both lose access and refresh credentials');
select pg_temp.pd_assert((select count(*)=1 and bool_and(revocation_outcome='failed'
  and revocation_error_code='http_503' and local_cleanup_status='complete'
  and cleared_stores @> array['redis_connection:google','workspace_account_bindings','provider_connections'])
  from public.provider_disconnect_receipts where tenant_stable_id='fd000000-0000-4000-8000-000000000011'),
  'provider failure is durably recorded alongside completed local cleanup');
select pg_temp.pd_assert((select removed_at is not null and payload='{}'::jsonb
  and payload_hash=repeat('0',64)
  from public.tenant_client_records where tenant_stable_id='fd000000-0000-4000-8000-000000000011'
    and store='provider_connections' and record_id='google'),
  'provider disconnect removes mirrored ciphertext while retaining an ordering tombstone');

select public.record_tenant_provider_disconnect('fd-disconnect','instagram','fd000000-0000-4000-8000-000000000001',
  'unsupported',null,'complete',array['redis_connection:instagram','tenant_config_cache']);
select pg_temp.pd_assert((select instagram_access_token is null from public.tenants where id='fd-disconnect'),
  'Instagram disconnect clears the legacy encrypted tenant token as well as Redis');
select pg_temp.pd_assert((select count(*)=1 and bool_and(revocation_outcome='unsupported'
  and cleared_stores @> array['redis_connection:instagram','tenant_config_cache','tenant.instagram_access_token','provider_connections'])
  from public.provider_disconnect_receipts where tenant_stable_id='fd000000-0000-4000-8000-000000000011' and provider='instagram'),
  'Instagram receipt records unsupported provider revoke and every cleared store');

insert into public.workspace_calendar_connections(workspace_id,provider,calendar_id,calendar_name,time_zone,status,created_by,
  access_token_ciphertext,refresh_token_ciphertext,token_expires_at) values
  ('fd000000-0000-4000-8000-000000000010','google','fixture-calendar','Fixture calendar','UTC','connected',
   'fd000000-0000-4000-8000-000000000001','enc:v1:CALACCESS:TAG:DATA','enc:v1:CALREFRESH:TAG:DATA',now()+interval '1 hour'),
  ('fd000000-0000-4000-8000-000000000010','outlook','fixture-outlook','Fixture Outlook','UTC','connected',
   'fd000000-0000-4000-8000-000000000001','enc:v1:MSACCESS:TAG:DATA','enc:v1:MSREFRESH:TAG:DATA',now()+interval '1 hour');

select public.disconnect_workspace_calendar_connection('fd000000-0000-4000-8000-000000000010',
  'fd000000-0000-4000-8000-000000000001','google','failed','http_500');
select pg_temp.pd_assert((select status='revoked' and access_token_ciphertext is null
  and refresh_token_ciphertext is null and token_expires_at is null
  from public.workspace_calendar_connections where workspace_id='fd000000-0000-4000-8000-000000000010' and provider='google'),
  'calendar provider failure never preserves local credentials');
select pg_temp.pd_assert((select count(*)=1 and bool_and(connection_source='calendar_connection'
  and revocation_outcome='failed' and revocation_error_code='http_500'
  and cleared_stores=array['workspace_calendar_connections'])
  from public.provider_disconnect_receipts where workspace_id='fd000000-0000-4000-8000-000000000010'
    and provider='google' and connection_source='calendar_connection'),
  'calendar disconnect receipt preserves remote result and local store');

select pg_temp.pd_assert(public.revoke_workspace_calendar_connection('fd000000-0000-4000-8000-000000000010',
  'fd000000-0000-4000-8000-000000000001','outlook'), 'older app RPC stays able to disconnect');
select pg_temp.pd_assert((select status='revoked' and access_token_ciphertext is null
  and refresh_token_ciphertext is null and token_expires_at is null
  from public.workspace_calendar_connections where workspace_id='fd000000-0000-4000-8000-000000000010' and provider='outlook'),
  'compatibility RPC clears all local calendar credentials');
select pg_temp.pd_assert((select count(*)=1 and bool_and(revocation_outcome='not_attempted'
  and revocation_error_code='revocation_not_requested') from public.provider_disconnect_receipts
  where workspace_id='fd000000-0000-4000-8000-000000000010' and provider='outlook'),
  'compatibility RPC records that revocation was not attempted');
select pg_temp.pd_expect($$select public.disconnect_workspace_calendar_connection('fd000000-0000-4000-8000-000000000010',
  'fd000000-0000-4000-8000-000000000002','outlook','revoked',null)$$,'workspace_membership_required');
delete from public.workspace_calendar_connections
where workspace_id='fd000000-0000-4000-8000-000000000010' and provider='outlook';
select pg_temp.pd_assert(not public.revoke_workspace_calendar_connection(
  'fd000000-0000-4000-8000-000000000010', 'fd000000-0000-4000-8000-000000000001', 'outlook'),
  'compatibility RPC returns false when no local connection exists');
select pg_temp.pd_assert((select count(*)=2 and bool_and(local_cleanup_status='complete')
  from public.provider_disconnect_receipts
  where workspace_id='fd000000-0000-4000-8000-000000000010' and provider='outlook'),
  'missing local connection still records the authorized disconnect attempt');
rollback;

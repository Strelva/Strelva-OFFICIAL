\set ON_ERROR_STOP on
begin;
insert into public.tenants(id,stable_id,site_name,active) values ('runtime-generation-test','e8210000-0000-4000-8000-000000000081','Runtime Generation Test',true);
do $$ declare old_payload jsonb; new_payload jsonb; result jsonb; begin
 old_payload := '{"provider":"google","tenantId":"runtime-generation-test","status":"connected","accessToken":"enc:v1:AAAA:BBBB:CCCC"}';
 new_payload := old_payload || '{"accessToken":"enc:v1:DDDD:EEEE:FFFF"}';
 perform public.record_tenant_client_record('runtime-generation-test','provider_connections','google',old_payload,repeat('a',64),'2026-10-07T23:59:59.999Z','dual_write','replace');
 perform public.record_tenant_client_record('runtime-generation-test','provider_connections','google',null,null,'2026-10-07T23:59:59.999Z','dual_write','remove');
 perform public.record_tenant_client_record('runtime-generation-test','provider_connections','google',new_payload,repeat('b',64),'2026-10-08T00:00:00Z','dual_write','replace');
 -- The old read's clock equals the reconnect's timestamp, or runs far ahead.
 foreach result in array array[
  public.mutate_tenant_provider_connection('runtime-generation-test','google',old_payload,old_payload||'{"accessToken":"enc:v1:GGGG:HHHH:IIII"}',repeat('c',64),'2026-10-08T00:00:00Z'),
  public.mutate_tenant_provider_connection('runtime-generation-test','google',old_payload,old_payload||'{"status":"needs_reauth"}',repeat('d',64),'2036-10-08T00:00:00Z')
 ] loop if result->>'status'<>'kept' then raise exception 'stale_grant_generation_allowed'; end if; end loop;
 if (select payload from public.tenant_client_records where tenant_stable_id='e8210000-0000-4000-8000-000000000081' and store='provider_connections' and record_id='google') <> new_payload then raise exception 'reconnected_grant_overwritten'; end if;
 result := public.mutate_tenant_provider_connection('runtime-generation-test','google',new_payload,new_payload||'{"accessToken":"enc:v1:JJJJ:KKKK:LLLL"}',repeat('e',64),'2026-10-08T00:00:00Z');
 if result->>'status'<>'updated' then raise exception 'current_generation_refused'; end if;
 if has_function_privilege('anon','public.mutate_tenant_provider_connection(text,text,jsonb,jsonb,text,timestamptz)','execute')
 or has_function_privilege('authenticated','public.mutate_tenant_provider_connection(text,text,jsonb,jsonb,text,timestamptz)','execute') then raise exception 'generation_acl_wrong'; end if;
end $$;
rollback;

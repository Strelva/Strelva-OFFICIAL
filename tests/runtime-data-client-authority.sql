\set ON_ERROR_STOP on
begin;
insert into public.tenants(id,stable_id,site_name,active) values ('runtime-authority-test','e8210000-0000-4000-8000-000000000001','Runtime Authority Test',true);
DO $$ declare result jsonb; payload jsonb; begin
 payload:='{"id":"legacy-random","externalId":"provider-1","verification":"site-signature","amountCents":2500}'::jsonb;
 perform public.record_tenant_client_record('runtime-authority-test','orders','legacy-random',payload,repeat('a',64),'2026-10-08T12:00:00Z','backfill','replace');
 result:=public.record_tenant_client_record('runtime-authority-test','orders','new-deterministic',payload||'{"amountCents":9900}',repeat('b',64),'2026-10-08T11:00:00Z','dual_write','keep_first');
 if result->>'status'<>'kept' then raise exception 'legacy_provider_order_duplicated'; end if;
 if jsonb_array_length(public.read_tenant_client_records_page('runtime-authority-test','orders',100,null,null))<>1 then raise exception 'provider_order_count_wrong'; end if;
 if public.read_tenant_client_records_page('runtime-authority-test','orders',100,null,null)->0->'payload'->>'amountCents'<>'2500' then raise exception 'first_provider_order_mutated'; end if;
 payload:='{"provider":"google","accessToken":"enc:v1:test","status":"connected"}'::jsonb;
 perform public.record_tenant_client_record('runtime-authority-test','provider_connections','google',payload,repeat('c',64),'2026-10-08T12:00:00Z','dual_write','replace');
 perform public.record_tenant_client_record('runtime-authority-test','provider_connections','google',null,null,'2026-10-08T12:01:00Z','dual_write','remove');
 result:=public.record_tenant_client_record('runtime-authority-test','provider_connections','google',payload,repeat('d',64),'2026-10-08T12:01:00Z','dual_write','replace');
 if result->>'status'<>'kept' then raise exception 'same_time_revocation_resurrected'; end if;
 if jsonb_array_length(public.read_tenant_client_records_page('runtime-authority-test','provider_connections',100,null,null))<>0 then raise exception 'revoked_connection_visible'; end if;
 result:=public.record_tenant_client_record('runtime-authority-test','provider_connections','google',payload,repeat('e',64),'2026-10-08T12:02:00Z','dual_write','replace');
 if result->>'status'<>'updated' then raise exception 'later_explicit_reconnect_blocked'; end if;
end $$;
rollback;

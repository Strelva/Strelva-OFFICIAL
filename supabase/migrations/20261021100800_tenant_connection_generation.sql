begin;
-- A wall clock is an ordering hint, not grant identity. Compare the exact
-- encrypted row under the same advisory lock used by save/revoke/reconnect.
create function public.mutate_tenant_provider_connection(
 p_tenant_id text,p_provider text,p_expected_payload jsonb,p_payload jsonb,p_payload_hash text,p_captured_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_stable uuid; v_row public.tenant_client_records%rowtype;
begin
 if p_provider is null or p_provider !~ '^[a-z][a-z0-9_]{0,79}$'
 or p_expected_payload is null or jsonb_typeof(p_expected_payload)<>'object'
 or p_payload is null or jsonb_typeof(p_payload)<>'object' or p_captured_at is null then raise exception 'client_record_invalid'; end if;
 select stable_id into v_stable from public.tenants where id=p_tenant_id;
 if v_stable is null then raise exception 'client_record_unknown_tenant'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_stable::text||':provider_connections:'||p_provider,9106));
 select * into v_row from public.tenant_client_records where tenant_stable_id=v_stable and store='provider_connections' and record_id=p_provider for update;
 if not found or v_row.removed_at is not null or v_row.payload is distinct from p_expected_payload then
  return jsonb_build_object('status','kept');
 end if;
 return public.record_tenant_client_record(p_tenant_id,'provider_connections',p_provider,p_payload,p_payload_hash,p_captured_at,'dual_write','replace');
end $$;
revoke all on function public.mutate_tenant_provider_connection(text,text,jsonb,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.mutate_tenant_provider_connection(text,text,jsonb,jsonb,text,timestamptz) to service_role;
commit;

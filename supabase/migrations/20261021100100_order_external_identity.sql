begin;
set local lock_timeout='3s';

-- Durable order identity survives legacy random IDs, clock skew and cache TTLs.
-- Extend the latest RPC without removing its tombstone/encryption/rename guards.
do $$ declare body text; anchor text; addition text; begin
 select pg_get_functiondef('public.record_tenant_client_record(text,text,text,jsonb,text,timestamp with time zone,text,text)'::regprocedure) into body;
 anchor:=$a$  perform pg_advisory_xact_lock(hashtextextended(v_stable::text || ':' || p_store || ':' || p_record_id, 9106));$a$;
 addition:=$b$  if p_store='orders' and p_mode='keep_first' then
    if coalesce(p_payload->>'externalId','')='' then raise exception 'client_record_order_identity_required'; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_stable::text || ':order-external:' || (p_payload->>'externalId'), 9106));
    select * into v_row from public.tenant_client_records
      where tenant_stable_id=v_stable and store='orders' and removed_at is null
        and payload->>'externalId'=p_payload->>'externalId' order by captured_at,id limit 1;
    if found then return jsonb_build_object('status','kept','id',v_row.id,'workspaceId',v_row.workspace_id); end if;
  end if;
$b$;
 if position(anchor in body)=0 then raise exception 'order_identity_function_drift'; end if;
 execute replace(body,anchor,addition||anchor);
end $$;
create index tenant_client_records_order_external_idx on public.tenant_client_records(tenant_stable_id,(payload->>'externalId')) where store='orders' and removed_at is null;

-- A stale refresh/sync begun before revocation cannot resurrect a connection,
-- including same-millisecond operations. Explicit reconnect is a later write.
do $$ declare body text; anchor text; addition text; begin
 select pg_get_functiondef('public.record_tenant_client_record(text,text,text,jsonb,text,timestamp with time zone,text,text)'::regprocedure) into body;
 anchor:=$a$  v_exists := found;$a$;
 addition:=$b$
  if p_store='provider_connections' and v_exists and v_row.removed_at is not null
    and p_mode<>'remove' and p_captured_at<=v_row.captured_at then
    return jsonb_build_object('status','kept','id',v_row.id,'workspaceId',v_row.workspace_id);
  end if;
$b$;
 if position(anchor in body)=0 then raise exception 'connection_revocation_function_drift'; end if;
 execute replace(body,anchor,anchor||addition);
end $$;

commit;

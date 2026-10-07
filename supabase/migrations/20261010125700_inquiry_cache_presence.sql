-- Bound the cache merge to IDs genuinely waiting for their durable copy.
-- Includes held records: cache fallback cannot undo a durable spam decision.
set local lock_timeout = '3s';
create function public.read_tenant_lead_presence(p_tenant_id text,p_lead_ids text[]) returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare v_stable uuid;
begin
  if p_lead_ids is null or cardinality(p_lead_ids) > 500 then raise exception 'inquiry_record_invalid'; end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  return coalesce((select jsonb_agg(lead_id) from public.tenant_leads
    where tenant_stable_id = v_stable and lead_id = any(p_lead_ids)), '[]'::jsonb);
end $$;
revoke all on function public.read_tenant_lead_presence(text,text[]) from public,anon,authenticated;
grant execute on function public.read_tenant_lead_presence(text,text[]) to service_role;
comment on table public.tenant_leads is 'Durable inquiry store. Redis is a cache only when the guarded read and authority switches are enabled.';

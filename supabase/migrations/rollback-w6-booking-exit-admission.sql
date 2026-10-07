begin;
set local lock_timeout='2s';
create or replace function public.booking_tenant(p_tenant_id text)
returns table(tenant_stable_id uuid,workspace_id uuid,system_id uuid,system_lifecycle text)
language sql stable security definer set search_path=public,pg_temp as $$
 select t.stable_id,l.workspace_id,s.id from public.tenants t
 left join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id
 left join lateral(select x.id,x.lifecycle from public.systems x where x.business_workspace_id=l.workspace_id and x.kind='booking' order by x.created_at,x.id limit 1) s on true
 where t.id=p_tenant_id
$$;
revoke all on function public.booking_tenant(text) from public,anon,authenticated,service_role;
commit;

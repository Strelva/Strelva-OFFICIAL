-- Completed workspace exit closes new admission on every native entry point.
-- It does not mutate bookings, reminder logs, receipts or calendar copies.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
create or replace function public.booking_tenant(p_tenant_id text)
returns table(tenant_stable_id uuid,workspace_id uuid,system_id uuid,system_lifecycle text)
language sql stable security definer set search_path=public,pg_temp as $$
 select t.stable_id,l.workspace_id,s.id,
   case when l.workspace_id is not null and public.workspace_exit_completed(l.workspace_id) then 'paused' else s.lifecycle end
 from public.tenants t
 left join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id
 left join lateral(select x.id,x.lifecycle from public.systems x where x.business_workspace_id=l.workspace_id and x.kind='booking' order by x.created_at,x.id limit 1) s on true
 where t.id=p_tenant_id
$$;
revoke all on function public.booking_tenant(text) from public,anon,authenticated,service_role;
commit;

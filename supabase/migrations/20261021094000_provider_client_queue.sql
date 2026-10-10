begin;
set local lock_timeout = '3s';
-- #257: provider-only projection. The provider seat grants internal client work;
-- it does not authorize a new outside effect. Recheck the exact agency, current
-- membership, active staff and seat in one READ ONLY snapshot, without writer
-- locks. No operator bypass and no raw receipt/delivery payloads escape.
create function public.read_provider_client_queue(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid,
  p_after_at timestamptz default null, p_after_key text default null, p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; cap integer := least(greatest(coalesce(p_limit,50),1),100);
begin
  if not exists(select 1 from public.users u
    join public.workspace_memberships m on m.user_id=u.id
    join public.workspaces w on w.id=m.workspace_id and w.kind='agency'
    where u.id=p_user_id and lower(u.email)=lower(btrim(coalesce(p_verified_email,'')))
      and u.verified_at is not null and m.workspace_id=p_agency_workspace_id)
    then raise exception 'provider_queue_access_denied'; end if;
  if (p_after_at is null) <> (p_after_key is null)
    or (p_after_key is not null and p_after_key !~ '^(listing|outside|website|decision):[0-9a-f-]{36}$')
    then raise exception 'provider_queue_cursor_invalid'; end if;
  with clients as materialized (
    select c.id,c.name from public.workspaces c
    where c.kind='customer' and not public.workspace_exit_completed(c.id) and exists(select 1 from public.provider_seats s
      join public.agency_client_staff st on st.agency_workspace_id=s.agency_workspace_id
        and st.customer_workspace_id=s.customer_workspace_id and st.user_id=p_user_id and st.status='active'
      where s.customer_workspace_id=c.id and s.agency_workspace_id=p_agency_workspace_id and s.status='active')
  ), rows as (
    select 'listing:'||r.id as key,r.workspace_id,c.name,null::uuid as system_id,
      'readback'::text as kind,'Google listing change'::text as title,r.readback as status,r.created_at as at
    from public.google_listing_receipts r join clients c on c.id=r.workspace_id
    where r.status='posted_unverified' and r.readback in ('failed','differs')
    union all
    select 'outside:'||r.id,c.id,c.name,r.system_id,'readback',
      case when r.provider='google_business' then 'Google change' else 'Website change' end,r.readback,r.created_at
    from public.outside_write_receipts r join clients c on c.id=coalesce(r.workspace_id,
      (select l.workspace_id from public.tenant_workspace_links l
       where l.tenant_stable_id=r.tenant_stable_id group by l.workspace_id
       having (select count(*) from public.tenant_workspace_links t where t.tenant_stable_id=r.tenant_stable_id)=1))
    where r.acceptance='accepted' and r.readback in ('failed','differs')
      and (r.system_id is null or exists(select 1 from public.systems s where s.id=r.system_id and s.business_workspace_id=c.id))
    union all
    select 'website:'||r.id,c.id,c.name,r.system_id,'readback','Website deployment',r.read_back,r.recorded_at
    from public.website_change_receipts r join clients c on c.id=r.workspace_id
    where r.kind='deployed' and r.read_back in ('not_confirmed','not_checked')
      and exists(select 1 from public.systems s where s.id=r.system_id and s.business_workspace_id=c.id)
    union all
    select 'decision:'||d.id,c.id,c.name,d.system_id,'owner_not_told',d.title,case when d.state='expired' then 'expired' else d.delivery_state end,d.opened_at
    from public.owner_decisions d join clients c on c.id=d.workspace_id
    where d.route='owner_decides' and ((d.state='open' and d.delivery_state in ('not_sent','suppressed','bounced'))
      or (d.state='expired' and d.decided_at>statement_timestamp()-interval '30 days'
        and not exists(select 1 from public.owner_decision_deliveries x where x.decision_id=d.id and x.status='sent')))
      and (d.system_id is null or exists(select 1 from public.systems s where s.id=d.system_id and s.business_workspace_id=c.id))
  ), page as materialized (
    select * from rows where p_after_at is null or (at,key)>(p_after_at,p_after_key)
    order by at,key limit cap+1
  ), shown as (select * from page order by at,key limit cap)
  select jsonb_build_object('agencyWorkspaceId',p_agency_workspace_id,
    'items',coalesce((select jsonb_agg(jsonb_build_object('key',key,'workspaceId',workspace_id,
      'workspaceName',name,'systemId',system_id,'kind',kind,'title',title,'status',status,'openedAt',at) order by at,key) from shown),'[]'::jsonb),
    'nextCursor',case when (select count(*) from page)>cap then
      (select jsonb_build_object('at',at,'key',key) from shown order by at desc,key desc limit 1) end) into result;
  return result;
end $$;
revoke all on function public.read_provider_client_queue(uuid,text,uuid,timestamptz,text,integer) from public,anon,authenticated;
grant execute on function public.read_provider_client_queue(uuid,text,uuid,timestamptz,text,integer) to service_role;
-- Catalog fingerprint is rollback-only metadata, inaccessible to application roles.
create table public.provider_client_queue_catalog_guard (definition_hash text not null);
alter table public.provider_client_queue_catalog_guard enable row level security;
revoke all on public.provider_client_queue_catalog_guard from public,anon,authenticated,service_role;
insert into public.provider_client_queue_catalog_guard values
  (md5(pg_get_functiondef('public.read_provider_client_queue(uuid,text,uuid,timestamptz,text,integer)'::regprocedure)));
notify pgrst, 'reload schema';
commit;

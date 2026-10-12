-- Read-only email presentation and scope. Transport policy remains in the one
-- email path. A missing business, relationship or verified contact holds mail.
begin;
create function public.read_email_business_context(p_workspace_id uuid default null, p_tenant_id text default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare ws uuid; tenant_ws uuid; w public.workspaces; recipient jsonb; reply_address text; business_name text;
begin
  ws := p_workspace_id;
  if p_tenant_id is not null then
    if p_tenant_id like 'workspace:%' then
      tenant_ws := substring(p_tenant_id from 11)::uuid;
    else
      select l.workspace_id into tenant_ws from public.tenant_workspace_links l
        join public.tenants t on t.stable_id=l.tenant_stable_id where t.id=p_tenant_id;
    end if;
    if tenant_ws is null then
      -- A successful read of an unconverted tenant establishes its exclusion
      -- scope, without inventing business/agency authorship or reply identity.
      if ws is null and exists(select 1 from public.tenants where id=p_tenant_id) then
        return jsonb_build_object('workspaceId',null,'tenantIds',jsonb_build_array(p_tenant_id),
          'ownerAuthorship',null,'businessName',null,'replyTo',null,'timeZone',null);
      end if;
      return null;
    end if;
    if ws is not null and ws<>tenant_ws then return null; end if;
    ws := tenant_ws;
  end if;
  select * into w from public.workspaces where id=ws and kind='customer';
  if not found then return null; end if;
  select coalesce(nullif(btrim(f.value#>>'{}'),''),nullif(btrim(w.name),'')) into business_name
    from (select 1) anchor left join lateral (select value from public.business_confirmed_facts(ws) where fact_key='display_name') f on true;
  -- A confirmed public address is a reply destination only when a current
  -- business member has verified that same address. Never infer the address from a serving agency.
  select lower(btrim(f.value#>>'{}')) into reply_address from public.business_confirmed_facts(ws) f
    where f.fact_key='email' and exists(select 1 from public.workspace_memberships m
      join public.users u on u.id=m.user_id and u.verified_at is not null
      where m.workspace_id=ws and lower(btrim(u.email))=lower(btrim(f.value#>>'{}')));
  if reply_address is null then
    recipient := public.resolve_business_owner_recipient(ws);
    if recipient->>'trusted'='true' and (recipient->>'verified'='true' or exists(
      select 1 from public.workspace_memberships m join public.users u on u.id=m.user_id and u.verified_at is not null
      where m.workspace_id=ws and m.role='owner' and lower(btrim(u.email))=lower(btrim(recipient->>'email')))) then
      reply_address := lower(btrim(recipient->>'email'));
    end if;
  end if;
  return jsonb_build_object('workspaceId',ws,'businessName',business_name,'replyTo',reply_address,
    'timeZone',coalesce((select value->>'timezone' from public.business_confirmed_facts(ws) where fact_key='hours'),
      (select b.timezone from public.booking_settings b where b.calendar_key=ws limit 1)),
    'tenantIds',coalesce((select jsonb_agg(t.id order by t.id) from public.tenant_workspace_links l join public.tenants t on t.stable_id=l.tenant_stable_id where l.workspace_id=ws),'[]'::jsonb),
    'ownerAuthorship',case when exists(select 1 from public.provider_seats s where s.customer_workspace_id=ws and s.status='active')
      or exists(select 1 from public.workspace_providers p where p.customer_workspace_id=ws and p.status='active') then 'agency' else 'platform' end);
end $$;
revoke all on function public.read_email_business_context(uuid,text) from public,anon,authenticated;
grant execute on function public.read_email_business_context(uuid,text) to service_role;
commit;

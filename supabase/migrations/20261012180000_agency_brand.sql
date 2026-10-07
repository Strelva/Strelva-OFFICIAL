-- Owner presentation only. No sender domains or verification privileges.
begin;
alter table public.workspaces add column agency_brand jsonb;
alter table public.workspaces add constraint workspaces_agency_brand_check check (
  agency_brand is null or (kind = 'agency' and jsonb_typeof(agency_brand) = 'object'
    and agency_brand ?& array['displayName','accentColor','replyTo','logo','credit']
    and agency_brand - array['displayName','accentColor','replyTo','logo','credit'] = '{}'::jsonb
    and jsonb_typeof(agency_brand->'displayName') = 'string'
    and length(agency_brand->>'displayName') between 1 and 120
    and agency_brand->>'displayName' !~ '[[:cntrl:]]'
    and agency_brand->>'accentColor' ~ '^#[0-9a-fA-F]{6}$'
    and agency_brand->>'credit' = 'runs_on_strelva'
    and (agency_brand->'replyTo' = 'null'::jsonb or agency_brand->>'replyTo' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    and (agency_brand->'logo' = 'null'::jsonb or (
      jsonb_typeof(agency_brand->'logo') = 'object'
      and agency_brand->'logo' ?& array['type','data']
      and (agency_brand->'logo') - array['type','data'] = '{}'::jsonb
      and agency_brand->'logo'->>'type' in ('image/png','image/jpeg','image/webp')
      and length(agency_brand->'logo'->>'data') between 1 and 349528
      and agency_brand->'logo'->>'data' ~ '^[A-Za-z0-9+/]+={0,2}$'
    ))) is true
);
create function public.resolve_owner_brand(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with agency as (
    select w.id from public.workspaces w where w.id=p_workspace_id and w.kind='agency'
    union all
    select s.agency_workspace_id from public.provider_seats s
      join public.workspaces c on c.id=s.customer_workspace_id and c.kind='customer'
      where s.customer_workspace_id=p_workspace_id and s.status='active'
      and (s.agency_workspace_id = (select p.provider_workspace_id from public.workspace_providers p where p.customer_workspace_id=p_workspace_id and p.status='active')
        or (select count(*) from public.provider_seats a where a.customer_workspace_id=p_workspace_id and a.status='active')=1)
  ) select jsonb_build_object('agencyId',w.id,'name',w.name,'brand',w.agency_brand)
    from agency a join public.workspaces w on w.id=a.id and w.kind='agency';
$$;
create function public.manage_agency_brand(p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_brand jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w public.workspaces%rowtype; m public.workspace_memberships%rowtype;
begin
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
  if not found then raise exception 'agency_brand_access'; end if;
  select * into m from public.workspace_memberships where user_id=p_user_id and workspace_id=p_workspace_id for share;
  if not found or m.role <> 'owner' then raise exception 'agency_brand_access'; end if;
  select * into w from public.workspaces where id=p_workspace_id and kind='agency' for update;
  if not found then raise exception 'agency_brand_access'; end if;
  if p_brand is not null then
    update public.workspaces set agency_brand=p_brand where id=w.id;
    return p_brand;
  end if;
  return coalesce(w.agency_brand,jsonb_build_object('displayName',w.name,'accentColor','#447a4f','replyTo',null,'logo',null,'credit','runs_on_strelva'));
end;
$$;
revoke all on function public.resolve_owner_brand(uuid), public.manage_agency_brand(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.resolve_owner_brand(uuid), public.manage_agency_brand(uuid,text,uuid,jsonb) to service_role;
commit;

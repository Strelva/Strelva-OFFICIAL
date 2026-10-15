-- ADR 0016: whose account installed the website script. Held, unapplied.
begin;
set local lock_timeout='3s';
create schema conn_tools_installer_rollback;
revoke all on schema conn_tools_installer_rollback from public,anon,authenticated,service_role;
create table conn_tools_installer_rollback.fingerprint(signature text primary key,value text not null);
alter table conn_tools_installer_rollback.fingerprint enable row level security;
revoke all on conn_tools_installer_rollback.fingerprint from public,anon,authenticated,service_role;

-- Called by the install command through POST RPC, not a READ ONLY listing.
create function public.read_connected_site_installer(p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare agency_id uuid; candidate record; agency_count integer:=0;
begin
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email))
    and verified_at is not null for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspaces where id=p_workspace_id and kind='customer' for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id
    and role in ('owner','admin') for share;
  if found then return jsonb_build_object('kind','business','workspaceId',p_workspace_id); end if;

  -- Lock every qualifying candidate, then refuse ambiguity instead of LIMIT 1.
  for candidate in
    select a.id from public.workspaces a
      join public.workspace_memberships m on m.workspace_id=a.id and m.user_id=p_user_id
      join public.provider_seats s on s.agency_workspace_id=a.id and s.customer_workspace_id=p_workspace_id and s.status='active'
      join public.agency_client_staff st on st.agency_workspace_id=a.id and st.customer_workspace_id=p_workspace_id
        and st.user_id=p_user_id and st.status='active'
      join public.agency_scope_grants g on g.agency_workspace_id=a.id and g.customer_workspace_id=p_workspace_id
        and g.scope='website' and g.status='active' and g.level in ('prepare','full_control')
    where a.kind='agency' order by a.id for share of a,m,s,st,g
  loop
    if agency_id is distinct from candidate.id then agency_count:=agency_count+1; agency_id:=candidate.id; end if;
  end loop;
  if agency_count<>1 then raise exception 'workspace_access_denied'; end if;
  return jsonb_build_object('kind','agency','workspaceId',agency_id);
end $$;
revoke all on function public.read_connected_site_installer(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_connected_site_installer(uuid,uuid,text) to service_role;
-- Core authorizes the workspace before calling a source. Return only display
-- metadata: never public keys, verification tokens, origins or form details.
create function public.read_connected_site_connection_metadata(p_workspace_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'business_workspace_id',s.business_workspace_id,
    'label',s.label,'status',s.status,'verified_at',s.verified_at,'created_at',s.created_at)
    order by s.created_at,s.id),'[]'::jsonb)
  from public.connected_sites s where s.business_workspace_id=p_workspace_id
$$;
revoke all on function public.read_connected_site_connection_metadata(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_connected_site_connection_metadata(uuid) to service_role;
-- Recheck the expected holder and insert under the same authority locks.
create function public.create_connected_site_for_installer(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare holder jsonb;
begin
  holder:=public.read_connected_site_installer(p_workspace_id,p_user_id,p_verified_email);
  if p_input->'installerHolder' is distinct from holder then raise exception 'workspace_access_denied'; end if;
  return public.create_connected_site(p_workspace_id,p_user_id,p_verified_email,p_input-'installerHolder');
end $$;
revoke all on function public.create_connected_site_for_installer(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.create_connected_site_for_installer(uuid,uuid,text,jsonb) to service_role;
insert into conn_tools_installer_rollback.fingerprint
select p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))
from pg_proc p where p.oid=any(array['public.read_connected_site_installer(uuid,uuid,text)'::regprocedure,
  'public.read_connected_site_connection_metadata(uuid)'::regprocedure,
  'public.create_connected_site_for_installer(uuid,uuid,text,jsonb)'::regprocedure]);
notify pgrst,'reload schema';
commit;

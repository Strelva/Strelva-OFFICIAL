-- Explicit, authenticated owner consent for an ordinary agency to publish
-- this website. The mandate never replaces approval of each exact candidate.
set local lock_timeout = '3s';

create function public.read_website_agency_publish_permission(
  p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare agency uuid; agency_name text; ref text;
begin
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,false,false);
  if not exists(select 1 from public.workspace_memberships m join public.workspaces w on w.id=m.workspace_id
    where m.workspace_id=p_workspace_id and m.user_id=p_user_id and m.role='owner' and w.kind='customer') then return null; end if;
  select p.provider_workspace_id,w.name into agency,agency_name from public.workspace_providers p
    join public.workspaces w on w.id=p.provider_workspace_id and w.kind='agency'
    join public.provider_seats s on s.customer_workspace_id=p.customer_workspace_id and s.agency_workspace_id=p.provider_workspace_id and s.status='active'
    where p.customer_workspace_id=p_workspace_id and p.status='active';
  if agency is null then return null; end if;
  ref:=public.system_origin_id(p_workspace_id,'saved_work',p_work_id::text)::text;
  return jsonb_build_object('agencyWorkspaceId',agency,'agencyName',agency_name,'granted',exists(
    select 1 from public.client_resource_mandates m where m.customer_workspace_id=p_workspace_id
      and m.agency_workspace_id=agency and m.effect='publish' and m.resource_kind='website' and m.resource_ref=ref and m.status='active'));
end $$;

create function public.approve_website_document_for_agency(
  p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text,
  p_revision integer, p_content_hash text, p_agency_workspace_id uuid
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare agency uuid;
begin
  -- The client owner, never their serving agency or an email-link session,
  -- grants resource authority. Lock order matches existing business writes.
  perform public.provider_seat_assert_owner(p_workspace_id,p_user_id,p_verified_email);
  select provider_workspace_id into agency from public.workspace_providers
    where customer_workspace_id=p_workspace_id and status='active' for share;
  if agency is null or agency is distinct from p_agency_workspace_id then raise exception 'website_agency_provider_changed'; end if;
  perform public.approve_website_document(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_revision,p_content_hash);
  perform public.grant_client_resource_mandate(p_user_id,p_verified_email,p_workspace_id,agency,'publish','website',
    public.system_origin_id(p_workspace_id,'saved_work',p_work_id::text)::text);
  -- Both writes share this transaction: an invalid seat/owner/candidate
  -- leaves neither an approval nor a mandate behind.
end $$;

revoke all on function public.read_website_agency_publish_permission(uuid,uuid,uuid,text),
  public.approve_website_document_for_agency(uuid,uuid,uuid,text,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.read_website_agency_publish_permission(uuid,uuid,uuid,text),
  public.approve_website_document_for_agency(uuid,uuid,uuid,text,integer,text,uuid) to service_role;

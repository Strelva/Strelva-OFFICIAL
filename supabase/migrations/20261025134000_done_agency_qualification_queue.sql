-- Evidence can wait for an independent reviewer, including when the agency's
-- member is the only operator. Review availability never grants approval power.
begin;
set local lock_timeout = '3s';
create schema done_agency_qualification_queue_rollback;
revoke all on schema done_agency_qualification_queue_rollback from public,anon,authenticated,service_role;
create table done_agency_qualification_queue_rollback.functions(signature text primary key,before_definition text not null,after_hash text);
insert into done_agency_qualification_queue_rollback.functions(signature,before_definition)
select signature,pg_get_functiondef(signature::regprocedure) from unnest(array[
 'public.read_agency_qualification(uuid,text,uuid)',
 'public.read_agency_qualification_desk(text)']) signature;

create or replace function public.read_agency_qualification(p_user_id uuid,p_verified_email text,p_agency_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_role text;
begin
  select m.role into v_role from public.workspace_memberships m join public.users u on u.id=m.user_id
    join public.workspaces w on w.id=m.workspace_id and w.kind='agency'
    where m.workspace_id=p_agency_workspace_id and u.id=p_user_id and u.verified_at is not null and lower(u.email)=lower(btrim(p_verified_email));
  if not found then raise exception 'agency_qualification_access_denied'; end if;
  return jsonb_build_object('workspaceId',p_agency_workspace_id,'canSubmit',v_role in ('owner','admin'),
    'independentReviewerAvailable',exists(select 1 from public.super_admins sa join public.users u on u.id=sa.user_id
      where sa.revoked_at is null and u.verified_at is not null and not exists(
        select 1 from public.workspace_memberships m where m.workspace_id=p_agency_workspace_id and m.user_id=u.id)),
    'submissions',public.agency_qualification_records(p_agency_workspace_id),
    'effects',(select jsonb_agg(jsonb_build_object('effect',e,'available',public.agency_effect_allowed(p_agency_workspace_id,e))) from unnest(public.agency_effect_names()) e));
end; $$;

create or replace function public.read_agency_qualification_desk(p_operator_email text) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare v_operator uuid;
begin
  v_operator:=public.tenant_conversion_assert_operator(p_operator_email);
  return (select coalesce(jsonb_agg(item || jsonb_build_object('canReview',not exists(
    select 1 from public.workspace_memberships m where m.workspace_id=(item->>'workspaceId')::uuid and m.user_id=v_operator)) order by ordinal),'[]'::jsonb)
    from jsonb_array_elements(public.agency_qualification_records(null)) with ordinality r(item,ordinal));
end; $$;
-- Preserve existing service-only readers; decision authority is unchanged.
revoke all on function public.read_agency_qualification(uuid,text,uuid),public.read_agency_qualification_desk(text) from public,anon,authenticated;
grant execute on function public.read_agency_qualification(uuid,text,uuid),public.read_agency_qualification_desk(text) to service_role;
update done_agency_qualification_queue_rollback.functions set after_hash=md5(pg_get_functiondef(signature::regprocedure));
commit;

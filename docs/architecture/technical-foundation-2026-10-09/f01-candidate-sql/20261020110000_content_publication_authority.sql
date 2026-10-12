-- #495: preserve the transport vocabulary and issued history; actual
-- authorship comes from current owner/provider authority, never a caller label.
begin;
set local lock_timeout='3s';
create table release_rollback_baseline.content_publication_authority (
  singleton boolean primary key check(singleton), definition text not null, after_hash text,
  actor_oid oid, actor_owner oid, actor_hash text, actor_acl aclitem[]
);
revoke all on release_rollback_baseline.content_publication_authority from public,anon,authenticated,service_role;
insert into release_rollback_baseline.content_publication_authority(singleton,definition,after_hash) values
  (true,pg_get_functiondef('public.write_operator_content(text,text,jsonb)'::regprocedure),null);
create function public.write_content_as_actor(p_tenant_id text, p_section text, p_data jsonb, p_user_id uuid, p_verified_email text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare prior jsonb; receipt jsonb; system_id uuid; stable_id uuid; business uuid; agency uuid; authorship jsonb;
begin
  if p_tenant_id is null or p_section is null or btrim(p_section) = ''
    or jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'outside_write_receipt_invalid';
  end if;
  select t.stable_id into stable_id from public.tenants t where t.id = p_tenant_id for key share;
  if not found then raise exception 'outside_write_receipt_invalid'; end if;
  select l.workspace_id into business from public.tenant_workspace_links l where l.tenant_stable_id=stable_id;
  -- Unconverted tenants retain their legacy writer/authority contract.
  if business is null then return public.write_operator_content(p_tenant_id,p_section,p_data); end if;
  perform pg_advisory_xact_lock(hashtextextended(business::text,7415));
  perform 1 from public.workspaces where id=business and kind='customer' for share;
  if not found or public.workspace_exit_completed(business) then raise exception 'content_publication_access_denied'; end if;
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
  if not found then raise exception 'content_publication_access_denied'; end if;
  select s.id into system_id from public.systems s where s.business_workspace_id=business
    and s.origin_kind='tenant' and s.origin_ref=stable_id::text;
  if system_id is null then raise exception 'content_publication_system_required'; end if;
  perform 1 from public.systems where id=system_id and lifecycle<>'paused' for share;
  if not found then raise exception 'content_publication_paused'; end if;
  perform 1 from public.workspace_memberships where workspace_id=business and user_id=p_user_id and role='owner' for share;
  if found then
    authorship:=jsonb_build_object('authority','owner','actorUserId',p_user_id,'provider',null);
  else
    agency:=public.acting_provider_assert(business,p_user_id,'publish','website',system_id::text);
    perform 1 from public.workspace_providers where customer_workspace_id=business
      and provider_workspace_id=agency and status='active' for share;
    if not found then raise exception 'acting_provider_not_staffed'; end if;
    -- Pin actual serving agency at acceptance; later renames cannot rewrite it.
    authorship:=jsonb_build_object('authority','provider','actorUserId',p_user_id,
      'provider',jsonb_build_object('workspaceId',agency,'name',(select name from public.workspaces where id=agency)));
  end if;
  -- Serialize only writes to this section, including first insert. The hot
  -- content table is neither rewritten nor locked portfolio-wide.
  perform pg_advisory_xact_lock(hashtextextended('operator-content:' || p_tenant_id || ':' || p_section, 0));
  select c.data into prior from public.content c where c.tenant_id = p_tenant_id and c.section = p_section for update;
  select s.id into system_id from public.systems s
    join public.tenant_workspace_links l on l.workspace_id = s.business_workspace_id
    where l.tenant_stable_id = stable_id and s.origin_kind = 'tenant' and s.origin_ref = stable_id::text;
  insert into public.content(tenant_id, section, data) values (p_tenant_id, p_section, p_data)
    on conflict (tenant_id, section) do update set data = excluded.data;
  receipt := public.record_outside_write_receipt(jsonb_build_object(
    'commandKey', 'content-publish:' || gen_random_uuid()::text,
    'tenantId', p_tenant_id, 'systemId', system_id,
    'provider', 'strelva_content', 'writeKind', 'content_publish', 'subject', p_section,
    'request', jsonb_build_object('authorship',authorship,'section', p_section, 'contentHash', md5(p_data::text), 'bytes', octet_length(p_data::text)),
    'beforeState', case when octet_length(prior::text) > 16000 then jsonb_build_object(
      'contentHash', md5(prior::text), 'bytes', octet_length(prior::text),
      'snapshotOmitted', 'Prior section exceeds the receipt snapshot limit; use its saved content version for restore.') else prior end,
    'acceptance', 'accepted', 'acceptanceDetail', 'Content and receipt committed in one Postgres transaction.',
    'readback', 'pending', 'undo', 'put_back_draft', 'undoLabel', 'Restore a prior content version to a draft, then review and publish.',
    'actor', p_user_id::text
  ));
  return receipt;
end;
$$;
revoke all on function public.write_content_as_actor(text,text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.write_content_as_actor(text,text,jsonb,uuid,text) to service_role;
-- An actorless call cannot serve a converted business. Unconverted legacy
-- provisioning retains its existing bounded transport receipt contract.
do $patch$
declare before_body text; patched text;
begin
  select definition into before_body from release_rollback_baseline.content_publication_authority where singleton;
  patched:=replace(before_body,'  -- Serialize only writes',
    '  if exists(select 1 from public.tenant_workspace_links where tenant_stable_id=stable_id) then
    raise exception ''content_publication_actor_required'';
  end if;
  -- Serialize only writes');
  if patched=before_body then raise exception 'content_publication_patch_drift'; end if;
  execute patched;
  update release_rollback_baseline.content_publication_authority set after_hash=md5(pg_get_functiondef('public.write_operator_content(text,text,jsonb)'::regprocedure));
end $patch$;
update release_rollback_baseline.content_publication_authority b set
  actor_oid=p.oid,actor_owner=p.proowner,actor_hash=md5(pg_get_functiondef(p.oid)),actor_acl=p.proacl
  from pg_proc p where p.oid='public.write_content_as_actor(text,text,jsonb,uuid,text)'::regprocedure;
commit;

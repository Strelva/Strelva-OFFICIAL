-- Restore only this website authority fallback. Refuse drift at its replacement
-- boundary; preserve the existing website v2 payload, CAS, identity and exit code.
begin;
create or replace function public.website_document_assert_actor(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_manage boolean,p_write boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;
  if p_write then
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
    perform 1 from public.workspaces where id=p_workspace_id for update;
    if not found then raise exception 'workspace_access_denied'; end if;
    if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and (not p_manage or role in ('owner','admin')) for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  if p_work_id is not null and not exists(select 1 from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website') then raise exception 'workspace_access_denied'; end if;
end $$;

do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb)'::regprocedure) into definition;
  if position($before$  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then
    -- Provider seats extend only website work, never other bounded payloads.
    if p_product_id is distinct from 'websites'
      or not exists(select 1 from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website')
      or coalesce(public.provider_seat_role(p_workspace_id,p_user_id,true) not in ('owner','admin','member'),true)
      then raise exception 'workspace_access_denied'; end if;
  end if;$before$ in definition)=0 then raise exception 'provider_website_authority_function_drift'; end if;
  definition := replace(definition,$before$  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then
    -- Provider seats extend only website work, never other bounded payloads.
    if p_product_id is distinct from 'websites'
      or not exists(select 1 from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website')
      or coalesce(public.provider_seat_role(p_workspace_id,p_user_id,true) not in ('owner','admin','member'),true)
      then raise exception 'workspace_access_denied'; end if;
  end if;$before$,$after$  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'workspace_access_denied'; end if;$after$);
  execute definition;
end $migration$;

revoke all on function public.website_document_assert_actor(uuid,uuid,uuid,text,boolean,boolean) from public,anon,authenticated,service_role;
commit;

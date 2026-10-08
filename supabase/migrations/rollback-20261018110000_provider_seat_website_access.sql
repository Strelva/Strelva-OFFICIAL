-- Restore only this website authority fallback. Refuse drift at its replacement
-- boundary; preserve the existing website v2 payload, CAS, identity and exit code.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb)'::regprocedure) into definition;
  if md5(definition) is distinct from 'eb2100026ee6a30913f04bff8c5fd79d' then raise exception 'provider_website_authority_wrong_order_or_function_drift'; end if;
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

commit;
